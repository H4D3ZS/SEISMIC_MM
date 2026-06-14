/**
 * AftershockForecaster.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Live-conditioned aftershock sequence forecaster.
 *
 * Fits the modified Omori-Utsu law  n(t) = K / (t + c)^p  to the REAL aftershocks
 * observed since a mainshock (from the live USGS/PHIVOLCS catalog), then projects
 * the daily decay forward to answer:
 *   • How many M≥4/5/6/7 events to expect each day this month
 *   • The largest expected aftershock (Båth's law) + its probability
 *   • Whether the sequence can cascade into a larger event (ETAS branching)
 *   • When the sequence decays back to background
 *
 * Falls back to AFTERSHOCK_PARAMS (Cotabato Trench generic) when there are too
 * few observed aftershocks to fit. This is a PROBABILISTIC forecast — aftershock
 * decay is statistically skillful (USGS runs it operationally), but it does not
 * give exact dates.
 *
 * References:
 *   Utsu, Ogata & Matsu'ura (1995); Reasenberg & Jones (1989, Science 243);
 *   Båth (1965); Helmstetter & Sornette (2002).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  SEISMOGENIC_ZONES,
  AFTERSHOCK_PARAMS,
  bathLargestAftershock,
  reasenbergJonesProb,
  etasBranchingRatio,
} from '../data/ResearchPaperData.js';

// June 8, 2026 M7.8 Maasim, Sarangani — default mainshock anchor.
const DEFAULT_MAINSHOCK = {
  lat: 5.86, lon: 124.70, depth: 18, mag: 7.8,
  time: Date.UTC(2026, 5, 7, 23, 37, 0),
  place: 'Maasim, Sarangani',
};

// Magnitude of completeness for the USGS Philippine feed (events below this are
// under-reported, so they are excluded from the Omori fit).
const MC_DEFAULT = 4.0;

export class AftershockForecaster {
  constructor(opts = {}) {
    this.mc = opts.mc ?? MC_DEFAULT;
  }

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /** Utsu aftershock-zone radius (km) for a mainshock magnitude. */
  aftershockRadiusKm(mag) {
    // L ≈ 10^(0.5·M − 1.8) km (subsurface rupture length, Wells & Coppersmith-ish);
    // aftershock zone ≈ rupture length. Floor at 30 km.
    return Math.max(30, Math.pow(10, 0.5 * mag - 1.8));
  }

  /**
   * Auto-detect the mainshock: the largest event in the trailing `lookbackDays`
   * within the region of interest. Falls back to the June 8 M7.8 anchor.
   * @param {Array} events  live catalog events ({lat,lon,mag,time})
   * @param {object} [roi]  { lat, lon } region of interest
   */
  detectMainshock(events, roi = null, lookbackDays = 90) {
    if (!Array.isArray(events) || events.length === 0) return { ...DEFAULT_MAINSHOCK, source: 'anchor' };
    const now = Date.now();
    const cutoff = now - lookbackDays * 86400000;
    let best = null;
    for (const ev of events) {
      if (typeof ev.mag !== 'number' || typeof ev.time !== 'number') continue;
      if (ev.time < cutoff || ev.time > now) continue;
      if (ev.mag < 6.5) continue; // mainshock must be sizable
      if (roi && this.haversine(roi.lat, roi.lon, ev.lat, ev.lon) > 400) continue;
      if (!best || ev.mag > best.mag) best = ev;
    }
    return best ? { ...best, source: 'live' } : { ...DEFAULT_MAINSHOCK, source: 'anchor' };
  }

  /**
   * Select aftershocks: events after the mainshock, inside the aftershock zone,
   * with magnitude ≥ Mc. Returns array of { daysSince, mag }.
   */
  selectAftershocks(events, mainshock) {
    if (!Array.isArray(events)) return [];
    const radius = this.aftershockRadiusKm(mainshock.mag);
    const out = [];
    for (const ev of events) {
      if (typeof ev.mag !== 'number' || typeof ev.time !== 'number') continue;
      if (ev.time <= mainshock.time) continue;
      if (ev.mag < this.mc) continue;
      if (ev.mag >= mainshock.mag) continue; // larger ⇒ it's a new mainshock, not an aftershock
      if (this.haversine(mainshock.lat, mainshock.lon, ev.lat, ev.lon) > radius) continue;
      const daysSince = (ev.time - mainshock.time) / 86400000;
      if (daysSince <= 0) continue;
      out.push({ daysSince, mag: ev.mag });
    }
    return out.sort((a, b) => a.daysSince - b.daysSince);
  }

  /**
   * Fit modified Omori-Utsu n(t)=K/(t+c)^p to observed aftershock times by a
   * coarse grid-search maximum-likelihood over (p, c); K from the total count.
   * Returns { K, c, p, n, fitted:true } or a generic fallback {fitted:false}.
   */
  fitOmori(aftershocks, mainshock) {
    const N = aftershocks.length;
    // Need a minimum sample to fit; otherwise use generic params.
    if (N < 8) {
      const fallback = AFTERSHOCK_PARAMS['Cotabato Trench'];
      return { K: fallback.K, c: fallback.c, p: fallback.p, n: N, fitted: false };
    }

    const times = aftershocks.map(a => a.daysSince);
    const T = Math.max(...times); // observation span (days)

    let best = { logL: -Infinity, p: 1.1, c: 0.05 };
    for (let p = 0.8; p <= 1.4001; p += 0.02) {
      for (let c = 0.01; c <= 1.0001; c += 0.03) {
        // Log-likelihood of modified Omori (Ogata 1983), K profiled out:
        //   λ(t) = K/(t+c)^p ; K_hat = N / A,  A = ∫_0^T (t+c)^-p dt
        let A;
        if (Math.abs(1 - p) < 1e-6) A = Math.log((T + c) / c);
        else A = (Math.pow(T + c, 1 - p) - Math.pow(c, 1 - p)) / (1 - p);
        if (A <= 0) continue;
        const Khat = N / A;
        let logL = N * Math.log(Khat);
        for (const t of times) logL -= p * Math.log(t + c);
        logL -= Khat * A; // = N, constant, but kept for completeness
        if (logL > best.logL) best = { logL, p, c };
      }
    }

    // K from profiled estimate at the best (p,c)
    let A;
    if (Math.abs(1 - best.p) < 1e-6) A = Math.log((T + best.c) / best.c);
    else A = (Math.pow(T + best.c, 1 - best.p) - Math.pow(best.c, 1 - best.p)) / (1 - best.p);
    const K = N / A;

    return { K, c: best.c, p: best.p, n: N, fitted: true, spanDays: T };
  }

  /** Modified Omori daily rate at day t. */
  omoriRate(fit, t) {
    return fit.K / Math.pow(t + fit.c, fit.p);
  }

  /**
   * Full forecast.
   * @param {object} params
   * @param {Array}  params.recentEvents  live catalog events
   * @param {object} [params.roi]         { lat, lon } region of interest
   * @param {number} [params.horizonDays=30]
   * @returns {object} forecast bundle
   */
  forecast(params = {}) {
    const { recentEvents = [], roi = null, horizonDays = 30 } = params;
    const mainshock = this.detectMainshock(recentEvents, roi);
    const aftershocks = this.selectAftershocks(recentEvents, mainshock);
    const fit = this.fitOmori(aftershocks, mainshock);

    const now = Date.now();
    const daysSinceMain = Math.max(0.01, (now - mainshock.time) / 86400000);

    // Nearest zone b-value for Gutenberg-Richter magnitude partitioning.
    const zone = SEISMOGENIC_ZONES
      .map(z => ({ ...z, d: this.haversine(mainshock.lat, mainshock.lon, z.lat, z.lon) }))
      .sort((a, b) => a.d - b.d)[0];
    const bValue = zone ? zone.bValue : 1.0;

    // Daily expected M≥Mc counts for the next `horizonDays`, then GR-scale to
    // M≥5/6/7 thresholds.
    const daily = [];
    for (let d = 0; d < horizonDays; d++) {
      const t = daysSinceMain + d;
      const rateMc = this.omoriRate(fit, t); // events/day at ≥ Mc
      daily.push({
        dayOffset: d,
        date: new Date(now + d * 86400000).toISOString().slice(0, 10),
        rateMc: rateMc,
        rateM5: rateMc * Math.pow(10, -bValue * (5 - this.mc)),
        rateM6: rateMc * Math.pow(10, -bValue * (6 - this.mc)),
        rateM7: rateMc * Math.pow(10, -bValue * (7 - this.mc)),
      });
    }

    // Window exceedance probabilities (Reasenberg-Jones), days 1..horizon since now.
    const t1 = daysSinceMain;
    const rjParams = { p: fit.p, c: fit.c, b: bValue };
    const prob7d = {
      m5: reasenbergJonesProb(mainshock.mag, 5, t1, t1 + 7, rjParams).probAtLeastOne,
      m6: reasenbergJonesProb(mainshock.mag, 6, t1, t1 + 7, rjParams).probAtLeastOne,
      m7: reasenbergJonesProb(mainshock.mag, 7, t1, t1 + 7, rjParams).probAtLeastOne,
    };
    const prob30d = {
      m5: reasenbergJonesProb(mainshock.mag, 5, t1, t1 + 30, rjParams).probAtLeastOne,
      m6: reasenbergJonesProb(mainshock.mag, 6, t1, t1 + 30, rjParams).probAtLeastOne,
      m7: reasenbergJonesProb(mainshock.mag, 7, t1, t1 + 30, rjParams).probAtLeastOne,
    };

    // Largest expected aftershock (Båth) + its 30-day exceedance probability.
    const largestExpected = bathLargestAftershock(mainshock.mag);
    const largestProb30d = reasenbergJonesProb(
      mainshock.mag, largestExpected, t1, t1 + 30, rjParams
    ).probAtLeastOne;

    // Cascade potential — ETAS branching ratio. n→1 ⇒ sequence can trigger an
    // event ≥ its own size (feeds the Big-One forecast).
    const branchingRatio = etasBranchingRatio(bValue);

    // When the sequence calms: day at which the ≥Mc rate drops below the zone
    // background rate (approx: occRate per sq-km × aftershock-zone area /year/day).
    const radius = this.aftershockRadiusKm(mainshock.mag);
    const zoneAreaKm2 = Math.PI * radius * radius;
    const backgroundDaily = zone ? (zone.occRate * zoneAreaKm2) / 365.25 : 0.01;
    let calmDay = null;
    for (let d = 0; d < 1000; d++) {
      if (this.omoriRate(fit, daysSinceMain + d) <= backgroundDaily) { calmDay = d; break; }
    }
    const calmsDate = calmDay !== null
      ? new Date(now + calmDay * 86400000).toISOString().slice(0, 10)
      : '>1000 days';

    const phase = daysSinceMain < 30 ? 'EARLY' : daysSinceMain < 180 ? 'MID'
      : daysSinceMain < 540 ? 'LATE' : 'POST-SEQUENCE';

    return {
      mainshock,
      observedAftershocks: fit.n,
      magnitudeOfCompleteness: this.mc,
      omori: { K: fit.K, c: fit.c, p: fit.p, fitted: fit.fitted },
      daysSinceMainshock: daysSinceMain,
      phase,
      bValue,
      daily,
      prob7d,
      prob30d,
      largestExpectedAftershock: largestExpected,
      largestProb30d,
      branchingRatio,
      cascadeRisk: branchingRatio > 0.9 ? 'HIGH (near-critical sequence)'
        : branchingRatio > 0.6 ? 'MODERATE' : 'LOW (sub-critical, decaying)',
      calmsInDays: calmDay,
      calmsDate,
      isActive: daysSinceMain < 540,
      note: 'Probabilistic aftershock forecast (Reasenberg-Jones / Omori-Utsu). '
        + (fit.fitted ? 'Omori parameters fit to live data.' : 'Too few live aftershocks — generic Cotabato Trench parameters used.'),
    };
  }
}
