/**
 * TrenchRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Subduction Trench Line Geometry
 *
 * Renders the four major Philippine tectonic plate boundaries as neon
 * CatmullRom spline tubes with depth-varying color.
 * Trenches: Manila, Cotabato, Philippine (East), East Luzon
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;

/** Raw geographic control points for each trench [lat, lon] */
const TRENCH_DEFINITIONS = [
  {
    id:    'manila_trench',
    label: 'Manila Trench',
    color: 0x00aaff,
    points: [
      [18.5, 120.0], [17.0, 119.5], [15.5, 119.2], [14.0, 119.0],
      [12.0, 118.8], [10.5, 118.5], [9.0,  119.0], [7.5,  119.8],
    ],
  },
  {
    id:    'cotabato_trench',
    label: 'Cotabato Trench',
    color: 0xff6600,
    points: [
      [5.5,  124.0], [6.5,  123.5], [7.5,  123.0],
      [8.5,  122.5], [9.5,  122.8],
    ],
  },
  {
    id:    'philippine_trench',
    label: 'Philippine Trench',
    color: 0x00ffcc,
    points: [
      [6.0,  127.5], [7.5,  127.0], [9.0,  126.8],
      [11.0, 126.5], [13.0, 126.8], [14.5, 127.0], [15.5, 127.5],
    ],
  },
  {
    id:    'east_luzon_trench',
    label: 'East Luzon Trough',
    color: 0xcc44ff,
    points: [
      [14.5, 125.0], [15.5, 124.5], [16.5, 124.0],
      [17.5, 123.5], [18.0, 123.0],
    ],
  },
];

export class TrenchRenderer {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;
  }

  /**
   * Build and add all trench splines to the scene.
   */
  renderAllTrenches() {
    for (const def of TRENCH_DEFINITIONS) {
      this._renderTrench(def);
    }
  }

  /**
   * @param {object} def  Trench definition object
   * @private
   */
  _renderTrench(def) {
    const key = `trench_${def.id}`;
    this.engine.disposeLayer(key);

    const splinePoints = def.points.map(([lat, lon]) => {
      const x = (lon - LON_ANCHOR) * SPATIAL_SCALE;
      const y = (lat - LAT_ANCHOR) * SPATIAL_SCALE;
      return new THREE.Vector3(x, y, 0.05); // Barely above terrain grid
    });

    const curve    = new THREE.CatmullRomCurve3(splinePoints, false, 'centripetal', 0.5);
    const points   = curve.getPoints(80);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color:       def.color,
      transparent: true,
      opacity:     0.7,
      linewidth:   1, // WebGL LineBasicMaterial is always 1px — use tube for thickness
    });

    const line = new THREE.Line(geometry, material);

    // Also add a wider dashed Line2 via an additive tube for a neon glow effect
    const tubeGeom = new THREE.TubeGeometry(curve, 80, 0.05, 6, false);
    const tubeMat  = new THREE.MeshBasicMaterial({
      color:       def.color,
      transparent: true,
      opacity:     0.18,
    });
    const tube = new THREE.Mesh(tubeGeom, tubeMat);

    const group = new THREE.Group();
    group.add(line);
    group.add(tube);

    this.engine.addLayer(key, group);
  }

  /**
   * Toggle visibility for all trench layers.
   * @param {boolean} visible
   */
  setVisible(visible) {
    for (const def of TRENCH_DEFINITIONS) {
      const obj = this.engine.registry.get(`trench_${def.id}`);
      if (obj) obj.visible = visible;
    }
  }

  /**
   * Remove all trench layers from the scene.
   */
  clearAll() {
    for (const def of TRENCH_DEFINITIONS) {
      this.engine.disposeLayer(`trench_${def.id}`);
    }
  }
}
