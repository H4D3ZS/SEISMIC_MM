/**
 * main.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV — SEISMIC Movement Monitoring
 * Application Bootstrap & Orchestration Layer
 *
 * Initialisation sequence:
 *   1.  Spin up the SeismicMapEngine (WebGL context, RAF loop)
 *   2.  Build terrain grid and trench geometry
 *   3.  Fetch live catalog from USGS FDSNWS + PHIVOLCS (falls back to synthetic)
 *   4.  Upload catalog to GPU via SeismicCatalogRenderer (1 draw call)
 *   5.  Render all volcanic nodes with plume particle systems
 *   6.  Bind UIController (HUD, filters, timeline, live feed panel)
 *   7.  Bind RaycasterController (mouse picking)
 *   8.  Wire engine frame hook for animation + live tile texture updates
 *   9.  Start background polling — refetch live data every 5 minutes
 *  10.  Hide loading overlay
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SeismicMapEngine }          from './engine/SeismicMapEngine.js';
import { SeismicCatalogRenderer }    from './engine/SeismicCatalogRenderer.js';
import { VolcanicLayerRenderer }     from './engine/VolcanicLayerRenderer.js';
import { TrenchRenderer }            from './engine/TrenchRenderer.js';
import { TerrainGridRenderer }       from './engine/TerrainGridRenderer.js';
import { AdvancedGeospatialTerrain } from './engine/AdvancedGeospatialTerrain.js';
import { PlaceLabelRenderer }        from './engine/PlaceLabelRenderer.js';
import { HazardZoneRenderer }        from './engine/HazardZoneRenderer.js';
import { UIController }              from './controllers/UIController.js';
import { RaycasterController }       from './controllers/RaycasterController.js';
import { TelemetryBridge }           from './services/TelemetryBridge.js';
import { buildSyntheticCatalog }     from './data/CatalogDataService.js';
import { fetchLiveCatalog }          from './data/PhivolcsDataService.js';
import { getVolcanoCatalog }         from './data/VolcanoDataService.js';

// ── Service Worker (tile cache for offline resilience) ────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw-tiles.js').then(reg => {
    console.info('[CISV] Tile cache SW registered:', reg.scope);
  }).catch(err => {
    console.warn('[CISV] Tile cache SW registration failed (non-critical):', err);
  });
}

// Live-poll interval — 5 minutes matches PHIVOLCS bulletin update cadence
const LIVE_POLL_MS = 5 * 60 * 1000;

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {

  // ── 1. WebGL Engine ─────────────────────────────────────────────────────
  const container = document.getElementById('canvas-container');
  const engine    = new SeismicMapEngine(container);

  // ── 2. Sub-system construction ──────────────────────────────────────────
  const catalogRenderer   = new SeismicCatalogRenderer(engine);
  const volcanicRenderer  = new VolcanicLayerRenderer(engine);
  const trenchRenderer    = new TrenchRenderer(engine);
  const gridRenderer      = new TerrainGridRenderer(engine);
  const geospatialTerrain = new AdvancedGeospatialTerrain(engine);
  const placeLabels       = new PlaceLabelRenderer(engine);
  const hazardZones       = new HazardZoneRenderer(engine);

  // ── 3. Static geometry ──────────────────────────────────────────────────
  updateLoaderProgress(10, 'Building terrain reference grid…');
  gridRenderer.renderGrid();

  updateLoaderProgress(20, 'Rendering subduction trench geometry…');
  trenchRenderer.renderAllTrenches();

  // ── 4. Live seismic catalog ──────────────────────────────────────────────
  updateLoaderProgress(35, 'Connecting to PHIVOLCS / USGS live feed…');
  await yieldFrame();

  let catalogResult = await _loadCatalog();

  updateLoaderProgress(65, `Uploading ${catalogResult.count.toLocaleString()} events to GPU…`);
  await yieldFrame();

  catalogRenderer.renderBinarySeismicCatalog(catalogResult.buffer, catalogResult.pgaBuffer);

  // ── 5. Volcanic nodes ───────────────────────────────────────────────────
  updateLoaderProgress(80, 'Initializing volcanic arc nodes…');
  await yieldFrame();

  const volcanoCatalog = getVolcanoCatalog();
  for (const volcano of volcanoCatalog) {
    volcanicRenderer.addVolcanicNode(volcano);
  }

  // ── 6. UI Controller ────────────────────────────────────────────────────
  updateLoaderProgress(92, 'Binding HUD controllers…');
  await yieldFrame();

  const ui = new UIController({
    catalogRenderer,
    volcanicRenderer,
    trenchRenderer,
    gridRenderer,
    geospatialTerrain,
    engine,
    catalogBuffer:  catalogResult.buffer,
    liveEvents:     catalogResult.events,
    volcanoCatalog,
    dataSources:    catalogResult.sources,
  });

  ui.updateEventCount(catalogResult.count);
  ui.setDataSources(catalogResult.sources);
  ui.setLastFetchTime(new Date());

  // ── 7. Raycaster ────────────────────────────────────────────────────────
  const raycaster = new RaycasterController(engine, ui); // eslint-disable-line no-unused-vars

  // ── 8. Frame hook ────────────────────────────────────────────────────────
  const previousHook = engine.onBeforeRenderUpdate;

  engine.onBeforeRenderUpdate = (elapsed, delta) => {
    if (typeof previousHook === 'function') previousHook(elapsed, delta);
    ui.tickTimeline(delta);
    geospatialTerrain.update(elapsed, delta);
    placeLabels.update(elapsed, delta);
    hazardZones.update(elapsed, delta);
  };

  engine.onFPSUpdate(fps => ui.updateFPS(fps));

  // ── 9. Background polling ────────────────────────────────────────────────
  setInterval(async () => {
    console.info('[CISV] Background poll: refreshing live catalog…');
    ui.setFeedStatus('UPDATING…', 'pending');

    const fresh = await _loadCatalog();

    catalogRenderer.renderBinarySeismicCatalog(fresh.buffer, fresh.pgaBuffer);
    ui.updateCatalog(fresh.buffer, fresh.events);
    ui.updateEventCount(fresh.count);
    ui.setDataSources(fresh.sources);
    ui.setLastFetchTime(new Date());
    ui.setFeedStatus('LIVE', 'live');
    ui.refreshLiveFeedList(fresh.events);

    console.info(`[CISV] Poll complete — ${fresh.count} events.`);
  }, LIVE_POLL_MS);

  // ── 9a. Live telemetry bridge (worker: USGS 30 s stream + precursors) ───
  const telemetry = new TelemetryBridge();

  telemetry.onSeismicEvent(ev => {
    console.info(`[CISV] LIVE: Mw ${ev.magnitude?.toFixed(1)} — ${ev.place}`);
    geospatialTerrain.triggerPing(ev.latitude, ev.longitude, ev.magnitude);
    hazardZones.evaluateEvent(ev);   // liquefaction flash + tsunami geofence
  });

  telemetry.onFeedStatus((source, ok) => {
    if (source === 'usgs') ui.setFeedStatus(ok ? 'LIVE' : 'DEGRADED', ok ? 'live' : 'pending');
  });

  // ── 9b. Native Tauri bridge (desktop shell only; no-op in browser) ──────
  if (window.__TAURI__?.event) {
    window.__TAURI__.event.listen('realtime-seismic-stream', ({ payload }) => {
      const ev = typeof payload === 'string' ? JSON.parse(payload) : payload;
      console.info('[CISV] Native telemetry event:', ev);
      ui.setFeedStatus('LIVE (NATIVE)', 'live');
    });
    window.__TAURI__.event.listen('triage-critical-alert', ({ payload }) => {
      console.warn('[CISV] TRIAGE CRITICAL ALERT:', payload);
      ui.setFeedStatus('CRITICAL ALERT', 'pending');
    });
    console.info('[CISV] Tauri native bridge attached (siren + 30s telemetry active).');
  }

  // ── 10. Ready ────────────────────────────────────────────────────────────
  updateLoaderProgress(100, 'CISV ENGINE ONLINE');
  await yieldFrame(400);

  ui.hideLoader();
  ui.setFeedStatus('LIVE', 'live');
  ui.refreshLiveFeedList(catalogResult.events);

  console.info([
    '╔══════════════════════════════════════════╗',
    '║  CISV — SEISMIC Movement Monitoring       ║',
    '║  Philippine Geodynamic Command Map        ║',
    `║  Seismic events loaded : ${String(catalogResult.count).padStart(7)}           ║`,
    `║  Sources               : ${(catalogResult.sources.join('+') || 'SYNTHETIC').padEnd(10)}         ║`,
    `║  Volcanic nodes        :      ${volcanoCatalog.length}           ║`,
    '║  Render mode           : InstancedMesh   ║',
    '╚══════════════════════════════════════════╝',
  ].join('\n'));
}

// ── Catalog loader with fallback ──────────────────────────────────────────────

/**
 * Try live fetch first; fall back to synthetic catalog if network is unavailable.
 * Returns a unified result object.
 */
async function _loadCatalog() {
  try {
    const live = await fetchLiveCatalog({ minMag: 1.0, limitDays: 30 });

    if (live.count > 0) {
      return live;
    }

    console.warn('[CISV] Live feed returned 0 events — falling back to synthetic catalog.');
  } catch (err) {
    console.warn('[CISV] Live fetch error — falling back to synthetic catalog.', err.message);
  }

  // Synthetic fallback
  const synth = buildSyntheticCatalog();
  return {
    buffer:    synth.buffer,
    pgaBuffer: synth.pgaBuffer,
    count:     synth.count,
    events:    [],          // No LiveEvent metadata for synthetic data
    sources:   ['SYNTHETIC'],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateLoaderProgress(pct, msg) {
  const bar = document.getElementById('loader-bar');
  const sub = document.getElementById('loader-sub-text');
  if (bar) bar.style.width = `${pct}%`;
  if (sub && msg) sub.textContent = msg;
}

function yieldFrame(ms = 0) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      if (ms > 0) setTimeout(resolve, ms);
      else resolve();
    });
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

boot().catch(err => {
  console.error('CISV boot failed:', err);
  const overlay = document.getElementById('loading-overlay');
  const sub     = document.getElementById('loader-sub-text');
  const bar     = document.getElementById('loader-bar');
  if (bar) bar.style.background = '#ff1a44';
  if (sub) sub.textContent = `ENGINE FAULT: ${err.message}`;
  if (overlay) {
    const text = overlay.querySelector('.loader-text');
    if (text) { text.textContent = 'INITIALIZATION ERROR'; text.style.color = '#ff1a44'; }
  }
});
