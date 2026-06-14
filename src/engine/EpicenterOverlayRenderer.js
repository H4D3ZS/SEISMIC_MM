/**
 * EpicenterOverlayRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders rich cartographic and situational overlays inspired by lindol.app:
 *   - Epicenter Magnitude Badge (circular badge with Mw value).
 *   - Epicenter Warning Sign floating above the magnitude badge.
 *   - Concentric wave rings propagating outward from the selected epicenter.
 *   - Dashed orange-red loop outlining the "Sarangani Aftershock Zone" with badge.
 *   - Pulsing green verified safety badge at Davao City.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;

export class EpicenterOverlayRenderer {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;
    this.group  = new THREE.Group();
    this.group.name = 'epicenter-overlays';

    this._activeEvent = null;
    this._badgeSprite = null;
    this._pulseRings  = [];
    this._stressHotspot = null;
    this._llmPredictedFocus = null;
    
    // Safety checkmark badge at Davao City (7.07°N, 125.61°E)
    this._safetyShield = null;

    // Aftershock Zone meshes
    this._aftershockGroup = new THREE.Group();
    this._aftershockGroup.visible = false;
    this.group.add(this._aftershockGroup);

    this._buildSafetyShield();
    this._buildAftershockZone();
    
    this.engine.addLayer('epicenter_overlays', this.group);
  }

  // ─── Initial Construction ──────────────────────────────────────────────────

  _buildSafetyShield() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Draw green report checkmark circle (white border, green fill)
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#2e7d32'; // Forest Green
    ctx.beginPath();
    ctx.arc(32, 32, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // White checkmark
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✔', 32, 33);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this._safetyShield = new THREE.Sprite(material);
    this._safetyShield.scale.set(1.5, 1.5, 1);
    
    const x = (125.61 - LON_ANCHOR) * SPATIAL_SCALE;
    const y = (7.07 - LAT_ANCHOR) * SPATIAL_SCALE;
    this._safetyShield.position.set(x, y, 0.45);
    this.group.add(this._safetyShield);
  }

  _buildAftershockZone() {
    // Generates a dashed loop outlining the Sarangani aftershock zone
    const points = [];
    const numPoints = 64;
    const centerLat = 5.8;
    const centerLon = 125.2;
    const radiusLat = 1.0;
    const radiusLon = 0.85;

    for (let i = 0; i <= numPoints; i++) {
      const theta = (i / numPoints) * Math.PI * 2;
      const lat = centerLat + Math.sin(theta) * radiusLat;
      const lon = centerLon + Math.cos(theta) * radiusLon;
      points.push(new THREE.Vector3(
        (lon - LON_ANCHOR) * SPATIAL_SCALE,
        (lat - LAT_ANCHOR) * SPATIAL_SCALE,
        0.08
      ));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0xff4f1a, // orange-red
      dashSize: 0.6,
      gapSize: 0.4,
      transparent: true,
      opacity: 0.8,
      linewidth: 2,
    });

    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    this._aftershockGroup.add(line);

    // Text card: "SARANGANI AFTERSHOCK ZONE"
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    // Rounded rect
    ctx.fillStyle = 'rgba(230, 74, 25, 0.9)'; // rich orange
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    
    // Rounded rect path helper
    const r = 8;
    const w = 256, h = 48;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 15px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SARANGANI AFTERSHOCK ZONE', w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const badgeMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this._aftershockBadge = new THREE.Sprite(badgeMat);
    this._aftershockBadge.scale.set(6.0, 1.125, 1);
    
    // Position near the top of the zone loop
    const bx = (centerLon - LON_ANCHOR) * SPATIAL_SCALE;
    const by = (centerLat + radiusLat - 0.2 - LAT_ANCHOR) * SPATIAL_SCALE;
    this._aftershockBadge.position.set(bx, by, 0.4);
    this._aftershockGroup.add(this._aftershockBadge);
  }

  // ─── Set Event & Dynamic Updates ───────────────────────────────────────────

  /**
   * Set epicenter coordinates and generate overlays.
   * @param {{lat: number, lon: number, depth: number, mag: number}} event
   */
  setEvent(event) {
    this._activeEvent = event;

    // Clear previous dynamic meshes
    if (this._badgeSprite) {
      this.group.remove(this._badgeSprite);
      this._badgeSprite.material.map?.dispose();
      this._badgeSprite.material.dispose();
      this._badgeSprite = null;
    }
    this._clearRings();

    if (!event) {
      this._aftershockGroup.visible = false;
      return;
    }

    const ex = (event.lon - LON_ANCHOR) * SPATIAL_SCALE;
    const ey = (event.lat - LAT_ANCHOR) * SPATIAL_SCALE;

    // 1. Build epicenter circular magnitude badge and warning triangle
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    const cx = 64, cy = 64; // centered
    const showWarning = event.mag >= 5.0;

    // Magnitude circle
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 8;
    ctx.fillStyle = event.mag >= 7.0 ? '#ff1a44' : (event.mag >= 5.5 ? '#ffaa00' : '#00e5ff');
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Text: magnitude value
    ctx.font = 'bold 22px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(event.mag.toFixed(1), cx, cy);

    // Warning sign above the badge
    if (showWarning) {
      const wx = cx, wy = cy - 44;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      
      // Draw white triangle base
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(wx, wy - 14);
      ctx.lineTo(wx + 15, wy + 10);
      ctx.lineTo(wx - 15, wy + 10);
      ctx.closePath();
      ctx.fill();

      // Draw red triangle border
      ctx.strokeStyle = '#ff1a44';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Warning exclamation mark
      ctx.shadowColor = 'transparent';
      ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', wx, wy + 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this._badgeSprite = new THREE.Sprite(material);
    // Scale according to magnitude
    const badgeScale = 2.2 + (event.mag - 4.0) * 0.15;
    this._badgeSprite.scale.set(badgeScale, badgeScale, 1);
    this._badgeSprite.position.set(ex, ey, 0.4);
    this.group.add(this._badgeSprite);

    // 2. Generate concentric wave rings (propagating out)
    const maxRings = 3;
    const baseColor = event.mag >= 7.0 ? 0xff1a44 : (event.mag >= 5.5 ? 0xffaa00 : 0x00ffcc);
    
    for (let i = 0; i < maxRings; i++) {
      const ringGeom = new THREE.RingGeometry(0.98, 1.0, 64);
      const ringMat = new THREE.LineBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const ringMesh = new THREE.LineLoop(ringGeom, ringMat);
      ringMesh.position.set(ex, ey, 0.06);
      
      // Offset starting progress of rings
      const progress = i / maxRings;
      this.group.add(ringMesh);
      this._pulseRings.push({ mesh: ringMesh, progress });
    }

    // 3. Show Sarangani Aftershock Zone outline for major Southern events
    const isMajorSouthern = event.mag >= 6.5 && event.lat < 8.0 && event.lon > 123.0;
    this._aftershockGroup.visible = isMajorSouthern;
  }

  /**
   * Render or clear the AI stress loading prediction hotspot.
   * @param {number|null} lat
   * @param {number|null} lon
   * @param {number} [intensity=1.0]
   */
  setStressHotspot(lat, lon, intensity = 1.0) {
    if (this._stressHotspot) {
      this.group.remove(this._stressHotspot);
      this._stressHotspot.traverse(child => {
        if (child.isMesh || child.isLine || child.isSprite) {
          child.geometry?.dispose();
          if (child.material) {
            child.material.map?.dispose();
            child.material.dispose();
          }
        }
      });
      this._stressHotspot = null;
    }

    if (lat === null || lon === null) return;

    const ex = (lon - LON_ANCHOR) * SPATIAL_SCALE;
    const ey = (lat - LAT_ANCHOR) * SPATIAL_SCALE;

    this._stressHotspot = new THREE.Group();
    this._stressHotspot.position.set(ex, ey, 0.02);

    // Glowing red-orange core (represents high Coulomb stress transfer)
    const coreGeom = new THREE.RingGeometry(0.01, 1.8, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff3c00, // vibrant red-orange
      transparent: true,
      opacity: 0.22 * intensity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    this._stressHotspot.add(coreMesh);

    // Outer gradient boundary ring
    const borderGeom = new THREE.RingGeometry(1.75, 1.8, 32);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0xff3c00,
      transparent: true,
      opacity: 0.65 * intensity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const borderMesh = new THREE.Mesh(borderGeom, borderMat);
    this._stressHotspot.add(borderMesh);

    // Label card sprite: "AI PREDICTED FOCUS"
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 36;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(255, 60, 0, 0.85)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    
    // Rounded rect
    const r = 6, w = 160, h = 36;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 10px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AI PREDICTED FOCUS', w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.scale.set(4.0, 0.9, 1);
    labelSprite.position.set(0, 2.3, 0.3); // offset above the stress core
    this._stressHotspot.add(labelSprite);

    this.group.add(this._stressHotspot);
    console.info(`[EpicenterOverlayRenderer] Plotted stress prediction hotspot at (${lat}, ${lon})`);
  }

  /**
   * Render or clear the LLM predicted rupture focus.
   * @param {number|null} lat
   * @param {number|null} lon
   */
  setLLMPredictedFocus(lat, lon) {
    if (this._llmPredictedFocus) {
      this.group.remove(this._llmPredictedFocus);
      this._llmPredictedFocus.traverse(child => {
        if (child.isMesh || child.isLine || child.isSprite) {
          child.geometry?.dispose();
          if (child.material) {
            child.material.map?.dispose();
            child.material.dispose();
          }
        }
      });
      this._llmPredictedFocus = null;
    }

    if (lat === null || lon === null) return;

    const ex = (lon - LON_ANCHOR) * SPATIAL_SCALE;
    const ey = (lat - LAT_ANCHOR) * SPATIAL_SCALE;

    this._llmPredictedFocus = new THREE.Group();
    this._llmPredictedFocus.position.set(ex, ey, 0.03);

    // Glowing cyan/neon blue core (represents high probability seismicity prediction)
    const coreGeom = new THREE.RingGeometry(0.01, 1.5, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, // cyan
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    this._llmPredictedFocus.add(coreMesh);

    // Outer gradient boundary ring
    const borderGeom = new THREE.RingGeometry(1.45, 1.5, 32);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const borderMesh = new THREE.Mesh(borderGeom, borderMat);
    this._llmPredictedFocus.add(borderMesh);

    // Label card sprite: "LLM PREDICTED FOCUS"
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 36;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 229, 255, 0.85)'; // cyan background
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    
    // Rounded rect
    const r = 6, w = 160, h = 36;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 10px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LLM PREDICTED FOCUS', w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.scale.set(4.0, 0.9, 1);
    labelSprite.position.set(0, 2.0, 0.3); // offset above the stress core
    this._llmPredictedFocus.add(labelSprite);

    this.group.add(this._llmPredictedFocus);
    console.info(`[EpicenterOverlayRenderer] Plotted LLM predicted focus at (${lat}, ${lon})`);
  }

  _clearRings() {
    for (const r of this._pulseRings) {
      this.group.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
    this._pulseRings = [];
  }

  // ─── Per-frame animation ───────────────────────────────────────────────────

  update(elapsed, delta) {
    // 1. Pulsing green safety checkmark badge
    if (this._safetyShield) {
      const safetyScale = 1.6 + Math.sin(elapsed * 4.5) * 0.15;
      this._safetyShield.scale.set(safetyScale, safetyScale, 1);
    }

    // 2. Concentric rings propagation
    const maxRadius = this._activeEvent ? Math.max(8.0, this._activeEvent.mag * 2.8) : 15.0;
    const ringSpeed = 0.35; // speed of radial expansion

    for (const r of this._pulseRings) {
      r.progress += delta * ringSpeed;
      if (r.progress >= 1.0) r.progress = 0.0; // loop back to epicenter

      const radius = r.progress * maxRadius;
      r.mesh.scale.set(radius, radius, 1);
      
      // Decay opacity towards the outer edge
      r.mesh.material.opacity = (1.0 - r.progress) * 0.9;
    }

    // 3. Pulsing AI stress hotspot
    if (this._stressHotspot && this._stressHotspot.children.length >= 2) {
      const pulse = 1.0 + 0.08 * Math.sin(elapsed * 3.5);
      this._stressHotspot.children[0].scale.set(pulse, pulse, 1);
      this._stressHotspot.children[1].scale.set(pulse, pulse, 1);
    }

    // 4. Pulsing LLM predicted focus
    if (this._llmPredictedFocus && this._llmPredictedFocus.children.length >= 2) {
      const pulse = 1.0 + 0.08 * Math.sin(elapsed * 4.0);
      this._llmPredictedFocus.children[0].scale.set(pulse, pulse, 1);
      this._llmPredictedFocus.children[1].scale.set(pulse, pulse, 1);
    }
  }

  dispose() {
    if (this._badgeSprite) {
      this._badgeSprite.material.map?.dispose();
      this._badgeSprite.material.dispose();
    }
    this._clearRings();
    
    if (this._safetyShield) {
      this._safetyShield.material.map?.dispose();
      this._safetyShield.material.dispose();
    }

    if (this._stressHotspot) {
      this.group.remove(this._stressHotspot);
      this._stressHotspot.traverse(child => {
        if (child.isMesh || child.isLine || child.isSprite) {
          child.geometry?.dispose();
          if (child.material) {
            child.material.map?.dispose();
            child.material.dispose();
          }
        }
      });
    }

    if (this._llmPredictedFocus) {
      this.group.remove(this._llmPredictedFocus);
      this._llmPredictedFocus.traverse(child => {
        if (child.isMesh || child.isLine || child.isSprite) {
          child.geometry?.dispose();
          if (child.material) {
            child.material.map?.dispose();
            child.material.dispose();
          }
        }
      });
    }

    this._aftershockGroup.traverse(child => {
      if (child.isMesh || child.isLine) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });

    this.engine.disposeLayer('epicenter_overlays');
  }
}
