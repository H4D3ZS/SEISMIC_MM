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
  1: { font: 'bold 42px monospace', color: '#9fd8e8', sub: '#5a8a9a', scale: 4.6, alpha: 0.85 },
  2: { font: 'bold 34px monospace', color: '#00e5ff', sub: '#4d8fa6', scale: 2.6, alpha: 0.95 },
  3: { font: 'bold 30px monospace', color: '#ffd34d', sub: '#a68c4d', scale: 1.5, alpha: 0.95 },
  4: { font: 'bold 28px monospace', color: '#ff8a5c', sub: '#a6644d', scale: 0.85, alpha: 0.95 },
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
    const style = TIER_STYLE[label.tier];

    // Measure, then render to a tight canvas (power-of-two not required)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = style.font;
    const nameW = ctx.measureText(label.name).width;
    const subText = label.parent ? label.parent.toUpperCase() : '';
    ctx.font = '20px monospace';
    const subW = subText ? ctx.measureText(subText).width : 0;

    const w = Math.ceil(Math.max(nameW, subW)) + 24;
    const h = subText ? 84 : 56;
    canvas.width = w;
    canvas.height = h;

    // Name
    ctx.font = style.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillStyle = style.color;
    ctx.fillText(label.name, w / 2, 6);

    // Parent sub-label — the hierarchy cue ("GLAN / SARANGANI")
    if (subText) {
      ctx.font = '20px monospace';
      ctx.fillStyle = style.sub;
      ctx.fillText(subText, w / 2, 52);
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
    sprite.scale.set(style.scale * aspect * 0.45, style.scale * 0.45 * (subText ? 1.5 : 1.0), 1);

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
