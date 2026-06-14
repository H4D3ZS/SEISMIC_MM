/**
 * MagnitudeUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Magnitude homogenization to moment magnitude (Mw).
 *
 * USGS and PHIVOLCS report different magnitude scales for the same earthquake:
 *   • USGS Philippine events are mostly mb (body-wave) — saturates, reads LOW
 *   • PHIVOLCS bulletins commonly report Ms (surface-wave)
 *   • Large events may be Mw directly
 * Treating these as interchangeable introduces systematic error (mb can be
 * ~0.2–0.4 below Mw near M5). To compare sources fairly and to feed the
 * Torregosa (Ms-based) model consistently, every event is converted to Mw using
 * the global empirical relations of Scordilis (2006).
 *
 * Reference:
 *   Scordilis, E.M. (2006). "Empirical global relations converting M_S and m_b
 *   to moment magnitude." Journal of Seismology 10:225–236.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Convert a magnitude of a given type to moment magnitude Mw.
 * Returns { mw, converted, note }.
 *
 * @param {number} mag
 * @param {string} [magType]  e.g. 'mb','mwc','mww','ms','ml','md'
 */
export function toMw(mag, magType = '') {
  if (typeof mag !== 'number' || !isFinite(mag)) return { mw: mag, converted: false, note: 'invalid' };
  const t = String(magType || '').toLowerCase();

  // Already a moment magnitude — keep as-is.
  if (t.startsWith('mw') || t === 'w') return { mw: mag, converted: false, note: 'already Mw' };

  // Body-wave mb → Mw  (Scordilis 2006, valid 3.5 ≤ mb ≤ 6.2)
  if (t === 'mb' || t === 'mb_lg' || t === 'mblg') {
    const mw = 0.85 * mag + 1.03;
    return { mw: round2(mw), converted: true, note: 'mb→Mw (Scordilis 2006)' };
  }

  // Surface-wave Ms → Mw  (Scordilis 2006, two ranges)
  if (t === 'ms' || t === 'ms_20' || t === 'msz') {
    const mw = mag <= 6.1 ? (0.67 * mag + 2.07) : (0.99 * mag + 0.08);
    return { mw: round2(mw), converted: true, note: 'Ms→Mw (Scordilis 2006)' };
  }

  // Local/duration ML, Md ≈ Mw for small-moderate events (no robust global
  // relation) — pass through but flag.
  if (t === 'ml' || t === 'md' || t === 'mlv') {
    return { mw: mag, converted: false, note: `${t}≈Mw (no conversion)` };
  }

  // Unknown / blank type — assume already moment-like, do not fabricate a shift.
  return { mw: mag, converted: false, note: magType ? `unhandled type ${magType}` : 'no type → assumed Mw' };
}

/** Convert PHIVOLCS-style Ms to the Ms scale used by the Torregosa attenuation. */
export function mwToMs(mw) {
  // Inverse of Scordilis Ms→Mw (lower range), clamped.
  if (typeof mw !== 'number' || !isFinite(mw)) return mw;
  return round2((mw - 2.07) / 0.67);
}

function round2(x) { return Math.round(x * 100) / 100; }
