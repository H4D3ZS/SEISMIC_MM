/**
 * GeodynamicLayerRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders NASA-grade tectonic feature layers in the Three.js viewport:
 *   1. Active Tectonic Fault Lines (Philippine Fault System, Valley Fault System,
 *      Cotabato Fault Zone).
 *   2. Tectonic GPS Velocity Vectors (3D arrow helpers at major cities showing
 *      crustal movement magnitude & azimuth in mm/year).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;

// Coordinates tracing major geological fault systems in the Philippines
const FAULT_SYSTEMS = [
  {
    name: 'Philippine Fault Zone - Luzon Segment',
    coords: [
      { lat: 18.2, lon: 122.0 },
      { lat: 17.5, lon: 121.8 },
      { lat: 16.8, lon: 121.5 },
      { lat: 16.0, lon: 121.1 },
      { lat: 15.3, lon: 121.3 },
      { lat: 14.6, lon: 121.8 },
      { lat: 13.7, lon: 122.3 }
    ],
    color: 0xff4500 // neon orange-red
  },
  {
    name: 'Philippine Fault Zone - Leyte/Visayas Segment',
    coords: [
      { lat: 12.5, lon: 124.0 },
      { lat: 11.8, lon: 124.5 },
      { lat: 10.9, lon: 124.8 },
      { lat: 10.1, lon: 125.1 }
    ],
    color: 0xff4500
  },
  {
    name: 'Philippine Fault Zone - Mindanao Segment',
    coords: [
      { lat: 9.8, lon: 125.5 },
      { lat: 9.0, lon: 125.8 },
      { lat: 8.2, lon: 126.1 },
      { lat: 7.3, lon: 126.0 },
      { lat: 6.4, lon: 126.2 },
      { lat: 5.7, lon: 126.4 }
    ],
    color: 0xff4500
  },
  {
    name: 'West Valley Fault System',
    coords: [
      { lat: 14.80, lon: 121.10 },
      { lat: 14.65, lon: 121.08 },
      { lat: 14.50, lon: 121.05 },
      { lat: 14.35, lon: 121.03 }
    ],
    color: 0xff0055 // magenta-red
  },
  {
    name: 'Cotabato Fault Zone',
    coords: [
      { lat: 7.10, lon: 124.20 },
      { lat: 6.60, lon: 124.50 },
      { lat: 6.10, lon: 124.80 },
      { lat: 5.60, lon: 125.10 }
    ],
    color: 0xff5500
  },
  {
    name: 'Central Digos Fault System',
    coords: [
      { lat: 6.95, lon: 125.25 },
      { lat: 6.85, lon: 125.30 },
      { lat: 6.756, lon: 125.356 },
      { lat: 6.65, lon: 125.40 },
      { lat: 6.55, lon: 125.45 }
    ],
    color: 0xffaa00
  },
  {
    name: 'Tangbulan Fault',
    coords: [
      { lat: 6.88, lon: 125.42 },
      { lat: 6.78, lon: 125.45 },
      { lat: 6.68, lon: 125.48 },
      { lat: 6.58, lon: 125.51 },
      { lat: 6.48, lon: 125.54 }
    ],
    color: 0xffaa00
  },
  {
    name: 'Davao River Fault',
    coords: [
      { lat: 7.30, lon: 125.45 },
      { lat: 7.20, lon: 125.50 },
      { lat: 7.10, lon: 125.58 },
      { lat: 7.00, lon: 125.65 },
      { lat: 6.90, lon: 125.72 }
    ],
    color: 0xffaa00
  }
];

// Active GPS geodesy stations reporting plate movement velocities
const GPS_STATIONS = [
  { name: 'MNL1 (Manila)', lat: 14.59, lon: 120.98, velocity: 12, direction: 280 }, // West-Northwest
  { name: 'LAO1 (Laoag)', lat: 18.19, lon: 120.59, velocity: 14, direction: 285 },
  { name: 'LEG1 (Legazpi)', lat: 13.14, lon: 123.74, velocity: 26, direction: 295 },
  { name: 'CEB1 (Cebu City)', lat: 10.31, lon: 123.89, velocity: 22, direction: 290 },
  { name: 'DVO1 (Davao)', lat: 7.07, lon: 125.61, velocity: 38, direction: 298 },
  { name: 'GSO1 (GenSan)', lat: 6.11, lon: 125.17, velocity: 42, direction: 305 },
  { name: 'ZAM1 (Zamboanga)', lat: 6.92, lon: 122.07, velocity: 18, direction: 275 }
];

export class GeodynamicLayerRenderer {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;
    
    // Group for fault lines
    this.faultGroup = new THREE.Group();
    this.faultGroup.name = 'fault-lines';
    this.faultGroup.visible = true; // Enabled by default
    this.engine.addLayer('fault_lines', this.faultGroup);

    // Group for GPS vectors
    this.gpsGroup = new THREE.Group();
    this.gpsGroup.name = 'gps-vectors';
    this.gpsGroup.visible = true; // Enabled by default
    this.engine.addLayer('gps_vectors', this.gpsGroup);

    this._arrows = [];
    this._labels = [];

    this._buildFaultLines();
    this._buildGPSVectors();
  }

  _buildFaultLines() {
    for (const fault of FAULT_SYSTEMS) {
      const points = [];
      for (const pt of fault.coords) {
        const x = (pt.lon - LON_ANCHOR) * SPATIAL_SCALE;
        const y = (pt.lat - LAT_ANCHOR) * SPATIAL_SCALE;
        points.push(new THREE.Vector3(x, y, 0.08)); // slightly above terrain
      }

      // Generate catmull-rom spline for smooth curves
      const curve = new THREE.CatmullRomCurve3(points);
      const curvePoints = curve.getPoints(50);
      const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);

      // Dash material for active faults
      const material = new THREE.LineDashedMaterial({
        color: fault.color,
        dashSize: 0.5,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.85,
        linewidth: 2.5
      });

      const line = new THREE.Line(geometry, material);
      line.name = fault.name;
      line.computeLineDistances();
      this.faultGroup.add(line);
    }
    console.info(`[GeodynamicLayerRenderer] Mapped ${FAULT_SYSTEMS.length} primary fault systems.`);
  }

  _buildGPSVectors() {
    for (const station of GPS_STATIONS) {
      const x = (station.lon - LON_ANCHOR) * SPATIAL_SCALE;
      const y = (station.lat - LAT_ANCHOR) * SPATIAL_SCALE;
      const origin = new THREE.Vector3(x, y, 0.1);

      // Convert azimuth direction (degrees) to 3D direction vector
      // Azimuth 0 is North, 90 is East, 180 is South, 270 is West
      const angleRad = (90 - station.direction) * (Math.PI / 180);
      const dirVec = new THREE.Vector3(Math.cos(angleRad), Math.sin(angleRad), 0).normalize();

      // Scale length by velocity (e.g. 42mm/yr -> 1.68 units length)
      const length = station.velocity * 0.04; 

      // 3D Arrow helper (yellow, represents tectonic velocity vector)
      const arrow = new THREE.ArrowHelper(dirVec, origin, length, 0xffff00, 0.3, 0.15);
      
      // Inject some visual updates in material settings for extra glow
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.85;
      arrow.line.material.linewidth = 2.0;
      arrow.cone.material.transparent = true;
      arrow.cone.material.opacity = 0.95;

      this.gpsGroup.add(arrow);
      this._arrows.push(arrow);

      // Label sprite card: e.g. "DVO1: 38 mm/yr"
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 24;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(12, 16, 22, 0.75)';
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 1;

      // Draw small card
      ctx.fillRect(0, 0, 96, 24);
      ctx.strokeRect(0, 0, 96, 24);

      ctx.font = 'bold 8px "Courier New", Courier, monospace';
      ctx.fillStyle = '#ffff00';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${station.name.split(' ')[0]} ${station.velocity}mm/y`, 48, 12);

      const texture = new THREE.CanvasTexture(canvas);
      const labelMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
      });

      const labelSprite = new THREE.Sprite(labelMat);
      labelSprite.scale.set(1.5, 0.375, 1);
      // Offset position slightly away from arrow head
      const labelPos = origin.clone().add(dirVec.clone().multiplyScalar(length + 0.35));
      labelPos.z = 0.35;
      labelSprite.position.copy(labelPos);

      this.gpsGroup.add(labelSprite);
      this._labels.push(labelSprite);
    }
    console.info(`[GeodynamicLayerRenderer] Plotted ${GPS_STATIONS.length} geodetic velocity vectors.`);
  }

  setFaultsVisible(visible) {
    this.faultGroup.visible = visible;
  }

  setGPSVisible(visible) {
    this.gpsGroup.visible = visible;
  }

  /**
   * Update active fault hazards based on transfer loads.
   * @param {Object.<string, number>} faultLoads
   */
  updateFaultHazards(faultLoads) {
    if (!faultLoads) return;
    this.faultGroup.children.forEach(line => {
      const load = faultLoads[line.name];
      if (load !== undefined && line.material) {
        if (load > 1.0) {
          line.material.color.setHex(0xff1a44); // Critical load - bright red
          line.material.dashSize = 0.8;
          line.material.gapSize = 0.2;
        } else if (load > 0.5) {
          line.material.color.setHex(0xffaa00); // Moderate load - amber
          line.material.dashSize = 0.6;
          line.material.gapSize = 0.25;
        } else {
          line.material.color.setHex(0x00ff88); // Low load - green/cyan indicator
          line.material.dashSize = 0.5;
          line.material.gapSize = 0.3;
        }
        line.computeLineDistances();
      }
    });
  }

  /**
   * Reset all faults to their base structural colors.
   */
  resetFaultColors() {
    this.faultGroup.children.forEach(line => {
      const original = FAULT_SYSTEMS.find(f => f.name === line.name);
      if (original && line.material) {
        line.material.color.setHex(original.color);
        line.material.dashSize = 0.5;
        line.material.gapSize = 0.3;
        line.computeLineDistances();
      }
    });
  }

  update(elapsed) {
    // Subtle animations to represent active crustal strain
    const pulse = 0.75 + 0.25 * Math.sin(elapsed * 2.5);
    for (const label of this._labels) {
      label.material.opacity = pulse;
    }

    // Flow fault line dashes by altering line offsets
    for (const child of this.faultGroup.children) {
      if (child.material) {
        child.material.dashOffset = -elapsed * 0.8;
      }
    }
  }

  dispose() {
    this.faultGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.gpsGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      if (child.material?.map) child.material.map.dispose();
    });

    this.engine.disposeLayer('fault_lines');
    this.engine.disposeLayer('gps_vectors');
  }
}
