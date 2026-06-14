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

import { PLACE_LABELS } from './PlaceLabelCatalog.js';

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

// Landmark significant Philippine earthquakes since 1990
export const LANDMARK_EVENTS = [
  {
    id: 'landmark_19900716_m77',
    lat: 15.68,
    lon: 121.17,
    depth: 25.0,
    mag: 7.7,
    time: Date.UTC(1990, 6, 16, 7, 26, 0), // July 16, 1990 15:26 PST (07:26 UTC)
    place: 'Rizal, Nueva Ecija (Luzon Megashock)',
    source: 'PHIVOLCS',
    strike: 310,
    dip: 80,
    rake: -5
  },
  {
    id: 'landmark_19941115_m71',
    lat: 13.52,
    lon: 121.08,
    depth: 15.0,
    mag: 7.1,
    time: Date.UTC(1994, 10, 14, 19, 15, 0), // Nov 15, 1994 03:15 PST (Nov 14, 19:15 UTC)
    place: 'Verde Island Passage (Mindoro Earthquake)',
    source: 'PHIVOLCS',
    strike: 350,
    dip: 75,
    rake: -10
  },
  {
    id: 'landmark_20131015_m72',
    lat: 9.88,
    lon: 124.21,
    depth: 12.0,
    mag: 7.2,
    time: Date.UTC(2013, 9, 15, 0, 12, 0), // Oct 15, 2013 08:12 PST (00:12 UTC)
    place: 'Sagbayan, Bohol (Bohol Megashock)',
    source: 'PHIVOLCS',
    strike: 45,
    dip: 50,
    rake: 90
  },
  {
    id: 'landmark_20231202_m76',
    lat: 8.44,
    lon: 126.37,
    depth: 32.0,
    mag: 7.6,
    time: Date.UTC(2023, 11, 2, 14, 37, 0), // Dec 2, 2023 22:37 PST (14:37 UTC)
    place: 'Hinatuan, Surigao del Sur (Mindanao Megashock)',
    source: 'PHIVOLCS',
    strike: 340,
    dip: 40,
    rake: 85
  },
  {
    id: 'landmark_20260608_m78',
    lat: 5.86,
    lon: 124.70, // ~32km W of Maasim
    depth: 33.0,
    mag: 7.8,
    time: Date.UTC(2026, 5, 7, 23, 37, 0), // June 8, 2026 07:37 PST (June 7, 23:37 UTC)
    place: '32 km W of Maasim, Sarangani (Cotabato Trench Megashock)',
    source: 'PHIVOLCS',
    strike: 345,
    dip: 35,
    rake: -90
  }
];

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

function getNearestPlaceName(lat, lon) {
  let nearest = 'Philippine Trench';
  let minDist = Infinity;
  for (const label of PLACE_LABELS) {
    const dy = label.lat - lat;
    const dx = label.lon - lon;
    const dist = dy * dy + dx * dx;
    if (dist < minDist) {
      minDist = dist;
      nearest = label.parent ? `${label.name}, ${label.parent}` : label.name;
    }
  }
  return nearest;
}

/**
 * Build the full synthetic seismic catalog as a flat Float32Array.
 * The dataset is seeded deterministically — the same Float32Array is returned
 * on every call within a session.
 *
 * @returns {{ buffer: Float32Array, count: number, pgaBuffer: Float32Array, yearBuffer: Float32Array, events: any[] }}
 */
export function buildSyntheticCatalog() {
  const rng    = makePRNG(0xCAFEBABE);
  const buffer = new Float32Array(SYNTHETIC_COUNT * RECORD_SIZE);
  const pgaBuf = new Float32Array(SYNTHETIC_COUNT);
  const yearBuf = new Float32Array(SYNTHETIC_COUNT);
  const events = [];

  // Map and add landmark events first to ensure they are always present offline
  for (const landmark of LANDMARK_EVENTS) {
    const pga = Math.pow(10, 0.5 * landmark.mag - Math.log10(landmark.depth + 10) - 1.5);
    const date = new Date(landmark.time);
    const year = date.getUTCFullYear();
    const day = (date.getTime() - Date.UTC(year, 0, 1)) / (86400000 * 365.25);
    const yearFrac = year + day;

    events.push({
      ...landmark,
      pga: Math.min(3.0, pga),
      yearFrac: yearFrac
    });
  }

  // Fill the rest with background synthetic seismicity
  const backgroundCount = SYNTHETIC_COUNT - LANDMARK_EVENTS.length;
  for (let i = 0; i < backgroundCount; i++) {
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

    // Generate year/timestamp (spanning 1990.0 to 2026.0)
    const yearFrac = 1990.0 + rng() * 36.0;

    const year = Math.floor(yearFrac);
    const dayOfYear = Math.floor(rng() * 365);
    const hour = Math.floor(rng() * 24);
    const min = Math.floor(rng() * 60);
    const sec = Math.floor(rng() * 60);
    const date = new Date(Date.UTC(year, 0, 1));
    date.setUTCDate(dayOfYear);
    date.setUTCHours(hour, min, sec);
    const timeMs = date.getTime();

    events.push({
      id: `synth_${i}`,
      lat: lat,
      lon: lon,
      depth: depth,
      mag: mag,
      time: timeMs,
      place: getNearestPlaceName(lat, lon),
      source: 'SYNTHETIC',
      strike: strike,
      dip: dip,
      rake: rake,
      pga: Math.min(3.0, pga),
      yearFrac: yearFrac
    });
  }

  // Sort events newest first for UI list
  events.sort((a, b) => b.time - a.time);

  // Write sorted events to flat binary buffers so that indexing is perfectly aligned
  for (let i = 0; i < SYNTHETIC_COUNT; i++) {
    const ev = events[i];
    const base = i * RECORD_SIZE;
    buffer[base + 0] = ev.lat;
    buffer[base + 1] = ev.lon;
    buffer[base + 2] = ev.depth;
    buffer[base + 3] = ev.mag;
    buffer[base + 4] = ev.strike;
    buffer[base + 5] = ev.dip;
    buffer[base + 6] = ev.rake;

    pgaBuf[i] = ev.pga;
    yearBuf[i] = ev.yearFrac;

    // Clean up temporary properties we only used for mapping to buffers
    delete ev.pga;
    delete ev.yearFrac;
  }

  return { buffer, count: SYNTHETIC_COUNT, pgaBuffer: pgaBuf, yearBuffer: yearBuf, events };
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
