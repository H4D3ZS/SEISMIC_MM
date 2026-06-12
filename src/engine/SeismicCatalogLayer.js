/**
 * SeismicCatalogLayer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GPU ingestion layer for the 1990–2026 multi-era seismic catalog.
 *
 *  - One THREE.InstancedMesh, one draw call, regardless of catalog size.
 *  - Raw Float32 record stream, 6 floats per event:
 *      [lat, lon, depthKm, magnitude, status, alert_level]
 *  - Depth maps downward on Y (negative space below the terrain plane);
 *    instance scale grows exponentially with Mw.
 *  - Additive-blended radial-falloff fragment shader: dense historical
 *    clusters along active faults integrate into a bright neon glow.
 *  - Re-ingestion (live poll refresh) disposes the previous mesh via the
 *    engine registry before uploading the new buffer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { projectToWorld } from './GeoProjection.js';

const RECORD_SIZE = 6; // [lat, lon, depth, magnitude, status, alert_level]
const LAYER_KEY = 'seismic_catalog';

export class SeismicCatalogLayer {
  constructor(engineInstance) {
    this.engine = engineInstance;
  }

  /**
   * Ingest a raw Float32Array catalog buffer onto the GPU.
   * @param {Float32Array} buffer — packed records, RECORD_SIZE floats each
   * @returns {THREE.InstancedMesh|null}
   */
  parseBinaryBuffer(buffer) {
    if (!buffer || buffer.length < RECORD_SIZE) {
      console.warn('[CISV] SeismicCatalogLayer: empty catalog buffer, skipping upload.');
      return null;
    }
    if (buffer.length % RECORD_SIZE !== 0) {
      console.warn(
        `[CISV] SeismicCatalogLayer: buffer length ${buffer.length} not a multiple of ` +
        `${RECORD_SIZE} — trailing partial record ignored.`
      );
    }
    const count = Math.floor(buffer.length / RECORD_SIZE);

    const baseGeo = new THREE.IcosahedronGeometry(0.12, 1);
    const shaderMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vPos;
        uniform vec3 coreNeonColor;
        void main() {
          float intensity = exp(-length(vPos) * 6.0);
          gl_FragColor = vec4(coreNeonColor * intensity * 2.5, intensity);
        }
      `,
      uniforms: {
        coreNeonColor: { value: new THREE.Color(0xff0055) }, // crimson-pink alert
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const instancedMesh = new THREE.InstancedMesh(baseGeo, shaderMat, count);
    // Instances span the whole viewport — the base geometry's bounding sphere
    // would cull the mesh whenever the origin leaves the frustum.
    instancedMesh.frustumCulled = false;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const idx = i * RECORD_SIZE;
      const lat   = buffer[idx];
      const lon   = buffer[idx + 1];
      const depth = buffer[idx + 2];
      const mag   = buffer[idx + 3];

      // Local linear projection centered on Mindanao; deep hypocenters
      // push down past the terrain plane on Y.
      const { x, y, z } = projectToWorld(lat, lon, depth);
      dummy.position.set(x, y, z);

      // Exponential Mw scaling — M7 dominates visually over the M2 noise floor.
      const dynamicScale = Math.pow(Math.max(mag, 0.5), 2.2) * 0.02;
      dummy.scale.setScalar(dynamicScale);

      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;

    // addLayer disposes any previous catalog mesh (geometry, shader, GPU
    // buffers) before registering the new one — safe for live re-ingestion.
    this.engine.addLayer(LAYER_KEY, instancedMesh);
    return instancedMesh;
  }

  dispose() {
    this.engine.disposeLayer(LAYER_KEY);
  }
}
