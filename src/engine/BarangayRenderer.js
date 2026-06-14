/**
 * BarangayRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders barangay-level polygon overlays on the Three.js viewport.
 * Color-coded by hazard/utility status. Supports click interaction for
 * detailed barangay info popup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { CITIES, STATUS_COLORS, computeCityStats } from '../data/CivicInfrastructureData.js';

const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;

// Approximate barangay polygon size (degrees)
const BARANGAY_SIZE_LAT = 0.012;
const BARANGAY_SIZE_LON = 0.015;

export class BarangayRenderer {
  constructor(engineInstance) {
    this.engine = engineInstance;
    this.group = new THREE.Group();
    this.group.name = 'barangay-overlays';
    this.group.visible = false;

    this._polygons = [];
    this._labels = [];
    this._city = null;

    this.engine.addLayer('barangay_overlays', this.group);
  }

  /**
   * Render barangay polygons for a city.
   * @param {string} cityName
   * @param {string} statusField  Which status to color by: 'water' | 'power' | 'hazard'
   */
  renderCity(cityName, statusField = 'hazard') {
    this.clear();
    this._city = cityName;

    const city = CITIES[cityName];
    if (!city) return;

    this.group.visible = true;

    for (const b of city.barangays) {
      const status = b[statusField];
      const colorMap = STATUS_COLORS[statusField];
      const colorInfo = colorMap[status] || colorMap[Object.keys(colorMap)[0]];

      // Create polygon geometry (hexagonal approximation)
      const cx = (b.lon - LON_ANCHOR) * SPATIAL_SCALE;
      const cy = (b.lat - LAT_ANCHOR) * SPATIAL_SCALE;
      const hw = BARANGAY_SIZE_LON * SPATIAL_SCALE * 0.5;
      const hh = BARANGAY_SIZE_LAT * SPATIAL_SCALE * 0.5;

      const shape = new THREE.Shape();
      // Octagonal shape for barangay boundaries
      const r = Math.min(hw, hh);
      const sides = 6;
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 6;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();

      // Fill polygon
      const fillMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorInfo.bg || colorInfo.border || '#333333'),
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const geom = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geom, fillMat);
      mesh.position.z = 0.02;
      this.group.add(mesh);

      // Border line
      const borderPoints = shape.getPoints(8);
      const borderGeom = new THREE.BufferGeometry().setFromPoints(
        borderPoints.map(p => new THREE.Vector3(p.x, p.y, 0.03))
      );
      const borderMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(colorInfo.border || colorInfo.bg || '#ffffff'),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const borderLine = new THREE.Line(borderGeom, borderMat);
      this.group.add(borderLine);

      this._polygons.push({
        mesh,
        border: borderLine,
        barangay: b,
        statusField,
        cx, cy,
      });
    }

    console.info(`[BarangayRenderer] Rendered ${city.barangays.length} barangay polygons for ${cityName}`);
  }

  /**
   * Update polygon colors when status changes.
   */
  updateStatus(statusField = 'hazard') {
    for (const poly of this._polygons) {
      const status = poly.barangay[statusField];
      const colorMap = STATUS_COLORS[statusField];
      const colorInfo = colorMap[status] || colorMap[Object.keys(colorMap)[0]];

      poly.mesh.material.color = new THREE.Color(colorInfo.bg || colorInfo.border || '#333333');
      poly.border.material.color = new THREE.Color(colorInfo.border || colorInfo.bg || '#ffffff');
    }
  }

  /**
   * Get the barangay at a given screen position (for click interaction).
   */
  getBarangayAt(worldX, worldY) {
    for (const poly of this._polygons) {
      const dx = worldX - poly.cx;
      const dy = worldY - poly.cy;
      const r = BARANGAY_SIZE_LON * SPATIAL_SCALE * 0.5;
      if (Math.sqrt(dx * dx + dy * dy) < r) {
        return poly.barangay;
      }
    }
    return null;
  }

  clear() {
    for (const poly of this._polygons) {
      this.group.remove(poly.mesh);
      this.group.remove(poly.border);
      poly.mesh.geometry.dispose();
      poly.mesh.material.dispose();
      poly.border.geometry.dispose();
      poly.border.material.dispose();
    }
    this._polygons = [];
    this._labels = [];
    this._city = null;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    this.clear();
    this.engine.disposeLayer('barangay_overlays');
  }
}
