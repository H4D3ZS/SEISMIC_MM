/**
 * VolcanicLayerRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Volcanic Arc & Gas Plume System — Task 3 Implementation
 *
 * Responsibilities:
 *   • Render a wireframe structural edifice cone for each active volcano
 *   • Render a pulsing neon-red PDZ (Permanent Danger Zone) geofence ring
 *   • Spawn and animate a GPU-friendly SO₂ particle plume scaled to
 *     real-time Alert Level and SO₂ Flux telemetry
 *   • Register per-frame animation hooks on the engine's onBeforeRenderUpdate
 *     compositing queue (multiple volcanoes → multiple hooks, not overwrite)
 *   • Full lifecycle: addVolcanicNode / removeVolcanicNode / updateTelemetry
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * VolcanoAsset schema:
 * {
 *   ID            : string       — unique identifier
 *   latitude      : number       — geographic latitude  (°)
 *   longitude     : number       — geographic longitude (°)
 *   Alert_Level   : 0–5          — PHIVOLCS alert scale
 *   SO2_Flux      : number       — tonnes/day
 *   Tilt_Deformation: number     — microradians
 *   PDZ_Radius    : number       — km radius of Permanent Danger Zone
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { TILE_SOURCES } from './AdvancedGeospatialTerrain.js';

// ── Constants ──────────────────────────────────────────────────────────────

const LAT_ANCHOR   = 12.0;
const LON_ANCHOR   = 122.0;
const SPATIAL_SCALE = 6.0;

/** Maximum particle count per volcano — GPU budget guard */
const MAX_PARTICLES = 4000;

/** Altitude ceiling before particle respawn (world units) */
const PLUME_CEILING = 18.0;

/** Alert-level color map → THREE.Color hex */
const ALERT_COLORS = {
  0: 0x00ff88,  // Level 0 — Background unrest (green)
  1: 0x00ff88,  // Level 1 — Low-level unrest  (green)
  2: 0xffaa00,  // Level 2 — Moderate unrest   (amber)
  3: 0xff1a44,  // Level 3 — High-level unrest (red)
  4: 0xff1a44,  // Level 4 — Hazardous eruption (red)
  5: 0xaa44ff,  // Level 5 — Paroxysmal eruption (violet)
};

// ── Shaders for NASA-Grade Magma and Lava Convection ────────────────────────

const MAGMA_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MAGMA_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform float uAlertLevel;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
  }

  void main() {
    vec2 uv = vUv - vec2(0.5);
    float dist = length(uv);
    if (dist > 0.5) discard;

    float n1 = noise(uv * 12.0 + vec2(uTime * 0.45, uTime * 0.22));
    float n2 = noise(uv * 24.0 - vec2(uTime * 0.35, -uTime * 0.45));
    float heatPattern = (n1 * 0.6 + n2 * 0.4);

    vec3 hotGold   = vec3(1.0, 0.75, 0.05); // Incandescent lava crack
    vec3 midOrange = vec3(0.9, 0.18, 0.0);  // High-heat flow
    vec3 coolRed   = uBaseColor * 0.7;      // Cooler basaltic crust

    float temp = smoothstep(0.25, 0.78, heatPattern);
    vec3 color = mix(coolRed, midOrange, temp);
    color = mix(color, hotGold, smoothstep(0.68, 0.95, temp));

    float rimFactor = smoothstep(0.46, 0.5, dist);
    color = mix(color, coolRed * 0.2, rimFactor);

    float glowMultiplier = 1.25 + uAlertLevel * 0.45;
    gl_FragColor = vec4(color * glowMultiplier, 1.0);
  }
`;

const LAVA_FLOW_VERT = /* glsl */`
  varying float vHeight;
  void main() {
    vHeight = position.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LAVA_FLOW_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  varying float vHeight;

  void main() {
    float flowSpeed = 3.5;
    float pulse = sin(vHeight * 18.0 - uTime * flowSpeed) * 0.5 + 0.5;

    vec3 hotYellow = vec3(1.0, 0.7, 0.0);
    vec3 flowColor = mix(uColor, hotYellow, pulse * 0.75);

    gl_FragColor = vec4(flowColor * 2.0, 1.0);
  }
`;

// ── VolcanicLayerRenderer ──────────────────────────────────────────────────

export class VolcanicLayerRenderer {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;

    /**
     * Per-volcano animation state, keyed by volcano ID.
     * Each entry holds: { plume, velocities, positions, pdzRing, particleCount, x, y, z }
     * @type {Map<string, object>}
     */
    this._animationStates = new Map();
    this._styleName = import.meta.env.VITE_MAPBOX_TOKEN?.trim() ? 'mapbox_satellite' : 'google_satellite';

    // Compose frame updates into a single chained hook
    this._hookRegistered = false;
    this._registerFrameHook();
  }

  // ─── Frame Hook Registration ──────────────────────────────────────────

  /**
   * Registers a single onBeforeRenderUpdate hook that iterates over all
   * active volcano animation states.  This avoids overwriting the engine's
   * hook slot for each volcano.
   * @private
   */
  _registerFrameHook() {
    const previousHook = this.engine.onBeforeRenderUpdate;

    this.engine.onBeforeRenderUpdate = (elapsed, delta) => {
      // Preserve any previously registered hooks (e.g., from other systems)
      if (typeof previousHook === 'function') {
        previousHook(elapsed, delta);
      }
      this._tickAllPlumes(elapsed, delta);
    };

    this._hookRegistered = true;
  }

  /**
   * Animate all registered volcanic plumes in a single loop.
   * @param {number} elapsed  Total elapsed time (seconds)
   * @param {number} delta    Frame delta time (seconds)
   * @private
   */
  _tickAllPlumes(elapsed, delta) {
    for (const [id, state] of this._animationStates) {
      this._tickPlume(state, elapsed, delta);
    }
  }

  /**
   * Advance particle positions for one volcano plume, and pulse the PDZ ring.
   * @param {object} state   Animation state object
   * @param {number} elapsed
   * @param {number} delta
   * @private
   */
  _tickPlume(state, elapsed, delta) {
    const { plume, velocities, particleCount, x, y, pdzRing, craterZ, magmaMaterial, lavaMaterials } = state;

    // ── PDZ ring pulse ───────────────────────────────────────────────
    if (pdzRing) {
      const scalePulse = 1.0 + Math.sin(elapsed * 4.0) * 0.04;
      pdzRing.scale.set(scalePulse, scalePulse, 1.0);
      // Fade opacity in/out for threat-level awareness effect
      pdzRing.material.opacity = 0.35 + Math.sin(elapsed * 4.0) * 0.15;
    }

    // ── Update custom magma and lava shaders ─────────────────────────
    if (magmaMaterial) {
      magmaMaterial.uniforms.uTime.value = elapsed;
    }
    if (lavaMaterials) {
      for (let i = 0; i < lavaMaterials.length; i++) {
        lavaMaterials[i].uniforms.uTime.value = elapsed;
      }
    }

    // ── Particle plume advance ───────────────────────────────────────
    if (!plume || particleCount === 0) return;

    const posAttr = plume.geometry.attributes.position;
    const posArr  = posAttr.array;
    const n3      = particleCount * 3;

    for (let i = 0; i < n3; i += 3) {
      posArr[i]     += velocities[i]     * delta * 30;
      posArr[i + 1] += velocities[i + 1] * delta * 30;
      posArr[i + 2] += velocities[i + 2] * delta * 30;

      // Respawn at crater mouth when particle exceeds altitude ceiling
      if (posArr[i + 2] > PLUME_CEILING) {
        posArr[i]     = x + (Math.random() - 0.5) * 0.15;
        posArr[i + 1] = y + (Math.random() - 0.5) * 0.15;
        posArr[i + 2] = craterZ;
      }
    }

    posAttr.needsUpdate = true;
  }

  // ─── Node Lifecycle ───────────────────────────────────────────────────

  /**
   * Add or replace a volcanic node in the scene.
   *
   * @param {object} volcanoAsset  Volcano descriptor matching the schema above
   */
  addVolcanicNode(volcanoAsset) {
    const layerKey = `volcano_${volcanoAsset.ID}`;

    // Remove stale state for this ID before rebuilding
    this._animationStates.delete(volcanoAsset.ID);
    this.engine.disposeLayer(layerKey);

    // ── Coordinate projection ────────────────────────────────────────
    const x = (volcanoAsset.longitude - LON_ANCHOR) * SPATIAL_SCALE;
    const y = (volcanoAsset.latitude  - LAT_ANCHOR) * SPATIAL_SCALE;
    const z = 0; // Surface baseline

    const group       = new THREE.Group();
    const alertLevel  = Math.min(5, Math.max(0, volcanoAsset.Alert_Level ?? 0));
    const alertColor  = ALERT_COLORS[alertLevel];
    const colorObj    = new THREE.Color(alertColor);

    // ── 1. Structural Edifice Plane (Realistic Volcano) ─────────────
    const height = 0.55 + (volcanoAsset.elevation ?? 1200) / 1600;
    const radius = height * 0.55;
    const R_rim = radius * 0.20; // Crater rim at 20% of radius
    const H_max = height;
    const H_crater = H_max * 0.65; // Crater floor is 65% of peak height
    const size = radius * 2.4; // Plane extends slightly past the outer radius R

    const segments = 64;
    const planeGeom = new THREE.PlaneGeometry(size, size, segments, segments);

    // Calculate dynamic zoom level so that the tile bounds contain the volcano footprint
    const sizeDeg = size / SPATIAL_SCALE;
    const maxZoom = 13;
    let zoom = maxZoom;
    while (zoom > 7) {
      const tileWidth = 360 / Math.pow(2, zoom);
      if (tileWidth >= sizeDeg) break;
      zoom--;
    }

    // Calculate slippy map tile coordinates for this specific volcano location
    const tileX = Math.floor(((volcanoAsset.longitude + 180) / 360) * Math.pow(2, zoom));
    const rad = (volcanoAsset.latitude * Math.PI) / 180;
    const tileY = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom));
    
    // Bounds of this tile in geographic degrees
    const n = Math.pow(2, zoom);
    const lonMin = (tileX / n) * 360 - 180;
    const lonMax = ((tileX + 1) / n) * 360 - 180;
    const latMax = (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n))) * 180) / Math.PI;
    const latMin = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tileY + 1)) / n))) * 180) / Math.PI;

    // Create local procedural fallback texture immediately
    const fallbackTexture = createProceduralVolcanoTexture(volcanoAsset.name);

    // Load satellite texture for this location
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
    const tileUrl = TILE_SOURCES[this._styleName || 'google_satellite'].url(zoom, tileX, tileY, mapboxToken);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const texture = loader.load(
      tileUrl,
      (loadedTex) => {
        coneMat.map = loadedTex;
        coneMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn(`[CISV Volcano] Failed to load satellite texture for Mt. ${volcanoAsset.name}. Using procedural fallback.`);
      }
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    // Deform vertices and assign vertex colors (RGBA) for alpha transparency mapping
    const posAttr = planeGeom.attributes.position;
    const uvAttr = planeGeom.attributes.uv;
    const colors = [];

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const r = Math.sqrt(vx * vx + vy * vy);

      let vHeight = 0;
      let opacity = 1.0;

      if (r < R_rim) {
        // Inside the crater bowl
        const u_crater = r / R_rim;
        vHeight = H_crater + (H_max - H_crater) * u_crater * u_crater;
      } else if (r < radius) {
        // Concave flanks of the volcano
        const t = (r - R_rim) / (radius - R_rim);
        const flankBase = H_max * Math.pow(1.0 - t, 3.0);

        // Procedural radial ridge/erosion noise
        const theta = Math.atan2(vy, vx);
        const noiseFactor = (1.0 - t) * t; // fades out at rim and base
        const noise = (
          Math.sin(theta * 8.0) * 0.08 +
          Math.cos(theta * 15.0) * 0.04 +
          Math.sin(theta * 3.0) * 0.06
        ) * noiseFactor * H_max;

        vHeight = Math.max(0.0, flankBase + noise);
      } else {
        // Flat ground
        vHeight = 0;
      }

      posAttr.setZ(i, vHeight);

      // Seamless alpha blending at outer boundaries
      const R_fade = radius * 0.85;
      const R_max = size / 2.0;

      if (r < R_fade) {
        opacity = 1.0;
      } else if (r < R_max) {
        const t_fade = (r - R_fade) / (R_max - R_fade);
        opacity = 1.0 - (3 * t_fade * t_fade - 2 * t_fade * t_fade * t_fade); // Smoothstep fade
      } else {
        opacity = 0.0;
      }

      // Vertex color modulations (RGB=1)
      colors.push(1, 1, 1);

      // Project texture coordinates to geographic coordinates
      const wx = x + vx;
      const wy = y + vy;
      const vLon = LON_ANCHOR + wx / SPATIAL_SCALE;
      const vLat = LAT_ANCHOR + wy / SPATIAL_SCALE;

      const u = (vLon - lonMin) / (lonMax - lonMin);
      const v = (vLat - latMin) / (latMax - latMin);
      uvAttr.setXY(i, u, v);
    }

    planeGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    planeGeom.computeVertexNormals();
    uvAttr.needsUpdate = true;

    const coneMat = new THREE.MeshStandardMaterial({
      map:         fallbackTexture,
      roughness:   0.85,
      metalness:   0.1,
      flatShading: true,                   // faceted terrain relief look
      emissive:    colorObj,
      emissiveIntensity: alertLevel * 0.15, // glows dynamically based on threat level
      vertexColors: true,
      transparent:  true,
      depthWrite:   true,
    });

    coneMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #include <map_fragment>
        // Smoothly fade out edges based on UV coordinates to blend seamlessly
        float distFromCenter = distance(vMapUv, vec2(0.5));
        diffuseColor.a *= smoothstep(0.5, 0.42, distFromCenter);
        `
      );
    };

    const edifice = new THREE.Mesh(planeGeom, coneMat);
    edifice.position.set(x, y, z);
    edifice.userData.volcano = volcanoAsset;
    group.add(edifice);

    const lavaMaterials = [];

    // ── Magma Chamber Pool (placed at the bottom of the crater bowl) ──────
    const magmaGeom = new THREE.CircleGeometry(R_rim * 0.85, 32);
    const magmaMat  = new THREE.ShaderMaterial({
      vertexShader:   MAGMA_VERT,
      fragmentShader: MAGMA_FRAG,
      uniforms: {
        uTime:       { value: 0 },
        uBaseColor:  { value: colorObj },
        uAlertLevel: { value: alertLevel },
      },
      side:           THREE.DoubleSide,
    });
    const magma = new THREE.Mesh(magmaGeom, magmaMat);
    magma.position.set(0, 0, H_crater + 0.02); // placed inside the bowl
    edifice.add(magma);

    // ── Glowing Lava Streams (fissures) for high alert levels ──────────
    if (alertLevel >= 3) {
      const numFissures = 4;
      for (let f = 0; f < numFissures; f++) {
        const fPoints = [];
        const fAngle = (f / numFissures) * Math.PI * 2 + Math.random() * 0.5;
        const fLength = 10; // more steps for smoother lava paths
        for (let j = 0; j <= fLength; j++) {
          const t = j / fLength; // 0 = top rim, 1 = base
          const rCur = THREE.MathUtils.lerp(R_rim, radius, t);
          const t_slope = (rCur - R_rim) / (radius - R_rim);
          const baseHeight = H_max * Math.pow(1.0 - t_slope, 3.0);

          const wiggle = Math.sin(t_slope * 8.0) * 0.04;
          const curAngle = fAngle + wiggle;

          const noiseFactor = (1.0 - t_slope) * t_slope;
          const noise = (
            Math.sin(curAngle * 8.0) * 0.08 +
            Math.cos(curAngle * 15.0) * 0.04 +
            Math.sin(curAngle * 3.0) * 0.06
          ) * noiseFactor * H_max;

          const zCur = Math.max(0.0, baseHeight + noise);

          fPoints.push(new THREE.Vector3(
            Math.cos(curAngle) * rCur,
            Math.sin(curAngle) * rCur,
            zCur + 0.015 // floating slightly above the 3D mesh to prevent z-fighting
          ));
        }
        const fGeom = new THREE.BufferGeometry().setFromPoints(fPoints);
        const fMat = new THREE.ShaderMaterial({
          vertexShader:   LAVA_FLOW_VERT,
          fragmentShader: LAVA_FLOW_FRAG,
          uniforms: {
            uTime:  { value: 0 },
            uColor: { value: colorObj },
          },
          transparent: true,
          depthWrite:  false,
          blending:    THREE.AdditiveBlending,
        });
        lavaMaterials.push(fMat);
        const fLine = new THREE.Line(fGeom, fMat);
        edifice.add(fLine);
      }
    }

    // Invisible solid pick proxy
    const pickGeom = new THREE.CylinderGeometry(R_rim * 1.5, radius * 1.3, height * 1.1, 8);
    pickGeom.rotateX(Math.PI / 2);
    pickGeom.translate(0, 0, (height * 1.1) / 2);
    const pickMesh = new THREE.Mesh(
      pickGeom,
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickMesh.position.set(x, y, z);
    pickMesh.userData.volcano = volcanoAsset;
    group.add(pickMesh);

    // ── 2. PDZ Geofence Ring ─────────────────────────────────────────
    const pdzWorldRadius = (volcanoAsset.PDZ_Radius ?? 4) * (SPATIAL_SCALE / 111.0);
    const ringInner      = pdzWorldRadius;
    const ringOuter      = pdzWorldRadius + 0.12;

    const ringGeom = new THREE.RingGeometry(ringInner, ringOuter, 48);
    const ringMat  = new THREE.MeshBasicMaterial({
      color:       0xff1a44,
      side:        THREE.DoubleSide,
      transparent: true,
      opacity:     0.45,
    });

    const pdzBoundary = new THREE.Mesh(ringGeom, ringMat);
    pdzBoundary.position.set(x, y, z + 0.02);
    group.add(pdzBoundary);

    // ── 3. SO₂ Particle Plume ────────────────────────────────────────
    const rawParticleCount = Math.floor((volcanoAsset.SO2_Flux ?? 100) * 0.2);
    const particleCount    = Math.min(rawParticleCount, MAX_PARTICLES);

    let plume      = null;
    let velocities = null;

    if (particleCount > 0) {
      const pGeom = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      velocities = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i]     = x + (Math.random() - 0.5) * 0.3;
        positions[i + 1] = y + (Math.random() - 0.5) * 0.3;
        positions[i + 2] = z + height + Math.random() * 6.0;

        const alertVelocityBoost = 1.0 + alertLevel * 0.3;
        velocities[i]     = (Math.random() - 0.5) * 0.20;
        velocities[i + 1] = (Math.random() - 0.5) * 0.20;
        velocities[i + 2] = (Math.random() * 0.5 + 0.25) * alertVelocityBoost;
      }

      pGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const pMat = new THREE.PointsMaterial({
        color:       alertColor,
        size:        alertLevel >= 3 ? 0.30 : 0.22,
        transparent: true,
        opacity:     0.75,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        sizeAttenuation: true,
      });

      plume = new THREE.Points(pGeom, pMat);
      group.add(plume);
    }

    this._animationStates.set(volcanoAsset.ID, {
      plume,
      velocities,
      particleCount,
      pdzRing: pdzBoundary,
      magmaMaterial: magmaMat,
      lavaMaterials: lavaMaterials,
      x, y, z,
      craterZ: z + H_crater,
      volcano: volcanoAsset,
    });

    this.engine.addLayer(layerKey, group);
  }

  /**
   * Remove a volcanic node and its animation state.
   * @param {string} id  Volcano ID (matches volcanoAsset.ID)
   */
  removeVolcanicNode(id) {
    this._animationStates.delete(id);
    this.engine.disposeLayer(`volcano_${id}`);
  }

  /**
   * Update real-time telemetry for an existing node without full rebuild.
   * Only updates plume material color and opacity to reflect new alert level.
   *
   * @param {object} volcanoAsset  Updated asset descriptor
   */
  updateTelemetry(volcanoAsset) {
    // Full rebuild is simplest and keeps code paths predictable;
    // for hot-path updates in production, material uniform mutations would
    // be preferable.  Given the low node count (24 volcanoes) this is fine.
    this.addVolcanicNode(volcanoAsset);
  }

  /**
   * Remove all volcanic nodes from the scene.
   */
  clearAll() {
    for (const id of [...this._animationStates.keys()]) {
      this.removeVolcanicNode(id);
    }
  }

  /**
   * Update active tile style and refresh all volcanic node textures.
   * @param {string} styleName
   */
  setTileStyle(styleName) {
    if (styleName === this._styleName) return;
    this._styleName = styleName;

    // Collect and rebuild all active volcano assets
    const activeVolcanoes = [];
    for (const state of this._animationStates.values()) {
      if (state.volcano) {
        activeVolcanoes.push(state.volcano);
      }
    }
    for (const volcano of activeVolcanoes) {
      this.addVolcanicNode(volcano);
    }
  }
}

// ── Procedural Volcano Fallback Texture Generator ──────────────────────────────

function createProceduralVolcanoTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Draw basalt rock background gradient
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, '#1f1e24');
  grad.addColorStop(0.5, '#121215');
  grad.addColorStop(1, '#070709');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Draw rock radial cracks / topography lines
  ctx.strokeStyle = 'rgba(255, 69, 0, 0.18)'; // faint orange magma cracks
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.moveTo(128, 128);
    ctx.lineTo(
      128 + Math.cos(angle) * (60 + Math.random() * 40),
      128 + Math.sin(angle) * (60 + Math.random() * 40)
    );
  }
  ctx.stroke();

  // Draw glowing magma crater center
  ctx.fillStyle = 'rgba(255, 69, 0, 0.85)';
  ctx.shadowColor = '#ff4500';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(128, 128, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0; // reset

  // Draw a yellow core to represent extreme heat
  ctx.fillStyle = '#ffb300';
  ctx.beginPath();
  ctx.arc(128, 128, 9, 0, Math.PI * 2);
  ctx.fill();

  // Text label for name (discreet geodynamic label)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name.toUpperCase(), 128, 240);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
