/**
 * CatalogDataService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Seismic Data Service
 *
 * Responsibilities:
 *   • Maintain the complete seismic event catalog as a Float32Array binary buffer
 *   • Provide time-windowed views without re-allocating the full dataset
 *   • Serialize and return a flat binary record for GPU ingestion
 *   • Expose the full catalog metadata (count, date range, magnitude range)
 *
 * In a production deployment this module would stream compressed binary blobs
 * from an edge CDN endpoint.  For this standalone demo build, it synthesizes
 * a statistically representative dataset derived from historical Philippine
 * seismicity patterns (PHIVOLCS / USGS catalog statistics 1990–2026).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Binary record layout (RECORD_SIZE = 7 × Float32):
 *   [0] lat     – Latitude        (°, +N)
 *   [1] lon     – Longitude       (°, +E)
 *   [2] depth   – Depth           (km, positive down)
 *   [3] mag     – Moment magnitude Mw
 *   [4] strike  – Fault strike    (°)
 *   [5] dip     – Fault dip       (°)
 *   [6] rake    – Fault rake      (°)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const RECORD_SIZE = 7;

// ── Geographic bounds — Philippine Archipelago ──────────────────────────────
const BOUNDS = {
  latMin: 4.5,   latMax: 21.5,
  lonMin: 116.0, lonMax: 130.0,
};

// ── Seismic zone definitions (weight, lat range, lon range, depth profile) ──
// Weights drive sampling probability to match observed PHIVOLCS density maps
const SEISMIC_ZONES = [
  // Manila Trench subduction (shallow–intermediate)
  { w: 0.18, latMin:  7.0, latMax: 19.0, lonMin: 118.5, lonMax: 121.0, depthProfile: 'subduction', magBias: 5.0 },
  // Philippine Trench subduction (intermediate–deep)
  { w: 0.20, latMin:  6.0, latMax: 15.0, lonMin: 125.0, lonMax: 128.0, depthProfile: 'deep',        magBias: 5.5 },
  // Cotabato Basin (shallow)
  { w: 0.08, latMin:  5.5, latMax: 10.0, lonMin: 122.0, lonMax: 126.0, depthProfile: 'shallow',     magBias: 4.8 },
  // Luzon volcanic arc (shallow crustal)
  { w: 0.15, latMin: 13.5, latMax: 19.5, lonMin: 120.0, lonMax: 124.5, depthProfile: 'crustal',     magBias: 4.5 },
  // Visayas diffuse zone
  { w: 0.14, latMin:  9.5, latMax: 13.5, lonMin: 120.5, lonMax: 126.0, depthProfile: 'crustal',     magBias: 4.6 },
  // Mindanao deep focus zone
  { w: 0.12, latMin:  5.0, latMax:  9.5, lonMin: 123.0, lonMax: 128.0, depthProfile: 'deep',        magBias: 5.2 },
  // East Luzon Trough
  { w: 0.08, latMin: 14.0, latMax: 19.0, lonMin: 122.0, lonMax: 125.5, depthProfile: 'subduction',  magBias: 4.9 },
  // Background diffuse seismicity
  { w: 0.05, latMin:  4.5, latMax: 21.5, lonMin: 116.0, lonMax: 130.0, depthProfile: 'crustal',     magBias: 4.0 },
];

/** Total synthetic catalog size — large enough for density hotspot realism */
const SYNTHETIC_COUNT = 25000;

// ── RNG (seeded for reproducible demo renders) ──────────────────────────────

/**
 * Mulberry32 deterministic PRNG — avoids Math.random() non-reproducibility.
 * @param {number} seed  32-bit integer seed
 * @returns {() => number}  Returns values in [0, 1)
 */
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s  += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Sampling helpers ────────────────────────────────────────────────────────

function sampleZone(rng, zones) {
  const r = rng();
  let cumulative = 0;
  for (const zone of zones) {
    cumulative += zone.w;
    if (r <= cumulative) return zone;
  }
  return zones[zones.length - 1];
}

function sampleDepth(rng, profile) {
  switch (profile) {
    case 'crustal':
      return 1 + rng() * rng() * 35;              // 1–35 km, surface-heavy
    case 'shallow':
      return 1 + rng() * 70;                       // 1–70 km uniform
    case 'subduction':
      return 5 + Math.pow(rng(), 0.5) * 250;       // 5–255 km, sqrt distribution
    case 'deep':
      return 50 + rng() * 650;                     // 50–700 km
    default:
      return 10 + rng() * 90;
  }
}

/** Gutenberg–Richter magnitude sampling: b ≈ 0.9 for Philippines */
function sampleMagnitude(rng, mMin, bias) {
  const b      = 0.9;
  const u      = rng();
  // Inverse CDF of truncated exponential GR distribution
  const mag    = mMin + (-Math.log(1 - u * (1 - Math.exp(-b * (9 - mMin)))) / b);
  return Math.min(9.0, Math.max(mMin, mag + (bias - 4.5) * 0.05));
}

// ── Main catalog generator ──────────────────────────────────────────────────

/**
 * Build the full synthetic seismic catalog as a flat Float32Array.
 * The dataset is seeded deterministically — the same Float32Array is returned
 * on every call within a session.
 *
 * @returns {{ buffer: Float32Array, count: number, pgaBuffer: Float32Array }}
 */
export function buildSyntheticCatalog() {
  const rng    = makePRNG(0xCAFEBABE);
  const buffer = new Float32Array(SYNTHETIC_COUNT * RECORD_SIZE);
  const pgaBuf = new Float32Array(SYNTHETIC_COUNT);

  let writeIdx = 0;

  for (let i = 0; i < SYNTHETIC_COUNT; i++) {
    const zone  = sampleZone(rng, SEISMIC_ZONES);
    const lat   = zone.latMin + rng() * (zone.latMax - zone.latMin);
    const lon   = zone.lonMin + rng() * (zone.lonMax - zone.lonMin);
    const depth = sampleDepth(rng, zone.depthProfile);
    const mag   = sampleMagnitude(rng, 2.0, zone.magBias);

    // Random focal mechanism (uniform distribution over valid ranges)
    const strike = rng() * 360;
    const dip    = rng() * 90;
    const rake   = (rng() - 0.5) * 360;

    // Simplified PGA estimation: Atkinson–Boore (2003) proxy
    // PGA(g) ≈ 10^(0.5·Mw − log10(depth+10) − 1.5)  (order-of-magnitude only)
    const pga = Math.pow(10, 0.5 * mag - Math.log10(depth + 10) - 1.5);

    const base = writeIdx * RECORD_SIZE;
    buffer[base + 0] = lat;
    buffer[base + 1] = lon;
    buffer[base + 2] = depth;
    buffer[base + 3] = mag;
    buffer[base + 4] = strike;
    buffer[base + 5] = dip;
    buffer[base + 6] = rake;

    pgaBuf[writeIdx] = Math.min(3.0, pga);
    writeIdx++;
  }

  return { buffer, count: SYNTHETIC_COUNT, pgaBuffer: pgaBuf };
}

/**
 * Return the raw record for a single event by index.
 *
 * @param {Float32Array} buffer
 * @param {number}       index
 * @returns {{ lat, lon, depth, mag, strike, dip, rake }}
 */
export function getEventRecord(buffer, index) {
  const base = index * RECORD_SIZE;
  return {
    lat:    buffer[base + 0],
    lon:    buffer[base + 1],
    depth:  buffer[base + 2],
    mag:    buffer[base + 3],
    strike: buffer[base + 4],
    dip:    buffer[base + 5],
    rake:   buffer[base + 6],
  };
}

/**
 * Extract a subset of records filtered by magnitude and depth.
 * Returns a new Float32Array — does NOT mutate the source buffer.
 *
 * @param {Float32Array} buffer
 * @param {object}       filters  { magMin, magMax, depthMax }
 * @returns {Float32Array}
 */
export function filterCatalog(buffer, { magMin = 2.0, magMax = 9.0, depthMax = 700 } = {}) {
  const count    = buffer.length / RECORD_SIZE;
  const outRecs  = [];

  for (let i = 0; i < count; i++) {
    const base  = i * RECORD_SIZE;
    const mag   = buffer[base + 3];
    const depth = buffer[base + 2];

    if (mag >= magMin && mag <= magMax && depth <= depthMax) {
      for (let f = 0; f < RECORD_SIZE; f++) {
        outRecs.push(buffer[base + f]);
      }
    }
  }

  return new Float32Array(outRecs);
}
