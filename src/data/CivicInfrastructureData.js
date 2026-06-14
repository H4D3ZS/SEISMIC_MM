/**
 * CivicInfrastructureData.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time civic infrastructure monitoring data for Philippine cities.
 * Per-barangay granularity with utilities, businesses, and hazard status.
 *
 * Data sources:
 *   - GSC Water District (GSCWD) — water pressure/status per barangay
 *   - SOCOTECO II — power restoration status
 *   - LGU CDRRMO — hazard advisories
 *   - Business permits office — operating status
 *   - USGS/PHIVOLCS — seismic events triggering status changes
 *
 * Status enums:
 *   utilities: OK | LOW_PRESS | INTERRUPTED | UNKNOWN
 *   power:     RESTORED | PARTIAL | OUTAGE | UNKNOWN
 *   hazard:    NORMAL | ELEVATED | CRITICAL | FLOODED | SINKHOLE
 *   business:  OPEN | CLOSED | RESTRICTED | EVACUATED
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── General Santos City Barangays ───────────────────────────────────────────
// 26 barangays with approximate polygon centroids and utility status

export const CITIES = {
  'General Santos City': {
    code: 'GSC',
    province: 'South Cotabato',
    region: 'XII',
    lat: 6.1164,
    lon: 125.1716,
    population: 697000,
    barangays: generateBarangaysGSC(),
    lastUpdate: null,
    earthquakeAdvisory: null,
    powerRestoredPct: 0,
    waterRationingActive: false,
  },
  'Koronadal City': {
    code: 'KOR',
    province: 'South Cotabato',
    region: 'XII',
    lat: 6.5006,
    lon: 124.8469,
    population: 195000,
    barangays: generateBarangaysKOR(),
    lastUpdate: null,
    earthquakeAdvisory: null,
    powerRestoredPct: 0,
    waterRationingActive: false,
  },
  'Davao City': {
    code: 'DVO',
    province: 'Davao del Sur',
    region: 'XI',
    lat: 7.0707,
    lon: 125.6090,
    population: 1632000,
    barangays: generateBarangaysDVO(),
    lastUpdate: null,
    earthquakeAdvisory: null,
    powerRestoredPct: 0,
    waterRationingActive: false,
  },
};

function generateBarangaysGSC() {
  const barangays = [
    { name: 'Apopong', lat: 6.1350, lon: 125.1850, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Baluan', lat: 6.1100, lon: 125.1650, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Batomelong', lat: 6.1200, lon: 125.2000, water: 'UNKNOWN', power: 'PARTIAL', hazard: 'ELEVATED', businesses: [] },
    { name: 'Buayan', lat: 6.0950, lon: 125.1700, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Bula', lat: 6.1050, lon: 125.1550, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Calumpang', lat: 6.1150, lon: 125.1750, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'City Heights', lat: 6.1250, lon: 125.1800, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Conel', lat: 6.1300, lon: 125.1900, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Dadiangas East', lat: 6.1000, lon: 125.1900, water: 'INTERRUPTED', power: 'PARTIAL', hazard: 'FLOODED', businesses: [] },
    { name: 'Dadiangas North', lat: 6.1200, lon: 125.1700, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Dadiangas South', lat: 6.0900, lon: 125.1800, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Dadiangas West', lat: 6.1000, lon: 125.1600, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Fatima', lat: 6.1050, lon: 125.1850, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Katangawan', lat: 6.1150, lon: 125.1950, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Labangal', lat: 6.1100, lon: 125.1750, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Lagao', lat: 6.1050, lon: 125.1900, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Ligaya', lat: 6.1150, lon: 125.1600, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Mabuhay', lat: 6.1000, lon: 125.1500, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Olympog', lat: 6.1250, lon: 125.1750, water: 'UNKNOWN', power: 'UNKNOWN', hazard: 'ELEVATED', businesses: [] },
    { name: 'San Isidro', lat: 6.1300, lon: 125.1850, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'San Jose', lat: 6.1100, lon: 125.1600, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Siguel (Bawing)', lat: 6.0950, lon: 125.1550, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Sinawal', lat: 6.1000, lon: 125.1650, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Tambler', lat: 6.0900, lon: 125.1700, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Tinagacan', lat: 6.1350, lon: 125.1950, water: 'UNKNOWN', power: 'PARTIAL', hazard: 'ELEVATED', businesses: [] },
    { name: 'Upper Labay', lat: 6.1400, lon: 125.1800, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
  ];

  // Add businesses to relevant barangays
  const businessMap = {
    'Apopong': [
      { name: 'Gaisano Grand Mall GSC', type: 'MALL', status: 'OPEN', lat: 6.1340, lon: 125.1840 },
      { name: 'Apopong Public Market', type: 'MARKET', status: 'OPEN', lat: 6.1360, lon: 125.1860 },
    ],
    'Lagao': [
      { name: 'SM City General Santos', type: 'MALL', status: 'OPEN', lat: 6.1060, lon: 125.1910 },
      { name: 'Lagao 1 Public Market', type: 'MARKET', status: 'OPEN', lat: 6.1040, lon: 125.1890 },
    ],
    'City Heights': [
      { name: 'KCC Mall of Gensan', type: 'MALL', status: 'OPEN', lat: 6.1260, lon: 125.1810 },
      { name: 'GenSan Doctors Hospital', type: 'HOSPITAL', status: 'RESTRICTED', lat: 6.1240, lon: 125.1790 },
    ],
    'Dadiangas East': [
      { name: 'Dadiangas East Hospital', type: 'HOSPITAL', status: 'EVACUATED', lat: 6.1010, lon: 125.1910 },
    ],
    'Calumpang': [
      { name: 'Calumpang Beach Resort', type: 'HOTEL', status: 'OPEN', lat: 6.1160, lon: 125.1760 },
      { name: 'GenSan Waterfront', type: 'FOOD', status: 'OPEN', lat: 6.1140, lon: 125.1740 },
    ],
    'Bula': [
      { name: 'Bula Beach Resort', type: 'HOTEL', status: 'OPEN', lat: 6.1060, lon: 125.1560 },
    ],
    'San Isidro': [
      { name: 'San Isidro Elementary School', type: 'INFRASTRUCTURE', status: 'OPEN', lat: 6.1310, lon: 125.1860 },
    ],
    'Tambler': [
      { name: 'GenSan Airport', type: 'INFRASTRUCTURE', status: 'RESTRICTED', lat: 6.0890, lon: 125.1710 },
    ],
  };

  for (const b of barangays) {
    b.businesses = businessMap[b.name] || [];
  }

  return barangays;
}

function generateBarangaysKOR() {
  return [
    { name: 'Zone I', lat: 6.5010, lon: 124.8470, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Zone II', lat: 6.5020, lon: 124.8480, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Zone III', lat: 6.5000, lon: 124.8460, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Zone IV', lat: 6.4990, lon: 124.8450, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Zone V', lat: 6.5015, lon: 124.8490, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Aquino', lat: 6.5030, lon: 124.8440, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Assumption', lat: 6.4980, lon: 124.8470, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Avanceña', lat: 6.5005, lon: 124.8430, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Cacayan', lat: 6.5040, lon: 124.8460, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'El Gringo', lat: 6.4970, lon: 124.8480, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Kabacan', lat: 6.5025, lon: 124.8450, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Mabini', lat: 6.4995, lon: 124.8490, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Magsaysay', lat: 6.5010, lon: 124.8420, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Poblacion', lat: 6.5000, lon: 124.8475, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Rizal', lat: 6.5018, lon: 124.8455, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
  ];
}

function generateBarangaysDVO() {
  return [
    { name: 'Agdao', lat: 7.0850, lon: 125.6200, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Agdao Proper', lat: 7.0860, lon: 125.6210, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Buhangin', lat: 7.1100, lon: 125.6300, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Bunawan', lat: 7.1200, lon: 125.6400, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Calinan', lat: 7.0600, lon: 125.5800, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Catalunan Grande', lat: 7.0800, lon: 125.6100, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Catalunan Pequeño', lat: 7.0810, lon: 125.6110, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Cubao', lat: 7.0750, lon: 125.6050, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Dacudao', lat: 7.0500, lon: 125.5700, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Lanang', lat: 7.0900, lon: 125.6250, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Matina', lat: 7.0650, lon: 125.5950, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Poblacion', lat: 7.0700, lon: 125.6000, water: 'OK', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Talomo', lat: 7.0550, lon: 125.5850, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Talomo Proper', lat: 7.0560, lon: 125.5860, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
    { name: 'Tugbok', lat: 7.0450, lon: 125.5650, water: 'LOW_PRESS', power: 'RESTORED', hazard: 'NORMAL', businesses: [] },
  ];
}

// ── Status Color Mappings ───────────────────────────────────────────────────

export const STATUS_COLORS = {
  water: {
    OK:         { bg: '#00cc44', fg: '#000000', label: 'OK' },
    LOW_PRESS:  { bg: '#ffaa00', fg: '#000000', label: 'LOW PRESS' },
    INTERRUPTED:{ bg: '#ff4444', fg: '#ffffff', label: 'INTERRUPTED' },
    UNKNOWN:    { bg: '#888888', fg: '#ffffff', label: 'UNKNOWN' },
  },
  power: {
    RESTORED: { bg: '#00cc44', fg: '#000000', label: 'RESTORED' },
    PARTIAL:  { bg: '#ffaa00', fg: '#000000', label: 'PARTIAL' },
    OUTAGE:   { bg: '#ff4444', fg: '#ffffff', label: 'OUTAGE' },
    UNKNOWN:  { bg: '#888888', fg: '#ffffff', label: 'UNKNOWN' },
  },
  hazard: {
    NORMAL:   { bg: 'rgba(0, 204, 68, 0.15)', border: '#00cc44', label: 'Normal' },
    ELEVATED: { bg: 'rgba(255, 170, 0, 0.20)', border: '#ffaa00', label: 'Elevated' },
    CRITICAL: { bg: 'rgba(255, 68, 68, 0.25)', border: '#ff4444', label: 'Critical' },
    FLOODED:  { bg: 'rgba(0, 100, 255, 0.30)', border: '#0066ff', label: 'Flooded' },
    SINKHOLE: { bg: 'rgba(128, 0, 128, 0.30)', border: '#800080', label: 'Sinkhole' },
  },
  business: {
    OPEN:      { bg: '#00cc44', fg: '#000000', label: 'OPEN' },
    CLOSED:    { bg: '#ff4444', fg: '#ffffff', label: 'CLOSED' },
    RESTRICTED:{ bg: '#ffaa00', fg: '#000000', label: 'RESTRICTED' },
    EVACUATED: { bg: '#ff007f', fg: '#ffffff', label: 'EVACUATED' },
  },
  businessType: {
    MALL:           { icon: '🏬', color: '#ff6600' },
    HOTEL:          { icon: '🏨', color: '#00aaff' },
    FOOD:           { icon: '🍽️', color: '#ff4444' },
    HOSPITAL:       { icon: '🏥', color: '#ff007f' },
    MARKET:         { icon: '🏪', color: '#ffaa00' },
    SCHOOL:         { icon: '🏫', color: '#00cc44' },
    INFRASTRUCTURE: { icon: '🏛️', color: '#8888ff' },
  },
};

// ── Hazard Advisory Templates ───────────────────────────────────────────────

export function generateEarthquakeAdvisory(event) {
  if (!event) return null;
  const mag = event.mag || 0;
  const place = event.place || 'Unknown';

  if (mag >= 7.0) {
    return {
      level: 'CRITICAL',
      message: `EARTHQUAKE ADVISORY: Magnitude ${mag.toFixed(1)} struck near ${place} on ${new Date(event.time).toLocaleDateString()}. Airport restricted. Hospitals operating with precautions. Post-earthquake monitoring active.`,
      color: '#ff4444',
      timestamp: Date.now(),
    };
  } else if (mag >= 5.0) {
    return {
      level: 'ELEVATED',
      message: `SEISMIC ADVISORY: Magnitude ${mag.toFixed(1)} near ${place}. Monitoring for aftershocks. Infrastructure inspection recommended.`,
      color: '#ffaa00',
      timestamp: Date.now(),
    };
  }
  return {
    level: 'INFO',
    message: `Seismic event M${mag.toFixed(1)} near ${place}. No significant impact expected.`,
    color: '#00cc44',
    timestamp: Date.now(),
  };
}

// ── Utility Status Update Simulation ────────────────────────────────────────
// Simulates realistic utility status changes after an earthquake

export function simulatePostEarthquakeStatus(cityName, event) {
  const city = CITIES[cityName];
  if (!city) return;

  const mag = event?.mag || 0;
  const dist = event ? Math.sqrt((event.lat - city.lat) ** 2 + (event.lon - city.lon) ** 2) * 111 : 100;

  // Distance-based impact factor (closer = worse)
  const impactFactor = Math.max(0, Math.min(1, 1 - dist / 200));

  // Magnitude-based impact
  const magFactor = Math.max(0, Math.min(1, (mag - 5.0) / 3.0));

  const combinedImpact = impactFactor * magFactor;

  for (const b of city.barangays) {
    // Water status degradation
    const waterRoll = Math.random();
    if (combinedImpact > 0.7 && waterRoll < 0.3) {
      b.water = 'INTERRUPTED';
    } else if (combinedImpact > 0.3 && waterRoll < 0.6) {
      b.water = 'LOW_PRESS';
    } else if (combinedImpact < 0.1 && waterRoll < 0.3) {
      b.water = 'OK';
    }

    // Power status
    const powerRoll = Math.random();
    if (combinedImpact > 0.8 && powerRoll < 0.2) {
      b.power = 'OUTAGE';
    } else if (combinedImpact > 0.4 && powerRoll < 0.4) {
      b.power = 'PARTIAL';
    }

    // Hazard status
    if (combinedImpact > 0.6) {
      const hazardRoll = Math.random();
      if (hazardRoll < 0.05) b.hazard = 'SINKHOLE';
      else if (hazardRoll < 0.15) b.hazard = 'FLOODED';
      else if (hazardRoll < 0.30) b.hazard = 'CRITICAL';
      else if (hazardRoll < 0.50) b.hazard = 'ELEVATED';
    }

    // Business status
    for (const biz of b.businesses) {
      if (combinedImpact > 0.7 && biz.type === 'HOSPITAL') {
        biz.status = 'RESTRICTED';
      } else if (combinedImpact > 0.8 && biz.type === 'INFRASTRUCTURE') {
        biz.status = 'RESTRICTED';
      } else if (combinedImpact > 0.5 && Math.random() < 0.3) {
        biz.status = 'CLOSED';
      }
    }
  }

  // Update city-level stats
  const total = city.barangays.length;
  const okCount = city.barangays.filter(b => b.water === 'OK').length;
  city.powerRestoredPct = Math.round(city.barangays.filter(b => b.power === 'RESTORED').length / total * 100);
  city.waterRationingActive = city.barangays.filter(b => b.water === 'INTERRUPTED').length > 0;
  city.lastUpdate = Date.now();
}

// ── Compute City Aggregate Statistics ───────────────────────────────────────

export function computeCityStats(cityName) {
  const city = CITIES[cityName];
  if (!city) return null;

  const total = city.barangays.length;
  const waterStats = { OK: 0, LOW_PRESS: 0, INTERRUPTED: 0, UNKNOWN: 0 };
  const powerStats = { RESTORED: 0, PARTIAL: 0, OUTAGE: 0, UNKNOWN: 0 };
  const hazardStats = { NORMAL: 0, ELEVATED: 0, CRITICAL: 0, FLOODED: 0, SINKHOLE: 0 };
  const businessStats = { OPEN: 0, CLOSED: 0, RESTRICTED: 0, EVACUATED: 0 };

  let totalBusinesses = 0;

  for (const b of city.barangays) {
    waterStats[b.water]++;
    powerStats[b.power]++;
    hazardStats[b.hazard]++;
    for (const biz of b.businesses) {
      totalBusinesses++;
      businessStats[biz.status]++;
    }
  }

  return {
    totalBarangays: total,
    waterStats,
    powerStats,
    hazardStats,
    businessStats,
    totalBusinesses,
    powerRestoredPct: city.powerRestoredPct,
    waterRationingActive: city.waterRationingActive,
  };
}
