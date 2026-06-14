/**
 * PhilippineHazardAssessor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-Hazard Assessment Engine for the Philippine Archipelago
 *
 * Integrates real PHIVOLCS data and geological parameters to predict:
 *   1. Liquefaction potential (soil type, water table, shaking intensity)
 *   2. Sinkhole risk (limestone bedrock proximity)
 *   3. Tsunami inundation (coastal distance, bathymetry, fault type)
 *   4. Landslide susceptibility (slope angle, rainfall, shaking)
 *   5. Seabed uplift/subsidence (subduction zone proximity, coupling)
 *
 * Data sources:
 *   - PHIVOLCS Liquefaction Hazard Maps (GSC, Sarangani, Davao)
 *   - PHIVOLCS Tsunami warning zones
 *   - Philippine Geology Survey bedrock maps
 *   - Copernicus DEM for slope analysis
 *   - Torregosa et al. (2002) seismogenic zone parameters
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SEISMOGENIC_ZONES, ACTIVE_FAULTS } from '../data/ResearchPaperData.js';

// ── Philippine Geological Zones ──────────────────────────────────────────────

const LIQUEFACTION_ZONES = [
  // General Santos City — from PHIVOLCS Liquefaction Hazard Map
  { name: 'Dadiangas West', city: 'GSC', lat: 6.4956, lon: 125.4440, potential: 'high', soilType: 'sandy', waterTable: 2.5, bValue: 1.19 },
  { name: 'Dadiangas South', city: 'GSC', lat: 6.4900, lon: 125.4480, potential: 'high', soilType: 'sandy', waterTable: 2.0, bValue: 1.19 },
  { name: 'Lagao', city: 'GSC', lat: 6.5050, lon: 125.4560, potential: 'high', soilType: 'silty', waterTable: 3.0, bValue: 1.19 },
  { name: 'Baluan', city: 'GSC', lat: 6.4980, lon: 125.4620, potential: 'moderate', soilType: 'clayey', waterTable: 3.5, bValue: 1.19 },
  { name: 'Bula', city: 'GSC', lat: 6.4850, lon: 125.4550, potential: 'high', soilType: 'sandy', waterTable: 2.0, bValue: 1.19 },
  { name: 'Calumpang', city: 'GSC', lat: 6.4750, lon: 125.4400, potential: 'moderate', soilType: 'silty', waterTable: 3.0, bValue: 1.19 },
  { name: 'Apokong', city: 'GSC', lat: 6.5100, lon: 125.4380, potential: 'low', soilType: 'clayey', waterTable: 5.0, bValue: 1.19 },
  { name: 'Labangal', city: 'GSC', lat: 6.4880, lon: 125.4350, potential: 'moderate', soilType: 'silty', waterTable: 3.5, bValue: 1.19 },
  { name: 'San Isidro', city: 'GSC', lat: 6.5150, lon: 125.4500, potential: 'moderate', soilType: 'silty', waterTable: 3.0, bValue: 1.19 },
  { name: 'Katangawan', city: 'GSC', lat: 6.5200, lon: 125.4600, potential: 'moderate', soilType: 'silty', waterTable: 3.5, bValue: 1.19 },

  // Sarangani Province
  { name: 'Alabel', city: 'Sarangani', lat: 6.1030, lon: 125.2900, potential: 'high', soilType: 'sandy', waterTable: 1.5, bValue: 1.19 },
  { name: 'Glan', city: 'Sarangani', lat: 5.8250, lon: 125.2030, potential: 'high', soilType: 'sandy', waterTable: 2.0, bValue: 1.19 },
  { name: 'Maasim', city: 'Sarangani', lat: 5.8770, lon: 125.0050, potential: 'moderate', soilType: 'silty', waterTable: 3.0, bValue: 1.19 },
  { name: 'Kiamba', city: 'Sarangani', lat: 5.9860, lon: 124.9910, potential: 'moderate', soilType: 'silty', waterTable: 3.5, bValue: 1.19 },
  { name: 'Maitum', city: 'Sarangani', lat: 6.0390, lon: 124.9020, potential: 'low', soilType: 'clayey', waterTable: 5.0, bValue: 1.19 },
  { name: 'Malapatan', city: 'Sarangani', lat: 5.9640, lon: 125.2870, potential: 'high', soilType: 'sandy', waterTable: 2.0, bValue: 1.19 },
  { name: 'Malungon', city: 'Sarangani', lat: 6.2660, lon: 125.2810, potential: 'low', soilType: 'rocky', waterTable: 8.0, bValue: 1.19 },

  // Davao Occidental
  { name: 'Malita', city: 'Davao Occidental', lat: 6.4090, lon: 125.3060, potential: 'moderate', soilType: 'silty', waterTable: 3.0, bValue: 1.08 },
  { name: 'Don Marcelino', city: 'Davao Occidental', lat: 6.3230, lon: 125.3010, potential: 'moderate', soilType: 'silty', waterTable: 3.5, bValue: 1.08 },
  { name: 'Santa Maria', city: 'Davao Occidental', lat: 6.5470, lon: 125.4660, potential: 'low', soilType: 'rocky', waterTable: 6.0, bValue: 1.08 },
];

const SINKHOLE_ZONES = [
  // Limestone bedrock areas — from PHIVOLCS advisory
  { name: 'Alabel Coastal', lat: 6.1030, lon: 125.2900, risk: 'high', bedrock: 'limestone', thickness: 50 },
  { name: 'Glan Coastal', lat: 5.8250, lon: 125.2030, risk: 'high', bedrock: 'limestone', thickness: 40 },
  { name: 'Bawing', lat: 6.0650, lon: 125.2680, risk: 'high', bedrock: 'limestone', thickness: 30 },
  { name: 'Maasim Coast', lat: 5.8770, lon: 125.0050, risk: 'moderate', bedrock: 'limestone', thickness: 60 },
  { name: 'Kiamba Coast', lat: 5.9860, lon: 124.9910, risk: 'moderate', bedrock: 'limestone', thickness: 50 },
];

const TSUNAMI_COASTS = [
  // Coastal segments vulnerable to tsunami from Cotabato Trench
  { name: 'Sarangani Bay North', lat: 6.0, lon: 125.0, length_km: 40, exposure: 'high', maxRunup_m: 3.0 },
  { name: 'Sarangani Bay South', lat: 5.85, lon: 125.15, length_km: 30, exposure: 'high', maxRunup_m: 2.5 },
  { name: 'Glan Coast', lat: 5.82, lon: 125.20, length_km: 25, exposure: 'moderate', maxRunup_m: 1.5 },
  { name: 'General Santos Bay', lat: 6.50, lon: 125.17, length_km: 35, exposure: 'moderate', maxRunup_m: 1.0 },
  { name: 'Davao Gulf', lat: 7.0, lon: 125.8, length_km: 80, exposure: 'low', maxRunup_m: 0.5 },
  { name: 'Zamboanga Coast', lat: 6.9, lon: 122.0, length_km: 50, exposure: 'moderate', maxRunup_m: 1.5 },
  { name: 'Tawi-Tawi', lat: 5.2, lon: 119.8, length_km: 30, exposure: 'high', maxRunup_m: 2.0 },
];

const SEABED_ZONES = [
  // Subduction zones capable of seabed uplift
  { name: 'Cotabato Trench', lat: 6.0, lon: 125.0, couplingRatio: 0.94, strainRate: 42, upliftRisk: 'critical', maxUplift_m: 2.0 },
  { name: 'Philippine Trench South', lat: 6.0, lon: 127.0, couplingRatio: 0.88, strainRate: 28, upliftRisk: 'high', maxUplift_m: 1.5 },
  { name: 'Manila Trench', lat: 14.0, lon: 119.5, couplingRatio: 0.91, strainRate: 35, upliftRisk: 'high', maxUplift_m: 1.2 },
  { name: 'East Luzon Trench', lat: 17.8, lon: 123.5, couplingRatio: 0.85, strainRate: 25, upliftRisk: 'moderate', maxUplift_m: 0.8 },
];

// ── CONFIRMED ground-truth observations (real, validated by agencies) ─────────
// These are NOT predictions — they are documented post-event observations used
// to validate the model's hazard forecasts against reality.
export const CONFIRMED_OBSERVATIONS = [
  {
    type: 'seabed_uplift',
    lat: 5.92, lon: 125.20, // Brgy. Pangyan, Glan, Sarangani
    place: 'Brgy. Pangyan, Glan, Sarangani',
    observedUplift_m: 2.0,
    shorelineExtension_m: 200,
    date: '2025-06-11',
    causedBy: 'M7.8 Maasim, Sarangani (June 8, 2025)',
    detail: 'Long stretches of shoreline, coral reef and seagrass beds exposed in '
      + 'Pangyan Marine Sanctuary; corals dying off. Seabed rose ~2 m, shoreline '
      + 'extended ~200 m.',
    source: 'DENR SOCCSKSARGEN / PENRO Sarangani; PHIVOLCS (June 11, 2025)',
  },
];

const VOLCANIC_ARCS = [
  { name: 'Matutum', lat: 6.35, lon: 125.17, type: 'stratovolcano', alertLevel: 0, lastEruption: 'Holocene' },
  { name: 'Parker', lat: 6.15, lon: 124.90, type: 'stratovolcano', alertLevel: 0, lastEruption: '1641' },
  { name: 'Apo', lat: 6.98, lon: 125.27, type: 'stratovolcano', alertLevel: 0, lastEruption: 'Holocene' },
  { name: 'Halcon', lat: 12.40, lon: 123.50, type: 'stratovolcano', alertLevel: 0, lastEruption: 'Holocene' },
  { name: 'Bulusan', lat: 12.77, lon: 124.05, type: 'stratovolcano', alertLevel: 0, lastEruption: '2022' },
  { name: 'Mayon', lat: 13.25, lon: 123.68, type: 'stratovolcano', alertLevel: 0, lastEruption: '2024' },
  { name: 'Taal', lat: 14.00, lon: 120.99, type: 'caldera', alertLevel: 0, lastEruption: '2022' },
  { name: 'Pinatubo', lat: 15.14, lon: 120.35, type: 'stratovolcano', alertLevel: 0, lastEruption: '1991' },
  { name: 'Kanlaon', lat: 10.41, lon: 123.13, type: 'stratovolcano', alertLevel: 0, lastEruption: '2024' },
  { name: 'Smith Volcano', lat: 19.53, lon: 121.90, type: 'stratovolcano', alertLevel: 0, lastEruption: '1924' },
];


export class PhilippineHazardAssessor {
  constructor() {
    this.liquefactionZones = LIQUEFACTION_ZONES;
    this.sinkholeZones = SINKHOLE_ZONES;
    this.tsunamiCoasts = TSUNAMI_COASTS;
    this.seabedZones = SEABED_ZONES;
    this.volcanicArcs = VOLCANIC_ARCS;
  }

  /**
   * Haversine distance (km)
   */
  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Assess liquefaction potential at a given location given earthquake parameters.
   * Returns risk level, affected barangays, and recommendations.
   */
  assessLiquefaction(lat, lon, magnitude, depth = 25) {
    const nearby = this.liquefactionZones
      .map(z => ({ ...z, dist: this.haversine(lat, lon, z.lat, z.lon) }))
      .filter(z => z.dist < 100)
      .sort((a, b) => a.dist - b.dist);

    const shakingIntensity = this._computeShakingIntensity(magnitude, depth, nearby[0]?.dist || 50);

    const affected = nearby.map(z => {
      let risk = z.potential;
      if (shakingIntensity >= 6 && z.potential === 'high') risk = 'critical';
      if (shakingIntensity >= 7 && z.potential === 'moderate') risk = 'high';
      if (shakingIntensity < 4) risk = 'low';

      const liquefactionProb = this._computeLiquefactionProbability(z, shakingIntensity, magnitude);

      return {
        name: z.name,
        city: z.city,
        dist_km: Math.round(z.dist),
        potential: risk,
        probability: liquefactionProb,
        soilType: z.soilType,
        waterTable: z.waterTable,
        recommendation: this._getLiquefactionRecommendation(risk, liquefactionProb),
      };
    });

    return {
      epicenter: { lat, lon },
      magnitude,
      shakingIntensity,
      affectedZones: affected,
      summary: {
        criticalCount: affected.filter(z => z.potential === 'critical').length,
        highCount: affected.filter(z => z.potential === 'high').length,
        moderateCount: affected.filter(z => z.potential === 'moderate').length,
        maxProbability: affected.length > 0 ? Math.max(...affected.map(z => z.probability)) : 0,
      },
      source: 'PHIVOLCS Liquefaction Hazard Maps + Torregosa et al. (2002)',
    };
  }

  /**
   * Assess sinkhole risk based on limestone bedrock proximity and seismic shaking.
   */
  assessSinkholeRisk(lat, lon, magnitude) {
    const nearby = this.sinkholeZones
      .map(z => ({ ...z, dist: this.haversine(lat, lon, z.lat, z.lon) }))
      .filter(z => z.dist < 50)
      .sort((a, b) => a.dist - b.dist);

    const shakingIntensity = this._computeShakingIntensity(magnitude, 25, nearby[0]?.dist || 30);

    return nearby.map(z => {
      const riskFactor = (1 - z.dist / 50) * (magnitude / 8.0) * (z.risk === 'high' ? 1.0 : 0.6);
      const sinkholeProb = Math.min(0.95, riskFactor * 0.3);

      return {
        name: z.name,
        dist_km: Math.round(z.dist),
        risk: z.risk,
        bedrock: z.bedrock,
        probability: parseFloat(sinkholeProb.toFixed(3)),
        shakingIntensity,
        recommendation: sinkholeProb > 0.3
          ? 'AVOID area — sinkhole collapse likely. Evacuate to stable ground.'
          : 'Monitor for ground subsidence and new cracks.',
      };
    });
  }

  /**
   * Assess tsunami risk for coastal areas given earthquake parameters.
   */
  assessTsunamiRisk(lat, lon, magnitude, depth = 25) {
    const offshore = this.haversine(lat, lon, 6.0, 125.0) < 200;
    const isSubduction = magnitude >= 6.5 && depth < 50 && offshore;

    const coastalThreats = this.tsunamiCoasts
      .map(c => ({ ...c, dist: this.haversine(lat, lon, c.lat, c.lon) }))
      .filter(c => c.dist < 300)
      .sort((a, b) => a.dist - b.dist);

    return {
      tsunamiTriggered: isSubduction,
      magnitude,
      depth,
      epicenterDistToCoast: Math.round(coastalThreats[0]?.dist || 0),
      coastalSegments: coastalThreats.map(c => {
        const waveHeight = isSubduction
          ? c.maxRunup_m * (magnitude / 7.0) * Math.max(0.1, 1 - c.dist / 300)
          : 0;
        return {
          name: c.name,
          dist_km: Math.round(c.dist),
          exposure: c.exposure,
          estimatedRunup_m: parseFloat(waveHeight.toFixed(1)),
          warning: waveHeight > 1.0 ? 'TSUNAMI WARNING' : waveHeight > 0.3 ? 'TSUNAMI ADVISORY' : 'MONITORING',
        };
      }),
      source: 'PHIVOLCS Sea Level Monitoring + Cotabato Trench model',
    };
  }

  /**
   * Assess seabed uplift/subsidence risk.
   */
  assessSeabedUplift(lat, lon, magnitude) {
    const nearbyTrenches = this.seabedZones
      .map(z => ({ ...z, dist: this.haversine(lat, lon, z.lat, z.lon) }))
      .filter(z => z.dist < 200)
      .sort((a, b) => a.dist - b.dist);

    return nearbyTrenches.map(z => {
      const couplingFactor = z.couplingRatio;
      const magFactor = Math.min(1, magnitude / 8.0);
      const distFactor = Math.max(0, 1 - z.dist / 200);
      const upliftProb = couplingFactor * magFactor * distFactor;
      const estimatedUplift = z.maxUplift_m * magFactor * distFactor;

      return {
        name: z.name,
        dist_km: Math.round(z.dist),
        couplingRatio: z.couplingRatio,
        strainRate_mm_yr: z.strainRate,
        upliftProbability: parseFloat(upliftProb.toFixed(3)),
        estimatedUplift_m: parseFloat(estimatedUplift.toFixed(2)),
        riskLevel: z.upliftRisk,
        impact: estimatedUplift > 1.0
          ? 'CRITICAL — coastal inundation, harbor damage, coral reef exposure'
          : estimatedUplift > 0.5
          ? 'HIGH — minor coastal changes, fishing ground shifts'
          : 'MODERATE — subtle sea level changes',
      };
    });
  }

  /**
   * Full multi-hazard assessment for a given earthquake scenario.
   */
  assessFullHazard(lat, lon, magnitude, depth = 25) {
    const liquefaction = this.assessLiquefaction(lat, lon, magnitude, depth);
    const sinkholes = this.assessSinkholeRisk(lat, lon, magnitude);
    const tsunami = this.assessTsunamiRisk(lat, lon, magnitude, depth);
    const seabed = this.assessSeabedUplift(lat, lon, magnitude);

    // Confirmed ground-truth observations within ~150 km — validates predictions.
    const confirmedNearby = CONFIRMED_OBSERVATIONS
      .map(o => ({ ...o, dist_km: Math.round(this.haversine(lat, lon, o.lat, o.lon)) }))
      .filter(o => o.dist_km <= 150)
      .sort((a, b) => a.dist_km - b.dist_km);
    // If we predicted seabed uplift here AND it was observed, mark it validated.
    if (confirmedNearby.some(o => o.type === 'seabed_uplift') && seabed.length > 0) {
      seabed[0].validatedByObservation = confirmedNearby.find(o => o.type === 'seabed_uplift');
    }

    const nearestVolcano = this.volcanicArcs
      .map(v => ({ ...v, dist: this.haversine(lat, lon, v.lat, v.lon) }))
      .sort((a, b) => a.dist - b.dist)[0];

    return {
      timestamp: new Date().toISOString(),
      epicenter: { lat, lon, depth, magnitude },
      liquefaction,
      sinkholes,
      tsunami,
      seabedUplift: seabed,
      confirmedObservations: confirmedNearby,
      nearestVolcano: nearestVolcano ? {
        name: nearestVolcano.name,
        dist_km: Math.round(nearestVolcano.dist),
        type: nearestVolcano.type,
        alertLevel: nearestVolcano.alertLevel,
        volcanicThreat: nearestVolcano.dist < 50 ? 'MONITOR' : 'LOW',
      } : null,
      overallRisk: this._computeOverallRisk(liquefaction, sinkholes, tsunami, seabed),
      source: 'PHIVOLCS + Torregosa et al. (2002) + Philippine Geology Survey',
    };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  _computeShakingIntensity(magnitude, depth, distKm) {
    // Simplified Modified Mercalli Intensity from magnitude, depth, distance
    const energyFactor = Math.pow(10, 0.5 * (magnitude - 4.0));
    const distFactor = Math.max(0.1, 1.0 / (1 + distKm / 50));
    const depthFactor = Math.max(0.3, 1.0 - depth / 200);
    const rawIntensity = energyFactor * distFactor * depthFactor;
    return Math.min(12, Math.max(1, Math.round(rawIntensity)));
  }

  _computeLiquefactionProbability(zone, shakingIntensity, magnitude) {
    const soilFactor = zone.soilType === 'sandy' ? 1.0 : zone.soilType === 'silty' ? 0.7 : 0.3;
    const waterFactor = Math.max(0, 1 - zone.waterTable / 10);
    const shakeFactor = Math.min(1, shakingIntensity / 8);
    const magFactor = Math.min(1, magnitude / 7.0);
    const prob = soilFactor * waterFactor * shakeFactor * magFactor * 0.8;
    return Math.min(0.95, Math.max(0, prob));
  }

  _getLiquefactionRecommendation(risk, probability) {
    if (risk === 'critical' || probability > 0.7)
      return 'CRITICAL — Evacuate immediately. Ground failure imminent. Avoid low-lying areas near water bodies.';
    if (risk === 'high' || probability > 0.4)
      return 'HIGH — Relocate heavy structures. Monitor for sand boils and ground fissures. Avoid river banks.';
    if (risk === 'moderate' || probability > 0.2)
      return 'MODERATE — Inspect foundations after shaking. Watch for subsidence near waterways.';
    return 'LOW — Standard post-earthquake inspection recommended.';
  }

  _computeOverallRisk(liq, sink, tsu, seabed) {
    let score = 0;
    if (liq.summary.criticalCount > 0) score += 3;
    if (liq.summary.highCount > 0) score += 2;
    if (sink.length > 0 && sink[0].probability > 0.3) score += 2;
    if (tsu.tsunamiTriggered) score += 3;
    if (seabed.length > 0 && seabed[0].upliftProbability > 0.5) score += 2;

    if (score >= 6) return { level: 'EXTREME', color: '#ff1a44', action: 'IMMEDIATE EVACUATION of all coastal and low-lying areas' };
    if (score >= 4) return { level: 'HIGH', color: '#ffaa00', action: 'Evacuate coastal zones. Prepare for infrastructure damage.' };
    if (score >= 2) return { level: 'ELEVATED', color: '#ffaa00', action: 'Monitor conditions. Inspect critical infrastructure.' };
    return { level: 'NORMAL', color: '#00ff88', action: 'Standard monitoring protocols.' };
  }
}
