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
  { name: 'Luzon',        lat: 16.20, lon: 121.10, tier: 1 },
  { name: 'Visayas',      lat: 11.00, lon: 123.80, tier: 1 },
  { name: 'Mindanao',     lat: 7.80,  lon: 125.00, tier: 1 },
  { name: 'Palawan',      lat: 9.85,  lon: 118.74, tier: 1 },
  { name: 'Mindoro',      lat: 12.90, lon: 121.10, tier: 1 },
  { name: 'Panay',        lat: 11.10, lon: 122.50, tier: 1 },
  { name: 'Negros',       lat: 9.98,  lon: 122.99, tier: 1 },
  { name: 'Cebu',         lat: 10.32, lon: 123.75, tier: 1 },
  { name: 'Bohol',        lat: 9.85,  lon: 124.27, tier: 1 },
  { name: 'Leyte',        lat: 10.86, lon: 124.88, tier: 1 },
  { name: 'Samar',        lat: 11.85, lon: 125.05, tier: 1 },
  { name: 'Masbate',      lat: 12.17, lon: 123.55, tier: 1 },
  { name: 'Catanduanes',  lat: 13.80, lon: 124.25, tier: 1 },
  { name: 'Sulu Arch.',   lat: 5.95,  lon: 121.10, tier: 1 },

  // ── Tier 2 — Provinces & major cities ────────────────────────────────────
  { name: 'Metro Manila',  parent: 'Luzon',    lat: 14.60, lon: 120.98, tier: 2 },
  { name: 'Baguio City',        parent: 'Benguet',  lat: 16.41, lon: 120.59, tier: 2 },
  { name: 'Laoag City',        parent: 'Ilocos Norte', lat: 18.196, lon: 120.593, tier: 2 },
  { name: 'Vigan City',        parent: 'Ilocos Sur', lat: 17.575, lon: 120.387, tier: 2 },
  { name: 'Tuguegarao City',   parent: 'Cagayan',  lat: 17.613, lon: 121.727, tier: 2 },
  { name: 'San Fernando City', parent: 'La Union', lat: 16.616, lon: 120.316, tier: 2 },
  { name: 'Dagupan City',      parent: 'Pangasinan', lat: 16.043, lon: 120.340, tier: 2 },
  { name: 'Santiago City',     parent: 'Isabela',  lat: 16.690, lon: 121.549, tier: 2 },
  { name: 'Cabanatuan City',   parent: 'Nueva Ecija', lat: 15.486, lon: 120.968, tier: 2 },
  { name: 'Tarlac City',  parent: 'Tarlac',   lat: 15.483, lon: 120.596, tier: 2 },
  { name: 'Angeles City', parent: 'Pampanga', lat: 15.144, lon: 120.589, tier: 2 },
  { name: 'Olongapo City',     parent: 'Zambales', lat: 14.833, lon: 120.283, tier: 2 },
  { name: 'Cavite City',  parent: 'Cavite',   lat: 14.484, lon: 120.898, tier: 2 },
  { name: 'Tagaytay City',     parent: 'Cavite',   lat: 14.115, lon: 120.962, tier: 2 },
  { name: 'Batangas City', parent: 'Batangas', lat: 13.756, lon: 121.058, tier: 2 },
  { name: 'Lipa City',         parent: 'Batangas', lat: 13.941, lon: 121.162, tier: 2 },
  { name: 'Lucena City',       parent: 'Quezon',   lat: 13.931, lon: 121.617, tier: 2 },
  { name: 'Calapan City',      parent: 'Oriental Mindoro', lat: 13.412, lon: 121.180, tier: 2 },
  { name: 'Puerto Princesa City', parent: 'Palawan', lat: 9.739, lon: 118.735, tier: 2 },
  { name: 'Sorsogon City', parent: 'Sorsogon', lat: 12.969, lon: 124.004, tier: 2 },
  { name: 'Legazpi City',       parent: 'Albay',    lat: 13.14, lon: 123.74, tier: 2 },
  { name: 'Naga City',          parent: 'Camarines Sur', lat: 13.62, lon: 123.19, tier: 2 },
  { name: 'Iloilo City',        parent: 'Panay',    lat: 10.72, lon: 122.56, tier: 2 },
  { name: 'Bacolod City',       parent: 'Negros',   lat: 10.68, lon: 122.95, tier: 2 },
  { name: 'Cebu City',     parent: 'Cebu',     lat: 10.32, lon: 123.90, tier: 2 },
  { name: 'Mandaue City',       parent: 'Cebu',     lat: 10.344, lon: 123.936, tier: 2 },
  { name: 'Lapu-Lapu City',     parent: 'Cebu',     lat: 10.314, lon: 123.948, tier: 2 },
  { name: 'Tagbilaran City',    parent: 'Bohol',    lat: 9.650, lon: 123.850, tier: 2 },
  { name: 'Roxas City',    parent: 'Capiz',    lat: 11.585, lon: 122.752, tier: 2 },
  { name: 'Tacloban City',      parent: 'Leyte',    lat: 11.24, lon: 125.00, tier: 2 },
  { name: 'Ormoc City',         parent: 'Leyte',    lat: 11.004, lon: 124.608, tier: 2 },
  { name: 'Dumaguete City',     parent: 'Negros Oriental', lat: 9.31, lon: 123.31, tier: 2 },
  { name: 'Calbayog City',      parent: 'Samar',    lat: 12.067, lon: 124.600, tier: 2 },
  { name: 'Catbalogan City',    parent: 'Samar',    lat: 11.783, lon: 124.883, tier: 2 },
  { name: 'Cagayan de Oro City', parent: 'Misamis Oriental', lat: 8.48, lon: 124.65, tier: 2 },
  { name: 'Butuan City',        parent: 'Agusan del Norte', lat: 8.95, lon: 125.54, tier: 2 },
  { name: 'Surigao City',       parent: 'Surigao del Norte', lat: 9.79, lon: 125.49, tier: 2 },
  { name: 'Davao City',    parent: 'Davao del Sur', lat: 7.07, lon: 125.61, tier: 2 },
  { name: 'Tagum City',         parent: 'Davao del Norte', lat: 7.45, lon: 125.81, tier: 2 },
  { name: 'Digos City',         parent: 'Davao del Sur', lat: 6.756, lon: 125.356, tier: 2 },
  { name: 'Mati City',          parent: 'Davao Oriental', lat: 6.961, lon: 126.215, tier: 2 },
  { name: 'Zamboanga City',     parent: 'Zamboanga Pen.', lat: 6.92, lon: 122.08, tier: 2 },
  { name: 'Cotabato City', parent: 'Maguindanao', lat: 7.22, lon: 124.25, tier: 2 },
  { name: 'General Santos City', parent: 'SOCCSKSARGEN', lat: 6.12, lon: 125.17, tier: 2 },
  { name: 'Sarangani',     parent: 'Province',  lat: 5.93, lon: 125.10, tier: 2 },
  { name: 'Koronadal City',     parent: 'South Cotabato', lat: 6.50, lon: 124.85, tier: 2 },
  { name: 'Kidapawan',     parent: 'Cotabato', lat: 7.008, lon: 125.090, tier: 2 },
  { name: 'Pagadian City',      parent: 'Zamboanga del Sur', lat: 7.825, lon: 123.433, tier: 2 },
  { name: 'Dipolog City',       parent: 'Zamboanga del Norte', lat: 8.583, lon: 123.342, tier: 2 },
  { name: 'Iligan City',        parent: 'Lanao del Norte', lat: 8.228, lon: 124.245, tier: 2 },
  { name: 'Marawi City',        parent: 'Lanao del Sur', lat: 8.020, lon: 124.290, tier: 2 },
  { name: 'Malaybalay City',    parent: 'Bukidnon', lat: 8.158, lon: 125.126, tier: 2 },
  { name: 'Valencia City',      parent: 'Bukidnon', lat: 7.906, lon: 125.094, tier: 2 },
  { name: 'Bislig City',        parent: 'Surigao del Sur', lat: 8.217, lon: 126.317, tier: 2 },
  { name: 'Tandag City',        parent: 'Surigao del Sur', lat: 9.083, lon: 126.200, tier: 2 },

  // ── Tier 3 — Municipalities & focus islands ──────────────────────────────
  // Sarangani Province municipalities
  { name: 'Glan',          parent: 'Sarangani', lat: 5.82, lon: 125.20, tier: 3 },
  { name: 'Alabel',        parent: 'Sarangani', lat: 6.10, lon: 125.29, tier: 3 },
  { name: 'Malapatan',     parent: 'Sarangani', lat: 5.97, lon: 125.29, tier: 3 },
  { name: 'Maasim',        parent: 'Sarangani', lat: 5.86, lon: 124.99, tier: 3 },
  { name: 'Kiamba',        parent: 'Sarangani', lat: 5.99, lon: 124.62, tier: 3 },
  { name: 'Maitum',        parent: 'Sarangani', lat: 6.03, lon: 124.49, tier: 3 },
  { name: 'Malungon',      parent: 'Sarangani', lat: 6.34, lon: 125.28, tier: 3 },
  // Sarangani Bay islands (Davao Occidental)
  { name: 'Sarangani Is.', parent: 'Davao Occ.', lat: 5.55, lon: 125.46, tier: 3 },
  { name: 'Balut Is.',     parent: 'Davao Occ.', lat: 5.40, lon: 125.38, tier: 3 },
  // South Cotabato / Davao corridor
  { name: 'Polomolok',     parent: 'South Cotabato', lat: 6.22, lon: 125.06, tier: 3 },
  { name: 'Tupi',          parent: 'South Cotabato', lat: 6.33, lon: 124.95, tier: 3 },
  { name: 'Jose Abad Santos', parent: 'Davao Occ.', lat: 5.92, lon: 125.65, tier: 3 },
  // Luzon Municipalities & capitals
  { name: 'Daet',          parent: 'Camarines Norte', lat: 14.117, lon: 122.950, tier: 3 },
  { name: 'Virac',         parent: 'Catanduanes', lat: 13.583, lon: 124.233, tier: 3 },
  { name: 'Infanta',       parent: 'Quezon',   lat: 14.745, lon: 121.649, tier: 3 },
  { name: 'Baler',         parent: 'Aurora',   lat: 15.759, lon: 121.562, tier: 3 },
  { name: 'Aparri',        parent: 'Cagayan',  lat: 18.355, lon: 121.641, tier: 3 },
  { name: 'Bangued',       parent: 'Abra',     lat: 17.598, lon: 120.619, tier: 3 },
  { name: 'Lubang',        parent: 'Occ. Mindoro', lat: 13.858, lon: 120.123, tier: 3 },
  { name: 'Coron',         parent: 'Palawan',  lat: 12.000, lon: 120.200, tier: 3 },
  { name: 'El Nido',       parent: 'Palawan',  lat: 11.178, lon: 119.389, tier: 3 },
  // Visayas Municipalities & capitals
  { name: 'Kalibo',        parent: 'Aklan',    lat: 11.708, lon: 122.364, tier: 3 },
  { name: 'San Jose',      parent: 'Antique',  lat: 10.743, lon: 121.936, tier: 3 },
  { name: 'Catarman',      parent: 'N. Samar', lat: 12.500, lon: 124.633, tier: 3 },
  { name: 'Borongan',      parent: 'E. Samar', lat: 11.608, lon: 125.430, tier: 3 },
  { name: 'Maasin',        parent: 'S. Leyte', lat: 10.133, lon: 124.850, tier: 3 },
  { name: 'Bogo',          parent: 'Cebu',     lat: 11.052, lon: 124.006, tier: 3 },
  { name: 'Carcar',        parent: 'Cebu',     lat: 10.108, lon: 123.637, tier: 3 },
  // Mindanao Municipalities & capitals
  { name: 'Jolo',          parent: 'Sulu',     lat: 6.053, lon: 121.000, tier: 3 },
  { name: 'Bongao',        parent: 'Tawi-Tawi', lat: 5.053, lon: 119.773, tier: 3 },
  { name: 'Isabela City',  parent: 'Basilan',  lat: 6.703, lon: 121.971, tier: 3 },
  { name: 'Ipil',          parent: 'Zambo. Sibugay', lat: 7.783, lon: 122.583, tier: 3 },

  // ── Tier 4 — GenSan districts / barangays ────────────────────────────────
  { name: 'Lagao',         parent: 'GenSan', lat: 6.130, lon: 125.187, tier: 4 },
  { name: 'Calumpang',     parent: 'GenSan', lat: 6.085, lon: 125.135, tier: 4 },
  { name: 'Bula',          parent: 'GenSan', lat: 6.097, lon: 125.163, tier: 4 },
  { name: 'Dadiangas',     parent: 'GenSan', lat: 6.112, lon: 125.172, tier: 4 },
  { name: 'Labangal',      parent: 'GenSan', lat: 6.105, lon: 125.148, tier: 4 },
  { name: 'Tambler',       parent: 'GenSan', lat: 6.058, lon: 125.118, tier: 4 },
  { name: 'San Isidro',    parent: 'GenSan', lat: 6.142, lon: 125.168, tier: 4 },
  { name: 'Mabuhay',       parent: 'GenSan', lat: 6.170, lon: 125.130, tier: 4 },
  { name: 'Fatima',        parent: 'GenSan', lat: 6.155, lon: 125.205, tier: 4 },
  // Glan coastal barangays (tsunami-exposed)
  { name: 'Poblacion',     parent: 'Glan',   lat: 5.823, lon: 125.203, tier: 4 },
  { name: 'Gumasa',        parent: 'Glan',   lat: 5.815, lon: 125.122, tier: 4 },
  { name: 'Taluya',        parent: 'Glan',   lat: 5.780, lon: 125.230, tier: 4 },
  // Balut / Sarangani Is. communities
  { name: 'Mabila',        parent: 'Balut Is.', lat: 5.417, lon: 125.392, tier: 4 },
  { name: 'Batuganding',   parent: 'Sarangani Is.', lat: 5.560, lon: 125.430, tier: 4 },

  // Bodies of Water (hydrographic labels matching lindol.app)
  { name: 'Celebes Sea',   lat: 5.0, lon: 122.5, tier: 1, isBodyOfWater: true },
  { name: 'Sulu Sea',      lat: 8.5, lon: 119.5, tier: 1, isBodyOfWater: true },
  { name: 'Bohol Sea',     lat: 9.2, lon: 124.5, tier: 1, isBodyOfWater: true },
  { name: 'Philippine Sea', lat: 14.5, lon: 126.5, tier: 1, isBodyOfWater: true },
];

export function getLabelsByTier(tier) {
  return PLACE_LABELS.filter(l => l.tier === tier);
}
