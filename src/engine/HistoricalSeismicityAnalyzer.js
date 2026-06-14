/**
 * HistoricalSeismicityAnalyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * REAL statistical analysis of the REAL earthquake catalog.
 *
 * Everything here is computed from the actual events passed in (live + historical
 * USGS catalog fetched by PhivolcsDataService). Nothing is hard-coded; if the
 * catalog is the synthetic fallback the report says so explicitly. No invented
 * numbers.
 *
 * Computes:
 *   • Magnitude of completeness Mc  — maximum-curvature method (+0.2 bias corr.)
 *   • Gutenberg-Richter b-value     — Aki-Utsu maximum-likelihood estimator
 *                                     with Shi & Bolt (1982) standard error
 *   • a-value and annual recurrence — N(M≥m) per year and return periods
 *   • Depth distribution            — shallow/intermediate/deep fractions
 *   • Largest events                — actual top events in the catalog
 *   • Activity change              — recent (last 90 d) rate vs long-term rate,
 *                                     i.e. is the region elevated RIGHT NOW
 *
 * References:
 *   Aki (1965); Utsu (1965) — b-value MLE
 *   Shi & Bolt (1982) — b-value standard error
 *   Wiemer & Wyss (2000) — Mc maximum curvature
 *   Gutenberg & Richter (1944) — frequency-magnitude relation
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class HistoricalSeismicityAnalyzer {
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
   * @param {Array}  events   real catalog events ({lat,lon,depth,mag,time,source})
   * @param {object} [opts]
   * @param {object} [opts.roi]        { lat, lon } — restrict to within radiusKm
   * @param {number} [opts.radiusKm=300]
   * @param {string[]} [opts.sources]  catalog source tags (to flag synthetic)
   * @returns {object} analysis bundle
   */
  analyze(events, opts = {}) {
    const roi = opts.roi || null;
    const radiusKm = opts.radiusKm ?? 300;
    const sources = opts.sources || [];
    const isSynthetic = sources.length === 1 && sources[0] === 'SYNTHETIC';

    // Filter to usable, in-region, magnitude-bearing events.
    let cat = (events || []).filter(e =>
      typeof e.mag === 'number' && isFinite(e.mag) && e.mag > 0 &&
      typeof e.time === 'number' && isFinite(e.time)
    );
    if (roi) cat = cat.filter(e => this.haversine(roi.lat, roi.lon, e.lat, e.lon) <= radiusKm);

    const n = cat.length;
    if (n < 20) {
      return {
        ok: false,
        reason: `Only ${n} events in scope — too few for a stable statistical fit (need ≥20).`,
        eventCount: n,
        isSynthetic,
        sources,
      };
    }

    const mags = cat.map(e => e.mag).sort((a, b) => a - b);
    const times = cat.map(e => e.time);
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const spanYears = Math.max(0.5, (tMax - tMin) / (365.25 * 86400000));

    // ── Magnitude of completeness — maximum curvature (mode of the FMD) ──────
    const binW = 0.1;
    const counts = new Map();
    for (const m of mags) {
      const b = Math.round(m / binW) * binW;
      counts.set(b.toFixed(1), (counts.get(b.toFixed(1)) || 0) + 1);
    }
    let mcRaw = mags[0], peak = 0;
    for (const [b, c] of counts) {
      if (c > peak) { peak = c; mcRaw = parseFloat(b); }
    }
    const Mc = parseFloat((mcRaw + 0.2).toFixed(1)); // maximum-curvature + bias correction

    // ── b-value — Aki-Utsu MLE on events ≥ Mc ────────────────────────────────
    const above = mags.filter(m => m >= Mc - 1e-9);
    const nAbove = above.length;
    let bValue = null, bError = null, aValue = null;
    if (nAbove >= 15) {
      const meanMag = above.reduce((s, m) => s + m, 0) / nAbove;
      // Utsu (1965) with binning correction: b = log10(e) / (mean - (Mc - dM/2))
      bValue = Math.LOG10E / (meanMag - (Mc - binW / 2));
      // Shi & Bolt (1982) standard error
      const variance = above.reduce((s, m) => s + (m - meanMag) ** 2, 0) / (nAbove * (nAbove - 1));
      bError = 2.30 * bValue * bValue * Math.sqrt(variance);
      // a-value from N(≥Mc) = 10^(a − b·Mc) over the catalog span (per year)
      const rateAboveMc = nAbove / spanYears;
      aValue = Math.log10(rateAboveMc) + bValue * Mc;
    }

    // ── Annual rates & return periods at key thresholds (extrapolated GR) ─────
    const rateAt = (m) => (aValue !== null && bValue !== null)
      ? Math.pow(10, aValue - bValue * m) : null;
    const thresholds = [5, 6, 7, 7.5].map(m => {
      const rate = rateAt(m);
      const observed = mags.filter(x => x >= m).length;
      return {
        mag: m,
        annualRate: rate !== null ? parseFloat(rate.toFixed(3)) : null,
        returnPeriodYears: rate && rate > 0 ? parseFloat((1 / rate).toFixed(1)) : null,
        observedCount: observed,
      };
    });

    // ── Depth distribution (real) ────────────────────────────────────────────
    const depths = cat.map(e => (typeof e.depth === 'number' && isFinite(e.depth)) ? e.depth : null)
      .filter(d => d !== null);
    const depthStats = depths.length ? {
      mean: parseFloat((depths.reduce((s, d) => s + d, 0) / depths.length).toFixed(1)),
      shallowPct: parseFloat((depths.filter(d => d < 70).length / depths.length * 100).toFixed(0)),
      intermediatePct: parseFloat((depths.filter(d => d >= 70 && d < 300).length / depths.length * 100).toFixed(0)),
      deepPct: parseFloat((depths.filter(d => d >= 300).length / depths.length * 100).toFixed(0)),
    } : null;

    // ── Largest events (real) ────────────────────────────────────────────────
    const largest = [...cat].sort((a, b) => b.mag - a.mag).slice(0, 5).map(e => ({
      mag: e.mag,
      date: new Date(e.time).toISOString().slice(0, 10),
      lat: parseFloat(e.lat?.toFixed?.(2) ?? e.lat),
      lon: parseFloat(e.lon?.toFixed?.(2) ?? e.lon),
      depth: (typeof e.depth === 'number' && isFinite(e.depth)) ? Math.round(e.depth) : null,
      place: e.place || '',
      source: e.source || '',
    }));

    // ── Activity change: recent (90 d) vs long-term rate — is it elevated NOW ─
    const now = Date.now();
    const recentCutoff = now - 90 * 86400000;
    const recentCount = cat.filter(e => e.time >= recentCutoff).length;
    const recentRatePerYr = recentCount / (90 / 365.25);
    const longTermRatePerYr = n / spanYears;
    const activityRatio = longTermRatePerYr > 0 ? recentRatePerYr / longTermRatePerYr : null;

    return {
      ok: true,
      isSynthetic,
      sources,
      eventCount: n,
      spanYears: parseFloat(spanYears.toFixed(1)),
      dateRange: [new Date(tMin).toISOString().slice(0, 10), new Date(tMax).toISOString().slice(0, 10)],
      magnitudeRange: [mags[0], mags[mags.length - 1]],
      Mc,
      bValue: bValue !== null ? parseFloat(bValue.toFixed(3)) : null,
      bError: bError !== null ? parseFloat(bError.toFixed(3)) : null,
      aValue: aValue !== null ? parseFloat(aValue.toFixed(2)) : null,
      nAboveMc: nAbove,
      thresholds,
      depthStats,
      largest,
      activity: {
        recentCount90d: recentCount,
        recentRatePerYr: parseFloat(recentRatePerYr.toFixed(1)),
        longTermRatePerYr: parseFloat(longTermRatePerYr.toFixed(1)),
        ratio: activityRatio !== null ? parseFloat(activityRatio.toFixed(2)) : null,
        status: activityRatio === null ? 'UNKNOWN'
          : activityRatio > 3 ? 'STRONGLY ELEVATED (swarm/aftershock sequence)'
          : activityRatio > 1.5 ? 'ELEVATED'
          : activityRatio < 0.5 ? 'QUIET' : 'NORMAL',
      },
    };
  }

  /** Format the real analysis as a text report. */
  formatReport(a, roiLabel = '') {
    if (!a.ok) {
      return `[HISTORICAL SEISMICITY ANALYSIS]\nInsufficient data: ${a.reason}\nSources: ${a.sources.join(', ') || 'none'}`;
    }
    const warn = a.isSynthetic
      ? '\n⚠ DATA SOURCE: SYNTHETIC FALLBACK (USGS unreachable). Numbers below are from\n  the offline model catalog, NOT live observations. Reconnect for real data.\n'
      : `\nDATA SOURCE: ${a.sources.join(', ')} (real catalog)\n`;

    const b = a.bValue !== null ? `${a.bValue} ± ${a.bError}` : 'n/a (too few events ≥ Mc)';
    let out = `[HISTORICAL SEISMICITY ANALYSIS]${roiLabel ? ' — ' + roiLabel : ''}
═══════════════════════════════════════════${warn}
Catalog: ${a.eventCount} events | ${a.dateRange[0]} → ${a.dateRange[1]} (${a.spanYears} yr)
Magnitude range: M${a.magnitudeRange[0]} – M${a.magnitudeRange[1]}

GUTENBERG-RICHTER (real MLE, Aki-Utsu):
  Magnitude of completeness Mc: ${a.Mc}
  b-value: ${b}   (events ≥ Mc: ${a.nAboveMc})
  a-value: ${a.aValue ?? 'n/a'}
  → ${a.bValue !== null && a.bValue < 0.8 ? 'Low b: stress-loaded / large-event prone' : a.bValue !== null && a.bValue > 1.1 ? 'High b: many small events / swarm-like' : 'Typical tectonic b-value'}

RECURRENCE (extrapolated from real fit):`;
    for (const t of a.thresholds) {
      out += `
  M≥${t.mag}: ${t.annualRate !== null ? t.annualRate + '/yr → ~1 per ' + t.returnPeriodYears + ' yr' : 'n/a'}  (observed ${t.observedCount} in catalog)`;
    }
    if (a.depthStats) {
      out += `

DEPTH (real): mean ${a.depthStats.mean} km | shallow<70 ${a.depthStats.shallowPct}% · intermediate ${a.depthStats.intermediatePct}% · deep≥300 ${a.depthStats.deepPct}%`;
    }
    out += `

CURRENT ACTIVITY (last 90 days vs long-term):
  Recent: ${a.activity.recentCount90d} events (${a.activity.recentRatePerYr}/yr pace) | Long-term: ${a.activity.longTermRatePerYr}/yr
  Ratio: ${a.activity.ratio ?? 'n/a'}× → ${a.activity.status}

LARGEST EVENTS (real catalog):`;
    for (const e of a.largest) {
      out += `
  M${e.mag} ${e.date} @ ${e.lat},${e.lon} ${e.depth ?? '?'}km ${e.place ? '— ' + e.place : ''} [${e.source}]`;
    }
    out += `
═══════════════════════════════════════════
All values computed live from the catalog above — no hard-coded numbers.`;
    return out;
  }
}
