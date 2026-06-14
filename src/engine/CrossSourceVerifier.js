/**
 * CrossSourceVerifier.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Measures the ACTUAL agreement between USGS and PHIVOLCS for the same
 * earthquakes. Answers the question "is USGS 100% accurate with PHIVOLCS?"
 * honestly with numbers instead of assuming they are identical (they are not —
 * two independent networks, different magnitude scales and locating algorithms).
 *
 * For each PHIVOLCS event it finds the best USGS match within a space–time
 * window, then reports:
 *   • match rate (how many events both networks recorded)
 *   • magnitude bias + RMS, on the RAW reported values AND after homogenizing
 *     both to Mw (Scordilis 2006) — the raw gap is mostly scale (mb vs Ms),
 *     the homogenized gap is the true measurement spread
 *   • epicentre offset (km) and depth difference (km)
 *   • PHIVOLCS availability (so the UI never claims a source that is down)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { toMw } from '../data/MagnitudeUtils.js';

function hav(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function rms(a) { return a.length ? Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length) : 0; }

/**
 * Compare two event arrays. Each event: { lat, lon, depth, mag, magType?, time }.
 * @param {Array} usgs
 * @param {Array} phivolcs
 * @param {object} [opts] { maxKm=60, maxMinutes=90 }
 */
export function compareSources(usgs = [], phivolcs = [], opts = {}) {
  const maxKm = opts.maxKm ?? 60;
  const maxMs = (opts.maxMinutes ?? 90) * 60000;

  const phAvail = phivolcs.length > 0;
  const usgsAvail = usgs.length > 0;

  const magRaw = [], magMw = [], distKm = [], depthDiff = [];
  let matched = 0;

  for (const ph of phivolcs) {
    if (typeof ph.lat !== 'number' || typeof ph.mag !== 'number') continue;
    let best = null, bestD = Infinity;
    for (const u of usgs) {
      if (typeof u.time === 'number' && typeof ph.time === 'number' && Math.abs(u.time - ph.time) > maxMs) continue;
      const d = hav(ph.lat, ph.lon, u.lat, u.lon);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (best && bestD <= maxKm) {
      matched++;
      const uRaw = best.magOriginal ?? best.mag;                  // original USGS value
      magRaw.push(ph.mag - uRaw);                                 // raw reported gap (scale-mixed)
      const phMw = toMw(ph.mag, ph.magType || 'ms').mw;           // PHIVOLCS usually Ms
      const uMw  = toMw(uRaw, best.magType || 'mb').mw;           // USGS usually mb
      magMw.push(phMw - uMw);                                     // scale-corrected gap
      distKm.push(bestD);
      if (typeof ph.depth === 'number' && typeof best.depth === 'number') depthDiff.push(ph.depth - best.depth);
    }
  }

  const r2 = (x) => Math.round(x * 100) / 100;
  const matchRate = phivolcs.length ? matched / phivolcs.length : 0;

  return {
    usgsAvailable: usgsAvail,
    phivolcsAvailable: phAvail,
    usgsCount: usgs.length,
    phivolcsCount: phivolcs.length,
    matched,
    matchRatePct: r2(matchRate * 100),
    magnitude: {
      rawBias: r2(mean(magRaw)),     // PHIVOLCS − USGS, raw scales
      rawRMS: r2(rms(magRaw)),
      mwBias: r2(mean(magMw)),       // after homogenizing both to Mw
      mwRMS: r2(rms(magMw)),
    },
    epicentreOffsetKm: { mean: r2(mean(distKm)), max: r2(distKm.length ? Math.max(...distKm) : 0) },
    depthDiffKm: { mean: r2(mean(depthDiff)), rms: r2(rms(depthDiff)) },
    verdict: !phAvail
      ? 'PHIVOLCS source unavailable — cannot cross-verify; catalog is USGS-only right now.'
      : matched < 3
      ? 'Too few co-recorded events to judge agreement.'
      : (Math.abs(mean(magMw)) < 0.15 && mean(distKm) < 25)
      ? 'GOOD agreement after Mw homogenization (independent networks, expected small spread).'
      : 'NOTABLE differences — sources are independent; do not treat as identical.',
  };
}

export function formatVerification(v) {
  let out = `[CROSS-SOURCE VERIFICATION — USGS vs PHIVOLCS]
═══════════════════════════════════════════
USGS: ${v.usgsAvailable ? v.usgsCount + ' events' : 'UNAVAILABLE'} | PHIVOLCS: ${v.phivolcsAvailable ? v.phivolcsCount + ' events' : 'UNAVAILABLE'}`;
  if (!v.phivolcsAvailable) {
    out += `\n\n⚠ ${v.verdict}\nThe two networks are NOT expected to be 100% identical even when both are up.`;
    return out;
  }
  out += `
Co-recorded (matched) events: ${v.matched} (${v.matchRatePct}% of PHIVOLCS)

MAGNITUDE (PHIVOLCS − USGS):
  Raw reported:        bias ${v.magnitude.rawBias >= 0 ? '+' : ''}${v.magnitude.rawBias}, RMS ${v.magnitude.rawRMS}  ← includes scale mismatch (mb vs Ms)
  Homogenized to Mw:   bias ${v.magnitude.mwBias >= 0 ? '+' : ''}${v.magnitude.mwBias}, RMS ${v.magnitude.mwRMS}  ← true measurement spread

EPICENTRE OFFSET: mean ${v.epicentreOffsetKm.mean} km (max ${v.epicentreOffsetKm.max} km)
DEPTH DIFFERENCE: mean ${v.depthDiffKm.mean} km, RMS ${v.depthDiffKm.rms} km

VERDICT: ${v.verdict}
═══════════════════════════════════════════
Both feeds are real and independent. The app homogenizes all magnitudes to Mw
(Scordilis 2006) so they can be compared and modelled on one consistent scale.`;
  return out;
}
