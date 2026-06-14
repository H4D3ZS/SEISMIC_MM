/**
 * stream.worker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Hardware-Isolated Ingestion Web Worker.
 *
 * Runs off the main thread to handle WebSocket streaming, HTTP polling,
 * string parsing, and coordinate projection without blocking the 3D render loop.
 * Passes clean raw binary ArrayBuffers directly back to the main thread.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Bounding box for the Philippine archipelago
const BBOX = { latMin: 4.0, latMax: 21.0, lonMin: 116.0, lonMax: 127.0 };

// Geodynamic coordinate constants
const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;
const DEPTH_SCALE   = 0.25;

let usgsPollMs = 30_000;
let usgsTimer  = null;
let precursorTimer = null;
let precursorEndpoints = null;
let webSocketUrl = 'wss://api.cyberifrit.net/seismic/stream';
let ws = null;
let wsReconnectTimeout = null;
let wsFailCount = 0;
const WS_MAX_RETRY_DELAY = 30000;

const seenIds = new Set();

/**
 * Projects latitude, longitude, and depth into Three.js scene coordinates
 */
function projectCoordinates(lat, lon, depth) {
  const x = (lon - LON_ANCHOR) * SPATIAL_SCALE;
  const y = (lat - LAT_ANCHOR) * SPATIAL_SCALE;
  const z = -(depth * DEPTH_SCALE);
  return { x, y, z };
}

/**
 * Pack event telemetry into a binary Float32Array buffer and post it.
 * Structure: [lat, lon, depth, magnitude, x, y, z] (7 floats, 28 bytes)
 */
function emitBinaryEvent(id, place, time_ms, source, lat, lon, depth, magnitude, extraReport = null) {
  const coords = projectCoordinates(lat, lon, depth);
  
  const arrayBuffer = new ArrayBuffer(7 * 4); // 7 float32 fields = 28 bytes
  const view = new Float32Array(arrayBuffer);
  view[0] = lat;
  view[1] = lon;
  view[2] = depth;
  view[3] = magnitude;
  view[4] = coords.x;
  view[5] = coords.y;
  view[6] = coords.z;

  self.postMessage({
    type: 'seismic-event-bin',
    id,
    place,
    time_ms,
    source: source || 'USGS_LIVE',
    buffer: arrayBuffer,
    situational_report: extraReport
  }, [arrayBuffer]); // Transfer ownership to main thread (zero-copy)
}

// ── WebSocket Ingestion ───────────────────────────────────────────────────────

function connectWebSocket() {
  if (ws) {
    try { ws.close(); } catch (e) {}
  }

  console.info(`[Worker] Connecting to live WebSocket: ${webSocketUrl}`);
  
  try {
    ws = new WebSocket(webSocketUrl);
    
    ws.onopen = () => {
      console.info('[Worker] WebSocket connection established.');
      self.postMessage({ type: 'status', source: 'websocket', ok: true, detail: 'CONNECTED' });
      if (wsReconnectTimeout) {
        clearTimeout(wsReconnectTimeout);
        wsReconnectTimeout = null;
      }
    };

    ws.onmessage = (messageEvent) => {
      try {
        const payload = JSON.parse(messageEvent.data);
        if (payload && payload.id) {
          if (seenIds.has(payload.id)) return;
          seenIds.add(payload.id);
          
          emitBinaryEvent(
            payload.id,
            payload.place || 'Live Tectonic Rupture',
            payload.time_ms || Date.now(),
            payload.source || 'LIVE_WS',
            payload.lat,
            payload.lon,
            payload.depth,
            payload.magnitude,
            payload.situational_report || null
          );
        }
      } catch (err) {
        console.warn('[Worker] Failed to parse WebSocket payload:', err);
      }
    };

    ws.onerror = (err) => {
      self.postMessage({ type: 'status', source: 'websocket', ok: false, detail: 'ERROR' });
    };

    ws.onclose = () => {
      self.postMessage({ type: 'status', source: 'websocket', ok: false, detail: 'DISCONNECTED' });
      wsFailCount++;
      const delay = Math.min(1000 * Math.pow(2, wsFailCount), WS_MAX_RETRY_DELAY);
      if (!wsReconnectTimeout) {
        wsReconnectTimeout = setTimeout(connectWebSocket, delay);
      }
    };
  } catch (e) {
    self.postMessage({ type: 'status', source: 'websocket', ok: false, detail: String(e) });
    wsFailCount++;
    const delay = Math.min(1000 * Math.pow(2, wsFailCount), WS_MAX_RETRY_DELAY);
    if (!wsReconnectTimeout) {
      wsReconnectTimeout = setTimeout(connectWebSocket, delay);
    }
  }
}

// ── USGS REST API Polling (Fallback Tier) ────────────────────────────────────

async function pollUSGS() {
  // 2h lookback to avoid missing events during brief network drops
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
      
      // Inject random mock situational reports for strong events (Mw >= 5.0) to test rendering pipelines
      let situational_report = null;
      if (f.properties.mag >= 5.0) {
        situational_report = {
          has_media: true,
          image_url: '/assets/media/gensan_structure_01.jpg',
          source: 'PH_STAR_VERIFIED',
          damage_classification: f.properties.mag >= 7.0 ? 'STRUCTURAL_COLLAPSE_LEVEL_4' : 'MODERATE_FISSURES_LEVEL_2'
        };
      }

      emitBinaryEvent(
        f.id,
        f.properties.place ?? 'Unknown region',
        f.properties.time ?? Date.now(),
        'USGS_POLL',
        lat,
        lon,
        depth ?? 10,
        f.properties.mag ?? 0,
        situational_report
      );
    }

    if (seenIds.size > 50_000) seenIds.clear();
    self.postMessage({ type: 'status', source: 'usgs', ok: true, detail: `${fresh} new` });
  } catch (err) {
    self.postMessage({ type: 'status', source: 'usgs', ok: false, detail: String(err) });
  }
}

// ── Precursor Channels Polling ───────────────────────────────────────────────

async function pollPrecursors() {
  if (!precursorEndpoints) return;

  for (const [channel, url] of Object.entries(precursorEndpoints)) {
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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
  connectWebSocket();
  pollUSGS();
  usgsTimer = setInterval(pollUSGS, usgsPollMs);
  precursorTimer = setInterval(pollPrecursors, 10 * 60_000);
}

function stop() {
  if (usgsTimer) clearInterval(usgsTimer);
  if (precursorTimer) clearInterval(precursorTimer);
  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = null;
  }
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
