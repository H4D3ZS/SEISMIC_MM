/**
 * PlaceLabelRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hierarchical place-name labels rendered as camera-facing sprites.
 *
 *  - Canvas-generated text textures (name + parent sub-label), built once per
 *    label and cached; tier visibility toggles per frame, no rebuild churn.
 *  - LoD: camera distance gates tiers — islands always, provinces/cities at
 *    mid zoom, municipalities close, barangays at tactical zoom.
 *  - Sprites face the camera at any orbit angle, so labels stay readable in
 *    the tilted 3D view.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { PLACE_LABELS } from '../data/PlaceLabelCatalog.js';

const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;

/** Tier → max camera distance at which the tier is shown. */
const TIER_DISTANCE = { 1: Infinity, 2: 90, 3: 35, 4: 14 };

/** Tier → visual style. */
const TIER_STYLE = {
  1: { font: 'bold 36px "Inter", "Segoe UI", sans-serif', color: '#bce4f0', sub: '#7ba9b8', scale: 4.6, alpha: 0.9 },
  2: { font: 'bold 26px "Inter", "Segoe UI", sans-serif', color: '#f5f7f8', sub: '#a0b4c6', scale: 2.6, alpha: 0.95 },
  3: { font: 'bold 20px "Inter", "Segoe UI", sans-serif', color: '#eae1cc', sub: '#b0a68d', scale: 1.5, alpha: 0.95 },
  4: { font: '500 16px "Inter", "Segoe UI", sans-serif', color: '#f7c8b2', sub: '#b89484', scale: 0.85, alpha: 0.95 },
};

export class PlaceLabelRenderer {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;
    this.group  = new THREE.Group();
    this.group.name = 'place-labels';

    /** @type {Array<{sprite: THREE.Sprite, tier: number}>} */
    this._labels = [];
    this._visible = true;
    this._accum = 0;

    this._buildAll();
    this.engine.addLayer('place_labels', this.group);
  }

  // ── Construction ───────────────────────────────────────────────────────────

  _buildAll() {
    for (const label of PLACE_LABELS) {
      const sprite = this._buildSprite(label);
      this.group.add(sprite);
      this._labels.push({ sprite, tier: label.tier });
    }
    console.info(`[CISV] Place labels: ${this._labels.length} across 4 LoD tiers.`);
  }

  _buildSprite(label) {
    const isWater = label.isBodyOfWater === true;
    const style = isWater 
      ? { font: 'italic bold 22px "Inter", "Segoe UI", sans-serif', color: '#54c5d8', sub: null, scale: 4.0, alpha: 0.8 }
      : TIER_STYLE[label.tier];

    // Measure, then render to a tight canvas (power-of-two not required)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = style.font;
    const nameW = ctx.measureText(label.name).width;
    const subText = (!isWater && label.parent) ? label.parent : '';
    ctx.font = '16px "Inter", "Segoe UI", sans-serif';
    const subW = subText ? ctx.measureText(subText).width : 0;

    const w = Math.ceil(Math.max(nameW, subW)) + 24;
    const h = 96;
    canvas.width = w;
    canvas.height = h;

    // Configure text stroke outline and shadow for high contrast on terrain
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = isWater ? 4 : 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = isWater ? 2.5 : (label.tier <= 2 ? 4 : 3);

    // Draw Name
    ctx.font = style.font;
    ctx.textAlign = 'center';
    ctx.fillStyle = style.color;

    const cy = h / 2;

    if (isWater || label.tier === 1) {
      ctx.textBaseline = 'middle';
      ctx.strokeText(label.name, w / 2, cy);
      ctx.fillText(label.name, w / 2, cy);
    } else {
      // Draw text offset above the dot
      ctx.textBaseline = 'bottom';
      ctx.strokeText(label.name, w / 2, cy - 6);
      ctx.fillText(label.name, w / 2, cy - 6);

      // Draw subtext offset below the dot
      if (subText) {
        ctx.font = '12px "Inter", "Segoe UI", sans-serif';
        ctx.fillStyle = style.sub;
        ctx.textBaseline = 'top';
        ctx.strokeText(subText, w / 2, cy + 6);
        ctx.fillText(subText, w / 2, cy + 6);
      }

      // Draw anchor dot exactly in the center (which will align with lat/lon)
      ctx.shadowColor = 'transparent'; // disable shadow for clean dot geometry
      ctx.beginPath();
      const radius = label.tier === 2 ? 5.5 : (label.tier === 3 ? 4.5 : 3.5);
      ctx.arc(w / 2, cy, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: style.alpha,
      depthWrite: false,
      depthTest: false, // never buried under terrain tiles or markers
    });

    const sprite = new THREE.Sprite(material);
    const aspect = w / h;
    sprite.scale.set(style.scale * aspect * 0.45, style.scale * 0.45, 1);

    const x = (label.lon - LON_ANCHOR) * SPATIAL_SCALE;
    const y = (label.lat - LAT_ANCHOR) * SPATIAL_SCALE;
    sprite.position.set(x, y, 0.3 + label.tier * 0.05);
    sprite.renderOrder = 10 + label.tier;

    return sprite;
  }

  // ── Per-frame LoD (call from engine frame hook) ────────────────────────────

  update(_elapsed, delta) {
    this._accum += delta;
    if (this._accum < 0.2) return; // 5 Hz visibility check is plenty
    this._accum = 0;

    if (!this._visible) return;

    const distance = this.engine.camera.position.distanceTo(this.engine.controls.target);
    for (const { sprite, tier } of this._labels) {
      sprite.visible = distance < TIER_DISTANCE[tier];
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setVisible(visible) {
    this._visible = visible;
    this.group.visible = visible;
  }

  dispose() {
    for (const { sprite } of this._labels) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this._labels = [];
    this.engine.disposeLayer('place_labels');
  }
}
