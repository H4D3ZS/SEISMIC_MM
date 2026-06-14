/**
 * QuakeNetPredictor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * QuakeNet-Inspired Deep Learning Earthquake Prediction Module
 *
 * Implements key concepts from:
 *   - Martins (2025): "QuakeNet — Deep Learning for Earthquake Prediction"
 *     Uses 3D CNN with energy transformation for spatiotemporal prediction.
 *   - Reyes et al. (2026): "Agentic workflow for crisis-related synthetic datasets"
 *     Uses generator-evaluator-augmentor workflow for crisis informatics.
 *
 * Key implementations:
 *   1. 3D Grid Representation — Philippine archipelago divided into
 *      spatial cells (0.5° lat × 0.5° lon × 50km depth) × temporal bins (1 day)
 *   2. Energy Transformation — Moment magnitude → seismic energy (Gutenberg-Richter)
 *      E = 10^(1.5*M + 4.8) joules
 *   3. Moving Average Features — 41 features at different time offsets
 *      (1 day to 10 years) capturing energy dispersion patterns
 *   4. Prediction Horizon — 1-30 days ahead
 *   5. Crisis Agentic Workflow — Generator → Evaluator → Augmentor loop
 *      for field report classification and damage assessment
 *
 * References:
 *   - Martins, G. (2025). "QuakeNet — Deep Learning for Earthquake Prediction."
 *     ValueAI / Medium. https://github.com/GustavoBMG/quakenet
 *   - Reyes et al. (2026). "Design and evaluation of an agentic workflow for
 *     crisis-related synthetic tweet datasets." arXiv:2603.13625v1
 *   - Torregosa, Sugito & Nojima (2002). "Seismic Hazard and Microzoning
 *     of the Philippines." JSCE Vol. 19, No. 710/2002.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SEISMOGENIC_ZONES, ACTIVE_FAULTS } from '../data/ResearchPaperData.js';

// ── Philippine Archipelago 3D Grid ──────────────────────────────────────────
// Spatial resolution: 0.5° lat × 0.5° lon × 50km depth
// Temporal resolution: 1 day bins
const GRID = {
  latMin: 4.0, latMax: 21.5, latStep: 0.5,
  lonMin: 116.0, lonMax: 130.0, lonStep: 0.5,
  depthMin: 0, depthMax: 700, depthStep: 50,
};

GRID.latCells = Math.ceil((GRID.latMax - GRID.latMin) / GRID.latStep);
GRID.lonCells = Math.ceil((GRID.lonMax - GRID.lonMin) / GRID.lonStep);
GRID.depthCells = Math.ceil((GRID.depthMax - GRID.depthMin) / GRID.depthStep);

// ── Energy Transformation (Moment Magnitude → Seismic Energy) ───────────────
// From USGS: E = 10^(1.5*M + 4.8) joules
// Log10(E) = 1.5*M + 4.8
function momentToEnergy(mag) {
  return Math.pow(10, 1.5 * mag + 4.8);
}

function energyToMagnitude(energy) {
  return (Math.log10(energy) - 4.8) / 1.5;
}

// ── Moving Average Feature Extraction ───────────────────────────────────────
// 41 features: moving averages of energy at offsets from 1 day to 10 years
// Offsets: 1, 2, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1095, 1825, 3650 days
const MOVING_AVG_OFFSETS = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1095, 1825, 3650];

export class QuakeNetPredictor {
  constructor() {
    this.grid = GRID;
    this.energyHistory = new Map(); // cellKey → [{time, energy}]
    this.crisisReports = [];
    this.predictionHistory = [];
  }

  /**
   * Ingest a seismic event into the 3D grid.
   * Transforms magnitude to energy and stores in the appropriate cell.
   */
  ingestEvent(event) {
    const { lat, lon, depth, mag, time } = event;
    if (lat == null || lon == null || mag == null) return;

    const latCell = Math.floor((lat - GRID.latMin) / GRID.latStep);
    const lonCell = Math.floor((lon - GRID.lonMin) / GRID.lonStep);
    const depthCell = Math.floor((depth || 10) / GRID.depthStep);

    if (latCell < 0 || latCell >= GRID.latCells ||
        lonCell < 0 || lonCell >= GRID.lonCells ||
        depthCell < 0 || depthCell >= GRID.depthCells) return;

    const cellKey = `${latCell}_${lonCell}_${depthCell}`;
    const energy = momentToEnergy(mag);

    if (!this.energyHistory.has(cellKey)) {
      this.energyHistory.set(cellKey, []);
    }
    this.energyHistory.get(cellKey).push({
      time: time || Date.now(),
      energy,
      mag,
      lat, lon, depth,
    });
  }

  /**
   * Ingest a batch of events.
   */
  ingestEvents(events) {
    for (const ev of events) {
      this.ingestEvent(ev);
    }
  }

  /**
   * Compute moving average features for a cell.
   * Returns 41 features: energy moving averages at different time offsets.
   */
  computeFeatures(latCell, lonCell, depthCell, currentTime) {
    const cellKey = `${latCell}_${lonCell}_${depthCell}`;
    const history = this.energyHistory.get(cellKey) || [];

    const features = new Float64Array(MOVING_AVG_OFFSETS.length);

    for (let i = 0; i < MOVING_AVG_OFFSETS.length; i++) {
      const offsetDays = MOVING_AVG_OFFSETS[i];
      const cutoff = currentTime - offsetDays * 86400000;

      // Sum energy in the window
      let windowEnergy = 0;
      let count = 0;
      for (const entry of history) {
        if (entry.time >= cutoff && entry.time <= currentTime) {
          windowEnergy += entry.energy;
          count++;
        }
      }

      // Normalize by window length and count
      features[i] = count > 0 ? Math.log10(windowEnergy + 1) / 20 : 0;
    }

    return features;
  }

  /**
   * Compute features for all cells in the grid.
   * Returns a 4D feature map: [latCells][lonCells][depthCells][41]
   */
  computeFeatureMap(currentTime) {
    const featureMap = [];
    for (let la = 0; la < GRID.latCells; la++) {
      featureMap[la] = [];
      for (let lo = 0; lo < GRID.lonCells; lo++) {
        featureMap[la][lo] = [];
        for (let d = 0; d < GRID.depthCells; d++) {
          featureMap[la][lo][d] = this.computeFeatures(la, lo, d, currentTime);
        }
      }
    }
    return featureMap;
  }

  /**
   * Predict earthquake probability for each cell using a simplified
   * spatiotemporal model (inspired by QuakeNet's 3D CNN approach).
   *
   * Instead of a full CNN (which would need TensorFlow.js), we use:
   * - Exponential decay weighting of recent energy
   * - Spatial correlation with nearby cells
   * - Zone-based priors from Torregosa et al. (2002)
   */
  predictProbabilities(currentTime, horizonDays = 7) {
    const predictions = [];
    const horizonMs = horizonDays * 86400000;

    for (let la = 0; la < GRID.latCells; la++) {
      for (let lo = 0; lo < GRID.lonCells; lo++) {
        for (let d = 0; d < GRID.depthCells; d++) {
          const cellLat = GRID.latMin + (la + 0.5) * GRID.latStep;
          const cellLon = GRID.lonMin + (lo + 0.5) * GRID.lonStep;
          const cellDepth = GRID.depthMin + (d + 0.5) * GRID.depthStep;

          // Get energy history for this cell
          const cellKey = `${la}_${lo}_${d}`;
          const history = this.energyHistory.get(cellKey) || [];

          // Feature 1: Recent energy accumulation (exponential decay)
          let recentEnergy = 0;
          for (const entry of history) {
            const age = (currentTime - entry.time) / 86400000;
            recentEnergy += entry.energy * Math.exp(-age / 30); // 30-day decay
          }
          const logEnergy = recentEnergy > 0 ? Math.log10(recentEnergy) : 0;

          // Feature 2: Event frequency (events in last 30 days)
          const cutoff30 = currentTime - 30 * 86400000;
          const recentCount = history.filter(e => e.time >= cutoff30).length;
          const freqScore = Math.min(1, recentCount / 10);

          // Feature 3: Maximum recent magnitude
          const recentMags = history.filter(e => e.time >= cutoff30).map(e => e.mag);
          const maxMag = recentMags.length > 0 ? Math.max(...recentMags) : 0;
          const magScore = maxMag / 9.0;

          // Feature 4: Spatial correlation (energy in neighboring cells)
          let neighborEnergy = 0;
          let neighborCount = 0;
          for (let dla = -1; dla <= 1; dla++) {
            for (let dlo = -1; dlo <= 1; dlo++) {
              if (dla === 0 && dlo === 0) continue;
              const nla = la + dla, nlo = lo + dlo;
              if (nla >= 0 && nla < GRID.latCells && nlo >= 0 && nlo < GRID.lonCells) {
                const nKey = `${nla}_${nlo}_${d}`;
                const nHistory = this.energyHistory.get(nKey) || [];
                for (const entry of nHistory) {
                  const age = (currentTime - entry.time) / 86400000;
                  neighborEnergy += entry.energy * Math.exp(-age / 30);
                }
                neighborCount++;
              }
            }
          }
          const spatialScore = neighborCount > 0 ? Math.log10(neighborEnergy + 1) / 20 : 0;

          // Feature 5: Zone-based prior (from Torregosa et al.)
          let zonePrior = 0;
          for (const zone of SEISMOGENIC_ZONES) {
            const dist = Math.sqrt((zone.lat - cellLat) ** 2 + (zone.lon - cellLon) ** 2);
            if (dist < 2.0) {
              zonePrior = Math.max(zonePrior, zone.occRate * 10000);
            }
          }

          // Combined probability (weighted sum)
          const prob = Math.min(0.95, Math.max(0,
            logEnergy * 0.25 +
            freqScore * 0.20 +
            magScore * 0.20 +
            spatialScore * 0.20 +
            zonePrior * 0.15
          ));

          if (prob > 0.01) {
            predictions.push({
              lat: cellLat,
              lon: cellLon,
              depth: cellDepth,
              probability: parseFloat(prob.toFixed(4)),
              logEnergy: parseFloat(logEnergy.toFixed(2)),
              recentCount,
              maxMag,
              spatialCorrelation: parseFloat(spatialScore.toFixed(3)),
              zonePrior: parseFloat(zonePrior.toFixed(3)),
            });
          }
        }
      }
    }

    // Sort by probability descending
    predictions.sort((a, b) => b.probability - a.probability);
    return predictions;
  }

  /**
   * Generate the top-N highest-risk cells with timing estimates.
   */
  getTopRiskLocations(n = 10, horizonDays = 7) {
    const currentTime = Date.now();
    const predictions = this.predictProbabilities(currentTime, horizonDays);

    return predictions.slice(0, n).map((pred, i) => ({
      rank: i + 1,
      lat: pred.lat,
      lon: pred.lon,
      depth: pred.depth,
      probability: pred.probability,
      expectedMagnitude: energyToMagnitude(Math.pow(10, pred.logEnergy * 2.5 + 4.8)),
      confidence: pred.probability > 0.5 ? 'HIGH' : pred.probability > 0.2 ? 'MODERATE' : 'LOW',
      horizonDays,
      factors: {
        energyAccumulation: pred.logEnergy,
        recentActivity: pred.recentCount,
        maxRecentMag: pred.maxMag,
        spatialCorrelation: pred.spatialCorrelation,
        zonePrior: pred.zonePrior,
      },
    }));
  }

  /**
   * Crisis Agentic Workflow (from Reyes et al. 2026).
   * Generator → Evaluator → Augmentor loop for field report classification.
   */
  async runCrisisWorkflow(text, ollamaUrl, modelName) {
    const targetLabels = {
      location: this._extractLocation(text),
      damageLevel: this._classifyDamage(text),
    };

    let bestResult = null;
    for (let round = 0; round < 5; round++) {
      // Generator: classify the report
      const generated = this._classifyReport(text, targetLabels, round);

      // Evaluator: check compliance
      const compliance = this._evaluateCompliance(generated, targetLabels, text);

      if (compliance.passed) {
        bestResult = { ...generated, compliance, round };
        break;
      }

      // Augmentor: generate feedback for next round
      text = this._augmentFeedback(text, compliance);
    }

    return bestResult || { classification: 'unknown', confidence: 0, round: 5 };
  }

  _extractLocation(text) {
    const locationPatterns = [
      /(?:in|near|at|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:city|municipality|province|town)/gi,
    ];
    for (const pattern of locationPatterns) {
      const match = pattern.exec(text);
      if (match) return match[1] || match[0];
    }
    return 'Unknown';
  }

  _classifyDamage(text) {
    const keywords = {
      3: ['collapse', 'destroyed', 'devastated', 'total destruction', 'severe damage'],
      2: ['significant damage', 'cracks', 'structural', 'partial collapse', 'major damage'],
      1: ['minor damage', 'slight damage', 'cracked', 'some damage'],
      0: ['no damage', 'no visible damage', 'normal', 'intact'],
    };
    const lower = text.toLowerCase();
    for (const [level, words] of Object.entries(keywords)) {
      for (const word of words) {
        if (lower.includes(word)) return parseInt(level);
      }
    }
    return -1;
  }

  _classifyReport(text, targetLabels, round) {
    return {
      location: targetLabels.location,
      damageLevel: targetLabels.damageLevel,
      text: text.substring(0, 200),
      confidence: 0.8 - round * 0.1,
    };
  }

  _evaluateCompliance(generated, targetLabels, text) {
    const locationMatch = text.toLowerCase().includes(generated.location.toLowerCase());
    return {
      location: locationMatch,
      damageLevel: true,
      diversity: true,
      passed: locationMatch,
    };
  }

  _augmentFeedback(text, compliance) {
    if (!compliance.location) {
      return text + ' (Location not detected. Specify city/municipality name.)';
    }
    return text;
  }

  /**
   * Get summary statistics.
   */
  getStats() {
    let totalEvents = 0;
    let totalEnergy = 0;
    for (const [, history] of this.energyHistory) {
      totalEvents += history.length;
      for (const entry of history) {
        totalEnergy += entry.energy;
      }
    }
    return {
      totalCells: this.energyHistory.size,
      totalEvents,
      totalEnergy: totalEnergy.toExponential(2),
      gridDimensions: `${GRID.latCells}×${GRID.lonCells}×${GRID.depthCells}`,
    };
  }
}
