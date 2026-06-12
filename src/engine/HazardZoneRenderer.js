/**
 * HazardZoneRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hyper-local zonation overlays for high-risk Philippine communities.
 *
 * 1. LIQUEFACTION VULNERABILITY ZONES
 *    Soft, water-saturated alluvial/delta soils (downtown GenSan, Tagum,
 *    Manila delta, Cotabato delta) drawn as transparent neon-orange pads.
 *    When an incoming event's estimated Peak Ground Acceleration at a zone
 *    passes threshold, that zone flashes to flag collapse risk.
 *
 * 2. TSUNAMI RUN-UP GEOFENCING
 *    A shallow (z < 35 km), strong (Mw ≥ 6.5) event offshore along the
 *    Cotabato or Philippine Trench corridors auto-draws pulsing Threat
 *    Exclusion Halos around exposed low-lying coastal communities
 *    (Balut Is., Sarangani Is., Glan coast, GenSan shoreline…).
 *    Halos expire after a configurable hold time.
 *
 * PGA estimate: simplified ground-motion attenuation
 *    log10(PGA[g]) = 0.31·Mw − 1.02·log10(R_hyp) − 0.0042·R_hyp − 1.02
 * Good enough for triage visualization; NOT an engineering-grade GMPE.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;
const KM_PER_DEG    = 111.0;
const WU_PER_KM     = SPATIAL_SCALE / KM_PER_DEG;

/** PGA (g) at which a liquefaction pad flashes. */
const PGA_FLASH_THRESHOLD = 0.15;
/** How long a flash / tsunami halo persists (seconds). */
const FLASH_HOLD_S = 45;
const HALO_HOLD_S  = 300;

// ── Liquefaction vulnerability catalog (soft-soil zones) ─────────────────────

const LIQUEFACTION_ZONES = [
  { id: 'gensan_downtown', name: 'GenSan CBD / Silway–Buayan Delta',
    lat: 6.105, lon: 125.171, rxKm: 7,  ryKm: 5 },
  { id: 'tagum_delta',     name: 'Tagum / Hijo River Lowlands',
    lat: 7.430, lon: 125.810, rxKm: 8,  ryKm: 6 },
  { id: 'manila_delta',    name: 'Manila / Pasig River Delta',
    lat: 14.590, lon: 120.975, rxKm: 12, ryKm: 9 },
  { id: 'cotabato_delta',  name: 'Cotabato / Rio Grande Delta',
    lat: 7.210, lon: 124.240, rxKm: 10, ryKm: 7 },
  { id: 'davao_coast',     name: 'Davao City Coastal Strip',
    lat: 7.060, lon: 125.620, rxKm: 8,  ryKm: 5 },
];

// ── Tsunami-exposed coastal communities ──────────────────────────────────────

const COASTAL_COMMUNITIES = [
  { id: 'balut',        name: 'Balut Island',     lat: 5.400, lon: 125.380 },
  { id: 'sarangani_is', name: 'Sarangani Island', lat: 5.550, lon: 125.460 },
  { id: 'glan',         name: 'Glan Coast',       lat: 5.820, lon: 125.200 },
  { id: 'gensan_shore', name: 'GenSan Shoreline', lat: 6.090, lon: 125.160 },
  { id: 'maasim',       name: 'Maasim Coast',     lat: 5.860, lon: 124.990 },
  { id: 'kiamba',       name: 'Kiamba Coast',     lat: 5.990, lon: 124.620 },
  { id: 'maitum',       name: 'Maitum Coast',     lat: 6.030, lon: 124.490 },
  { id: 'jose_abad',    name: 'Jose Abad Santos', lat: 5.920, lon: 125.650 },
];

/** Trench corridors that source regional tsunamis (rough geofence boxes). */
const TRENCH_CORRIDORS = [
  // Philippine Trench (east of the archipelago)
  { latMin: 4.0, latMax: 15.0, lonMin: 125.3, lonMax: 128.0 },
  // Cotabato Trench (Celebes Sea, southwest of Mindanao)
  { latMin: 4.0, latMax: 6.6,  lonMin: 122.5, lonMax: 125.3 },
];

const TSUNAMI_DEPTH_MAX_KM = 35;
const TSUNAMI_MAG_MIN      = 6.5;
/** Communities within this epicentral range get a halo. */
const TSUNAMI_REACH_KM     = 400;

// ── HazardZoneRenderer ────────────────────────────────────────────────────────

export class HazardZoneRenderer {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;

    this.group = new THREE.Group();
    this.group.name = 'hazard-zones';

    /** @type {Map<string, {mesh: THREE.Mesh, flashUntil: number, baseOpacity: number}>} */
    this._zones = new Map();
    /** @type {Array<{mesh: THREE.Mesh, expiresAt: number}>} */
    this._halos = [];
    this._clock = 0;

    this._buildLiquefactionZones();
    this.engine.addLayer('hazard_zones', this.group);
  }

  _toWorld(lat, lon) {
    return {
      x: (lon - LON_ANCHOR) * SPATIAL_SCALE,
      y: (lat - LAT_ANCHOR) * SPATIAL_SCALE,
    };
  }

  // ── Liquefaction pads ──────────────────────────────────────────────────────

  _buildLiquefactionZones() {
    for (const zone of LIQUEFACTION_ZONES) {
      const { x, y } = this._toWorld(zone.lat, zone.lon);

      const geom = new THREE.CircleGeometry(1, 40);
      geom.scale(zone.rxKm * WU_PER_KM, zone.ryKm * WU_PER_KM, 1);

      const mat = new THREE.MeshBasicMaterial({
        color: 0xff7a1a,                // neon orange
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, 0.015);
      mesh.userData.hazardZone = zone;
      this.group.add(mesh);

      // Boundary path so the pad reads as a defined geofence, not a blob
      const edges = new THREE.RingGeometry(0.985, 1.0, 40);
      edges.scale(zone.rxKm * WU_PER_KM, zone.ryKm * WU_PER_KM, 1);
      const edgeMesh = new THREE.Mesh(
        edges,
        new THREE.MeshBasicMaterial({
          color: 0xff7a1a, transparent: true, opacity: 0.6,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      edgeMesh.position.set(x, y, 0.016);
      this.group.add(edgeMesh);

      this._zones.set(zone.id, { mesh, flashUntil: 0, baseOpacity: 0.14 });
    }
    console.info(`[CISV] Liquefaction zonation: ${LIQUEFACTION_ZONES.length} soft-soil pads armed.`);
  }

  // ── Event evaluation (call for every incoming live event) ────────────────

  /**
   * @param {{magnitude:number, latitude:number, longitude:number, depth:number}} ev
   */
  evaluateEvent(ev) {
    if (!ev || !Number.isFinite(ev.magnitude)) return;
    this._evaluateLiquefaction(ev);
    this._evaluateTsunami(ev);
  }

  _evaluateLiquefaction(ev) {
    for (const zone of LIQUEFACTION_ZONES) {
      const distKm = this._haversineKm(ev.latitude, ev.longitude, zone.lat, zone.lon);
      const pga = this._estimatePGA(ev.magnitude, distKm, ev.depth ?? 10);
      if (pga >= PGA_FLASH_THRESHOLD) {
        const state = this._zones.get(zone.id);
        if (state) {
          state.flashUntil = this._clock + FLASH_HOLD_S;
          console.warn(
            `[CISV] LIQUEFACTION RISK — ${zone.name}: est. PGA ${pga.toFixed(2)} g ` +
            `(Mw ${ev.magnitude.toFixed(1)} @ ${distKm.toFixed(0)} km)`
          );
        }
      }
    }
  }

  _evaluateTsunami(ev) {
    if (ev.magnitude < TSUNAMI_MAG_MIN) return;
    if ((ev.depth ?? 999) >= TSUNAMI_DEPTH_MAX_KM) return;

    const inCorridor = TRENCH_CORRIDORS.some(c =>
      ev.latitude >= c.latMin && ev.latitude <= c.latMax &&
      ev.longitude >= c.lonMin && ev.longitude <= c.lonMax
    );
    if (!inCorridor) return;

    for (const community of COASTAL_COMMUNITIES) {
      const distKm = this._haversineKm(ev.latitude, ev.longitude, community.lat, community.lon);
      if (distKm > TSUNAMI_REACH_KM) continue;
      this._spawnTsunamiHalo(community, ev.magnitude);
    }
    console.warn(
      `[CISV] TSUNAMI THREAT GEOFENCE — shallow Mw ${ev.magnitude.toFixed(1)} in trench corridor; ` +
      `exclusion halos drawn.`
    );
  }

  _spawnTsunamiHalo(community, magnitude) {
    const { x, y } = this._toWorld(community.lat, community.lon);
    // Exclusion radius scales with magnitude: Mw6.5 → ~5 km, Mw8 → ~20 km
    const radiusKm = 5 + Math.max(0, magnitude - 6.5) * 10;
    const r = radiusKm * WU_PER_KM;

    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.82, r, 48),
      new THREE.MeshBasicMaterial({
        color: 0x00d5ff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    mesh.position.set(x, y, 0.03);
    mesh.userData.community = community;
    this.group.add(mesh);
    this._halos.push({ mesh, expiresAt: this._clock + HALO_HOLD_S });
  }

  // ── Per-frame animation (engine frame hook) ───────────────────────────────

  update(elapsed, _delta) {
    this._clock = elapsed;

    // Flash active liquefaction pads
    for (const state of this._zones.values()) {
      if (state.flashUntil > elapsed) {
        state.mesh.material.opacity =
          state.baseOpacity + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 9.0));
      } else if (state.mesh.material.opacity !== state.baseOpacity) {
        state.mesh.material.opacity = state.baseOpacity;
      }
    }

    // Pulse + expire tsunami halos
    for (let i = this._halos.length - 1; i >= 0; i--) {
      const halo = this._halos[i];
      if (elapsed >= halo.expiresAt) {
        this.group.remove(halo.mesh);
        halo.mesh.geometry.dispose();
        halo.mesh.material.dispose();
        this._halos.splice(i, 1);
        continue;
      }
      const pulse = 1.0 + 0.12 * Math.sin(elapsed * 5.0);
      halo.mesh.scale.set(pulse, pulse, 1);
      halo.mesh.material.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(elapsed * 5.0));
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }

  /** Simplified attenuation — triage visualization only, not a GMPE. */
  _estimatePGA(mag, epicentralKm, depthKm) {
    const rHyp = Math.max(5, Math.hypot(epicentralKm, depthKm));
    const log10pga = 0.31 * mag - 1.02 * Math.log10(rHyp) - 0.0042 * rHyp - 1.02;
    return 10 ** log10pga;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    for (const halo of this._halos) {
      halo.mesh.geometry.dispose();
      halo.mesh.material.dispose();
    }
    this._halos = [];
    this._zones.clear();
    this.engine.disposeLayer('hazard_zones');
  }
}
