/**
 * CoulombStressTransfer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Simplified empirical static Coulomb stress transfer — the "WHERE" engine.
 *
 * When a fault ruptures it loads (or shadows) neighbouring faults. Segments with
 * a positive Coulomb stress change (ΔCFF) of ~0.1-0.5 bar or more are brought
 * closer to failure ("clock advanced"). This module estimates ΔCFF from a source
 * rupture onto each seismogenic zone/segment and ranks them, so we can say which
 * segment the next large event is most likely to nucleate on.
 *
 * METHOD — empirical, NOT a full Okada (1992) elastic dislocation:
 *   ΔCFF ∝ M0 · (1/r³) · lobe(azimuth − strike)
 * with a double-couple lobe pattern that loads along-strike continuations and
 * the extensional quadrants. Calibrated so an M7.8 produces order ~0.1-1 bar at
 * 30-80 km, and the 0.1-bar triggering threshold is meaningful. Use Okada for
 * publication-grade spatial detail; this is for fast in-browser ranking.
 *
 * References:
 *   King, Stein & Lin (1994), BSSA 84 — Coulomb stress triggering
 *   Stein (1999), Nature 402 — stress-transfer & sequences
 *   Toda et al. (2011) — Coulomb 3 methodology (full version)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  SEISMOGENIC_ZONES,
  STRAIN_RATES,
  magToFaultLength,
} from '../data/ResearchPaperData.js';

// Effective stress drop (bar) controlling near-field ΔCFF amplitude. Real static
// stress drops are ~10-100 bar on-fault; the off-fault transferred ΔCFF at a
// rupture-length away is order ~1 bar, so this effective value reproduces the
// classic few-tenths-of-a-bar loading on adjacent segments.
const STRESS_DROP = 3.0;          // bar
const TRIGGER_THRESHOLD = 0.1;    // bar — classic Coulomb triggering threshold

export class CoulombStressTransfer {
  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /** Initial bearing (deg, 0=N, clockwise) from point 1 to point 2. */
  azimuth(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /** Seismic moment M0 (N·m) from moment magnitude. */
  seismicMoment(mag) {
    return Math.pow(10, 1.5 * mag + 9.05);
  }

  /**
   * Compute ΔCFF onto each seismogenic zone from a source rupture.
   *
   * @param {object} source  { lat, lon, mag, strike }  strike deg (default 345 = Mindanao trenches)
   * @param {object} [opts]
   * @param {number} [opts.maxRangeKm=500]
   * @param {number} [opts.excludeRadiusKm=20]  ignore the source zone itself
   * @returns {object} { source, rangedSegments, topSegment, triggeredCount }
   */
  compute(source, opts = {}) {
    const maxRange = opts.maxRangeKm ?? 500;
    const excludeR = opts.excludeRadiusKm ?? 20;
    const strike = source.strike ?? 345;

    // Rupture length sets the near-field reach: bigger quakes load farther.
    const ruptureLenKm = magToFaultLength((source.mag + 1.83) / 1.27); // Ms→MJ→length
    const L = Math.max(10, ruptureLenKm);

    const segments = SEISMOGENIC_ZONES
      .map(z => {
        const r = this.haversine(source.lat, source.lon, z.lat, z.lon);
        return { zone: z, r };
      })
      .filter(s => s.r <= maxRange && s.r >= excludeR)
      .map(({ zone, r }) => {
        const az = this.azimuth(source.lat, source.lon, zone.lat, zone.lon);
        // Lobe modulation: along-strike continuations (θ≈0/180) loaded most.
        // Range 0.4..1.0 so off-strike near-field segments still see real loading
        // rather than being zeroed out.
        const theta = (az - strike) * Math.PI / 180;
        const lobe = 0.7 + 0.3 * Math.cos(2 * theta); // 0.4..1.0
        // Near-field reach: ΔCFF ~ stressDrop · (L/(r+L))³, so segments within a
        // rupture length feel ~bar-level loading that decays steeply beyond.
        const rEff = Math.max(L * 0.3, r);
        const dCFF = STRESS_DROP * Math.pow(L / (rEff + L), 3) * lobe; // bar (positive = loaded)

        // Stressing rate from nearest strain record → "clock advance" years.
        const strain = STRAIN_RATES.find(s =>
          zone.name.toLowerCase().includes(s.name.toLowerCase().split(' ')[0])
        );
        const stressingRate = strain ? strain.rate * 0.002 : 0.05; // bar/yr (empirical)
        const clockAdvanceYears = stressingRate > 0 ? dCFF / stressingRate : 0;

        return {
          id: zone.id,
          name: zone.name,
          lat: zone.lat,
          lon: zone.lon,
          maxMag: zone.maxMag,
          bValue: zone.bValue,
          distanceKm: Math.round(r),
          azimuth: Math.round(az),
          deltaCFF_bar: parseFloat(dCFF.toFixed(3)),
          loaded: dCFF >= TRIGGER_THRESHOLD,
          clockAdvanceYears: parseFloat(clockAdvanceYears.toFixed(1)),
          status: dCFF >= TRIGGER_THRESHOLD ? 'LOADED (advanced toward failure)'
            : dCFF >= TRIGGER_THRESHOLD * 0.3 ? 'MILD LOADING'
            : 'NEGLIGIBLE / SHADOW',
        };
      })
      .sort((a, b) => b.deltaCFF_bar - a.deltaCFF_bar);

    return {
      source: { ...source, strike, ruptureLengthKm: parseFloat(ruptureLenKm.toFixed(0)) },
      triggerThresholdBar: TRIGGER_THRESHOLD,
      rangedSegments: segments,
      topSegment: segments[0] || null,
      triggeredCount: segments.filter(s => s.loaded).length,
      method: 'Empirical static ΔCFF (King-Stein-Lin 1994 style; not full Okada)',
    };
  }
}
