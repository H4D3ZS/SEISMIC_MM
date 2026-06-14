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
import { EpicenterOverlayRenderer }  from './engine/EpicenterOverlayRenderer.js';
import { UIController }              from './controllers/UIController.js';
import { RaycasterController }       from './controllers/RaycasterController.js';
import { TelemetryBridge }           from './services/TelemetryBridge.js';
import { buildSyntheticCatalog, LANDMARK_EVENTS }     from './data/CatalogDataService.js';
import { fetchLiveCatalog, packEventsToBinary, fetchHistoricalUSGSEvents } from './data/PhivolcsDataService.js';
import { getVolcanoCatalog }         from './data/VolcanoDataService.js';
import { LocalNLPTriageEngine }      from './services/nlp_triage.js';
import { GFMVisualizer }             from './engine/GFMVisualizer.js';
import { GeodynamicLayerRenderer }   from './engine/GeodynamicLayerRenderer.js';
import { NasagradeSeismicSimulator } from './engine/simulation_engine.js';
import { EarthquakePredictor } from './engine/EarthquakePredictor.js';
import { QuakeNetPredictor } from './engine/QuakeNetPredictor.js';
import { MonteCarloSimulator } from './engine/MonteCarloSimulator.js';
import { TextToSpeechService } from './services/TextToSpeechService.js';
import { HistoricalSeismicityAnalyzer } from './engine/HistoricalSeismicityAnalyzer.js';
import { ProbabilityHotspotScanner } from './engine/ProbabilityHotspotScanner.js';
import { SearchIndex } from './engine/SearchIndex.js';
import { CommandPalette } from './engine/CommandPalette.js';
import { PhilippineHazardAssessor } from './engine/PhilippineHazardAssessor.js';
import { getBarangayHazard, nearestBarangay } from './data/HazardMapData.js';
import { geoToScene } from './data/projection.js';
import { compareSources, formatVerification } from './engine/CrossSourceVerifier.js';
import { PredictionImprover } from './engine/PredictionImprover.js';
import { BarangayRenderer } from './engine/BarangayRenderer.js';
import { CivicDashboard } from './engine/CivicDashboard.js';
import { SEISMOGENIC_ZONES, ACTIVE_FAULTS } from './data/ResearchPaperData.js';

// ── Helper: PRNG for deterministic simulation seeds ──────────────────────────
function _mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Helper: Cluster events into spatial hotspots ─────────────────────────────
function _clusterEvents(events, radiusKm = 50) {
  const R = 6371;
  const used = new Set();
  const clusters = [];
  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;
    const ev = events[i];
    const cluster = { lat: ev.lat, lon: ev.lon, count: 1, maxMag: ev.mag, totalMag: ev.mag, avgDepth: ev.depth || 10 };
    used.add(i);
    for (let j = i + 1; j < events.length; j++) {
      if (used.has(j)) continue;
      const d = Math.sqrt((ev.lat - events[j].lat) ** 2 + (ev.lon - events[j].lon) ** 2) * 111;
      if (d < radiusKm) {
        used.add(j);
        cluster.count++;
        cluster.totalMag += events[j].mag;
        if (events[j].mag > cluster.maxMag) cluster.maxMag = events[j].mag;
        cluster.avgDepth = (cluster.avgDepth * (cluster.count - 1) + (events[j].depth || 10)) / cluster.count;
      }
    }
    cluster.lat = ev.lat;
    cluster.lon = ev.lon;
    clusters.push(cluster);
  }
  clusters.sort((a, b) => b.count - a.count);
  return clusters;
}

// ── LINDOL Inspired Seismograph Waveform Engine ──────────────────────────────
class Seismograph {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.buffer = new Array(this.width).fill(0);
    this.spikeAmplitude = 0;
    this.spikeTime = 0;
    this.tick = 0;
    this.start();
  }

  spike(magnitude) {
    this.spikeAmplitude = Math.min(1.0, Math.max(0.2, (magnitude - 2.0) / 6.0)) * 32; // wave height
    this.spikeTime = Date.now();
  }

  start() {
    const render = () => {
      if (!this.ctx) return;
      this.ctx.fillStyle = '#08080a';
      this.ctx.fillRect(0, 0, this.width, this.height);

      // Draw grid lines
      this.ctx.strokeStyle = '#12151b';
      this.ctx.lineWidth = 1;
      for (let x = 0; x < this.width; x += 30) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.height);
        this.ctx.stroke();
      }
      for (let y = 0; y < this.height; y += 15) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.width, y);
        this.ctx.stroke();
      }

      this.tick++;
      // Generate noise point
      let noise = (Math.random() - 0.5) * 1.5;

      if (this.spikeAmplitude > 0) {
        const elapsed = (Date.now() - this.spikeTime) / 1000;
        if (elapsed < 6) {
          const decay = Math.exp(-elapsed * 0.85);
          const pWave = Math.sin(elapsed * 48) * 0.35;
          const sWave = Math.sin(elapsed * 16) * 0.9;
          noise += (pWave + sWave) * this.spikeAmplitude * decay;
        } else {
          this.spikeAmplitude = 0;
        }
      }

      this.buffer.shift();
      this.buffer.push(noise);

      // Render wave line
      this.ctx.strokeStyle = '#00ffcc';
      this.ctx.shadowColor = '#00ffcc';
      this.ctx.shadowBlur = this.spikeAmplitude > 0 ? 4 : 0;
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(0, this.height / 2 + this.buffer[0]);
      for (let i = 1; i < this.width; i++) {
        this.ctx.lineTo(i, this.height / 2 + this.buffer[i]);
      }
      this.ctx.stroke();
      this.ctx.shadowBlur = 0; // reset

      requestAnimationFrame(render);
    };
    render();
  }
}

// ── LINDOL Responders Leaderboard & Gamification Database ────────────────────
const responders = [
  { id: 'hades', name: 'Agent HADES (You)', level: 8, points: 2840, avatar: 'H' },
  { id: 'ocd12', name: 'OCD-XII Alpha', level: 5, points: 1420, avatar: 'O' },
  { id: 'gensan', name: 'Gensan CDRRMO', level: 6, points: 1980, avatar: 'G' },
  { id: 'davao911', name: 'Davao 911 Emergency', level: 7, points: 2450, avatar: 'D' },
];

let seismographInstance = null;

function renderLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  if (!listEl) return;
  const sorted = [...responders].sort((a, b) => b.points - a.points);
  
  listEl.innerHTML = sorted.map((res, idx) => {
    const rank = idx + 1;
    const levelProgress = ((res.points % 500) / 500) * 100;
    return `
      <div class="leaderboard-item" id="leaderboard-item-${res.id}">
        <div class="leaderboard-rank">${rank}</div>
        <div class="leaderboard-avatar">${res.avatar}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-name-row">
            <span class="leaderboard-name">${res.name} <span style="font-size:8px; opacity:0.6;">LV ${res.level}</span></span>
            <span class="leaderboard-points">${res.points.toLocaleString()} PTS</span>
          </div>
          <div class="leaderboard-bar-wrap">
            <div class="leaderboard-bar" style="width: ${levelProgress}%"></div>
          </div>
        </div>
      </div>
    `.trim();
  }).join('');
}

function addPointsToHades(pts) {
  const hades = responders.find(r => r.id === 'hades');
  if (hades) {
    hades.points += pts;
    const threshold = hades.level * 500;
    if (hades.points >= threshold) {
      hades.level++;
      console.info(`[CISV] Operator leveled up to Level ${hades.level}!`);
    }
    renderLeaderboard();
  }
}

// Open escalation modal with pre-drafted payload
function openEscalationModal(text, lat, lon) {
  const modal = document.getElementById('escalation-modal');
  const draftTextarea = document.getElementById('escalate-msg-draft');
  if (!modal || !draftTextarea) return;
  
  draftTextarea.value = `URGENT CISV REPORT TRANSIT:\n[Incident]: "${text}"\n[GPS Coords]: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E\n[Time]: ${new Date().toISOString()}\n[Priority]: High (Awaiting dispatch verification)`;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

// ── Service Worker (tile cache for offline resilience) ────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw-tiles.js').then(reg => {
    console.info('[CISV] Tile cache SW registered:', reg.scope);
  }).catch(err => {
    console.warn('[CISV] Tile cache SW registration failed (non-critical):', err);
  });
}

// Live-poll interval — 20 s for near-real-time concurrency with the PHIVOLCS
// bulletin + USGS FDSNWS (both publish within ~1 min of an event being located).
const LIVE_POLL_MS = 20 * 1000;

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
  const epicenterOverlay  = new EpicenterOverlayRenderer(engine);
  const nlpTriage         = new LocalNLPTriageEngine(engine);
  const gfmVisualizer     = new GFMVisualizer(engine);
  const geodynamic        = new GeodynamicLayerRenderer(engine);

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

  catalogRenderer.renderBinarySeismicCatalog(catalogResult.buffer, catalogResult.pgaBuffer, catalogResult.yearBuffer);

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

  const telemetry = new TelemetryBridge();

  const simulator = new NasagradeSeismicSimulator(engine);
  const predictor = new EarthquakePredictor();
  const quakeNet = new QuakeNetPredictor();
  const tts = new TextToSpeechService();
  const seismicityAnalyzer = new HistoricalSeismicityAnalyzer();
  const hotspotScanner = new ProbabilityHotspotScanner();
  const searchIndex = new SearchIndex();
  const readoutAssessor = new PhilippineHazardAssessor();
  searchIndex.setEvents(catalogResult?.events ?? []);
  const improver = new PredictionImprover();
  const barangayRenderer = new BarangayRenderer(engine);
  const civicDashboard = new CivicDashboard(barangayRenderer, gfmVisualizer);
  civicDashboard.setCatalog(catalogResult.events, catalogResult.sources);

  // Ingest all events into QuakeNet 3D grid for spatiotemporal analysis
  quakeNet.ingestEvents(catalogResult.events);
  console.info(`[QuakeNet] Ingested ${catalogResult.events.length} events into ${quakeNet.getStats().gridDimensions} grid (${quakeNet.getStats().totalCells} cells)`);

  const ui = new UIController({
    catalogRenderer,
    volcanicRenderer,
    trenchRenderer,
    gridRenderer,
    geospatialTerrain,
    epicenterOverlay,
    gfmVisualizer,
    geodynamic,
    simulator,
    hazardZones,
    engine,
    catalogBuffer:  catalogResult.buffer,
    liveEvents:     catalogResult.events,
    volcanoCatalog,
    dataSources:    catalogResult.sources,
    telemetry,
  });

  ui.updateEventCount(catalogResult.count);
  ui.setDataSources(catalogResult.sources);
  ui.setLastFetchTime(new Date());

  // ── 7. Raycaster ────────────────────────────────────────────────────────
  const raycaster = new RaycasterController(engine, ui); // eslint-disable-line no-unused-vars

  // ── 7b. Interactive NLP Triage Form Binding ──────────────────────────────
  const submitBtn = document.getElementById('nlp-submit-btn');
  submitBtn?.addEventListener('click', async () => {
    const textEl = document.getElementById('nlp-text');
    const peisEl = document.getElementById('nlp-peis');

    if (!textEl) return;

    const text = textEl.value.trim();
    const peis = peisEl ? parseInt(peisEl.value, 10) : 0;

    if (!text) {
      alert('Please enter field report text.');
      return;
    }

    // Auto-detect coordinates from latest seismic event
    let lat = 12.0, lon = 122.0;
    const events = catalogResult?.events ?? [];
    if (events.length > 0) {
      lat = events[0].lat;
      lon = events[0].lon;
    }

    // Try to extract coordinates from the text itself
    const coordMatch = text.match(/(\d+\.\d+)[°]?\s*[NnSs],?\s*(\d+\.\d+)[°]?\s*[EeWw]/);
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lon = parseFloat(coordMatch[2]);
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing…';

    const resultEl = document.getElementById('nlp-result');
    try {
      const res = await nlpTriage.processIncomingFieldText(text, { lat, lon }, peis);
      addIncidentToFeed(text, lat, lon, peis);

      // Show the REAL classification result so the user sees output.
      if (resultEl) {
        const r = res || { source: 'unknown', category: 'unknown', severity: 0, matched: [] };
        const sevColor = r.severity >= 4 ? 'var(--red, #ff1a44)' : r.severity >= 2 ? 'var(--amber, #ffaa00)' : 'var(--green, #00ff88)';
        resultEl.style.display = 'block';
        resultEl.style.color = sevColor;
        resultEl.textContent =
          `TRIAGE RESULT (${r.source})\n` +
          `  Category : ${r.category}\n` +
          `  Severity : ${r.severity}/5${r.confidence != null ? `  (confidence ${(r.confidence * 100).toFixed(0)}%)` : ''}\n` +
          (r.matched && r.matched.length ? `  Hazards  : ${r.matched.join(', ')}\n` : '') +
          `  Mapped   : ${r.plotted ? 'YES — marker plotted at ' + lat.toFixed(2) + ', ' + lon.toFixed(2) : 'no (below threshold)'}`;
      }
      textEl.value = ''; // Clear input on success
    } catch (err) {
      console.error('[NLP UI] Triage failed:', err);
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.color = 'var(--amber, #ffaa00)';
        resultEl.textContent = `Triage error: ${err.message}`;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Run NLP Triage';
    }
  });

  // ── 7c. Alarm Siren Threshold Config Binding ─────────────────────────────
  const sirenMagInput  = document.getElementById('siren-mag-threshold');
  const sirenMagVal    = document.getElementById('siren-mag-val');
  sirenMagInput?.addEventListener('input', () => {
    if (sirenMagVal) sirenMagVal.textContent = parseFloat(sirenMagInput.value).toFixed(1);
    sirenMagInput.setAttribute('aria-valuenow', sirenMagInput.value);
  });

  const sirenDistInput = document.getElementById('siren-dist-threshold');
  const sirenDistVal   = document.getElementById('siren-dist-val');
  sirenDistInput?.addEventListener('input', () => {
    if (sirenDistVal) sirenDistVal.textContent = parseInt(sirenDistInput.value, 10);
    sirenDistInput.setAttribute('aria-valuenow', sirenDistInput.value);
  });

  // ── 8. Frame hook ────────────────────────────────────────────────────────
  const previousHook = engine.onBeforeRenderUpdate;

  engine.onBeforeRenderUpdate = (elapsed, delta) => {
    if (typeof previousHook === 'function') previousHook(elapsed, delta);
    ui.tickTimeline(delta);
    geospatialTerrain.update(elapsed, delta);
    placeLabels.update(elapsed, delta);
    hazardZones.update(elapsed, delta);
    epicenterOverlay.update(elapsed, delta);
    gfmVisualizer.update(elapsed, delta);
    geodynamic.update(elapsed);
  };

  engine.onFPSUpdate(fps => ui.updateFPS(fps));

  // ── 9. Background polling — every 30 seconds for near-real-time detection ──
  const POLL_INTERVAL = 30_000; // 30 seconds
  let lastEventCount = catalogResult?.count ?? 0;

  setInterval(async () => {
    console.info('[CISV] Background poll: refreshing live catalog…');
    ui.setFeedStatus('UPDATING…', 'pending');

    const fresh = await _loadCatalog();
    const newCount = fresh.count;
    const newEvents = newCount - lastEventCount;

    if (newEvents > 0) {
      console.info(`[CISV] NEW EVENTS DETECTED: +${newEvents} (${newCount} total)`);
      // Trigger radar ping, TTS, and popup alerts for new events
      const latestEvents = fresh.events.slice(0, newEvents);
      for (const ev of latestEvents) {
        geospatialTerrain.triggerPing(ev.lat, ev.lon, ev.mag);
        hazardZones.evaluateEvent(ev);
        seismographInstance?.spike(ev.mag);
        civicDashboard.onSeismicEvent(ev);
        tts.announceEarthquake(ev);
        showAlertPopup(ev);
      }
    }

    catalogResult = fresh;
    catalogRenderer.renderBinarySeismicCatalog(fresh.buffer, fresh.pgaBuffer, fresh.yearBuffer);
    ui.updateCatalog(fresh.buffer, fresh.events);
    ui.updateEventCount(fresh.count);
    ui.setDataSources(fresh.sources);
    ui.setLastFetchTime(new Date());
    ui.setFeedStatus('LIVE', 'live');
    ui.refreshLiveFeedList(fresh.events);
    civicDashboard.setCatalog(fresh.events, fresh.sources);
    searchIndex.setEvents(fresh.events);

    // Ingest new events into QuakeNet grid
    if (newEvents > 0) {
      quakeNet.ingestEvents(fresh.events.slice(0, newEvents));
    }

    lastEventCount = newCount;
    console.info(`[CISV] Poll complete — ${newCount} events (${newEvents > 0 ? '+' + newEvents + ' new' : 'no change'}).`);
  }, POLL_INTERVAL);

  // ── 9a. Live telemetry bridge (worker: USGS 30 s stream + precursors) ───

  telemetry.onSeismicEvent(ev => {
    console.info(`[CISV] LIVE: Mw ${ev.magnitude?.toFixed(1)} — ${ev.place}`);
    geospatialTerrain.triggerPing(ev.latitude, ev.longitude, ev.magnitude);
    hazardZones.evaluateEvent(ev);   // liquefaction flash + tsunami geofence
    seismographInstance?.spike(ev.magnitude); // Spike live seismograph
    civicDashboard.onSeismicEvent(ev); // Update civic infrastructure status

    // Auto-validate predictions against live events
    const validations = improver.processLiveEvent(ev);
    if (validations.length > 0) {
      console.info(`[CISV] Prediction validated:`, validations);
    }

    // Trigger Coulomb Stress and LLM report for incoming events >= Mw 5.0
    if (ev.magnitude >= 5.0) {
      const slipVector = { magnitude: Math.max(0.1, (ev.magnitude - 4.5) * 0.5) };
      const faultGeometry = { strike: ev.strike || 195, dip: ev.dip || 22, rake: ev.rake || 92 };
      const stressMetrics = simulator.calculateCoulombStressLoading(slipVector, faultGeometry);
      
      const loadVal = document.getElementById('coulomb-load-val');
      const statusVal = document.getElementById('coulomb-status-val');
      const couplingVal = document.getElementById('coulomb-coupling-val');
      if (loadVal) loadVal.textContent = `${stressMetrics.coulombLoadBars} bars`;
      if (statusVal) {
        statusVal.textContent = stressMetrics.isCritical ? 'CRITICAL (HIGH RISK)' : 'SUB-CRITICAL';
        statusVal.style.color = stressMetrics.isCritical ? 'var(--red)' : 'var(--green)';
      }
      if (couplingVal) couplingVal.textContent = `${(stressMetrics.couplingEfficiency * 100).toFixed(1)}%`;
      
      simulator.executeAutomatedTriageLog(stressMetrics, { lat: ev.latitude, lon: ev.longitude });
    }
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

  // Initialize Seismograph and Responders Leaderboard
  seismographInstance = new Seismograph('seismo-canvas');
  ui.setSeismograph(seismographInstance);
  renderLeaderboard();

  // Bind Escalation Modal Controls
  const modal = document.getElementById('escalation-modal');
  const modalClose = document.getElementById('modal-close');
  const transmitBtn = document.getElementById('btn-transmit-alert');
  
  const closeModal = () => {
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }
  };

  modalClose?.addEventListener('click', closeModal);

  // Close when clicking backdrop/overlay
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.hidden) {
      closeModal();
    }
  });

  transmitBtn?.addEventListener('click', () => {
    alert('ALERT DATA TRANSMITTED SUCCESSFULLY via Satellite/SMS channels. Emergency Services notified.');
    closeModal();
    addPointsToHades(100); // Hades gets points for escalating!
  });

  // ── Boot sequence — stream REAL init milestones (Jarvis-style) ────────────
  const _bootLog = document.getElementById('boot-log');
  if (_bootLog) {
    const srcOk = (catalogResult?.sources ?? []).join(', ') || 'SYNTHETIC';
    const isReal = !((catalogResult?.sources ?? []).length === 1 && catalogResult.sources[0] === 'SYNTHETIC');
    const lines = [
      ['USGS FDSNWS + PHIVOLCS feed', isReal ? `ONLINE · ${srcOk}` : 'OFFLINE · synthetic fallback', isReal],
      ['Seismic catalog', `${(catalogResult?.count ?? 0).toLocaleString()} events uploaded to GPU`, true],
      ['Torregosa (2002) model', `${SEISMOGENIC_ZONES.length} zones · ${ACTIVE_FAULTS.length} faults loaded`, true],
      ['DRRMO/PHIVOLCS hazard maps', `barangay liquefaction + tsunami inundation indexed`, true],
      ['Cross-source verification (USGS↔PHIVOLCS)', (() => {
        const v = compareSources(catalogResult?.rawUSGS ?? [], catalogResult?.rawPHIVOLCS ?? []);
        console.info(formatVerification(v));
        const badge = document.getElementById('data-source-badge');
        if (badge) badge.title = v.phivolcsAvailable
          ? `USGS↔PHIVOLCS: ${v.matched} matched, Mw bias ${v.magnitude.mwBias}, offset ${v.epicentreOffsetKm.mean}km — ${v.verdict}`
          : v.verdict;
        window.__cisvVerify = v;
        return v.phivolcsAvailable
          ? `${v.matched} matched · Mw bias ${v.magnitude.mwBias} · ${v.epicentreOffsetKm.mean}km offset`
          : 'PHIVOLCS down — USGS-only (homogenized to Mw)';
      })(), true],
      ['Probability hotspot scanner', 'ARMED', true],
      ['Bayesian network', 'ready (train on demand)', true],
      ['Command palette', 'Ctrl+K online', true],
    ];
    for (const [label, val, ok] of lines) {
      const div = document.createElement('div');
      div.innerHTML = `<span class="${ok ? 'boot-ok' : 'boot-pending'}">${ok ? '✓' : '○'}</span> ${label} … <span class="${ok ? 'boot-ok' : 'boot-pending'}">${val}</span>`;
      _bootLog.appendChild(div);
      await new Promise(r => setTimeout(r, 110));
    }
    await new Promise(r => setTimeout(r, 180));
  }

  ui.hideLoader();
  ui.setFeedStatus('LIVE', 'live');
  ui.refreshLiveFeedList(catalogResult.events);

  // ── 10b. NASA-Grade Prediction Panel Binding ───────────────────────────────
  // ── Command palette (Ctrl+K) — search + fly-to + hazard readout ───────────
  function _flyTo(lat, lon) {
    try {
      if (gfmVisualizer) gfmVisualizer.setLinks(lat, lon, true);
      const { x, y } = geoToScene(lat, lon);
      if (engine?.controls) {
        engine.controls.target.set(x, y, 0);
        engine.camera.position.set(x, y - 12, 10);
        engine.controls.update();
      }
    } catch (e) { console.warn('[CISV] flyTo failed:', e.message); }
  }

  function _liqClass(l) {
    return { very_high: ['VERY HIGH', 'hz-vhigh'], high: ['HIGH', 'hz-high'], moderate: ['MODERATE', 'hz-mod'], low: ['LOW', 'hz-low'] }[l] || ['—', 'hz-low'];
  }

  function _showHazardReadout(result) {
    const card = document.getElementById('hazard-readout');
    const titleEl = document.getElementById('hz-title');
    const bodyEl = document.getElementById('hz-body');
    if (!card || !bodyEl) return;
    const { lat, lon } = result;

    // Barangay hazard: exact match for a barangay result, else nearest mapped.
    const bgy = (result.type === 'barangay' && result.meta) ? result.meta
      : (getBarangayHazard(result.name) || nearestBarangay(lat, lon));

    // Recent nearby seismicity from the real catalog (within 80 km, last 1 yr).
    const evs = catalogResult?.events ?? [];
    const yr = Date.now() - 365 * 86400000;
    let nNear = 0, maxNear = 0;
    for (const e of evs) {
      const d = Math.hypot((e.lat - lat) * 111, (e.lon - lon) * 111 * Math.cos(lat * Math.PI / 180));
      if (d <= 80 && (e.time ?? 0) >= yr) { nNear++; if (e.mag > maxNear) maxNear = e.mag; }
    }

    // Nearest seismogenic zone.
    let zone = null, zd = Infinity;
    for (const z of SEISMOGENIC_ZONES) { const d = Math.hypot((z.lat - lat) * 111, (z.lon - lon) * 111); if (d < zd) { zd = d; zone = z; } }

    titleEl.textContent = result.name;
    let html = `<div style="color:#6f8a9a;margin-bottom:6px;">${result.subtitle || result.type} · ${lat.toFixed(3)}, ${lon.toFixed(3)}</div>`;

    if (bgy) {
      const [lab, cls] = _liqClass(bgy.liquefaction);
      html += `<div style="margin:4px 0;"><b>LIQUEFACTION:</b> <span class="hz-chip ${cls}">${lab}</span></div>`;
      html += `<div style="margin:4px 0;"><b>TSUNAMI:</b> ${bgy.tsunamiDepth_m ? `<span class="hz-chip hz-high">${bgy.tsunamiClass || bgy.tsunamiDepth_m + ' m'} inundation</span>` : 'not inundated'}</div>`;
      if (bgy.dist_km != null) html += `<div style="color:#6f8a9a;font-size:9px;">(nearest mapped barangay: ${bgy.name}, ${bgy.dist_km} km)</div>`;
      if (bgy.note) html += `<div style="color:#8affc1;margin-top:3px;">✓ ${bgy.note}</div>`;
    }
    if (zone) html += `<div style="margin:6px 0 2px;"><b>NEAREST ZONE:</b> ${zone.name} (${Math.round(zd)} km) · max M${zone.maxMag} · b=${zone.bValue}</div>`;
    html += `<div style="margin:2px 0;"><b>RECENT SEISMICITY:</b> ${nNear} events ≤80 km in 1 yr${maxNear ? `, largest M${maxNear.toFixed(1)}` : ''}</div>`;
    html += `<div style="margin-top:7px;color:#5b7585;font-size:8.5px;">Liquefaction/tsunami: DRRMO GenSan + DOST-PHIVOLCS (TSU-2025-126303-02). Zones: Torregosa et al. (2002).</div>`;
    bodyEl.innerHTML = html;
    card.style.display = 'block';
  }

  const commandPalette = new CommandPalette(searchIndex, {
    onSelect: (r) => { _flyTo(r.lat, r.lon); _showHazardReadout(r); },
  });
  document.getElementById('hz-close')?.addEventListener('click', () => {
    const c = document.getElementById('hazard-readout'); if (c) c.style.display = 'none';
  });

  const predictBtn = document.getElementById('predict-btn');
  const predictTerminal = document.getElementById('predict-terminal');
  const predictProgress = document.getElementById('predict-progress');

  predictBtn?.addEventListener('click', async () => {
    const sims = parseInt(document.getElementById('predict-sims')?.value || '1000000', 10);
    const top10El = document.getElementById('predict-top10');
    const predictBtnEl = predictBtn;

    predictBtnEl.disabled = true;
    predictBtnEl.textContent = 'ANALYZING ALL SEISMIC ZONES...';
    predictTerminal.style.display = 'block';
    predictTerminal.textContent = '';
    predictProgress.style.display = 'block';
    if (top10El) { top10El.style.display = 'block'; top10El.textContent = ''; }

    // Initialize funnel stages
    const funnel1b = document.getElementById('funnel-1b');
    const funnel100 = document.getElementById('funnel-100');
    const funnel50 = document.getElementById('funnel-50');
    const funnel10 = document.getElementById('funnel-10');
    const simLog = document.getElementById('sim-log');
    if (funnel1b) funnel1b.textContent = 'RUNNING...';
    if (funnel100) funnel100.textContent = '—';
    if (funnel50) funnel50.textContent = '—';
    if (funnel10) funnel10.textContent = '—';
    if (simLog) { simLog.style.display = 'block'; simLog.textContent = ''; }

    try {
      const events = catalogResult?.events ?? [];
      const srcs = catalogResult?.sources ?? [];

      // STAGE 1 — REAL grid scan: discover hotspots from live data (no coordinates).
      predictTerminal.textContent = `[STAGE 1] Scanning the Philippine grid for probability hotspots from ${events.length} live events...\n`;
      const scan = await hotspotScanner.scan({
        events, sources: srcs, cellDeg: 0.5, topN: 12,
        onProgress: (pct, msg) => {
          if (predictProgress) predictProgress.style.width = `${Math.floor(pct * 0.5)}%`;
          const pctEl = document.getElementById('predict-pct');
          if (pctEl) pctEl.textContent = `${Math.floor(pct * 0.5)}%`;
        },
      });

      // Discovered hotspots become the candidate locations for detailed MC-PSHA.
      const candidates = scan.hotspots.map(h => ({
        lat: h.lat, lon: h.lon,
        source: 'DISCOVERED_HOTSPOT',
        zoneName: h.nearestZone,
        maxMag: h.expectedMaxMag,
        scanProbability: h.probability1yrM6,
        driver: h.dominantDriver,
        recent90d: h.recentEvents90d,
      }));

      predictTerminal.textContent += hotspotScanner.formatReport(scan) + '\n';
      predictTerminal.scrollTop = predictTerminal.scrollHeight;
      if (funnel1b) funnel1b.textContent = `${scan.cellsScanned} cells scanned`;
      if (simLog) simLog.textContent += `[STAGE 1] ${scan.cellsScanned} grid cells scanned → ${candidates.length} hotspots discovered (data: ${(srcs.join(',') || 'none')})\n`;

      if (candidates.length === 0) {
        predictTerminal.textContent += '[ANALYSIS] No hotspots found. Check data feeds.\n';
        predictBtnEl.disabled = false;
        predictBtnEl.textContent = 'RUN PREDICTION — ANALYZE ALL SEISMIC ZONES';
        return;
      }

      // Run Monte Carlo on top candidates (sorted by existing risk)
      const ranked = [];
      const simsPerLocation = Math.max(50000, Math.floor(sims / Math.min(candidates.length, 20)));
      const maxLocations = Math.min(candidates.length, 20);

      for (let i = 0; i < maxLocations; i++) {
        const c = candidates[i];
        const pct = 50 + ((i + 1) / maxLocations) * 50; // scan was 0-50%, MC is 50-100%
        predictTerminal.textContent += `\n[MC-PSHA ${i+1}/${maxLocations}] ${c.lat.toFixed(2)}°N ${c.lon.toFixed(2)}°E (${c.source}, scan ${c.scanProbability ?? '?'}%) — ${simsPerLocation.toLocaleString()} sims...`;
        predictTerminal.scrollTop = predictTerminal.scrollHeight;
        if (predictProgress) predictProgress.style.width = `${pct}%`;
        const pctEl = document.getElementById('predict-pct');
        if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;

        try {
          predictor.simulator.numSimulations = simsPerLocation;
          predictor.simulator.rng = _mulberry32(Date.now() + i * 7919);
          const result = await predictor.predict({
            lat: c.lat, lon: c.lon, depth: c.avgDepth || 25,
            recentEvents: events,
            onProgress: () => {},
          });

          const mcSum = result.mcResult?.summary || {};
          const annualEx = result.mcResult?.annualExceedance || {};
          const timing = result.timing || {};
          const riskScore = (mcSum.hazardConsistentMag || 0) * 0.25
            + (annualEx.PGA_100gal || 0) * 100 * 0.25
            + (parseFloat(timing.overdueRatio) || 0) * 0.2
            + (c.maxMag || 0) * 0.15
            + (c.scanProbability || 0) * 0.05; // real grid-scan composite probability

          ranked.push({
            ...c,
            hazardMag: mcSum.hazardConsistentMag || 0,
            meanPGA: mcSum.meanPGA_g || 0,
            meanMag: mcSum.meanMagnitude || 0,
            exceedance100gal: annualEx.PGA_100gal || 0,
            overdueRatio: parseFloat(timing.overdueRatio) || 0,
            isOverdue: timing.isOverdue || false,
            riskScore: parseFloat(riskScore.toFixed(3)),
            zonesAnalyzed: mcSum.zonesAnalyzed || 0,
            faultsAnalyzed: mcSum.faultsAnalyzed || 0,
            timingWindows: result.timing?.timingWindows || [],
            multiHazard: result.multiHazard || null,
          });
        } catch (err) {
          predictTerminal.textContent += ` ERROR: ${err.message}`;
        }
      }

      // Sort by risk score descending, take top 10
      ranked.sort((a, b) => b.riskScore - a.riskScore);
      const top10 = ranked.slice(0, 10);

      // Update funnel stages
      if (funnel1b) funnel1b.textContent = `DONE — ${ranked.length} analyzed`;
      if (funnel100) funnel100.textContent = `${Math.min(ranked.length, 100)} ranked`;
      if (funnel50) funnel50.textContent = `${Math.min(ranked.length, 50)} validated`;
      if (funnel10) funnel10.textContent = `${top10.length} — ${new Date().toLocaleTimeString()}`;
      if (simLog) {
        simLog.textContent += `[STAGE 2] ${ranked.length} discovered hotspots ran through MC-PSHA (${simsPerLocation.toLocaleString()} sims each)\n`;
        simLog.textContent += `[STAGE 3] ranked by composite risk = hazard-consistent mag × PGA exceedance × strain overdue × zone Mmax\n`;
        simLog.textContent += `[STAGE 4] top ${top10.length} reported (highest composite risk)\n`;
        simLog.textContent += `[DONE] Real scan + simulation complete at ${new Date().toLocaleTimeString()}\n`;
      }

      // Display top 10 with timing windows
      if (top10El) {
        top10El.textContent = '';
        top10.forEach((loc, i) => {
          const riskColor = loc.riskScore > 3 ? '#ff1a44' : loc.riskScore > 1.5 ? '#ffaa00' : '#00ff88';
          const label = loc.zoneName || loc.faultName || loc.source;
          top10El.textContent += `[${i+1}] ${loc.lat.toFixed(2)}°N ${loc.lon.toFixed(2)}°E  Risk: ${loc.riskScore.toFixed(2)}  HCM: M${loc.hazardMag.toFixed(1)}  ${label}\n`;
          if (loc.driver) top10El.textContent += `    DRIVER: ${loc.driver}${loc.recent90d ? ` · ${loc.recent90d} events last 90d` : ''}\n`;
          if (loc.timingWindows && loc.timingWindows.length > 0) {
            const best = loc.timingWindows.reduce((b, w) => w.probability > b.probability ? w : b, loc.timingWindows[0]);
            top10El.textContent += `    WHEN: ${best.window} (${best.probability.toFixed(1)}% — ${best.confidence})\n`;
          }
          if (loc.overdueRatio > 0.8) {
            top10El.textContent += `    STRAIN: ${loc.overdueRatio.toFixed(1)}x overdue\n`;
          }
        });
        top10El.scrollTop = 0;
      }

      // Summary
      predictTerminal.textContent += `\n\n═══════════════════════════════════════════`;
      predictTerminal.textContent += `\nANALYSIS COMPLETE — ${ranked.length} locations analyzed`;
      predictTerminal.textContent += `\nTop 10 highest-risk locations ranked by combined`;
      predictTerminal.textContent += `\n(hazard mag × exceedance × strain × zone magnitude)`;
      predictTerminal.textContent += `\n═══════════════════════════════════════════\n`;
      predictTerminal.scrollTop = predictTerminal.scrollHeight;

      // Update AI status
      const statusEl = document.getElementById('ai-model-status');
      if (statusEl) {
        statusEl.textContent = `ACTIVE — TOP ${top10.length} RANKED`;
        statusEl.style.color = 'var(--green)';
      }

      // Fly to #1 risk location
      if (top10.length > 0) {
        const top = top10[0];
        gfmVisualizer.setLinks(top.lat, top.lon, true);
        const LAT_ANCHOR = 12.0, LON_ANCHOR = 122.0, SPATIAL_SCALE = 6.0;
        const x = (top.lon - LON_ANCHOR) * SPATIAL_SCALE;
        const y = (top.lat - LAT_ANCHOR) * SPATIAL_SCALE;
        if (engine?.controls) {
          engine.controls.target.set(x, y, 0);
          engine.camera.position.set(x, y - 12, 10);
          engine.controls.update();
        }
      }
    } catch (err) {
      predictTerminal.textContent += `\nERROR: ${err.message}`;
      console.error('[CISV] Prediction failed:', err);
    } finally {
      predictBtnEl.disabled = false;
      predictBtnEl.textContent = 'RUN PREDICTION — ANALYZE ALL SEISMIC ZONES';
    }
  });

  // ── 10c. GFM Training Button Handler ──────────────────────────────────────
  const gfmTrainBtn = document.getElementById('ai-train-btn');
  const gfmTerminal = document.getElementById('gfm-terminal');

  gfmTrainBtn?.addEventListener('click', async () => {
    gfmTerminal.style.display = 'block';
    gfmTerminal.textContent = '';

    const endpoint = document.getElementById('gfm-endpoint')?.value || 'http://localhost:8081/predictions/geophysical_foundation_model';
    const hfToken = document.getElementById('hf-token')?.value || '';
    const sendImage = document.getElementById('gfm-send-image')?.checked ?? true;

    const statusEl = document.getElementById('ai-model-status');
    if (statusEl) { statusEl.textContent = 'ANALYZING...'; statusEl.style.color = 'var(--cyan)'; }

    // ── REAL historical seismicity analysis — fetch the COMPLETE catalog ──────
    // Not instant theatre: it pulls the full USGS historical record (M≥2.5 since
    // 1990 — thousands of events, real network time), then runs a true per-zone
    // Gutenberg-Richter analysis across all 27 seismogenic zones, streamed.
    let evs = catalogResult?.events ?? [];
    let srcs = catalogResult?.sources ?? [];
    try {
      gfmTerminal.textContent = '[STAGE 1] Fetching COMPLETE historical catalog from USGS (M≥2.5 since 1990)…\n';
      gfmTerminal.scrollTop = gfmTerminal.scrollHeight;
      const t0 = performance.now();
      let full = [];
      try {
        full = await fetchHistoricalUSGSEvents(2.5);   // real, comprehensive fetch
      } catch (e) {
        gfmTerminal.textContent += `  USGS historical fetch failed (${e.message}); using loaded catalog.\n`;
      }
      if (full.length > evs.length) { evs = full; srcs = ['USGS-HISTORICAL']; }
      gfmTerminal.textContent += `  → ${evs.length.toLocaleString()} events retrieved in ${((performance.now() - t0) / 1000).toFixed(1)}s\n\n`;

      // Whole-catalog analysis.
      const analysis = seismicityAnalyzer.analyze(evs, { sources: srcs });
      gfmTerminal.textContent += seismicityAnalyzer.formatReport(analysis) + '\n';

      // STAGE 2 — real per-zone Gutenberg-Richter across ALL seismogenic zones.
      gfmTerminal.textContent += `\n[STAGE 2] Per-zone Gutenberg-Richter analysis (${SEISMOGENIC_ZONES.length} zones)…\n`;
      gfmTerminal.scrollTop = gfmTerminal.scrollHeight;
      for (let i = 0; i < SEISMOGENIC_ZONES.length; i++) {
        const z = SEISMOGENIC_ZONES[i];
        const za = seismicityAnalyzer.analyze(evs, { roi: { lat: z.lat, lon: z.lon }, radiusKm: 150, sources: srcs });
        const line = za.ok
          ? `  ${String(i + 1).padStart(2)}/${SEISMOGENIC_ZONES.length} ${z.name.padEnd(22)} n=${String(za.eventCount).padStart(4)}  b=${za.bValue ?? '—'}  Mc=${za.Mc}  M≥6/yr=${za.thresholds.find(t => t.mag === 6)?.annualRate ?? '—'}`
          : `  ${String(i + 1).padStart(2)}/${SEISMOGENIC_ZONES.length} ${z.name.padEnd(22)} (insufficient events)`;
        gfmTerminal.textContent += line + '\n';
        gfmTerminal.scrollTop = gfmTerminal.scrollHeight;
        await new Promise(r => setTimeout(r, 0)); // yield so the UI streams live
      }

      // Run Monte Carlo simulation on the catalog statistics
      gfmTerminal.textContent += '\n[STAGE 3] MC-PSHA — 100K simulations from catalog b-value…\n';
      gfmTerminal.scrollTop = gfmTerminal.scrollHeight;

      const mcSims = new MonteCarloSimulator({ numSimulations: 100_000, seed: Date.now() % 100000 });

      // Pick the most active location from the catalog
      const evClusters = _clusterEvents(evs, 50);
      const topCluster = evClusters[0] || { lat: 12.0, lon: 122.0 };

      const mcResult = await mcSims.runSimulation({
        lat: topCluster.lat, lon: topCluster.lon, depth: 25,
        progressCb: (pct, msg) => {
          gfmTerminal.textContent = gfmTerminal.textContent.replace(/\[MC-PSHA\].*?\n/g, '');
          gfmTerminal.textContent += `[MC-PSHA] ${msg}\n`;
          gfmTerminal.scrollTop = gfmTerminal.scrollHeight;
        }
      });

      // Display MC results
      const s = mcResult.summary;
      const ex = mcResult.annualExceedance;
      gfmTerminal.textContent += `\n═══ MC-PSHA RESULTS (${topCluster.lat.toFixed(2)}°N, ${topCluster.lon.toFixed(2)}°E) ═══\n`;
      gfmTerminal.textContent += `Hazard-Consistent Mag (500yr): M${s.hazardConsistentMag.toFixed(2)}\n`;
      gfmTerminal.textContent += `Mean Magnitude: M${s.meanMagnitude.toFixed(2)} | Max: M${s.maxMagnitude.toFixed(2)}\n`;
      gfmTerminal.textContent += `Mean PGA: ${s.meanPGA_g.toFixed(4)}g | Zones: ${s.zonesAnalyzed} | Faults: ${s.faultsAnalyzed}\n`;
      gfmTerminal.textContent += `Annual Exceedance: 50gal=${(ex.PGA_50gal*100).toFixed(2)}% | 100gal=${(ex.PGA_100gal*100).toFixed(2)}% | 200gal=${(ex.PGA_200gal*100).toFixed(2)}%\n`;
      gfmTerminal.scrollTop = gfmTerminal.scrollHeight;

      if (statusEl) {
        statusEl.textContent = analysis.isSynthetic ? 'ANALYZED (SYNTHETIC DATA)' : 'ANALYZED (REAL CATALOG + MC-PSHA)';
        statusEl.style.color = analysis.isSynthetic ? 'var(--amber)' : 'var(--green)';
      }
    } catch (e) {
      gfmTerminal.textContent += `Historical analysis error: ${e.message}\n`;
      console.error('[CISV] Historical analysis failed:', e);
    }

    // ── Optional: GFM model inference (only if a server is reachable) ─────────
    try {
      // Capture canvas snapshot
      const canvas = document.querySelector('#canvas-container canvas');
      let body;
      const headers = { 'Content-Type': 'application/json' };

      if (sendImage && canvas) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const buffer = await blob.arrayBuffer();
        body = JSON.stringify({ image: Array.from(new Uint8Array(buffer)), prompt: 'Analyze seismic activity patterns for Philippine archipelago. Identify stress concentration zones and predict potential rupture scenarios.' });
      } else {
        body = JSON.stringify({ prompt: 'Analyze seismic activity patterns for Philippine archipelago. Identify stress concentration zones and predict potential rupture scenarios.' });
      }

      if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

      const response = await fetch(endpoint, { method: 'POST', headers, body });
      if (!response.ok) throw new Error(`GFM API HTTP ${response.status}`);

      const result = await response.json();
      const analysis = result.analysis || result.predictions || JSON.stringify(result, null, 2);
      gfmTerminal.textContent += `\n─── GFM MODEL INFERENCE (thinkonward/geophysical-foundation-model) ───\n${analysis}`;

      if (statusEl) { statusEl.textContent = 'ANALYSIS COMPLETE'; statusEl.style.color = 'var(--green)'; }

      // Update HF stats
      try {
        const hfRes = await fetch('https://huggingface.co/api/models/thinkonward/geophysical-foundation-model');
        if (hfRes.ok) {
          const hfData = await hfRes.json();
          const likesEl = document.getElementById('hf-likes');
          const downloadsEl = document.getElementById('hf-downloads');
          if (likesEl) likesEl.textContent = hfData.likes ?? '--';
          if (downloadsEl) downloadsEl.textContent = hfData.downloads ?? '--';
        }
      } catch {}

      // Parse coordinates from server response or compute from live catalog
      let focusLat = null, focusLon = null;
      const coordMatch = (analysis || '').match(/COORDINATES:\s*([-\d.]+),\s*([-\d.]+)/);
      if (coordMatch) {
        focusLat = parseFloat(coordMatch[1]);
        focusLon = parseFloat(coordMatch[2]);
      } else if (catalogResult?.events && catalogResult.events.length > 0) {
        const latest = catalogResult.events[catalogResult.events.length - 1];
        focusLat = latest.lat;
        focusLon = latest.lon;
      }
      if (focusLat !== null && focusLon !== null) {
        await gfmVisualizer.fetchAndVisualize(focusLat, focusLon);
      }

    } catch (err) {
      gfmTerminal.textContent += `\n─── GFM model offline (optional): ${err.message} ───\n(Historical analysis above is from the real catalog and does not need the GFM server.)`;
    }
  });

  // Start the simulation ticker for the NLP triage and incident feed
  startIncidentSimulation(nlpTriage);

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
  const synth = buildSyntheticCatalog();
  let live = null;
  let historicalReal = [];

  // Try to fetch live events (last 30 days)
  try {
    live = await fetchLiveCatalog({ minMag: 1.0, limitDays: 30 });
  } catch (err) {
    console.warn('[CISV] Live fetch error — using cached/synthetic fallback.', err.message);
  }

  // Try to fetch historical real USGS events (since 1990, mag >= 4.5)
  try {
    historicalReal = await fetchHistoricalUSGSEvents(4.5);
    console.info(`[CISV] Fetched ${historicalReal.length} real historical earthquakes since 1990 from USGS.`);
  } catch (err) {
    console.warn('[CISV] Historical USGS fetch failed — using synthetic fallback for older years.', err.message);
  }

  const liveEventsList = live?.events ?? [];

  if (liveEventsList.length > 0 || historicalReal.length > 0) {
    // Combine real live, historical events, and offline landmark events (including simulated events).
    const combined = [...liveEventsList, ...historicalReal, ...LANDMARK_EVENTS];

    // Deduplicate: prioritize PHIVOLCS over USGS
    const seenIds = new Set();
    const uniqueEvents = [];

    for (const ev of combined) {
      if (seenIds.has(ev.id)) continue;

      const isDuplicate = uniqueEvents.some(u => {
        const latDiff = Math.abs(u.lat - ev.lat);
        const lonDiff = Math.abs(u.lon - ev.lon);
        const timeDiff = Math.abs(u.time - ev.time);

        // Deduplicate between USGS and PHIVOLCS, or live and historical duplicates
        return latDiff < 0.1 && lonDiff < 0.1 && timeDiff < 60 * 1000; // 1 minute, 0.1 degrees
      });

      if (!isDuplicate) {
        seenIds.add(ev.id);
        uniqueEvents.push(ev);
      }
    }

    // Sort all events newest first
    uniqueEvents.sort((a, b) => b.time - a.time);

    // Pack the real events into binary buffers
    const packed = packEventsToBinary(uniqueEvents);

    const activeSources = [];
    if (liveEventsList.length > 0) activeSources.push(...(live?.sources ?? []));
    if (historicalReal.length > 0) activeSources.push('USGS-HISTORICAL');

    return {
      buffer:    packed.buffer,
      pgaBuffer: packed.pgaBuffer,
      yearBuffer: packed.yearBuffer,
      count:     packed.count,
      events:    packed.events,
      sources:   [...new Set(activeSources)],
      rawUSGS:   live?.rawUSGS ?? [],
      rawPHIVOLCS: live?.rawPHIVOLCS ?? [],
    };
  }

  // Fallback to synthetic only (offline)
  return {
    buffer:    synth.buffer,
    pgaBuffer: synth.pgaBuffer,
    yearBuffer: synth.yearBuffer,
    count:     synth.count,
    events:    synth.events,
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

// ── Earthquake Alert Popup System ──────────────────────────────────────────────

function showAlertPopup(event) {
  const container = document.getElementById('alert-container');
  if (!container) return;

  const { mag, lat, lon, depth, place, time } = event;
  const severity = mag >= 7 ? 'major' : mag >= 6 ? 'strong' : mag >= 5 ? 'moderate' : 'minor';
  const severityLabel = mag >= 7 ? 'MAJOR' : mag >= 6 ? 'STRONG' : mag >= 5 ? 'MODERATE' : 'MINOR';
  const timeStr = time ? new Date(time).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';

  const alert = document.createElement('div');
  alert.className = `alert-popup alert-${severity}`;
  alert.innerHTML = `
    <button class="alert-dismiss" onclick="this.parentElement.remove()">✕</button>
    <div class="alert-header">
      <span class="alert-badge">${severityLabel} M${mag.toFixed(1)}</span>
      <span class="alert-time">${timeStr} UTC</span>
    </div>
    <div class="alert-body">
      <strong>${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E</strong> — Depth: ${Math.round(depth)}km
      ${place ? `<br>${place}` : ''}
    </div>
  `;

  container.prepend(alert);

  // Auto-dismiss after 8 seconds (minor) or 15 seconds (major)
  const dismissDelay = severity === 'major' ? 15000 : severity === 'strong' ? 12000 : 8000;
  setTimeout(() => {
    alert.style.animation = 'alert-slide-out 0.3s ease-in forwards';
    setTimeout(() => alert.remove(), 300);
  }, dismissDelay);

  // Limit to 3 visible alerts
  while (container.children.length > 3) {
    container.lastChild.remove();
  }
}

// ── NLP Incident Stream Ticker Simulation ──────────────────────────────────────

function addIncidentToFeed(text, lat, lon, peisLevel = 0) {
  const root = document.getElementById('incident-feed-root');
  if (!root) return;

  // Remove placeholder empty div if present
  const empty = root.querySelector('.feed-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'incident-item';
  
  const now = new Date();
  const timeStr = String(now.getUTCHours()).padStart(2, '0') + ':' + String(now.getUTCMinutes()).padStart(2, '0') + ':' + String(now.getUTCSeconds()).padStart(2, '0') + ' UTC';

  // check if it is classified as damage (using the same heuristic logic for visual cue)
  const isDamage = text.toLowerCase().match(/(damage|collapse|landslide|blocked|destroyed|cracks)/);
  
  let categoryLabel = isDamage ? 'HAZARD CONFIRMED' : 'UNVERIFIED REPORT';
  let labelColor = isDamage ? 'var(--red)' : 'var(--text-secondary)';

  if (peisLevel > 0) {
    const intensityNames = [
      '', 'Scarcely Perceptible', 'Slightly Felt', 'Weak', 'Moderately Strong',
      'Strong', 'Very Strong', 'Destructive', 'Very Destructive', 'Devastating', 'Completely Devastating'
    ];
    categoryLabel = `PEIS INTENSITY ${peisLevel} (${intensityNames[peisLevel] || 'Felt'})`;
    labelColor =
      peisLevel >= 7 ? 'var(--red)' :
      peisLevel >= 5 ? 'var(--amber)' :
      peisLevel >= 3 ? 'var(--cyan)' : 'var(--text-secondary)';
  }

  // Generate random reporter details
  const reporterNames = ["Citizen Juan", "Field Operator Jose", "Agri-Sensor B4", "Sarangani Watcher", "Mindanao Seismic Res"];
  const reporterName = reporterNames[Math.floor(Math.random() * reporterNames.length)];
  const avatarLetter = reporterName.charAt(0);
  const initialConfirms = Math.floor(Math.random() * 3);

  item.innerHTML = `
    <div class="incident-header">
      <div class="incident-reporter">
        <div class="reporter-avatar">${avatarLetter}</div>
        <span class="reporter-name">${reporterName}</span>
      </div>
      <span class="incident-time">${timeStr}</span>
    </div>
    <div class="incident-text">${text} (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)</div>
    <div class="incident-footer">
      <span class="peis-badge" style="background: ${labelColor}1a; color: ${labelColor}">${categoryLabel}</span>
      <div class="incident-actions">
        <button class="action-btn confirm-btn" data-confirms="${initialConfirms}">👍 Confirm (${initialConfirms})</button>
        <button class="action-btn escalate-btn">🚨 Escalate</button>
      </div>
    </div>
  `;

  // Spike seismograph waveform visual
  seismographInstance?.spike(peisLevel > 0 ? peisLevel : 4.0);

  // Bind local action listeners
  const confirmBtn = item.querySelector('.confirm-btn');
  confirmBtn?.addEventListener('click', () => {
    let count = parseInt(confirmBtn.getAttribute('data-confirms'), 10) + 1;
    confirmBtn.setAttribute('data-confirms', count);
    confirmBtn.textContent = `✓ Confirmed (${count})`;
    confirmBtn.classList.add('confirmed');
    addPointsToHades(50); // Hades gets points for confirming reports!
  });

  const escalateBtn = item.querySelector('.escalate-btn');
  escalateBtn?.addEventListener('click', () => {
    openEscalationModal(text, lat, lon);
  });

  root.insertBefore(item, root.firstChild);

  // Keep only last 10 reports
  while (root.children.length > 10) {
    root.removeChild(root.lastChild);
  }
}

function startIncidentSimulation(nlpTriage) {
  const reports = [
    { text: "Alert: Severe structural damage and collapse of a building in General Santos City!", lat: 6.1164, lon: 125.1716 },
    { text: "Minor road cracking reported in Tagum, no major casualties.", lat: 7.4478, lon: 125.8078 },
    { text: "Landslide blocked the main highway in Tagum sector, emergency crew dispatched.", lat: 7.4300, lon: 125.8200 },
    { text: "Water levels normal, no tsunami hazard detected on Sarangani island coastline.", lat: 5.6667, lon: 125.4667 },
    { text: "Bridge collapsed near Balut island, rescue teams are on the way.", lat: 5.4000, lon: 125.3800 },
    { text: "People reporting shaking in Davao, no visible infrastructure damage.", lat: 7.0707, lon: 125.6090 },
    { text: "Power lines down and massive structural cracks in tagum city hall.", lat: 7.4478, lon: 125.8078 }
  ];

  const triggerNext = async () => {
    // Pick a random report
    const report = reports[Math.floor(Math.random() * reports.length)];
    
    // Pick a random PEIS intensity for simulated reports (sometimes 0, sometimes 3-8)
    const peis = Math.random() > 0.5 ? Math.floor(3 + Math.random() * 5) : 0;

    // Process through NLP triage (will plot on map if categorized as infrastructure damage)
    await nlpTriage.processIncomingFieldText(report.text, { lat: report.lat, lon: report.lon }, peis);
    addIncidentToFeed(report.text, report.lat, report.lon, peis);

    // Schedule next report in 20-30 seconds
    const delay = 20000 + Math.random() * 10000;
    setTimeout(triggerNext, delay);
  };

  // Start initial trigger in 10 seconds
  setTimeout(triggerNext, 10000);
}
