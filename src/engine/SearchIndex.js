/**
 * SearchIndex.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified, fuzzy search index over every locatable entity in the app:
 *   places · barangays (with hazard) · seismogenic zones · active faults ·
 *   cities · volcanoes · live earthquake events.
 *
 * Pure, dependency-free ranking. The command palette uses query() to power the
 * "type a name → narrow → jump there" experience.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PLACE_LABELS } from '../data/PlaceLabelCatalog.js';
import { BARANGAY_HAZARDS } from '../data/HazardMapData.js';
import { SEISMOGENIC_ZONES, ACTIVE_FAULTS } from '../data/ResearchPaperData.js';
import { CITIES } from '../data/CivicInfrastructureData.js';
import { VOLCANO_CATALOG } from '../data/VolcanoDataService.js';

export class SearchIndex {
  constructor() {
    this.static = [];
    this.events = [];
    this._buildStatic();
  }

  _add(arr, type, name, lat, lon, subtitle, meta) {
    if (typeof lat !== 'number' || typeof lon !== 'number' || !name) return;
    arr.push({ type, name, lat, lon, subtitle: subtitle || '', meta: meta || {}, _name: name.toLowerCase() });
  }

  _buildStatic() {
    const A = this.static;
    for (const p of PLACE_LABELS) this._add(A, 'place', p.name, p.lat, p.lon, p.parent ? `Place · ${p.parent}` : 'Place', { tier: p.tier });
    for (const b of BARANGAY_HAZARDS) this._add(A, 'barangay', b.name, b.lat, b.lon, `Barangay · ${b.city} · liq ${b.liquefaction.replace('_', ' ')}${b.tsunamiDepth_m ? ` · tsunami ${b.tsunamiDepth_m}m` : ''}`, b);
    for (const z of SEISMOGENIC_ZONES) this._add(A, 'zone', z.name, z.lat, z.lon, `Seismogenic zone · max M${z.maxMag} · b=${z.bValue}`, z);
    for (const f of ACTIVE_FAULTS) if (f.lat && f.lon) this._add(A, 'fault', f.name, f.lat, f.lon, `Active fault · Mf ${f.Mf} · ${f.length}km`, f);
    for (const key of Object.keys(CITIES)) { const c = CITIES[key]; this._add(A, 'city', c.name || key, c.lat, c.lon, 'City', c); }
    for (const v of VOLCANO_CATALOG) this._add(A, 'volcano', v.name, v.latitude, v.longitude, `Volcano · alert ${v.Alert_Level ?? v.alertLevel ?? 0}`, v);
  }

  /** Feed/refresh the live earthquake events (newest first preferred). */
  setEvents(events) {
    this.events = [];
    const list = (events || []).filter(e => typeof e.lat === 'number' && typeof e.lon === 'number' && typeof e.mag === 'number');
    // Cap to the most significant/recent so the index stays snappy.
    const top = [...list].sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 400);
    for (const e of top) {
      const name = e.place || `M${e.mag.toFixed(1)} ${e.lat.toFixed(2)},${e.lon.toFixed(2)}`;
      this._add(this.events, 'event', name, e.lat, e.lon,
        `Event · M${e.mag.toFixed(1)} · ${e.depth ?? '?'}km · ${e.source || ''}`, e);
    }
  }

  /**
   * Fuzzy score of `q` against a lowercase target. Higher = better; -1 = no match.
   * Rewards exact / prefix / word-start / contiguous-substring, then falls back
   * to in-order subsequence.
   */
  _score(q, target) {
    if (!q) return 0;
    if (target === q) return 1000;
    if (target.startsWith(q)) return 800 - target.length;
    const idx = target.indexOf(q);
    if (idx === 0) return 700;
    if (idx > 0) {
      const wordStart = idx === 0 || /[\s,(\-]/.test(target[idx - 1]);
      return (wordStart ? 500 : 300) - idx;
    }
    // subsequence
    let ti = 0, qi = 0, hops = 0;
    while (ti < target.length && qi < q.length) {
      if (target[ti] === q[qi]) { qi++; } else { hops++; }
      ti++;
    }
    return qi === q.length ? 120 - hops : -1;
  }

  /**
   * @param {string} str
   * @param {number} [limit=30]
   * @returns {Array<{type,name,lat,lon,subtitle,meta,score}>}
   */
  query(str, limit = 30) {
    const q = String(str || '').toLowerCase().trim();
    const pool = this.static.concat(this.events);
    if (!q) {
      // Empty query: surface a useful default set (major places + active items).
      return pool.filter(e => e.type === 'city' || e.type === 'zone').slice(0, limit)
        .map(e => ({ ...e, score: 0 }));
    }
    const out = [];
    for (const e of pool) {
      let s = this._score(q, e._name);
      // also let the subtitle/city match (e.g. "general santos" finds its barangays)
      if (s < 0 && e.meta && e.meta.city) s = this._score(q, e.meta.city.toLowerCase()) > 0 ? 80 : -1;
      if (s >= 0) {
        // small type priors so a typed city name beats a far event with same score
        const prior = { city: 6, place: 5, zone: 4, barangay: 4, fault: 3, volcano: 3, event: 2 }[e.type] || 0;
        out.push({ ...e, score: s + prior });
      }
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }
}
