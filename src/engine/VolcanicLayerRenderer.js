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
    const { plume, velocities, particleCount, x, y, pdzRing, craterZ } = state;

    // ── PDZ ring pulse ───────────────────────────────────────────────
    if (pdzRing) {
      const scalePulse = 1.0 + Math.sin(elapsed * 4.0) * 0.04;
      pdzRing.scale.set(scalePulse, scalePulse, 1.0);
      // Fade opacity in/out for threat-level awareness effect
      pdzRing.material.opacity = 0.35 + Math.sin(elapsed * 4.0) * 0.15;
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

    // ── 1. Structural Edifice Cone ───────────────────────────────────
    // Height scales with the real edifice elevation (Apo 2954 m → ~2.4 wu,
    // Didicas 244 m → ~0.7 wu) so the arc reads as true 3D relief.
    const height = 0.55 + (volcanoAsset.elevation ?? 1200) / 1600;
    const radius = height * 0.55;

    const coneGeom = new THREE.ConeGeometry(radius, height, 12, 1, true);
    // ConeGeometry apex points +Y; scene up is +Z → rotate apex to +Z,
    // then lift so the base sits exactly on the map surface.
    coneGeom.rotateX(Math.PI / 2);
    coneGeom.translate(0, 0, height / 2);

    const coneMat = new THREE.MeshBasicMaterial({
      color:       alertColor,
      wireframe:   true,
      transparent: true,
      opacity:     0.65,
    });

    const edifice = new THREE.Mesh(coneGeom, coneMat);
    edifice.position.set(x, y, z);
    // Picking metadata for the RaycasterController
    edifice.userData.volcano = volcanoAsset;
    group.add(edifice);

    // Invisible solid pick proxy — raycasting against wireframe-rendered
    // geometry still uses triangles, but an open cone is hard to hit; a
    // slightly fatter closed cone makes hover/click reliable.
    const pickGeom = new THREE.ConeGeometry(radius * 1.3, height * 1.1, 8);
    pickGeom.rotateX(Math.PI / 2);
    pickGeom.translate(0, 0, (height * 1.1) / 2);
    const pickMesh = new THREE.Mesh(
      pickGeom,
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickMesh.position.set(x, y, z);
    pickMesh.userData.volcano = volcanoAsset;
    group.add(pickMesh);

    // Subtle label ring at the crater rim
    const topRingGeom = new THREE.RingGeometry(0.05, 0.12, 16);
    const topRingMat  = new THREE.MeshBasicMaterial({
      color:       alertColor,
      side:        THREE.DoubleSide,
      transparent: true,
      opacity:     0.9,
    });
    const topRing = new THREE.Mesh(topRingGeom, topRingMat);
    topRing.position.set(x, y, z + height + 0.05);
    group.add(topRing);

    // ── 2. PDZ Geofence Ring ─────────────────────────────────────────
    // PDZ_Radius is in km; we scale into world units (1° ≈ 111 km, spatialScale/111 ≈ 0.054)
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
    // Lay flat on the XY plane — ring geometry is in XY by default
    pdzBoundary.position.set(x, y, z + 0.02); // +0.02 prevents z-fighting with grid
    group.add(pdzBoundary);

    // ── 3. SO₂ Particle Plume ────────────────────────────────────────
    // Clamp particle count to GPU budget
    const rawParticleCount = Math.floor((volcanoAsset.SO2_Flux ?? 100) * 0.2);
    const particleCount    = Math.min(rawParticleCount, MAX_PARTICLES);

    let plume      = null;
    let velocities = null;

    if (particleCount > 0) {
      const pGeom      = new THREE.BufferGeometry();
      const positions  = new Float32Array(particleCount * 3);
      velocities       = new Float32Array(particleCount * 3);

      // Randomize initial scatter within the crater mouth footprint
      for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i]     = x + (Math.random() - 0.5) * 0.3;
        positions[i + 1] = y + (Math.random() - 0.5) * 0.3;
        // Stagger initial Z so particles don't all spawn simultaneously
        positions[i + 2] = z + height + Math.random() * 6.0;

        // Velocity: lateral wind drift + upward escape velocity
        // Scale upward velocity with alert level (more energetic eruptions)
        const alertVelocityBoost = 1.0 + alertLevel * 0.3;
        velocities[i]     = (Math.random() - 0.5) * 0.20;           // X drift
        velocities[i + 1] = (Math.random() - 0.5) * 0.20;           // Y drift
        velocities[i + 2] = (Math.random() * 0.5 + 0.25) * alertVelocityBoost; // Z ascent
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

    // ── Register animation state ─────────────────────────────────────
    this._animationStates.set(volcanoAsset.ID, {
      plume,
      velocities,
      particleCount,
      pdzRing: pdzBoundary,
      x, y, z,
      craterZ: z + height, // particles respawn at the crater rim
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
}
