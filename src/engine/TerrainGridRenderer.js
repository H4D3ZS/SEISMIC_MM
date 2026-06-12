/**
 * TerrainGridRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Reference Terrain Grid
 *
 * Renders a neon coordinate grid anchored to the Philippine Archipelago's
 * spatial extent, providing the telemetry control room "floor plane" aesthetic.
 * Includes:
 *   • A primary grid (major lines every 5°)
 *   • A sub-grid (minor lines every 1°)
 *   • A flat plane mesh with subtle emissive texture
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;

// Philippine extent (degrees)
const LAT_MIN = 4.0;
const LAT_MAX = 21.5;
const LON_MIN = 116.0;
const LON_MAX = 130.0;

export class TerrainGridRenderer {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;
  }

  renderGrid() {
    this.engine.disposeLayer('terrain_grid');

    const group = new THREE.Group();

    // ── Base plane ───────────────────────────────────────────────────────
    const planeW = (LON_MAX - LON_MIN) * SPATIAL_SCALE;
    const planeH = (LAT_MAX - LAT_MIN) * SPATIAL_SCALE;
    const cx     = ((LON_MIN + LON_MAX) / 2 - LON_ANCHOR) * SPATIAL_SCALE;
    const cy     = ((LAT_MIN + LAT_MAX) / 2 - LAT_ANCHOR) * SPATIAL_SCALE;

    const planeGeom = new THREE.PlaneGeometry(planeW, planeH);
    // PlaneGeometry is in XY — leave rotation; it matches our coordinate system
    // Opaque fallback floor BELOW the satellite tile mosaic (z −0.012/−0.006):
    // only visible while imagery streams in or fully offline.
    const planeMat  = new THREE.MeshBasicMaterial({
      color: 0x060911,
      side:  THREE.FrontSide,
    });
    const plane = new THREE.Mesh(planeGeom, planeMat);
    plane.position.set(cx, cy, -0.02);
    plane.renderOrder = -3;
    group.add(plane);

    // ── Grid line geometry builder ───────────────────────────────────────
    const buildGrid = (stepDeg, color, opacity) => {
      const vertices = [];

      // Longitude lines (vertical in geographic)
      for (let lon = LON_MIN; lon <= LON_MAX + 0.001; lon += stepDeg) {
        const wx = (lon - LON_ANCHOR) * SPATIAL_SCALE;
        const y0 = (LAT_MIN - LAT_ANCHOR) * SPATIAL_SCALE;
        const y1 = (LAT_MAX - LAT_ANCHOR) * SPATIAL_SCALE;
        vertices.push(wx, y0, 0, wx, y1, 0);
      }

      // Latitude lines (horizontal in geographic)
      for (let lat = LAT_MIN; lat <= LAT_MAX + 0.001; lat += stepDeg) {
        const wy = (lat - LAT_ANCHOR) * SPATIAL_SCALE;
        const x0 = (LON_MIN - LON_ANCHOR) * SPATIAL_SCALE;
        const x1 = (LON_MAX - LON_ANCHOR) * SPATIAL_SCALE;
        vertices.push(x0, wy, 0, x1, wy, 0);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

      const mat  = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      return new THREE.LineSegments(geom, mat);
    };

    // Sub-grid (1° minor lines)
    group.add(buildGrid(1.0, 0x0d2233, 0.55));
    // Major grid (5° labeled)
    group.add(buildGrid(5.0, 0x003344, 0.80));
    // Bounding box accent
    group.add(buildGrid(100.0, 0x00ccff, 0.25)); // Single box at full extent

    // ── Shallow depth indicator plane (shows crust/mantle boundary cue) ─
    const deepPlaneGeom = new THREE.PlaneGeometry(planeW, planeH);
    const deepPlaneMat  = new THREE.MeshBasicMaterial({
      color:       0x0a0418,
      transparent: true,
      opacity:     0.6,
      side:        THREE.FrontSide,
    });
    const deepPlane = new THREE.Mesh(deepPlaneGeom, deepPlaneMat);
    // Position at ~100 km depth in scene space
    deepPlane.position.set(cx, cy, -(100 * 0.25));
    group.add(deepPlane);

    this.engine.addLayer('terrain_grid', group);
  }

  /**
   * @param {boolean} visible
   */
  setVisible(visible) {
    const obj = this.engine.registry.get('terrain_grid');
    if (obj) obj.visible = visible;
  }
}
