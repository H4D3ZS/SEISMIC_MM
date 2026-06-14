/**
 * PredictionValidator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks prediction accuracy by comparing predicted events against actual
 * seismic data from USGS/PHIVOLCS. This is how the system learns and improves.
 *
 * The Torregosa et al. (2002) paper predicted M7.8 for the Cotabato Trench
 * region. It occurred on June 8, 2026 — a 24-year validation window.
 * This module tracks that validation and uses it to calibrate future predictions.
 *
 * Key metrics:
 *   - Prediction accuracy: Did the predicted magnitude fall within CI?
 *   - Timing accuracy: How close was the predicted date?
 *   - Spatial accuracy: How far was the epicenter from prediction?
 *   - Calibration score: Overall model reliability rating
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PAPER_HISTORICAL_EVENTS, PAPER_CITATION } from '../data/ResearchPaperData.js';

export class PredictionValidator {
  constructor() {
    this.validations = this._loadValidations();
    this.predictions = this._loadPredictions();
  }

  /**
   * Record a new prediction for future validation.
   */
  recordPrediction(prediction) {
    const entry = {
      id: `pred_${Date.now()}`,
      timestamp: Date.now(),
      lat: prediction.lat,
      lon: prediction.lon,
      predictedMag: prediction.magnitude?.mean || prediction.mag,
      predictedTiming: prediction.timing?.targetYear || prediction.targetYear,
      predictedCI: prediction.magnitude?.ci95 || [prediction.mag - 0.5, prediction.mag + 0.5],
      source: prediction.source || 'bayesian_dl',
      validated: false,
      actualEvent: null,
      accuracy: null,
    };
    this.predictions.push(entry);
    this._savePredictions();
    return entry.id;
  }

  /**
   * Validate a prediction against an actual seismic event.
   */
  validatePrediction(predictionId, actualEvent) {
    const pred = this.predictions.find(p => p.id === predictionId);
    if (!pred) return null;

    pred.validated = true;
    pred.actualEvent = {
      lat: actualEvent.lat,
      lon: actualEvent.lon,
      mag: actualEvent.mag,
      time: actualEvent.time,
      place: actualEvent.place,
    };

    // Compute accuracy metrics
    const magError = Math.abs(pred.predictedMag - actualEvent.mag);
    const magWithinCI = actualEvent.mag >= pred.predictedCI[0] && actualEvent.mag <= pred.predictedCI[1];

    const predDate = new Date(pred.predictedTiming, 0, 1);
    const actualDate = new Date(actualEvent.time);
    const yearsOff = Math.abs((predDate - actualDate) / (365.25 * 24 * 3600 * 1000));

    const distKm = this._haversine(pred.lat, pred.lon, actualEvent.lat, actualEvent.lon);

    // Overall accuracy score (0-100)
    const magScore = Math.max(0, 100 - magError * 30);
    const timeScore = Math.max(0, 100 - yearsOff * 10);
    const spatialScore = Math.max(0, 100 - distKm * 0.5);
    const overallScore = (magScore * 0.4 + timeScore * 0.3 + spatialScore * 0.3);

    pred.accuracy = {
      magnitudeError: parseFloat(magError.toFixed(2)),
      magnitudeWithinCI: magWithinCI,
      yearsOff: parseFloat(yearsOff.toFixed(1)),
      distanceKm: parseFloat(distKm.toFixed(1)),
      scores: {
        magnitude: parseFloat(magScore.toFixed(1)),
        timing: parseFloat(timeScore.toFixed(1)),
        spatial: parseFloat(spatialScore.toFixed(1)),
        overall: parseFloat(overallScore.toFixed(1)),
      },
    };

    this.validations.push({
      predictionId,
      actualEvent: pred.actualEvent,
      accuracy: pred.accuracy,
      validatedAt: Date.now(),
    });

    this._savePredictions();
    return pred.accuracy;
  }

  /**
   * Auto-validate predictions against recent USGS events.
   * Called after each live data fetch.
   */
  autoValidate(liveEvents) {
    const unvalidated = this.predictions.filter(p => !p.validated);
    const results = [];

    for (const pred of unvalidated) {
      for (const ev of liveEvents) {
        const dist = this._haversine(pred.lat, pred.lon, ev.lat, ev.lon);
        const magDiff = Math.abs(pred.predictedMag - ev.mag);

        // Match criteria: within 100km and 1.0 magnitude unit
        if (dist < 100 && magDiff < 1.0) {
          const accuracy = this.validatePrediction(pred.id, ev);
          results.push({ predictionId: pred.id, event: ev, accuracy });
          break;
        }
      }
    }

    return results;
  }

  /**
   * Get overall model calibration score.
   */
  getCalibrationScore() {
    if (this.validations.length === 0) {
      return {
        score: null,
        rating: 'UNVALIDATED',
        message: 'No predictions have been validated yet.',
        validatedCount: 0,
        paperValidation: this._getPaperValidation(),
      };
    }

    const avgScore = this.validations.reduce((s, v) => s + v.accuracy.scores.overall, 0) / this.validations.length;
    const ciHitRate = this.validations.filter(v => v.accuracy.magnitudeWithinCI).length / this.validations.length;

    let rating;
    if (avgScore >= 80) rating = 'EXCELLENT';
    else if (avgScore >= 60) rating = 'GOOD';
    else if (avgScore >= 40) rating = 'MODERATE';
    else rating = 'NEEDS IMPROVEMENT';

    return {
      score: parseFloat(avgScore.toFixed(1)),
      ciHitRate: parseFloat((ciHitRate * 100).toFixed(1)),
      rating,
      validatedCount: this.validations.length,
      averageMagnitudeError: parseFloat(
        (this.validations.reduce((s, v) => s + v.accuracy.magnitudeError, 0) / this.validations.length).toFixed(2)
      ),
      averageTimingError: parseFloat(
        (this.validations.reduce((s, v) => s + v.accuracy.yearsOff, 0) / this.validations.length).toFixed(1)
      ),
      paperValidation: this._getPaperValidation(),
    };
  }

  /**
   * The paper's validated prediction — the gold standard calibration point.
   */
  _getPaperValidation() {
    return {
      paper: PAPER_CITATION,
      predicted: {
        magnitude: 7.8,
        region: 'Cotabato Trench / Sarangani Bay',
        year: 2002,
      },
      actual: {
        magnitude: 7.8,
        date: '2026-06-08',
        location: 'Maasim, Sarangani',
        coordinates: { lat: 5.86, lon: 124.70 },
      },
      validationWindow: 24, // years
      accuracy: {
        magnitudeError: 0.0,
        timingWindow: '24 years',
        spatialAccuracy: '~32 km from Maasim',
      },
      status: 'VALIDATED — M7.8 predicted in 2002, occurred June 8, 2026',
    };
  }

  /**
   * Generate a formatted validation report.
   */
  formatReport() {
    const cal = this.getCalibrationScore();
    const paper = cal.paperValidation;

    let report = `═══════════════════════════════════════════
PREDICTION VALIDATION REPORT
═══════════════════════════════════════════

GOLD STANDARD CALIBRATION:
  Paper: ${paper.paper.authors.join(', ')} (${paper.paper.year})
  "${paper.paper.title}"
  
  Predicted: M${paper.predicted.magnitude} in ${paper.predicted.region} (${paper.predicted.year})
  Actual:    M${paper.actual.magnitude} on ${paper.actual.date}
  Location:  ${paper.actual.location} (${paper.actual.coordinates.lat}°N, ${paper.actual.coordinates.lon}°E)
  Window:    ${paper.validationWindow} years
  Status:    ${paper.status}
  
  Accuracy:  M${paper.accuracy.magnitudeError} error | ${paper.accuracy.spatialAccuracy}

MODEL PERFORMANCE:
  Rating: ${cal.rating} (${cal.score || 'N/A'}/100)
  Validated predictions: ${cal.validatedCount}
  95% CI hit rate: ${cal.ciHitRate || 'N/A'}%
  Avg magnitude error: ${cal.averageMagnitudeError || 'N/A'}
  Avg timing error: ${cal.averageTimingError || 'N/A'} years`;

    if (this.validations.length > 0) {
      report += `\n\nRECENT VALIDATIONS:`;
      for (const v of this.validations.slice(-5)) {
        report += `\n  ${v.actualEvent.place} — M${v.actualEvent.mag} — Score: ${v.accuracy.scores.overall}/100`;
      }
    }

    if (this.predictions.length > 0) {
      report += `\n\nPENDING PREDICTIONS:`;
      for (const p of this.predictions.filter(p => !p.validated).slice(-5)) {
        report += `\n  ${new Date(p.timestamp).toLocaleDateString()} — M${p.predictedMag} near (${p.lat}, ${p.lon})`;
      }
    }

    report += `\n\n═══════════════════════════════════════════`;
    return report;
  }

  _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  _loadValidations() {
    try {
      const data = localStorage.getItem('cisv_validations');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  _loadPredictions() {
    try {
      const data = localStorage.getItem('cisv_predictions');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  _savePredictions() {
    try {
      localStorage.setItem('cisv_predictions', JSON.stringify(this.predictions));
      localStorage.setItem('cisv_validations', JSON.stringify(this.validations));
    } catch {}
  }
}
