/**
 * ProbabilityHotspotScanner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * "WHERE will it happen?" — discovered, not typed.
 *
 * Instead of asking the user for coordinates, this scans a grid over the
 * Philippine region and computes an earthquake probability for EVERY cell from
 * REAL data, then ranks the cells to surface the highest-probability locations
 * (the discovered candidate epicenters). Nothing about the location is
 * hard-coded — the hotspots emerge from the live catalog + the active sequence.
 *
 * Per-cell composite probability of M≥6 in the next year blends four REAL
 * signals:
 *   1. Background rate    — local Gutenberg-Richter rate from the actual
 *                            catalog density around the cell (+ nearest-zone b)
 *   2. Renewal / overdue  — BPT time-dependent hazard from time since the last
 *                            major nearby event in the catalog
 *   3. Aftershock density — events in the last 90 days near the cell (this is
 *                            what makes the live June sequence light up)
 *   4. Coulomb loading    — ΔCFF transferred by the most recent mainshock
 *
 * Output: ranked hotspots (lat/lon, probability, dominant driver, nearest zone,
 * expected max magnitude) + a normalized heat grid for the globe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SEISMOGENIC_ZONES, RECURRENCE_DATA, bptHazard } from '../data/ResearchPaperData.js';
import { CoulombStressTransfer } from './CoulombStressTransfer.js';
import { AftershockForecaster } from './AftershockForecaster.js';

// Philippine bounding box
const PH = { latMin: 4.5, latMax: 21.5, lonMin: 116.0, lonMax: 130.0 };

export class ProbabilityHotspotScanner {
  constructor() {
    this.coulomb = new CoulombStressTransfer();
    this.aftershocks = new AftershockForecaster();
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

  /**
   * @param {object} params
   * @param {Array}  params.events       REAL catalog events ({lat,lon,mag,time})
   * @param {string[]} [params.sources]  catalog source tags (synthetic flag)
   * @param {number} [params.cellDeg=0.5]  grid resolution in degrees
   * @param {number} [params.topN=10]
   * @param {Function} [params.onProgress]
   * @returns {Promise<object>}
   */
  async scan(params = {}) {
    const events = (params.events || []).filter(e =>
      typeof e.mag === 'number' && isFinite(e.mag) && typeof e.time === 'number');
    const sources = params.sources || [];
    const isSynthetic = sources.length === 1 && sources[0] === 'SYNTHETIC';
    const cell = params.cellDeg ?? 0.5;
    const topN = params.topN ?? 10;
    const onProgress = params.onProgress;

    const now = Date.now();
    const recentCutoff = now - 90 * 86400000;

    // Pre-split the catalog: recent (aftershock window) vs all.
    const recent = events.filter(e => e.time >= recentCutoff);

    // Mainshock for the Coulomb field (largest recent sizable event).
    const mainshock = this.aftershocks.detectMainshock(events, null, 120);
    const coulombField = this.coulomb.compute({
      lat: mainshock.lat, lon: mainshock.lon, mag: mainshock.mag, strike: 345,
    });

    // Catalog time span (years) for rate normalization.
    const times = events.map(e => e.time);
    const spanYears = times.length > 1
      ? Math.max(0.5, (Math.max(...times) - Math.min(...times)) / (365.25 * 86400000)) : 1;

    const latCells = Math.ceil((PH.latMax - PH.latMin) / cell);
    const lonCells = Math.ceil((PH.lonMax - PH.lonMin) / cell);
    const grid = [];
    const radiusKm = 75; // neighbourhood for local rate

    let processed = 0;
    const totalCells = latCells * lonCells;

    for (let i = 0; i < latCells; i++) {
      const lat = PH.latMin + (i + 0.5) * cell;
      for (let j = 0; j < lonCells; j++) {
        const lon = PH.lonMin + (j + 0.5) * cell;

        // Nearest seismogenic zone (real paper data) for b-value & max mag.
        let zone = null, zDist = Infinity;
        for (const z of SEISMOGENIC_ZONES) {
          const d = this.haversine(lat, lon, z.lat, z.lon);
          if (d < zDist) { zDist = d; zone = z; }
        }
        // Skip cells with no zone within 250 km (open ocean / off-craton).
        if (zDist > 250) { processed++; continue; }

        // 1. Background rate from REAL local catalog density.
        let nNear = 0, nNearRecent = 0, lastMajorTime = 0, maxMagNear = 0;
        for (const e of events) {
          const d = this.haversine(lat, lon, e.lat, e.lon);
          if (d <= radiusKm) {
            nNear++;
            if (e.mag >= 6.0 && e.time > lastMajorTime) lastMajorTime = e.time;
            if (e.mag > maxMagNear) maxMagNear = e.mag;
            if (e.time >= recentCutoff) nNearRecent++;
          }
        }
        // Local annual rate of all events near cell; GR-scale to M≥6.
        const localAnnual = nNear / spanYears;
        const b = zone.bValue;
        // Fraction of events ≥6 vs ≥ small completeness (~4): 10^(-b·(6-4))
        const rate6 = localAnnual * Math.pow(10, -b * (6 - 4.0));
        const pBackground = 1 - Math.exp(-Math.max(0, rate6)); // 1-yr Poisson

        // 2. Renewal / overdue (BPT) from time since last major near cell.
        const rec = RECURRENCE_DATA.find(r =>
          zone.name.toLowerCase().includes(r.zone.toLowerCase().split(' ')[0]));
        const meanInterval = rec?.avgInterval ?? 60;
        const elapsedYears = lastMajorTime > 0
          ? (now - lastMajorTime) / (365.25 * 86400000)
          : meanInterval * 0.5; // unknown → assume mid-cycle
        const pRenewal = bptHazard(elapsedYears, 1, meanInterval, 0.5);

        // 3. Aftershock density (live elevation right now).
        const aftershockBoost = Math.min(2.5, nNearRecent / 3); // 0..2.5

        // 4. Coulomb loading from the recent mainshock at this cell.
        let coulombBoost = 0;
        // Reuse the segment ΔCFF if cell is near a loaded zone, else distance proxy.
        const dToMain = this.haversine(lat, lon, mainshock.lat, mainshock.lon);
        if (dToMain > 15 && dToMain < 300 && mainshock.mag >= 6.5) {
          // crude near-field ΔCFF proxy consistent with CoulombStressTransfer
          const L = Math.max(10, Math.pow(10, 0.5 * mainshock.mag - 1.8));
          const dcff = 3.0 * Math.pow(L / (dToMain + L), 3);
          coulombBoost = Math.min(1.5, dcff * 1.5);
        }

        // Composite probability (next 1 yr, M≥6), bounded.
        const composite = Math.min(0.98,
          (1 - (1 - pBackground) * (1 - pRenewal)) *
          (1 + aftershockBoost + coulombBoost));

        // Dominant driver for explainability. Aftershocks only count as a driver
        // when there is a genuine recent cluster (≥5 events in 90 d near the cell).
        const drivers = [
          ['background seismicity', pBackground],
          ['overdue (renewal)', pRenewal],
          ['active aftershocks', nNearRecent >= 5 ? aftershockBoost * 0.2 : 0],
          ['Coulomb stress loading', coulombBoost * 0.2],
        ].sort((a, b) => b[1] - a[1]);

        grid.push({
          lat: parseFloat(lat.toFixed(3)),
          lon: parseFloat(lon.toFixed(3)),
          probability: composite,
          pBackground, pRenewal, aftershockBoost, coulombBoost,
          nNear, nNearRecent,
          maxMagNear,
          zone: zone.name,
          zoneMaxMag: zone.maxMag,
          bValue: b,
          elapsedYears: parseFloat(elapsedYears.toFixed(1)),
          dominantDriver: drivers[0][0],
        });

        processed++;
      }
      if (onProgress) {
        onProgress(Math.floor((processed / totalCells) * 100),
          `Scanning grid… ${processed}/${totalCells} cells`);
        await new Promise(r => setTimeout(r, 0)); // yield per row
      }
    }

    // Rank, then spatially de-duplicate (merge cells within ~0.6° → keep peak).
    grid.sort((a, b) => b.probability - a.probability);
    const hotspots = [];
    for (const c of grid) {
      if (hotspots.length >= topN) break;
      const tooClose = hotspots.some(h => this.haversine(h.lat, h.lon, c.lat, c.lon) < 70);
      if (!tooClose) hotspots.push(c);
    }

    // Normalized heat grid (probability 0..1) for globe rendering.
    const maxP = grid.length ? grid[0].probability : 1;
    const heat = grid.map(c => ({
      lat: c.lat, lon: c.lon, w: maxP > 0 ? c.probability / maxP : 0,
    }));

    return {
      ok: grid.length > 0,
      isSynthetic,
      sources,
      cellDeg: cell,
      cellsScanned: grid.length,
      catalogEvents: events.length,
      recentEvents90d: recent.length,
      spanYears: parseFloat(spanYears.toFixed(1)),
      mainshock: { lat: mainshock.lat, lon: mainshock.lon, mag: mainshock.mag, source: mainshock.source },
      coulombTopSegment: coulombField.topSegment,
      hotspots: hotspots.map((h, idx) => ({
        rank: idx + 1,
        lat: h.lat, lon: h.lon,
        probability1yrM6: parseFloat((h.probability * 100).toFixed(1)),
        dominantDriver: h.dominantDriver,
        nearestZone: h.zone,
        expectedMaxMag: h.zoneMaxMag,
        recentEvents90d: h.nNearRecent,
        eventsNear: h.nNear,
        largestNearby: parseFloat(h.maxMagNear.toFixed(1)),
        yearsSinceLastMajor: h.elapsedYears,
      })),
      heat,
    };
  }

  formatReport(r) {
    if (!r || !r.ok) return '[HOTSPOT SCAN]\nNo cells scanned — empty catalog.';
    const warn = r.isSynthetic
      ? '\n⚠ SYNTHETIC FALLBACK DATA — USGS/PHIVOLCS unreachable. Reconnect for real hotspots.\n'
      : `\nDATA: ${r.sources.join(', ')} | ${r.catalogEvents} events (${r.recentEvents90d} in last 90d)\n`;
    let out = `[EARTHQUAKE PROBABILITY HOTSPOT SCAN]
═══════════════════════════════════════════
WHERE is the next one most likely? — discovered from real data, no coordinates typed.${warn}
Scanned ${r.cellsScanned} grid cells @ ${r.cellDeg}° | anchor mainshock M${r.mainshock.mag} (${r.mainshock.source})
${r.coulombTopSegment ? `Coulomb-loaded segment: ${r.coulombTopSegment.name} (+${r.coulombTopSegment.deltaCFF_bar} bar)` : ''}

TOP ${r.hotspots.length} PROBABLE LOCATIONS (P of M≥6 within 1 yr):`;
    for (const h of r.hotspots) {
      out += `
  #${String(h.rank).padStart(2)} ${h.lat.toFixed(2)}°N ${h.lon.toFixed(2)}°E — ${h.probability1yrM6}%
       zone: ${h.nearestZone} (max M${h.expectedMaxMag}) | driver: ${h.dominantDriver}
       recent 90d: ${h.recentEvents90d} events | largest nearby M${h.largestNearby} | ${h.yearsSinceLastMajor}yr since last M≥6`;
    }
    out += `
═══════════════════════════════════════════
All locations DISCOVERED by scanning real seismicity — not user-supplied.`;
    return out;
  }
}
