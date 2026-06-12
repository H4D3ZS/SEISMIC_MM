/**
 * VolcanoDataService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Philippine Volcanic Arc Dataset
 *
 * 23 active volcanic entities across Luzon, Visayas, and Mindanao.
 * Alert levels and SO₂ flux values reflect the operational status
 * as of the June 2026 dataset epoch.
 *
 * Data sourced from:
 *   PHIVOLCS Active Volcanoes of the Philippines
 *   https://www.phivolcs.dost.gov.ph
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} VolcanoAsset
 * @property {string} ID
 * @property {string} name
 * @property {string} region      — 'Luzon' | 'Visayas' | 'Mindanao'
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} Alert_Level — 0–5 (PHIVOLCS scale)
 * @property {number} SO2_Flux    — tonnes/day
 * @property {number} Tilt_Deformation — microradians
 * @property {number} PDZ_Radius  — km
 * @property {number} elevation   — metres asl
 */

/** @type {VolcanoAsset[]} */
export const VOLCANO_CATALOG = [
  // ── LUZON ──────────────────────────────────────────────────────────────
  {
    ID:                 'mayon',
    name:               'Mayon',
    region:             'Luzon',
    latitude:           13.257,
    longitude:          123.685,
    Alert_Level:        3,
    SO2_Flux:           1850,
    Tilt_Deformation:   12.4,
    PDZ_Radius:         6,
    elevation:          2463,
  },
  {
    ID:                 'taal',
    name:               'Taal',
    region:             'Luzon',
    latitude:           14.002,
    longitude:          120.993,
    Alert_Level:        1,
    SO2_Flux:           340,
    Tilt_Deformation:   2.1,
    PDZ_Radius:         7,
    elevation:          311,
  },
  {
    ID:                 'pinatubo',
    name:               'Pinatubo',
    region:             'Luzon',
    latitude:           15.143,
    longitude:          120.350,
    Alert_Level:        1,
    SO2_Flux:           120,
    Tilt_Deformation:   0.8,
    PDZ_Radius:         10,
    elevation:          1486,
  },
  {
    ID:                 'bulusan',
    name:               'Bulusan',
    region:             'Luzon',
    latitude:           12.769,
    longitude:          124.053,
    Alert_Level:        1,
    SO2_Flux:           200,
    Tilt_Deformation:   1.5,
    PDZ_Radius:         4,
    elevation:          1565,
  },
  {
    ID:                 'isarog',
    name:               'Mt. Isarog',
    region:             'Luzon',
    latitude:           13.657,
    longitude:          123.373,
    Alert_Level:        0,
    SO2_Flux:           55,
    Tilt_Deformation:   0.2,
    PDZ_Radius:         3,
    elevation:          1966,
  },
  {
    ID:                 'iriga',
    name:               'Mt. Iriga',
    region:             'Luzon',
    latitude:           13.457,
    longitude:          123.457,
    Alert_Level:        0,
    SO2_Flux:           30,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          1196,
  },
  {
    ID:                 'labo',
    name:               'Mt. Labo',
    region:             'Luzon',
    latitude:           14.045,
    longitude:          122.810,
    Alert_Level:        0,
    SO2_Flux:           25,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          1544,
  },
  {
    ID:                 'banahaw',
    name:               'Banahaw-San Cristobal',
    region:             'Luzon',
    latitude:           14.070,
    longitude:          121.487,
    Alert_Level:        0,
    SO2_Flux:           60,
    Tilt_Deformation:   0.3,
    PDZ_Radius:         4,
    elevation:          2158,
  },
  {
    ID:                 'natib',
    name:               'Mt. Natib',
    region:             'Luzon',
    latitude:           14.713,
    longitude:          120.393,
    Alert_Level:        0,
    SO2_Flux:           20,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          1253,
  },

  // ── VISAYAS ────────────────────────────────────────────────────────────
  {
    ID:                 'kanlaon',
    name:               'Kanlaon',
    region:             'Visayas',
    latitude:           10.412,
    longitude:          123.132,
    Alert_Level:        2,
    SO2_Flux:           620,
    Tilt_Deformation:   5.3,
    PDZ_Radius:         4,
    elevation:          2435,
  },
  {
    ID:                 'biliran',
    name:               'Biliran',
    region:             'Visayas',
    latitude:           11.518,
    longitude:          124.535,
    Alert_Level:        0,
    SO2_Flux:           45,
    Tilt_Deformation:   0.2,
    PDZ_Radius:         3,
    elevation:          1301,
  },
  {
    ID:                 'camiguin_island',
    name:               'Camiguin (Hibok-Hibok)',
    region:             'Mindanao',
    latitude:           9.203,
    longitude:          124.671,
    Alert_Level:        1,
    SO2_Flux:           150,
    Tilt_Deformation:   1.0,
    PDZ_Radius:         4,
    elevation:          1332,
  },
  {
    ID:                 'mahagnao',
    name:               'Mahagnao (Leyte)',
    region:             'Visayas',
    latitude:           10.932,
    longitude:          124.853,
    Alert_Level:        0,
    SO2_Flux:           18,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          1170,
  },
  {
    ID:                 'musuan',
    name:               'Musuan (Mt. Calayo)',
    region:             'Mindanao',
    latitude:           7.953,
    longitude:          125.070,
    Alert_Level:        0,
    SO2_Flux:           22,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          646,
  },

  // ── MINDANAO ───────────────────────────────────────────────────────────
  {
    ID:                 'apo',
    name:               'Mt. Apo',
    region:             'Mindanao',
    latitude:           6.987,
    longitude:          125.271,
    Alert_Level:        0,
    SO2_Flux:           35,
    Tilt_Deformation:   0.2,
    PDZ_Radius:         4,
    elevation:          2954,
  },
  {
    ID:                 'ragang',
    name:               'Ragang (Mt. Lanao)',
    region:             'Mindanao',
    latitude:           7.678,
    longitude:          124.499,
    Alert_Level:        1,
    SO2_Flux:           190,
    Tilt_Deformation:   1.2,
    PDZ_Radius:         4,
    elevation:          2815,
  },
  {
    ID:                 'matutum',
    name:               'Mt. Matutum',
    region:             'Mindanao',
    latitude:           6.365,
    longitude:          125.100,
    Alert_Level:        0,
    SO2_Flux:           28,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          2286,
  },
  {
    ID:                 'leonard_kniaseff',
    name:               'Leonard Kniaseff (Davao de Oro)',
    region:             'Mindanao',
    latitude:           7.382,
    longitude:          126.062,
    Alert_Level:        0,
    SO2_Flux:           15,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          1949,
  },
  {
    ID:                 'makaturing',
    name:               'Makaturing',
    region:             'Mindanao',
    latitude:           7.652,
    longitude:          124.319,
    Alert_Level:        0,
    SO2_Flux:           20,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          2012,
  },
  {
    ID:                 'camiguin_babuyanes',
    name:               'Camiguin de Babuyanes (Babuyan Is.)',
    region:             'Luzon',
    latitude:           18.833,
    longitude:          121.858,
    Alert_Level:        0,
    SO2_Flux:           40,
    Tilt_Deformation:   0.2,
    PDZ_Radius:         3,
    elevation:          712,
  },
  {
    ID:                 'smith',
    name:               'Smith Volcano (Babuyan Claro)',
    region:             'Luzon',
    latitude:           19.523,
    longitude:          121.919,
    Alert_Level:        1,
    SO2_Flux:           280,
    Tilt_Deformation:   1.8,
    PDZ_Radius:         3,
    elevation:          688,
  },
  {
    ID:                 'didicas',
    name:               'Didicas',
    region:             'Luzon',
    latitude:           19.079,
    longitude:          122.200,
    Alert_Level:        0,
    SO2_Flux:           50,
    Tilt_Deformation:   0.3,
    PDZ_Radius:         3,
    elevation:          244,
  },
  {
    ID:                 'parker',
    name:               'Mt. Parker (Allah Valley)',
    region:             'Mindanao',
    latitude:           6.112,
    longitude:          124.892,
    Alert_Level:        0,
    SO2_Flux:           12,
    Tilt_Deformation:   0.1,
    PDZ_Radius:         3,
    elevation:          1824,
  },
];

/**
 * Returns the full volcano catalog array.
 * @returns {VolcanoAsset[]}
 */
export function getVolcanoCatalog() {
  return VOLCANO_CATALOG;
}

/**
 * Fetch a single volcano by ID.
 * @param {string} id
 * @returns {VolcanoAsset|undefined}
 */
export function getVolcanoById(id) {
  return VOLCANO_CATALOG.find(v => v.ID === id);
}
