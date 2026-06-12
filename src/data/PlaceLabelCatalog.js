/**
 * PlaceLabelCatalog.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hierarchical Philippine place-name labels for the CISV map.
 *
 * Tier ladder (camera distance gates which tiers are visible):
 *   1 — Island groups & major islands     (always visible)
 *   2 — Provinces & major cities          (< 90 wu)
 *   3 — Municipalities & focus islands    (< 35 wu)
 *   4 — Districts / barangays             (< 14 wu)
 *
 * Hierarchy is encoded in `parent` so dense tiers read as "GLAN — Sarangani",
 * "LAGAO — GenSan" etc., making local zonation easy to map out.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} PlaceLabel
 * @property {string} name
 * @property {string} [parent]  — administrative parent shown as sub-text
 * @property {number} lat
 * @property {number} lon
 * @property {1|2|3|4} tier
 */

/** @type {PlaceLabel[]} */
export const PLACE_LABELS = [
  // ── Tier 1 — Island groups & major islands ───────────────────────────────
  { name: 'LUZON',        lat: 16.20, lon: 121.10, tier: 1 },
  { name: 'VISAYAS',      lat: 11.00, lon: 123.80, tier: 1 },
  { name: 'MINDANAO',     lat: 7.80,  lon: 125.00, tier: 1 },
  { name: 'PALAWAN',      lat: 9.85,  lon: 118.74, tier: 1 },
  { name: 'MINDORO',      lat: 12.90, lon: 121.10, tier: 1 },
  { name: 'PANAY',        lat: 11.10, lon: 122.50, tier: 1 },
  { name: 'NEGROS',       lat: 9.98,  lon: 122.99, tier: 1 },
  { name: 'CEBU',         lat: 10.32, lon: 123.75, tier: 1 },
  { name: 'BOHOL',        lat: 9.85,  lon: 124.27, tier: 1 },
  { name: 'LEYTE',        lat: 10.86, lon: 124.88, tier: 1 },
  { name: 'SAMAR',        lat: 11.85, lon: 125.05, tier: 1 },
  { name: 'MASBATE',      lat: 12.17, lon: 123.55, tier: 1 },
  { name: 'CATANDUANES',  lat: 13.80, lon: 124.25, tier: 1 },
  { name: 'SULU ARCH.',   lat: 5.95,  lon: 121.10, tier: 1 },

  // ── Tier 2 — Provinces & major cities ────────────────────────────────────
  { name: 'METRO MANILA',  parent: 'Luzon',    lat: 14.60, lon: 120.98, tier: 2 },
  { name: 'BAGUIO',        parent: 'Benguet',  lat: 16.41, lon: 120.59, tier: 2 },
  { name: 'LEGAZPI',       parent: 'Albay',    lat: 13.14, lon: 123.74, tier: 2 },
  { name: 'NAGA',          parent: 'Camarines Sur', lat: 13.62, lon: 123.19, tier: 2 },
  { name: 'ILOILO',        parent: 'Panay',    lat: 10.72, lon: 122.56, tier: 2 },
  { name: 'BACOLOD',       parent: 'Negros',   lat: 10.68, lon: 122.95, tier: 2 },
  { name: 'CEBU CITY',     parent: 'Cebu',     lat: 10.32, lon: 123.90, tier: 2 },
  { name: 'TACLOBAN',      parent: 'Leyte',    lat: 11.24, lon: 125.00, tier: 2 },
  { name: 'DUMAGUETE',     parent: 'Negros Oriental', lat: 9.31, lon: 123.31, tier: 2 },
  { name: 'CAGAYAN DE ORO', parent: 'Misamis Oriental', lat: 8.48, lon: 124.65, tier: 2 },
  { name: 'BUTUAN',        parent: 'Agusan del Norte', lat: 8.95, lon: 125.54, tier: 2 },
  { name: 'SURIGAO',       parent: 'Surigao del Norte', lat: 9.79, lon: 125.49, tier: 2 },
  { name: 'DAVAO CITY',    parent: 'Davao del Sur', lat: 7.07, lon: 125.61, tier: 2 },
  { name: 'TAGUM',         parent: 'Davao del Norte', lat: 7.45, lon: 125.81, tier: 2 },
  { name: 'ZAMBOANGA',     parent: 'Zamboanga Pen.', lat: 6.92, lon: 122.08, tier: 2 },
  { name: 'COTABATO CITY', parent: 'Maguindanao', lat: 7.22, lon: 124.25, tier: 2 },
  { name: 'GENERAL SANTOS', parent: 'SOCCSKSARGEN', lat: 6.12, lon: 125.17, tier: 2 },
  { name: 'SARANGANI',     parent: 'Province',  lat: 5.93, lon: 125.10, tier: 2 },
  { name: 'KORONADAL',     parent: 'South Cotabato', lat: 6.50, lon: 124.85, tier: 2 },

  // ── Tier 3 — Municipalities & focus islands ──────────────────────────────
  // Sarangani Province municipalities
  { name: 'GLAN',          parent: 'Sarangani', lat: 5.82, lon: 125.20, tier: 3 },
  { name: 'ALABEL',        parent: 'Sarangani', lat: 6.10, lon: 125.29, tier: 3 },
  { name: 'MALAPATAN',     parent: 'Sarangani', lat: 5.97, lon: 125.29, tier: 3 },
  { name: 'MAASIM',        parent: 'Sarangani', lat: 5.86, lon: 124.99, tier: 3 },
  { name: 'KIAMBA',        parent: 'Sarangani', lat: 5.99, lon: 124.62, tier: 3 },
  { name: 'MAITUM',        parent: 'Sarangani', lat: 6.03, lon: 124.49, tier: 3 },
  { name: 'MALUNGON',      parent: 'Sarangani', lat: 6.34, lon: 125.28, tier: 3 },
  // Sarangani Bay islands (Davao Occidental)
  { name: 'SARANGANI IS.', parent: 'Davao Occ.', lat: 5.55, lon: 125.46, tier: 3 },
  { name: 'BALUT IS.',     parent: 'Davao Occ.', lat: 5.40, lon: 125.38, tier: 3 },
  // South Cotabato / Davao corridor
  { name: 'POLOMOLOK',     parent: 'South Cotabato', lat: 6.22, lon: 125.06, tier: 3 },
  { name: 'TUPI',          parent: 'South Cotabato', lat: 6.33, lon: 124.95, tier: 3 },
  { name: 'DIGOS',         parent: 'Davao del Sur', lat: 6.75, lon: 125.36, tier: 3 },
  { name: 'MATI',          parent: 'Davao Oriental', lat: 6.95, lon: 126.22, tier: 3 },
  { name: 'JOSE ABAD SANTOS', parent: 'Davao Occ.', lat: 5.92, lon: 125.65, tier: 3 },

  // ── Tier 4 — GenSan districts / barangays ────────────────────────────────
  { name: 'LAGAO',         parent: 'GenSan', lat: 6.130, lon: 125.187, tier: 4 },
  { name: 'CALUMPANG',     parent: 'GenSan', lat: 6.085, lon: 125.135, tier: 4 },
  { name: 'BULA',          parent: 'GenSan', lat: 6.097, lon: 125.163, tier: 4 },
  { name: 'DADIANGAS',     parent: 'GenSan', lat: 6.112, lon: 125.172, tier: 4 },
  { name: 'LABANGAL',      parent: 'GenSan', lat: 6.105, lon: 125.148, tier: 4 },
  { name: 'TAMBLER',       parent: 'GenSan', lat: 6.058, lon: 125.118, tier: 4 },
  { name: 'SAN ISIDRO',    parent: 'GenSan', lat: 6.142, lon: 125.168, tier: 4 },
  { name: 'MABUHAY',       parent: 'GenSan', lat: 6.170, lon: 125.130, tier: 4 },
  { name: 'FATIMA',        parent: 'GenSan', lat: 6.155, lon: 125.205, tier: 4 },
  // Glan coastal barangays (tsunami-exposed)
  { name: 'POBLACION',     parent: 'Glan',   lat: 5.823, lon: 125.203, tier: 4 },
  { name: 'GUMASA',        parent: 'Glan',   lat: 5.815, lon: 125.122, tier: 4 },
  { name: 'TALUYA',        parent: 'Glan',   lat: 5.780, lon: 125.230, tier: 4 },
  // Balut / Sarangani Is. communities
  { name: 'MABILA',        parent: 'Balut Is.', lat: 5.417, lon: 125.392, tier: 4 },
  { name: 'BATUGANDING',   parent: 'Sarangani Is.', lat: 5.560, lon: 125.430, tier: 4 },
];

export function getLabelsByTier(tier) {
  return PLACE_LABELS.filter(l => l.tier === tier);
}
