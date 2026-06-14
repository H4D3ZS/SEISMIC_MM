/**
 * HazardMapData.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real barangay-level hazard data for General Santos City + Sarangani,
 * transcribed from published government hazard maps:
 *
 *   • DRRMO General Santos City / DOST-PHIVOLCS Liquefaction Hazard Map
 *       susceptibility: very_high / high / moderate / low
 *   • DOST-PHIVOLCS Tsunami Hazard Map — General Santos City, South Cotabato
 *       Product code TSU-2025-126303-02 (Published May 2025), 1:60,000
 *       inundation depth classes: <1, 1–2, 2–3, 3–4, 4–5, 5–6, >6 m
 *
 * These are REAL, attributed values read off the maps — not model output and not
 * invented. Barangay coordinates are approximate centroids. Where a barangay was
 * not classified on a given map, the field is null.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const HAZARD_MAP_SOURCE =
  'DRRMO General Santos City + DOST-PHIVOLCS Tsunami Hazard Map (TSU-2025-126303-02, May 2025)';

// liquefaction: 'very_high' | 'high' | 'moderate' | 'low'
// tsunamiDepth_m: peak inundation depth on the coast (0 if inland / not inundated)
export const BARANGAY_HAZARDS = [
  // ── General Santos City — coastal / eastern lowlands (HIGH liquefaction) ──
  { name: 'Bula',            city: 'General Santos City', lat: 6.1090, lon: 125.1730, liquefaction: 'high',      tsunamiDepth_m: 3.0, tsunamiClass: '2–3 m' },
  { name: 'Buayan',          city: 'General Santos City', lat: 6.1010, lon: 125.2100, liquefaction: 'high',      tsunamiDepth_m: 3.0, tsunamiClass: '2–3 m' },
  { name: 'Baluan',          city: 'General Santos City', lat: 6.1180, lon: 125.1980, liquefaction: 'high',      tsunamiDepth_m: 1.0, tsunamiClass: '1–2 m' },
  { name: 'Lagao',           city: 'General Santos City', lat: 6.1240, lon: 125.1810, liquefaction: 'high',      tsunamiDepth_m: 1.0, tsunamiClass: '1–2 m' },
  { name: 'Katangawan',      city: 'General Santos City', lat: 6.1500, lon: 125.1900, liquefaction: 'high',      tsunamiDepth_m: 0.0, tsunamiClass: null  },
  { name: 'Ligaya',          city: 'General Santos City', lat: 6.1420, lon: 125.2000, liquefaction: 'high',      tsunamiDepth_m: 0.0, tsunamiClass: null  },

  // ── Dadiangas belt + San Isidro (VERY HIGH liquefaction — built-up flats) ──
  { name: 'San Isidro (Lagao 2nd)', city: 'General Santos City', lat: 6.1130, lon: 125.1620, liquefaction: 'very_high', tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'City Heights',    city: 'General Santos City', lat: 6.1100, lon: 125.1700, liquefaction: 'very_high', tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Dadiangas North', city: 'General Santos City', lat: 6.1130, lon: 125.1700, liquefaction: 'very_high', tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Dadiangas East',  city: 'General Santos City', lat: 6.1100, lon: 125.1740, liquefaction: 'very_high', tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Dadiangas South', city: 'General Santos City', lat: 6.1070, lon: 125.1700, liquefaction: 'very_high', tsunamiDepth_m: 2.0, tsunamiClass: '1–2 m' },
  { name: 'Dadiangas West',  city: 'General Santos City', lat: 6.1080, lon: 125.1650, liquefaction: 'very_high', tsunamiDepth_m: 1.0, tsunamiClass: '1–2 m' },

  // ── Central / western (MODERATE liquefaction) ──
  { name: 'Calumpang',       city: 'General Santos City', lat: 6.0980, lon: 125.1600, liquefaction: 'moderate',  tsunamiDepth_m: 2.0, tsunamiClass: '1–2 m' },
  { name: 'Labangal',        city: 'General Santos City', lat: 6.0950, lon: 125.1550, liquefaction: 'moderate',  tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Apopong',         city: 'General Santos City', lat: 6.1170, lon: 125.1400, liquefaction: 'moderate',  tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Conel',           city: 'General Santos City', lat: 6.1700, lon: 125.1300, liquefaction: 'moderate',  tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Mabuhay',         city: 'General Santos City', lat: 6.1900, lon: 125.1100, liquefaction: 'moderate',  tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Olympog',         city: 'General Santos City', lat: 6.2100, lon: 125.1700, liquefaction: 'moderate',  tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Tinagacan',       city: 'General Santos City', lat: 6.2000, lon: 125.1900, liquefaction: 'moderate',  tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Upper Labay',     city: 'General Santos City', lat: 6.2400, lon: 125.1500, liquefaction: 'moderate',  tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Batomelong',      city: 'General Santos City', lat: 6.2200, lon: 125.2200, liquefaction: 'high',      tsunamiDepth_m: 0.0, tsunamiClass: null },

  // ── Upland / mountainous SW (LOW liquefaction) ──
  { name: 'Sinawal',         city: 'General Santos City', lat: 6.1300, lon: 125.0700, liquefaction: 'low',       tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'San Jose',        city: 'General Santos City', lat: 6.0700, lon: 125.0700, liquefaction: 'low',       tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Fatima',          city: 'General Santos City', lat: 6.0700, lon: 125.1200, liquefaction: 'low',       tsunamiDepth_m: 0.0, tsunamiClass: null },
  { name: 'Tambler',         city: 'General Santos City', lat: 6.0400, lon: 125.1300, liquefaction: 'low',       tsunamiDepth_m: 2.0, tsunamiClass: '1–2 m' },
  { name: 'Siguel',          city: 'General Santos City', lat: 5.9900, lon: 125.1000, liquefaction: 'low',       tsunamiDepth_m: 2.0, tsunamiClass: '1–2 m' },

  // ── Sarangani coast (validated uplift zone, June 2025) ──
  { name: 'Pangyan',         city: 'Glan, Sarangani',     lat: 5.9200, lon: 125.2000, liquefaction: 'moderate',  tsunamiDepth_m: 2.0, tsunamiClass: '1–2 m', note: 'Confirmed ~2 m seabed uplift, 200 m shoreline extension (June 11, 2025)' },
  { name: 'Glan Poblacion',  city: 'Glan, Sarangani',     lat: 5.8250, lon: 125.2030, liquefaction: 'high',      tsunamiDepth_m: 1.5, tsunamiClass: '1–2 m' },
  { name: 'Alabel',          city: 'Sarangani',           lat: 6.1030, lon: 125.2900, liquefaction: 'high',      tsunamiDepth_m: 2.0, tsunamiClass: '1–2 m' },
  { name: 'Maasim',          city: 'Sarangani',           lat: 5.8770, lon: 125.0050, liquefaction: 'moderate',  tsunamiDepth_m: 2.0, tsunamiClass: '1–2 m' },
];

const LIQ_RANK = { very_high: 4, high: 3, moderate: 2, low: 1 };

/** Look up a barangay's hazard record by (case-insensitive, partial) name. */
export function getBarangayHazard(name) {
  if (!name) return null;
  const q = String(name).toLowerCase().trim();
  return BARANGAY_HAZARDS.find(b => b.name.toLowerCase() === q)
      || BARANGAY_HAZARDS.find(b => b.name.toLowerCase().includes(q))
      || null;
}

function _hav(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Nearest mapped barangay to a coordinate, with distance (km). */
export function nearestBarangay(lat, lon, maxKm = 40) {
  let best = null, bestD = Infinity;
  for (const b of BARANGAY_HAZARDS) {
    const d = _hav(lat, lon, b.lat, b.lon);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (!best || bestD > maxKm) return null;
  return { ...best, dist_km: Math.round(bestD) };
}

export { LIQ_RANK };
