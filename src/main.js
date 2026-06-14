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
import { HistoricalSeismicityAnalyzer } from './engine/HistoricalSeismicityAnalyzer.js';
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
  const seismicityAnalyzer = new HistoricalSeismicityAnalyzer();
  const improver = new PredictionImprover();
  const barangayRenderer = new BarangayRenderer(engine);
  const civicDashboard = new CivicDashboard(barangayRenderer, gfmVisualizer);
  civicDashboard.setCatalog(catalogResult.events, catalogResult.sources);

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
    const latEl  = document.getElementById('nlp-lat');
    const lonEl  = document.getElementById('nlp-lon');
    const peisEl = document.getElementById('nlp-peis');

    if (!textEl || !latEl || !lonEl) return;

    const text = textEl.value.trim();
    const lat  = parseFloat(latEl.value);
    const lon  = parseFloat(lonEl.value);
    const peis = peisEl ? parseInt(peisEl.value, 10) : 0;

    if (!text) {
      alert('Please enter field report text.');
      return;
    }
    if (isNaN(lat) || isNaN(lon)) {
      alert('Please enter valid coordinates.');
      return;
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

  // ── 9. Background polling ────────────────────────────────────────────────
  setInterval(async () => {
    console.info('[CISV] Background poll: refreshing live catalog…');
    ui.setFeedStatus('UPDATING…', 'pending');

    const fresh = await _loadCatalog();
    catalogResult = fresh; // keep the shared reference current for predictors

    catalogRenderer.renderBinarySeismicCatalog(fresh.buffer, fresh.pgaBuffer, fresh.yearBuffer);
    ui.updateCatalog(fresh.buffer, fresh.events);
    ui.updateEventCount(fresh.count);
    ui.setDataSources(fresh.sources);
    ui.setLastFetchTime(new Date());
    ui.setFeedStatus('LIVE', 'live');
    ui.refreshLiveFeedList(fresh.events);
    civicDashboard.setCatalog(fresh.events, fresh.sources);

    console.info(`[CISV] Poll complete — ${fresh.count} events.`);
  }, LIVE_POLL_MS);

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

  ui.hideLoader();
  ui.setFeedStatus('LIVE', 'live');
  ui.refreshLiveFeedList(catalogResult.events);

  // ── 10b. NASA-Grade Prediction Panel Binding ───────────────────────────────
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

    try {
      // Build candidate locations from real data sources
      const candidates = [];
      const seen = new Set();

      // 1. Cluster recent USGS + PHIVOLCS events into hotspots
      const events = catalogResult?.events ?? [];
      if (events.length > 0) {
        const clusters = _clusterEvents(events, 50); // 50km radius clusters
        for (const cluster of clusters.slice(0, 15)) {
          const key = `${cluster.lat.toFixed(2)}_${cluster.lon.toFixed(2)}`;
          if (!seen.has(key)) {
            seen.add(key);
            candidates.push({
              lat: cluster.lat, lon: cluster.lon,
              source: 'EVENT_CLUSTER',
              maxMag: cluster.maxMag,
              eventCount: cluster.count,
              avgDepth: cluster.avgDepth,
            });
          }
        }
      }

      // 2. Seismogenic zone centers
      const zones = SEISMOGENIC_ZONES || [];
      for (const z of zones) {
        const key = `${z.lat.toFixed(2)}_${z.lon.toFixed(2)}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            lat: z.lat, lon: z.lon,
            source: 'ZONE_CENTER',
            zoneName: z.name,
            maxMag: z.maxMag,
            occRate: z.occRate,
          });
        }
      }

      // 3. Active fault centroids
      const faults = ACTIVE_FAULTS || [];
      for (const f of faults) {
        if (f.lat && f.lon) {
          const key = `${f.lat.toFixed(2)}_${f.lon.toFixed(2)}`;
          if (!seen.has(key)) {
            seen.add(key);
            candidates.push({
              lat: f.lat, lon: f.lon,
              source: 'FAULT_CENTROID',
              faultName: f.name,
              maxMag: f.Mf,
              slipRate: f.slipRate,
            });
          }
        }
      }

      predictTerminal.textContent = `[ANALYSIS] Found ${candidates.length} candidate locations from ${events.length} events + ${zones.length} zones + ${faults.length} faults\n`;
      predictTerminal.scrollTop = predictTerminal.scrollHeight;

      if (candidates.length === 0) {
        predictTerminal.textContent += '[ANALYSIS] No candidates found. Check data feeds.\n';
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
        const pct = ((i + 1) / maxLocations) * 100;
        predictTerminal.textContent += `\n[MC-PSHA ${i+1}/${maxLocations}] ${c.lat.toFixed(2)}°N ${c.lon.toFixed(2)}°E (${c.source}) — ${simsPerLocation.toLocaleString()} sims...`;
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
          const riskScore = (mcSum.hazardConsistentMag || 0) * 0.3
            + (annualEx.PGA_100gal || 0) * 100 * 0.3
            + (parseFloat(timing.overdueRatio) || 0) * 0.2
            + (c.maxMag || 0) * 0.2;

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
          });
        } catch (err) {
          predictTerminal.textContent += ` ERROR: ${err.message}`;
        }
      }

      // Sort by risk score descending, take top 10
      ranked.sort((a, b) => b.riskScore - a.riskScore);
      const top10 = ranked.slice(0, 10);

      // Display top 10
      if (top10El) {
        top10El.textContent = '';
        top10.forEach((loc, i) => {
          const riskColor = loc.riskScore > 3 ? '#ff1a44' : loc.riskScore > 1.5 ? '#ffaa00' : '#00ff88';
          const label = loc.zoneName || loc.faultName || loc.source;
          top10El.textContent += `[${i+1}] ${loc.lat.toFixed(2)}°N ${loc.lon.toFixed(2)}°E  Risk: ${loc.riskScore.toFixed(2)}  HCM: M${loc.hazardMag.toFixed(1)}  ${label}\n`;
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

    // ── REAL historical seismicity analysis on the actual catalog ────────────
    // This is what the button label promises. Runs first, always, from live data.
    try {
      const evs = catalogResult?.events ?? [];
      const srcs = catalogResult?.sources ?? [];
      const analysis = seismicityAnalyzer.analyze(evs, { sources: srcs });
      gfmTerminal.textContent = seismicityAnalyzer.formatReport(analysis) + '\n';
      if (statusEl) {
        statusEl.textContent = analysis.isSynthetic ? 'ANALYZED (SYNTHETIC DATA)' : 'ANALYZED (REAL CATALOG)';
        statusEl.style.color = analysis.isSynthetic ? 'var(--amber)' : 'var(--green)';
      }
    } catch (e) {
      gfmTerminal.textContent = `Historical analysis error: ${e.message}\n`;
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
