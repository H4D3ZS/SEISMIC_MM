/**
 * telemetry-worker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Multi-Source Live Telemetry Bridge — dedicated Web Worker.
 *
 * Runs off the main thread so polling, parsing and dedup never stall the
 * WebGL render loop.
 *
 *   • USGS GeoJSON real-time feed — every 30 s, strict Philippine bounding
 *     box (4.0–21.0°N, 116.0–127.0°E). Catches offshore megathrust breaks
 *     the instant they post.
 *   • Precursor channels (thermal IR / ionospheric TEC) — pluggable hooks
 *     polled at low cadence; emit normalized 0–1 anomaly indices. Endpoints
 *     are configurable because field deployments mirror NOAA/MODIS data on
 *     local servers.
 *
 * Messages OUT (worker → main):
 *   { type: 'seismic-event', event: {id, magnitude, place, latitude,
 *     longitude, depth, time_ms} }            — one per NEW event
 *   { type: 'precursor', channel, value, at } — anomaly index update
 *   { type: 'status', source, ok, detail }    — feed health
 *
 * Messages IN (main → worker):
 *   { type: 'configure', usgsPollMs?, precursorEndpoints? }
 *   { type: 'stop' }
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Philippine bounding box ───────────────────────────────────────────────────
const BBOX = { latMin: 4.0, latMax: 21.0, lonMin: 116.0, lonMax: 127.0 };

let usgsPollMs = 30_000;
let usgsTimer  = null;
let precursorTimer = null;
let precursorEndpoints = null; // { thermal_ir?: url, tec?: url }

/** De-dup across polls — only newly observed USGS event IDs are emitted. */
const seenIds = new Set();

// ── USGS high-frequency ingestion ─────────────────────────────────────────────

async function pollUSGS() {
  // 2 h lookback overlaps generously with the 30 s cadence; the seen-set
  // absorbs duplicates, so transient outages never drop events.
  const start = new Date(Date.now() - 2 * 3600_000).toISOString().slice(0, 19);
  const url =
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
    `&starttime=${start}` +
    `&minlatitude=${BBOX.latMin}&maxlatitude=${BBOX.latMax}` +
    `&minlongitude=${BBOX.lonMin}&maxlongitude=${BBOX.lonMax}` +
    '&orderby=time';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();

    let fresh = 0;
    for (const f of body.features ?? []) {
      if (seenIds.has(f.id)) continue;
      seenIds.add(f.id);
      fresh++;

      const [lon, lat, depth] = f.geometry.coordinates;
      self.postMessage({
        type: 'seismic-event',
        event: {
          id:        f.id,
          magnitude: f.properties.mag ?? 0,
          place:     f.properties.place ?? 'Unknown region',
          latitude:  lat,
          longitude: lon,
          depth:     depth ?? 0,
          time_ms:   f.properties.time ?? Date.now(),
        },
      });
    }

    // Bound memory across long uptimes
    if (seenIds.size > 50_000) seenIds.clear();

    self.postMessage({ type: 'status', source: 'usgs', ok: true, detail: `${fresh} new` });
  } catch (err) {
    self.postMessage({ type: 'status', source: 'usgs', ok: false, detail: String(err) });
  }
}

// ── Precursor channels (thermal IR / TEC) ─────────────────────────────────────

async function pollPrecursors() {
  if (!precursorEndpoints) return;

  for (const [channel, url] of Object.entries(precursorEndpoints)) {
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Expected mirror format: { value: <0..1 normalized anomaly index> }
      const value = Math.max(0, Math.min(1, Number(data.value) || 0));
      self.postMessage({ type: 'precursor', channel, value, at: Date.now() });
    } catch (err) {
      self.postMessage({ type: 'status', source: channel, ok: false, detail: String(err) });
    }
  }
}

// ── Control plane ─────────────────────────────────────────────────────────────

function start() {
  stop();
  pollUSGS(); // immediate first hit
  usgsTimer = setInterval(pollUSGS, usgsPollMs);
  precursorTimer = setInterval(pollPrecursors, 10 * 60_000); // 10 min cadence
}

function stop() {
  if (usgsTimer)      clearInterval(usgsTimer);
  if (precursorTimer) clearInterval(precursorTimer);
  usgsTimer = precursorTimer = null;
}

self.onmessage = ({ data }) => {
  switch (data?.type) {
    case 'configure':
      if (Number.isFinite(data.usgsPollMs) && data.usgsPollMs >= 10_000) {
        usgsPollMs = data.usgsPollMs;
      }
      if (data.precursorEndpoints) precursorEndpoints = data.precursorEndpoints;
      start();
      break;
    case 'stop':
      stop();
      break;
  }
};

start();
