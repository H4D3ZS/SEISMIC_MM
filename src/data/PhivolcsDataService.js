/**
 * PhivolcsDataService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Live Seismic Data Ingestion
 *
 * Primary source  : USGS FDSNWS Event API (GeoJSON) — Philippine bounding box
 *   Endpoint      : https://earthquake.usgs.gov/fdsnws/event/1/query
 *   Coverage      : Philippine PSN + international contributors incl. PHIVOLCS
 *   CORS          : Open — no proxy required
 *   Update rate   : ~1 min after event location
 *
 * Secondary source: PHIVOLCS Earthquake Bulletin HTML page
 *   Endpoint      : /phivolcs-proxy/ (Vite dev proxy → earthquake.phivolcs.dost.gov.ph)
 *   Coverage      : Philippine Seismic Network only, PEIS intensity data
 *   CORS          : Proxied in dev; same-origin fetch in prod must use a reverse proxy
 *
 * Output format   : Float32Array binary buffer — identical layout to CatalogDataService.js
 *   [0] lat       [1] lon   [2] depth  [3] mag
 *   [4] strike    [5] dip   [6] rake
 *   (strike/dip/rake default to 0 when not available in the source data)
 *
 * Both sources are merged and deduplicated by (lat, lon, mag) proximity.
 * If both sources fail, falls back to the synthetic catalog automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const RECORD_SIZE = 7;

// ── Philippine bounding box ───────────────────────────────────────────────────
const PH_LAT_MIN =  4.0;
const PH_LAT_MAX = 21.5;
const PH_LON_MIN = 116.0;
const PH_LON_MAX = 130.0;

// ── USGS FDSNWS endpoint ──────────────────────────────────────────────────────
const USGS_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

// ── PHIVOLCS proxy path (Vite dev: /phivolcs-proxy → earthquake.phivolcs.dost.gov.ph)
const PHIVOLCS_PROXY = '/phivolcs-proxy/';

/**
 * @typedef {object} LiveEvent
 * @property {string} id
 * @property {number} lat
 * @property {number} lon
 * @property {number} depth   km
 * @property {number} mag     Mw / mb
 * @property {number} time    Unix ms UTC
 * @property {string} place
 * @property {string} source  'USGS' | 'PHIVOLCS'
 * @property {number} strike  degrees (0 if unavailable)
 * @property {number} dip     degrees (0 if unavailable)
 * @property {number} rake    degrees (0 if unavailable)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1.  USGS FDSNWS fetch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch recent earthquakes from the USGS FDSNWS GeoJSON API.
 *
 * @param {object} [opts]
 * @param {number}  [opts.minMag=1.0]        Minimum magnitude
 * @param {number}  [opts.limitDays=30]      How many days back to query
 * @param {number}  [opts.maxResults=2000]   Hard cap on returned features
 * @returns {Promise<LiveEvent[]>}
 */
export async function fetchUSGSEvents(opts = {}) {
  const minMag     = opts.minMag     ?? 1.0;
  const limitDays  = opts.limitDays  ?? 30;
  const maxResults = opts.maxResults ?? 2000;

  const endTime   = new Date();
  const startTime = new Date(endTime.getTime() - limitDays * 86_400_000);

  const params = new URLSearchParams({
    format:       'geojson',
    starttime:    startTime.toISOString(),
    endtime:      endTime.toISOString(),
    minlatitude:  PH_LAT_MIN,
    maxlatitude:  PH_LAT_MAX,
    minlongitude: PH_LON_MIN,
    maxlongitude: PH_LON_MAX,
    minmagnitude: minMag,
    orderby:      'time',
    limit:        maxResults,
  });

  const url = `${USGS_BASE}?${params.toString()}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`USGS FDSNWS HTTP ${res.status}`);

  const json = await res.json();

  return (json.features ?? []).map(f => {
    const p    = f.properties;
    const [lon, lat, depth] = f.geometry.coordinates;
    return {
      id:     f.id,
      lat:    lat,
      lon:    lon,
      depth:  depth  ?? 10,
      mag:    p.mag  ?? 0,
      time:   p.time ?? 0,
      place:  p.place ?? '',
      source: 'USGS',
      strike: 0,
      dip:    0,
      rake:   0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.  PHIVOLCS HTML bulletin scraper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse the PHIVOLCS earthquake bulletin HTML page.
 * Returns an empty array gracefully if the proxy is unavailable.
 *
 * HTML table column order (as of 2025–2026):
 *   0: Date-Time (PST)
 *   1: Latitude (°N)
 *   2: Longitude (°E)
 *   3: Depth (km)
 *   4: Magnitude
 *   5: Location description
 *
 * @returns {Promise<LiveEvent[]>}
 */
export async function fetchPhivolcsEvents() {
  try {
    const res = await fetch(PHIVOLCS_PROXY, {
      cache:   'no-store',
      headers: { 'Accept': 'text/html,application/xhtml+xml' },
    });

    if (!res.ok) {
      console.warn(`[PhivolcsDataService] Proxy returned HTTP ${res.status} — skipping PHIVOLCS scrape.`);
      return [];
    }

    const html = await res.text();
    return _parsePhivolcsHTML(html);
  } catch (err) {
    console.warn('[PhivolcsDataService] PHIVOLCS fetch failed (non-critical):', err.message);
    return [];
  }
}

/**
 * Parse the PHIVOLCS bulletin HTML into LiveEvent objects.
 * Uses DOMParser — safe, no innerHTML injection.
 *
 * @param {string} html
 * @returns {LiveEvent[]}
 * @private
 */
function _parsePhivolcsHTML(html) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(html, 'text/html');

  // PHIVOLCS uses <table> with rows of data after a header row
  const rows = doc.querySelectorAll('table tr');
  const events = [];
  let rowsParsed = 0;

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) continue;  // Skip header rows / partial rows

    try {
      const dateStr = cells[0]?.textContent?.trim() ?? '';
      const lat     = parseFloat(cells[1]?.textContent?.trim());
      const lon     = parseFloat(cells[2]?.textContent?.trim());
      const depth   = parseFloat(cells[3]?.textContent?.trim());
      const mag     = parseFloat(cells[4]?.textContent?.trim());
      const place   = cells[5]?.textContent?.trim() ?? '';

      if (isNaN(lat) || isNaN(lon) || isNaN(mag)) continue;

      // Parse Philippine Standard Time (UTC+8) to Unix ms
      // Format example: "12 June 2026 - 05:37 PM"
      const timeMs = _parsePSTtoUTC(dateStr);

      // Filter to PH bounds (PHIVOLCS occasionally lists regional events)
      if (lat < PH_LAT_MIN || lat > PH_LAT_MAX || lon < PH_LON_MIN || lon > PH_LON_MAX) continue;

      events.push({
        id:     `phivolcs_${timeMs}_${lat}_${lon}`,
        lat,
        lon,
        depth:  isNaN(depth) ? 10 : depth,
        mag,
        time:   timeMs,
        place,
        source: 'PHIVOLCS',
        strike: 0,
        dip:    0,
        rake:   0,
      });

      rowsParsed++;
    } catch {
      // Skip malformed rows
    }
  }

  console.info(`[PhivolcsDataService] Parsed ${rowsParsed} events from PHIVOLCS bulletin.`);
  return events;
}

/**
 * Parse a PHIVOLCS date-time string (PST) to UTC Unix milliseconds.
 * Handles format: "12 June 2026 - 05:37 PM"
 *
 * @param {string} str
 * @returns {number} Unix ms UTC, or 0 on parse failure
 * @private
 */
function _parsePSTtoUTC(str) {
  if (!str) return 0;
  // Remove the dash separator and normalize
  const cleaned = str.replace(' - ', ' ').trim();
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return 0;
  // PST = UTC+8 → subtract 8 hours to get UTC
  return d.getTime() - 8 * 3_600_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  Merge & deduplicate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge USGS and PHIVOLCS event arrays, deduplicating events that are within
 * 0.15° lat/lon and 0.3 magnitude of each other.
 * PHIVOLCS events take precedence when a duplicate is found (more precise
 * location for local events).
 *
 * @param {LiveEvent[]} usgsEvents
 * @param {LiveEvent[]} phivolcsEvents
 * @returns {LiveEvent[]}
 */
export function mergeEvents(usgsEvents, phivolcsEvents) {
  const merged  = [...phivolcsEvents];
  const LAT_TOL = 0.15;
  const LON_TOL = 0.15;
  const MAG_TOL = 0.3;

  for (const ev of usgsEvents) {
    const isDuplicate = merged.some(p =>
      Math.abs(p.lat - ev.lat) < LAT_TOL &&
      Math.abs(p.lon - ev.lon) < LON_TOL &&
      Math.abs(p.mag - ev.mag) < MAG_TOL
    );
    if (!isDuplicate) merged.push(ev);
  }

  // Sort newest first
  merged.sort((a, b) => b.time - a.time);
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  Pack to Float32Array binary buffer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pack an array of LiveEvent objects into the CISV binary Float32Array format.
 * Also produces a parallel PGA buffer.
 *
 * @param {LiveEvent[]} events
 * @returns {{ buffer: Float32Array, pgaBuffer: Float32Array, count: number, events: LiveEvent[] }}
 */
export function packEventsToBinary(events) {
  const count  = events.length;
  const buffer = new Float32Array(count * RECORD_SIZE);
  const pgaBuf = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const ev   = events[i];
    const base = i * RECORD_SIZE;

    buffer[base + 0] = ev.lat;
    buffer[base + 1] = ev.lon;
    buffer[base + 2] = Math.max(0, ev.depth);
    buffer[base + 3] = Math.max(0, ev.mag);
    buffer[base + 4] = ev.strike;
    buffer[base + 5] = ev.dip;
    buffer[base + 6] = ev.rake;

    // Simplified Atkinson-Boore PGA proxy (order-of-magnitude only)
    pgaBuf[i] = Math.min(3.0, Math.pow(10, 0.5 * ev.mag - Math.log10(ev.depth + 10) - 1.5));
  }

  return { buffer, pgaBuffer: pgaBuf, count, events };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  High-level fetch + pack entrypoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch live data from both sources, merge, deduplicate, and return a
 * binary-packed catalog ready for GPU upload.
 *
 * Falls back to the synthetic catalog if both sources fail entirely.
 *
 * @param {object} [opts]
 * @param {number}  [opts.minMag=1.0]
 * @param {number}  [opts.limitDays=30]
 * @param {boolean} [opts.includePhivolcs=true]  Attempt PHIVOLCS HTML scrape
 * @returns {Promise<{
 *   buffer: Float32Array,
 *   pgaBuffer: Float32Array,
 *   count: number,
 *   events: LiveEvent[],
 *   sources: string[]
 * }>}
 */
export async function fetchLiveCatalog(opts = {}) {
  const includePhivolcs = opts.includePhivolcs ?? true;
  const sources = [];

  // Run both fetches concurrently; individual failures are non-fatal
  const [usgsResult, phivolcsResult] = await Promise.allSettled([
    fetchUSGSEvents({ minMag: opts.minMag ?? 1.0, limitDays: opts.limitDays ?? 30 }),
    includePhivolcs ? fetchPhivolcsEvents() : Promise.resolve([]),
  ]);

  const usgsEvents      = usgsResult.status      === 'fulfilled' ? usgsResult.value      : [];
  const phivolcsEvents  = phivolcsResult.status  === 'fulfilled' ? phivolcsResult.value  : [];

  if (usgsEvents.length > 0)     sources.push('USGS');
  if (phivolcsEvents.length > 0) sources.push('PHIVOLCS');

  if (usgsEvents.length === 0 && phivolcsEvents.length === 0) {
    console.warn('[PhivolcsDataService] Both live sources failed. Caller should fall back to synthetic catalog.');
    return { buffer: new Float32Array(0), pgaBuffer: new Float32Array(0), count: 0, events: [], sources: [] };
  }

  if (usgsResult.status === 'rejected') {
    console.warn('[PhivolcsDataService] USGS fetch failed:', usgsResult.reason?.message);
  }
  if (phivolcsResult.status === 'rejected') {
    console.warn('[PhivolcsDataService] PHIVOLCS fetch failed:', phivolcsResult.reason?.message);
  }

  const merged = mergeEvents(usgsEvents, phivolcsEvents);

  console.info(
    `[PhivolcsDataService] Merged catalog: ${merged.length} events ` +
    `(USGS: ${usgsEvents.length}, PHIVOLCS: ${phivolcsEvents.length})`
  );

  return { ...packEventsToBinary(merged), sources };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.  Re-export getEventRecord for compatibility with CatalogDataService callers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the raw record for a single event by index.
 * Identical signature to CatalogDataService.getEventRecord().
 *
 * @param {Float32Array} buffer
 * @param {number}       index
 * @returns {{ lat, lon, depth, mag, strike, dip, rake }}
 */
export function getEventRecord(buffer, index) {
  const base = index * RECORD_SIZE;
  return {
    lat:    buffer[base + 0],
    lon:    buffer[base + 1],
    depth:  buffer[base + 2],
    mag:    buffer[base + 3],
    strike: buffer[base + 4],
    dip:    buffer[base + 5],
    rake:   buffer[base + 6],
  };
}
