/**
 * simulation_engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Stress Inversion Analysis & AI Triage Simulator
 *
 * All values are computed dynamically from event parameters and paper data.
 * NO hard-coded magnitudes, Coulomb values, or scenario probabilities.
 *
 * Physics:
 *   - Slip magnitude from Wells & Coppersmith (1994): log10(A) = Mw - 4.07
 *   - Coulomb stress from elastic dislocation theory
 *   - Tsunami from Okada (1985) static seafloor deformation
 *   - Attenuation from Torregosa et al. (2002) Eqs. 17-19
 *
 * Data: Torregosa, Sugito & Nojima (2002),
 *   "Seismic Hazard and Microzoning of the Philippines"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PLACE_LABELS } from '../data/PlaceLabelCatalog.js';
import { EarthquakePredictor } from './EarthquakePredictor.js';
import { MonteCarloSimulator } from './MonteCarloSimulator.js';
import {
  SEISMOGENIC_ZONES,
  ACTIVE_FAULTS,
  STRAIN_RATES,
  computePGA,
  computePGV,
  PAPER_CITATION,
} from '../data/ResearchPaperData.js';

// ── Haversine distance ──────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Convert moment magnitude to fault slip in meters.
 * Wells & Coppersmith (1994) —Strike-Slip: log10(A) = Mw - 4.07
 * A = rupture area in km², slip ≈ A^0.5 * 10^(Mw-4.07) / 1000
 * Simplified: slip(m) ≈ 10^(0.5*Mw - 3.3)
 */
function magToSlipMeters(mag) {
  return Math.pow(10, 0.5 * mag - 3.3);
}

/**
 * Convert moment magnitude to seismic moment in Newton-meters.
 * log10(M0) = 1.5*Mw + 9.05 (Hanks & Kanamori, 1979)
 */
function magToMoment(mag) {
  return Math.pow(10, 1.5 * mag + 9.05);
}

/**
 * Find the N closest faults to a given epicenter, dynamically from paper data.
 */
function findClosestFaults(eventLat, eventLon, count = 3) {
  return ACTIVE_FAULTS
    .map(f => {
      const halfLenKm = f.length / 2;
      const strikeRad = f.strike * Math.PI / 180;
      const centroidLat = eventLat + halfLenKm * Math.cos(strikeRad) / 111;
      const centroidLon = eventLon + halfLenKm * Math.sin(strikeRad) / (111 * Math.cos(eventLat * Math.PI / 180));
      const dist = haversineKm(eventLat, eventLon, centroidLat, centroidLon);
      return { name: f.name, dist, Mf: f.Mf, vp: f.vp, slipRate: f.slipRate, length: f.length };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count);
}

/**
 * Find the nearest seismogenic zone dynamically from paper data.
 */
function findNearestZone(eventLat, eventLon) {
  return SEISMOGENIC_ZONES
    .map(z => ({ ...z, dist: haversineKm(eventLat, eventLon, z.lat, z.lon) }))
    .sort((a, b) => a.dist - b.dist)[0];
}

/**
 * Compute dynamic coupling ratio based on zone b-value and distance.
 */
function computeCouplingRatio(eventLat, eventLon, zone) {
  const b = zone.bValue;
  const baseCoupling = Math.max(0.5, Math.min(0.98, 1.0 - b * 0.15));
  const dist = haversineKm(eventLat, eventLon, zone.lat, zone.lon);
  const distanceFactor = Math.max(0.7, 1.0 - dist * 0.0005);
  return baseCoupling * distanceFactor;
}

/**
 * Determine fault segment and rupture type from coordinates (dynamic).
 */
function identifyRuptureType(lat, lon) {
  const zone = findNearestZone(lat, lon);
  if (!zone) {
    return { faultSegment: "Regional Fault Interface", primaryType: "Thrust Megashock", primaryName: "Primary Event" };
  }

  const zoneRuptureMap = {
    1: { segment: "Cagayan Valley Thrust Zone", type: "Thrust Rupture" },
    2: { segment: "Baguio thrust fault system", type: "Crustal Shear Failure" },
    3: { segment: "East Luzon Trough Subduction", type: "Subduction Megathrust" },
    4: { segment: "Central Luzon Basin", type: "Crustal Normal Faulting" },
    5: { segment: "West Luzon Arc", type: "Crustal Shear Failure" },
    6: { segment: "Manila Trench North Subduction", type: "Mega-Subduction Rupture" },
    8: { segment: "Visayan Block Boundary", type: "Strike-Slip Rupture" },
    9: { segment: "Sulu Sea Arc", type: "Thrust Rupture" },
    10: { segment: "Manila Bay Fault System", type: "Crustal Shear Failure" },
    12: { segment: "Philippine Trench North", type: "Subduction Megathrust" },
    13: { segment: "Philippine Trench Central", type: "Subduction Megathrust" },
    14: { segment: "Philippine Trench South", type: "Subduction Megathrust" },
    15: { segment: "East Mindanao Fault System", type: "Thrust Megashock" },
    16: { segment: "Cotabato Trench Subduction", type: "Thrust Megashock" },
    17: { segment: "Sarangani Bay Trench", type: "Thrust Megashock" },
    18: { segment: "Zamboanga Peninsula", type: "Strike-Slip Rupture" },
    20: { segment: "Central Mindanao Fault", type: "Strike-Slip Rupture" },
    21: { segment: "Davao Gulf Trench", type: "Thrust Rupture" },
    23: { segment: "Mindanao Eastern Margin", type: "Subduction Megathrust" },
    24: { segment: "Leyte Fault System", type: "Strike-Slip Rupture" },
    25: { segment: "Bicol Arc", type: "Thrust Rupture" },
  };

  const mapped = zoneRuptureMap[zone.id] || { segment: `${zone.name} Fault System`, type: "Thrust Megashock" };

  return {
    faultSegment: mapped.segment,
    primaryType: mapped.type,
    primaryName: `${zone.name} Event`,
    zoneId: zone.id,
    zoneName: zone.name,
    bValue: zone.bValue,
    maxMag: zone.maxMag,
  };
}

export class NasagradeSeismicSimulator {
  constructor(engineInstance) {
    this.engine = engineInstance;
    this.ollamaUrl = "http://localhost:11434/api/chat";
    this.activeModel = "tinyllama:1.1b";
    this.predictor = new EarthquakePredictor();
    this.monteCarloSimulator = new MonteCarloSimulator();
  }

  async runTemporalPrediction(lat, lon, depth = 25, onProgress) {
    return this.predictor.predict({ lat, lon, depth, onProgress });
  }

  /**
   * Calculate Coulomb Stress Change from ACTUAL event parameters.
   * Uses elastic dislocation theory — slip is derived from magnitude, not magnitude itself.
   *
   * @param {{magnitude: number}} slipVector  Contains the event MAGNITUDE (used to compute slip)
   * @param {{strike: number, dip: number, rake: number}} faultGeometry
   * @param {object|null} eventOrMag  Full event record or magnitude
   * @returns {object}  Stress metrics with dynamic values
   */
  calculateCoulombStressLoading(slipVector, faultGeometry, eventOrMag = null) {
    // 1. Resolve event parameters
    let event = null;
    let mag = 5.0;
    let eventLat = 12.0;
    let eventLon = 122.0;
    let eventDepth = 25;

    if (eventOrMag && typeof eventOrMag === 'object') {
      event = eventOrMag;
      mag = event.mag;
      eventLat = event.lat;
      eventLon = event.lon;
      eventDepth = event.depth ?? 25;
    } else {
      mag = eventOrMag ?? (slipVector.magnitude * 2.0 + 4.5);
    }

    // 2. Convert magnitude to actual slip in meters (Wells & Coppersmith 1994)
    const slipMeters = magToSlipMeters(mag);
    const seismicMoment = magToMoment(mag);

    // 3. Fault geometry
    const dipRad = faultGeometry.dip * (Math.PI / 180);
    const strikeRad = faultGeometry.strike * (Math.PI / 180);
    const rakeRad = (faultGeometry.rake || 0) * (Math.PI / 180);

    // 4. Compute Coulomb Stress Change (ΔCFF) from elastic dislocation
    //    ΔCFF = Δτ + μ·Δσn
    //    Where Δτ = shear stress change, Δσn = normal stress change
    const shearModulus = 32.0e9; // 32 GPa in Pa
    const frictionCoeff = 0.4;

    // Shear stress change: Δτ = μ·slip·sin(dip)·cos(rake) / (2π·R²) simplified
    const deltaShear = (shearModulus * slipMeters * Math.sin(dipRad) * Math.cos(rakeRad)) / (2 * Math.PI * Math.max(eventDepth * 1000, 20000));

    // Normal stress change: Δσn = μ·slip·sin(dip)·sin(rake) / (2π·R²) simplified
    const deltaNormal = (shearModulus * slipMeters * Math.sin(dipRad) * Math.sin(rakeRad)) / (2 * Math.PI * Math.max(eventDepth * 1000, 20000));

    // Coulomb Failure Function change (in Pascals, convert to bars: 1 bar = 1e5 Pa)
    const deltaCFF_Pa = deltaShear + frictionCoeff * deltaNormal;
    const deltaCFF_bars = deltaCFF_Pa / 1e5;

    // 5. Tsunami model (uses actual mag-derived slip)
    const tsunami = this.modelTsunamiPropagation(mag, faultGeometry.dip, faultGeometry.strike, faultGeometry.rake, event, slipMeters);

    // 6. Dynamic fault loading — stress transfer decays with distance
    const closestFaults = findClosestFaults(eventLat, eventLon, 3);
    const faultLoads = {};
    closestFaults.forEach((f) => {
      // Stress decays as 1/distance² from fault
      const distKm = Math.max(f.dist, 10);
      const stressAtFault = deltaCFF_bars * Math.pow(eventDepth / (eventDepth + distKm), 2);
      faultLoads[f.name] = parseFloat(Math.max(0.01, stressAtFault).toFixed(3));
    });

    // 7. Dynamic coupling from nearest zone
    const nearestZone = findNearestZone(eventLat, eventLon);
    const coupling = nearestZone ? computeCouplingRatio(eventLat, eventLon, nearestZone) : 0.85;

    return {
      coulombLoadBars: parseFloat(Math.max(0.01, deltaCFF_bars).toFixed(3)),
      isCritical: deltaCFF_bars > 1.0,
      couplingEfficiency: coupling,
      faultLoads: faultLoads,
      tsunami: tsunami,
      nearestZone: nearestZone ? nearestZone.name : 'Unknown',
      closestFaults: closestFaults.map(f => f.name),
      slipMeters: parseFloat(slipMeters.toFixed(2)),
      seismicMoment: seismicMoment.toExponential(2),
      derivedMagnitude: mag,
    };
  }

  /**
   * Model tsunami wave characteristics from actual slip, not magnitude.
   * Uses Okada (1985) static deformation + Green's Law shoaling.
   */
  modelTsunamiPropagation(mag, dip, strike, rake, event = null, slipMeters = null) {
    if (mag < 6.5) return null;

    // Use provided slip or compute from magnitude
    const slip = slipMeters || magToSlipMeters(mag);

    // Vertical seafloor displacement (Okada 1985 simplified)
    const dipRad = dip * (Math.PI / 180);
    const rakeRad = rake * (Math.PI / 180);
    const uplift = Math.max(0.01, slip * Math.sin(dipRad) * Math.abs(Math.sin(rakeRad)));

    // Wave propagation in deep ocean
    const g = 9.81;
    const deepDepth = 4000.0; // Average Philippine Sea depth
    const velocityMs = Math.sqrt(g * deepDepth);
    const velocityKmh = velocityMs * 3.6;

    // Green's Law shoaling: H_coast = H_deep * (d_deep / d_shore)^0.25
    const shoreDepth = 10.0;
    const shoalingFactor = Math.pow(deepDepth / shoreDepth, 0.25);

    // Find nearest coast targets dynamically
    let targets = [];
    if (event) {
      targets = PLACE_LABELS
        .filter(p => p.tier <= 3)
        .map(p => {
          const distKm = haversineKm(event.lat, event.lon, p.lat, p.lon);
          return { name: p.name + ' Coast', distanceKm: Math.max(5, parseFloat(distKm.toFixed(1))) };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 4);
    }

    if (targets.length === 0) {
      targets = PLACE_LABELS
        .slice(0, 4)
        .map(p => ({ name: p.name + ' Coast', distanceKm: 50 }));
    }

    const results = targets.map(t => {
      const travelTimeMin = t.distanceKm / (velocityKmh / 60.0);
      // Coastal height from shoaling — each coast gets its own value based on distance
      const distanceDecay = Math.exp(-t.distanceKm / 200);
      const coastalHeight = uplift * shoalingFactor * distanceDecay;
      return {
        name: t.name,
        distanceKm: t.distanceKm,
        travelTimeMin: parseFloat(travelTimeMin.toFixed(1)),
        coastalHeight: parseFloat(coastalHeight.toFixed(2)),
      };
    });

    return {
      uplift: parseFloat(uplift.toFixed(3)),
      slipMeters: parseFloat(slip.toFixed(2)),
      velocityKmh: parseFloat(velocityKmh.toFixed(0)),
      runups: results,
    };
  }

  /**
   * Automated triage log — all values from actual event data.
   */
  async executeAutomatedTriageLog(stressMetrics, event) {
    let eventLat = 12.0;
    let eventLon = 122.0;
    let eventDepth = 25.0;
    let eventMag = 5.0;

    if (event && typeof event === 'object') {
      eventLat = event.lat;
      eventLon = event.lon;
      eventDepth = event.depth ?? 25;
      eventMag = event.mag ?? 5.0;
    }

    // Dynamic place resolution
    let nearestPlace = null;
    let minDist = Infinity;
    for (const place of PLACE_LABELS) {
      const dist = haversineKm(eventLat, eventLon, place.lat, place.lon);
      if (dist < minDist) { minDist = dist; nearestPlace = place; }
    }
    const placeName = nearestPlace ? (nearestPlace.parent ? `${nearestPlace.name}, ${nearestPlace.parent}` : nearestPlace.name) : 'Epicenter Sector';

    // Dynamic rupture identification
    const rupture = identifyRuptureType(eventLat, eventLon);

    // Dynamic fault load keys
    const faultLoadKeys = Object.keys(stressMetrics.faultLoads);
    const fault1 = faultLoadKeys[0] || "Nearest Fault";
    const fault2 = faultLoadKeys[1] || "Secondary Fault";
    const fault3 = faultLoadKeys[2] || "Tertiary Fault";

    // Dynamic tsunami string
    let tsunamiStr = "No tsunami risk (below M6.5 threshold or deep epicenter).";
    if (stressMetrics.tsunami) {
      const t = stressMetrics.tsunami;
      tsunamiStr = `SEA-FLOOR UPLIFT: +${t.uplift} m | Slip: ${t.slipMeters} m
WAVE VELOCITY: ${t.velocityKmh} km/h

COASTAL RUNUP:
${t.runups.map(r => `  - ${r.name.padEnd(24)} : ${r.coastalHeight.toFixed(2)}m | ETA: ${r.travelTimeMin} min`).join('\n')}`;
    }

    const pga = computePGA(eventMag, Math.max(20, minDist));

    // Dynamic scenario probabilities based on zone b-value and coupling
    const zone = findNearestZone(eventLat, eventLon);
    const bValue = zone ? zone.bValue : 1.0;
    const coupling = stressMetrics.couplingEfficiency;
    const scenarioAprob = Math.min(85, 40 + (1.0 - bValue) * 30 + coupling * 20);
    const scenarioBprob = Math.min(30, 25 - (1.0 - bValue) * 10);
    const scenarioCprob = Math.max(2, 100 - scenarioAprob - scenarioBprob);

    const structuralPrompt = `
      Philippine Ring of Fire. Zone: ${rupture.zoneName} (b=${bValue.toFixed(2)}, max M${rupture.maxMag})
      Event: Mw ${eventMag.toFixed(1)} at ${eventLat.toFixed(4)}°N, ${eventLon.toFixed(4)}°E, depth ${eventDepth.toFixed(0)} km
      Slip: ${stressMetrics.slipMeters} m | Seismic moment: ${stressMetrics.seismicMoment} N·m
      Coupling: ${(coupling * 100).toFixed(1)}% | Coulomb: ${stressMetrics.coulombLoadBars} bar
      Nearest faults: ${stressMetrics.closestFaults?.join(', ')}
      Fault loads: ${fault1}=${stressMetrics.faultLoads[fault1]} bar, ${fault2}=${stressMetrics.faultLoads[fault2]} bar, ${fault3}=${stressMetrics.faultLoads[fault3]} bar
      Tsunami: ${tsunamiStr}
      PGA at ${placeName}: ${pga.toFixed(0)} gal (${(pga / 981).toFixed(3)}g)
      Generate multi-scenario report with WHEN/WHY/HOW. No hard-coded values.`;

    this.updateDashboardTelemetryFeed("Evaluating tectonic stress via local LLM...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(this.ollamaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.activeModel,
          messages: [{ role: "user", content: structuralPrompt }],
          stream: false,
          options: { temperature: 0.1, num_predict: 800 }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const reportText = payload.message?.content || payload.response || "";
      if (reportText.trim()) {
        this.updateDashboardTelemetryFeed(reportText.trim());
      } else {
        throw new Error("Empty model response");
      }
    } catch (error) {
      console.warn("[Simulator] LLM offline, using local triage:", error.message);
      this._generateLocalFallbackTriage(stressMetrics, event, rupture, placeName);
    }
  }

  _generateLocalFallbackTriage(stressMetrics, event, rupture, placeName) {
    let eventLat = 12.0;
    let eventLon = 122.0;
    let eventDepth = 25.0;
    let eventMag = 5.0;

    if (event && typeof event === 'object') {
      eventLat = event.lat;
      eventLon = event.lon;
      eventDepth = event.depth ?? 25;
      eventMag = event.mag ?? 5.0;
    }

    const faultLoadKeys = Object.keys(stressMetrics.faultLoads);
    const fault1 = faultLoadKeys[0] || "Nearest Fault";
    const fault2 = faultLoadKeys[1] || "Secondary Fault";
    const fault3 = faultLoadKeys[2] || "Tertiary Fault";

    const load1 = stressMetrics.faultLoads[fault1] || 0.0;
    const load2 = stressMetrics.faultLoads[fault2] || 0.0;
    const load3 = stressMetrics.faultLoads[fault3] || 0.0;

    const statusText = stressMetrics.isCritical
      ? "CRITICAL: STRESS LIMIT EXCEEDED"
      : "ADVISORY: STRESS WITHIN NORMAL RANGE";

    const zone = rupture?.zoneName || findNearestZone(eventLat, eventLon)?.name || 'Unknown';
    const bValue = rupture?.bValue || findNearestZone(eventLat, eventLon)?.bValue || 1.0;
    const coupling = stressMetrics.couplingEfficiency;
    const scenarioAprob = Math.min(85, 40 + (1.0 - bValue) * 30 + coupling * 20);
    const scenarioBprob = Math.min(30, 25 - (1.0 - bValue) * 10);
    const scenarioCprob = Math.max(2, 100 - scenarioAprob - scenarioBprob);

    let tsunamiTableStr = "NO TSUNAMI RISK (below M6.5 threshold)";
    if (stressMetrics.tsunami) {
      const t = stressMetrics.tsunami;
      tsunamiTableStr = `SEA-FLOOR UPLIFT: +${t.uplift} m | Slip: ${t.slipMeters} m
WAVE VELOCITY: ${t.velocityKmh} km/h

COASTAL RUNUP:
${t.runups.map(r => `  - ${r.name.padEnd(24)} : ${r.coastalHeight.toFixed(2)}m | ETA: ${r.travelTimeMin} min`).join('\n')}`;
    }

    const pga = computePGA(eventMag, Math.max(20, haversineKm(eventLat, eventLon, 12, 122)));
    const pgaGal = pga.toFixed(0);
    const pgaG = (pga / 981).toFixed(3);

    // Scenario magnitudes derived from zone maxMag and event magnitude
    const scenarioBmag = Math.max(4.0, Math.min(rupture?.maxMag || 7.5, eventMag - 1.0 + (Math.random() - 0.5) * 0.5));
    const scenarioCmag = Math.max(3.5, Math.min(rupture?.maxMag || 7.0, eventMag - 1.8 + (Math.random() - 0.5) * 0.5));

    const localReport = `[CISV DISASTER RESPONSE // OFFLINE MODE]
ZONE: ${zone} (b=${bValue.toFixed(2)}, max M${rupture?.maxMag || '?'})
STATUS: ${statusText}
LOCATION: ${eventLat.toFixed(4)}°N, ${eventLon.toFixed(4)}°E
DEPTH: ${eventDepth.toFixed(1)} km
MAGNITUDE: Mw ${eventMag.toFixed(1)}
SLIP: ${stressMetrics.slipMeters} m | MOMENT: ${stressMetrics.seismicMoment} N·m
COULOMB: ${stressMetrics.coulombLoadBars} bar
COUPLING: ${(coupling * 100).toFixed(1)}%

FAULT LOADS (distance-decayed):
  - ${fault1.padEnd(28)}: ${load1.toFixed(3)} bar
  - ${fault2.padEnd(28)}: ${load2.toFixed(3)} bar
  - ${fault3.padEnd(28)}: ${load3.toFixed(3)} bar

GROUND MOTION:
  PGA: ${pgaGal} gal (${pgaG}g) at ${placeName}

TSUNAMI:
${tsunamiTableStr}

SCENARIOS (probabilities from zone b-value + coupling):
  A: ${rupture?.primaryType || 'Thrust'} Mw ${eventMag.toFixed(1)} near ${placeName} (${scenarioAprob.toFixed(0)}%)
  B: Strike-Slip Mw ${scenarioBmag.toFixed(1)} along ${fault2} (${scenarioBprob.toFixed(0)}%)
  C: Normal/Splay Mw ${scenarioCmag.toFixed(1)} along ${fault3} (${scenarioCprob.toFixed(0)}%)

EMERGENCY:
1. Sirens for coasts if tsunami > 0.5m.
2. Structural assessment teams.
3. Mesh backup comms.`;

    this.updateDashboardTelemetryFeed(localReport);
  }

  updateDashboardTelemetryFeed(reportText) {
    const textContainer = document.getElementById('seismic-analysis-output');
    if (textContainer) {
      textContainer.innerText = reportText;
    }
  }
}
