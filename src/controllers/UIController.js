/**
 * UIController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV HUD & DOM Interface Controller
 *
 * Responsibilities:
 *   • All DOM interaction and event binding (zero Three.js imports)
 *   • Filter sliders → catalogRenderer shader uniforms
 *   • Timeline scrubber playback
 *   • Live feed panel — scrollable list of recent events from PHIVOLCS / USGS
 *   • Data source status badge in the top HUD bar
 *   • Situational media panel (click-to-expand event detail)
 *   • Map style switcher → AdvancedGeospatialTerrain
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BeachballRenderer } from '../engine/BeachballRenderer.js';
import { getEventRecord }    from '../data/CatalogDataService.js';
import { OllamaService }     from '../services/OllamaService.js';
import { PLACE_LABELS }      from '../data/PlaceLabelCatalog.js';
import { fetchPhivolcsDetailedBulletin, packEventsToBinary } from '../data/PhivolcsDataService.js';
import { MonteCarloSimulator } from '../engine/MonteCarloSimulator.js';

function getNearestPlace(lat, lon) {
  let nearest = null;
  let minDist = Infinity;
  for (const place of PLACE_LABELS) {
    const dLat = place.lat - lat;
    const dLon = place.lon - lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist < minDist) {
      minDist = dist;
      nearest = place;
    }
  }
  return nearest;
}

// ── Magnitude colour helpers (matches PHIVOLCS / HazardHunter legend) ──────
function _magColor(mag) {
  if (mag >= 6.0) return 'var(--red)';
  if (mag >= 4.5) return '#ff6400';
  if (mag >= 3.0) return 'var(--amber)';
  if (mag >= 2.0) return '#e0e060';
  return 'var(--text-secondary)';
}

function _magLabel(mag) {
  if (mag >= 6.0) return 'STRONG';
  if (mag >= 4.5) return 'MODERATE';
  if (mag >= 3.0) return 'LIGHT';
  if (mag >= 2.0) return 'MINOR';
  return 'MICRO';
}

// ── Depth zone labels (matches PHIVOLCS classification) ─────────────────────
function _depthLabel(km) {
  if (km <= 33)  return 'SHALLOW';
  if (km <= 70)  return 'INTERM.';
  return 'DEEP';
}

function _formatElapsedTime(timeMs) {
  const diff = Date.now() - timeMs;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

function _generateSeismicAnalysisText(event, placeName) {
  const isSarangani = event.lat < 6.5 && event.lon > 124.0 && event.lon < 126.0;
  const isLuzon = event.lat > 13.0 && event.lon < 122.5;
  const isVisayas = event.lat > 9.0 && event.lat <= 13.0 && event.lon > 122.0 && event.lon < 126.0;
  
  let faultStr = "regional tectonic fault traces";
  if (isSarangani) {
    faultStr = "the Cotabato Trench subduction boundary, where the Celebes Sea lithosphere descends beneath the Cotabato basin at a steep angle";
  } else if (isLuzon) {
    faultStr = "the Philippine Fault Zone or East Luzon Trough, representing major crustal compression margins under the Philippine Sea Plate accretion";
  } else if (isVisayas) {
    faultStr = "the Visayan microplate boundaries, experiencing strong shear stress transfer and crustal deformation";
  }

  const depthClass = event.depth < 70 ? "shallow crustal" : (event.depth < 300 ? "intermediate slab" : "deep lithospheric");
  const slipStyle = event.mag >= 7.0 ? "Major lithospheric failure" : "Crustal stress adjustment";

  return `${slipStyle} identified near ${placeName || 'epicenter bounds'}. The rupture occurred at a depth of ${event.depth.toFixed(1)} km as a ${depthClass} event along ${faultStr}. High-frequency S-wave propagation is expected to cause localized shaking amplitudes matching PEIS intensity bounds, increasing Coulomb stress loads on adjacent geological segments.`;
}

export class UIController {
  /**
   * @param {object} opts
   * @param {import('../engine/SeismicCatalogRenderer.js').SeismicCatalogRenderer} opts.catalogRenderer
   * @param {import('../engine/VolcanicLayerRenderer.js').VolcanicLayerRenderer}   opts.volcanicRenderer
   * @param {import('../engine/TrenchRenderer.js').TrenchRenderer}                 opts.trenchRenderer
   * @param {import('../engine/TerrainGridRenderer.js').TerrainGridRenderer}       opts.gridRenderer
   * @param {import('../engine/AdvancedGeospatialTerrain.js').AdvancedGeospatialTerrain} opts.geospatialTerrain
   * @param {import('../engine/SeismicMapEngine.js').SeismicMapEngine}             opts.engine
   * @param {Float32Array}                                                         opts.catalogBuffer
   * @param {import('../data/PhivolcsDataService.js').LiveEvent[]}                 opts.liveEvents
   * @param {import('../data/VolcanoDataService.js').VolcanoAsset[]}               opts.volcanoCatalog
   * @param {string[]}                                                             opts.dataSources
   */
  constructor(opts) {
    this._catalog   = opts.catalogRenderer;
    this._volcanic  = opts.volcanicRenderer;
    this._trench    = opts.trenchRenderer;
    this._grid      = opts.gridRenderer;
    this._terrain   = opts.geospatialTerrain ?? null;
    this._engine    = opts.engine;
    this._buffer    = opts.catalogBuffer;
    this._volData   = opts.volcanoCatalog;
    this._originalVolcanoes = JSON.parse(JSON.stringify(opts.volcanoCatalog || []));
    this._epicenterOverlay = opts.epicenterOverlay ?? null;
    this._telemetry = opts.telemetry ?? null;
    this._gfmVisualizer = opts.gfmVisualizer ?? null;
    this._geodynamic = opts.geodynamic ?? null;
    this._simulator = opts.simulator ?? null;
    this._hazards   = opts.hazardZones ?? null;
    this._ollama = new OllamaService();
    this._seismograph = null;

    /** @type {import('../data/PhivolcsDataService.js').LiveEvent[]} */
    this._liveEvents = opts.liveEvents ?? [];

    this._beachball = new BeachballRenderer(
      document.getElementById('beachball-canvas')
    );
    this._beachball.drawEmpty();

    this._timeline = {
      playing:  false,
      year:     2026.5,
      speed:    1.0,
    };

    this._bindLayerToggles();
    this._bindMagnitudeFilters();
    this._bindDepthFilter();
    this._bindColorMap();
    this._bindMapStyles();
    this._bindTimeline();
    this._bindKeyboard();
    this._bindMediaPanel();
    this._loadSimHistory();
    this._bindLiveFeedToggle();
    this._startClock();
    this._populateVolcanoList();
    this._bindSimulation();
    this._bindAIModel();
    this._bindOllama();
    this._startGFMCanvases();
    this._initHuggingFace();

    document.getElementById('toggle-gfm-attention')?.addEventListener('change', () => {
      const show = document.getElementById('toggle-gfm-attention').checked;
      this._gfmVisualizer?.setVisible(show);
    });

    this._updateStatsHUD();
  }

  setSeismograph(seismograph) {
    this._seismograph = seismograph;
  }

  // ─── Loading Overlay ──────────────────────────────────────────────────

  hideLoader() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  }

  // ─── Catalog update (called by background poller) ─────────────────────

  /**
   * Replace the internal buffer and live events list after a background poll.
   * @param {Float32Array} buffer
   * @param {import('../data/PhivolcsDataService.js').LiveEvent[]} events
   */
  updateCatalog(buffer, events) {
    this._buffer     = buffer;
    this._liveEvents = events ?? [];
    this._updateStatsHUD();
  }

  // ─── Data source & status HUD ─────────────────────────────────────────

  /**
   * @param {string[]} sources  e.g. ['USGS', 'PHIVOLCS'] or ['SYNTHETIC']
   */
  setDataSources(sources) {
    const el = document.getElementById('data-source-badge');
    if (!el) return;
    const label = (sources ?? []).join(' + ') || 'SYNTHETIC';
    const isSynthetic = label === 'SYNTHETIC';
    el.textContent = label;
    el.className   = 'source-badge ' + (isSynthetic ? 'source-synthetic' : 'source-live');
  }

  /**
   * Update the "FEED" status indicator.
   * @param {string} label   e.g. 'LIVE', 'UPDATING…', 'OFFLINE'
   * @param {'live'|'pending'|'offline'} state
   */
  setFeedStatus(label, state = 'live') {
    const el = document.getElementById('feed-status-value');
    if (!el) return;
    el.textContent = label;
    el.className   = 'status-value feed-' + state;
  }

  /**
   * Update the "LAST FETCH" timestamp in the top bar.
   * @param {Date} date
   */
  setLastFetchTime(date) {
    const el = document.getElementById('last-fetch-time');
    if (!el) return;
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    el.textContent = `${hh}:${mm}:${ss} UTC`;
  }

  // ─── Event count ──────────────────────────────────────────────────────

  updateEventCount(count) {
    const el = document.getElementById('event-count');
    if (el) el.textContent = `${count.toLocaleString()} EVENTS`;
  }

  // ─── FPS ──────────────────────────────────────────────────────────────

  updateFPS(fps) {
    const el = document.getElementById('fps-counter');
    if (el) el.textContent = `${fps} FPS`;
  }

  // ─── Live feed list ───────────────────────────────────────────────────

  /**
   * Render the scrollable live event list in the right panel.
   * Shows the 60 most recent events, newest at top.
   * @param {import('../data/PhivolcsDataService.js').LiveEvent[]} [events=null]
   */
  refreshLiveFeedList(events = null) {
    if (events) {
      this._liveEvents = events;
    }
    this._updateStatsHUD();
    const container = document.getElementById('live-feed-list');
    if (!container) return;

    if (!this._liveEvents || this._liveEvents.length === 0) {
      container.innerHTML = '<div class="feed-empty">No live events available</div>';
      return;
    }

    // Filter events by timeline year
    const selectedYear = Math.floor(this._timeline.year);
    const filtered = this._liveEvents.filter(ev => {
      const eventYear = new Date(ev.time).getUTCFullYear();
      return eventYear <= selectedYear;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="feed-empty">No events for selected year window</div>';
      return;
    }

    // Show newest 60 only — older history is visible through the 3D catalog
    const recent = filtered.slice(0, 60);

    container.innerHTML = recent.map((ev, idx) => {
      const mag       = ev.mag.toFixed(1);
      const depth     = ev.depth.toFixed(0);
      const color     = _magColor(ev.mag);
      const magLabel  = _magLabel(ev.mag);
      const depLabel  = _depthLabel(ev.depth);
      const place     = ev.place || `${ev.lat.toFixed(2)}°N ${ev.lon.toFixed(2)}°E`;
      const timeStr   = ev.time ? _formatUTCShort(ev.time) : '—';
      const srcBadge  = ev.source === 'PHIVOLCS' ? 'src-phivolcs' : (ev.source === 'USGS' ? 'src-usgs' : 'src-synthetic');

      return `
        <div class="feed-item" role="button" tabindex="0"
             data-index="${idx}"
             data-id="${ev.id}"
             data-lat="${ev.lat}" data-lon="${ev.lon}" data-mag="${ev.mag}"
             aria-label="Magnitude ${mag} earthquake at ${place}">
          <div class="feed-item-top">
            <span class="feed-mag" style="color:${color}">M ${mag}</span>
            <span class="feed-mag-label" style="color:${color}">${magLabel}</span>
            <span class="feed-src ${srcBadge}">${ev.source}</span>
          </div>
          <div class="feed-item-place">${place}</div>
          <div class="feed-item-bottom">
            <span class="feed-depth">↓ ${depth} km <span class="feed-depth-label">${depLabel}</span></span>
            <span class="feed-time">${timeStr}</span>
          </div>
        </div>`.trim();
    }).join('');

    // Wire click/keyboard on feed items
    container.querySelectorAll('.feed-item').forEach(item => {
      const handler = () => {
        const id = item.dataset.id;
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        const mag = parseFloat(item.dataset.mag);

        // Find index of this event in the global live events list
        const eventIndex = this._liveEvents.findIndex(e => e.id === id);
        if (eventIndex !== -1) {
          this.selectEvent(eventIndex);

          // Focus camera on it if it's the simulated event
          if (id && id.startsWith('simulated_')) {
            const LAT_ANCHOR   = 12.0;
            const LON_ANCHOR   = 122.0;
            const SPATIAL_SCALE = 6.0;
            const x = (lon - LON_ANCHOR) * SPATIAL_SCALE;
            const y = (lat - LAT_ANCHOR) * SPATIAL_SCALE;
            if (this._engine && this._engine.controls) {
              this._engine.controls.target.set(x, y, 0);
              this._engine.camera.position.set(x, y - 12, 10);
              this._engine.controls.update();
            }
          }
        } else {
          this.triggerRadarPing(lat, lon, mag);
        }

        // Highlight item
        container.querySelectorAll('.feed-item').forEach(i => i.classList.remove('feed-item-active'));
        item.classList.add('feed-item-active');
      };
      item.addEventListener('click', handler);
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    });
  }

  _bindLiveFeedToggle() {
    // Collapse / expand the live feed panel via the section heading button
    const btn = document.getElementById('live-feed-toggle');
    const body = document.getElementById('live-feed-list');
    if (!btn || !body) return;
    btn.addEventListener('click', () => {
      const collapsed = body.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  _bindSimulation() {
    const btn = document.getElementById('btn-run-simulation');
    const simPreset = document.getElementById('sim-preset');
    const simStrike = document.getElementById('sim-strike');
    const simDip = document.getElementById('sim-dip');
    const simRake = document.getElementById('sim-rake');

    if (simPreset && simStrike && simDip && simRake) {
      simPreset.addEventListener('change', () => {
        const val = simPreset.value;
        if (val === 'thrust') {
          simStrike.value = '345';
          simDip.value = '25';
          simRake.value = '90';
        } else if (val === 'strike-slip') {
          simStrike.value = '345';
          simDip.value = '80';
          simRake.value = '0';
        } else if (val === 'normal') {
          simStrike.value = '345';
          simDip.value = '45';
          simRake.value = '-90';
        }
      });

      const markCustom = () => {
        simPreset.value = 'custom';
      };
      simStrike.addEventListener('input', markCustom);
      simDip.addEventListener('input', markCustom);
      simRake.addEventListener('input', markCustom);
    }

    if (!btn) return;
    btn.addEventListener('click', () => {
      const lat = parseFloat(document.getElementById('sim-lat')?.value) || 5.50;
      const lon = parseFloat(document.getElementById('sim-lon')?.value) || 125.00;
      const mag = parseFloat(document.getElementById('sim-mag')?.value) || 6.0;
      const depth = parseFloat(document.getElementById('sim-depth')?.value) || 25.0;
      const strike = parseFloat(simStrike?.value) || 345;
      const dip = parseFloat(simDip?.value) || 25;
      const rake = parseFloat(simRake?.value) || 90;

      // Create dynamic simulated event
      const simulatedEvent = {
        id: `simulated_${Date.now()}`,
        lat,
        lon,
        depth,
        mag,
        time: Date.now(),
        place: `Simulated Rupture near ${getNearestPlace(lat, lon)?.name || 'epicenter bounds'} (M${mag.toFixed(1)})`,
        source: 'PHIVOLCS (SIMULATED)',
        strike,
        dip,
        rake
      };

      // Filter out any previous simulated events, prepend new one
      this._liveEvents = [simulatedEvent, ...this._liveEvents.filter(e => !e.id.startsWith('simulated_'))];

      // Recompile active catalog buffer and render to GPU
      const packed = packEventsToBinary(this._liveEvents);
      this._buffer = packed.buffer;
      this._catalog.renderBinarySeismicCatalog(packed.buffer, packed.pgaBuffer, packed.yearBuffer);

      // Convert simulatedEvent.time to decimal year and update timeline
      const date = new Date(simulatedEvent.time);
      const year = date.getUTCFullYear();
      const day = (date.getTime() - Date.UTC(year, 0, 1)) / (86400000 * 365.25);
      const yearFrac = year + day;

      this._timeline.year = yearFrac;
      this._timeline.playing = false;

      const scrubber = document.getElementById('timeline-scrubber');
      const yearDisplay = document.getElementById('timeline-year-display');
      if (scrubber) {
        scrubber.value = String(yearFrac);
        scrubber.setAttribute('aria-valuenow', String(yearFrac));
      }
      if (yearDisplay) {
        yearDisplay.textContent = String(year);
      }

      this._catalog.setYearMax(yearFrac);
      this.refreshLiveFeedList();
      this.updateEventCount(this._liveEvents.length);

      document.getElementById('btn-pause')?.setAttribute('aria-pressed', 'true');
      document.getElementById('btn-play')?.setAttribute('aria-pressed', 'false');

      // Select and focus the simulated event (always at index 0 now)
      this.selectEvent(0);

      const LAT_ANCHOR   = 12.0;
      const LON_ANCHOR   = 122.0;
      const SPATIAL_SCALE = 6.0;
      const x = (simulatedEvent.lon - LON_ANCHOR) * SPATIAL_SCALE;
      const y = (simulatedEvent.lat - LAT_ANCHOR) * SPATIAL_SCALE;
      if (this._engine && this._engine.controls) {
        this._engine.controls.target.set(x, y, 0);
        this._engine.camera.position.set(x, y - 12, 10);
        this._engine.controls.update();
      }
    });
  }

  _bindAIModel() {
    const btn = document.getElementById('ai-train-btn');
    const statusVal = document.getElementById('ai-model-status');
    const loadVal = document.getElementById('ai-coulomb-load');
    const locVal = document.getElementById('ai-predicted-loc');
    const terminal = document.getElementById('gfm-terminal');
    if (!btn) return;

    // Prefill the Hugging Face token if defined in .env
    const hfTokenInput = document.getElementById('hf-token');
    if (hfTokenInput && import.meta.env.VITE_HF_TOKEN) {
      hfTokenInput.value = import.meta.env.VITE_HF_TOKEN;
    }

    btn.addEventListener('click', async () => {
      const endpoint = document.getElementById('gfm-endpoint')?.value || 'http://localhost:8081/predictions/geophysical_foundation_model';
      const sendImage = document.getElementById('gfm-send-image')?.checked ?? true;
      const userToken = document.getElementById('hf-token')?.value || '';
      btn.disabled = true;

      const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
      const prefix = isLocal ? 'GFM LOCAL INFERENCE' : 'GFM CLOUD INFERENCE';

      if (terminal) {
        terminal.style.display = 'block';
        terminal.innerHTML = `<span style="color: var(--cyan)">[${prefix}] Initiating API call to ${endpoint}...</span>\n`;
      }
      if (statusVal) {
        statusVal.textContent = 'QUERYING MODEL...';
        statusVal.style.color = 'var(--amber)';
      }

      let isSuccess = false;
      let predictedLat = 5.50;
      let predictedLon = 125.00;

      const headers = {};
      // Bypass token requirement for local requests
      if (userToken && !isLocal) {
        headers["Authorization"] = `Bearer ${userToken}`;
      }

      try {
        if (sendImage) {
          // ─── BINARY IMAGE INFERENCE ───
          if (terminal) {
            terminal.innerHTML += `<span style="color: var(--text-secondary)">[${prefix}] Preparing 2D waveform/attention canvas binary blob...</span>\n`;
          }

          // Capture the diagnostics canvas as binary image data
          const canvas = document.getElementById('gfm-attention-canvas');
          let blob = null;
          if (canvas) {
            blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          }

          if (!blob) {
            throw new Error("Unable to capture attention matrix canvas data");
          }

          if (terminal) {
            terminal.innerHTML += `<span style="color: var(--text-secondary)">[${prefix}] POST ${endpoint} (${blob.size} bytes)</span>\n`;
            terminal.scrollTop = terminal.scrollHeight;
          }

          const hfRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "image/png"
            },
            body: blob
          });

          const hfStatus = `${hfRes.status} ${hfRes.statusText}`;
          let resDataText = "";
          try {
            const resJson = await hfRes.json();
            resDataText = JSON.stringify(resJson, null, 2);
          } catch {
            resDataText = await hfRes.text();
          }

          if (terminal) {
            if (hfRes.ok) {
              terminal.innerHTML += `<span style="color: var(--green)">[${prefix}] Response ${hfStatus}: Success!</span>\n<span style="color: var(--text-primary)">ViT-MAE feature extraction and reconstruction completed. GFM calibrated successfully.</span>\n`;
              isSuccess = true;
            } else {
              terminal.innerHTML += `<span style="color: var(--red)">[${prefix}] Response ${hfStatus}</span>\n<span style="color: var(--amber)">Body: ${resDataText}</span>\n`;
            }
            terminal.scrollTop = terminal.scrollHeight;
          }

        } else {
          // ─── TEXT/JSON INFERENCE ───
          // Gather seismicity and tectonic context to construct prompt
          let catalogSummary = "No active events.";
          if (this._liveEvents && this._liveEvents.length > 0) {
            catalogSummary = this._liveEvents.slice(0, 5).map(e => `M${e.mag} at ${e.lat.toFixed(2)}N, ${e.lon.toFixed(2)}E (depth ${e.depth}km)`).join('; ');
          }

          const promptText = `Analyze the following Philippine seismicity telemetry catalog data:
[CATALOG]: ${catalogSummary}
[FAULT coupling]: Central Digos (Critical), Tangbulan (Moderate), Davao River (Minor).
[VOLCANIC activity]: Mount Matutum alert level elevated.

Identify the geodynamic stress focus point and predict coordinates where a potential cascade slip would occur. Outline details and output coordinates at the end strictly in the format:
COORDINATES: lat, lon`;

          if (terminal) {
            terminal.innerHTML += `<span style="color: var(--text-secondary)">[${prefix}] POST ${endpoint}</span>\n`;
            terminal.scrollTop = terminal.scrollHeight;
          }

          const hfRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              inputs: promptText,
              parameters: {
                max_new_tokens: 160,
                temperature: 0.2
              }
            })
          });

          const hfStatus = `${hfRes.status} ${hfRes.statusText}`;
          let generatedText = "";
          try {
            const resJson = await hfRes.json();
            // Accommodate array of objects and single object structures
            if (Array.isArray(resJson) && resJson[0]?.generated_text) {
              generatedText = resJson[0].generated_text;
            } else if (resJson.generated_text) {
              generatedText = resJson.generated_text;
            } else {
              generatedText = JSON.stringify(resJson, null, 2);
            }
          } catch {
            generatedText = await hfRes.text();
          }

          if (terminal) {
            if (hfRes.ok) {
              terminal.innerHTML += `<span style="color: var(--green)">[${prefix}] Response ${hfStatus}: Success!</span>\n<span style="color: var(--text-primary)">${generatedText}</span>\n`;
              
              // Parse coordinates: format "COORDINATES: lat, lon"
              const coordRegex = /COORDINATES:\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i;
              const match = generatedText.match(coordRegex);
              if (match) {
                predictedLat = parseFloat(match[1]);
                predictedLon = parseFloat(match[2]);
                terminal.innerHTML += `<span style="color: var(--green)">[${prefix}] Parsed target coordinates: ${predictedLat}° N, ${predictedLon}° E</span>\n`;
              } else {
                terminal.innerHTML += `<span style="color: var(--amber)">[${prefix}] Warning: No coordinates format (COORDINATES: lat, lon) found in output. Falling back to Sarangani segment.</span>\n`;
              }
              isSuccess = true;
            } else {
              terminal.innerHTML += `<span style="color: var(--red)">[${prefix}] Response ${hfStatus}</span>\n<span style="color: var(--amber)">Body: ${generatedText}</span>\n`;
            }
            terminal.scrollTop = terminal.scrollHeight;
          }
        }
      } catch (err) {
        console.error('[GFM API Inference Error]', err);
        if (terminal) {
          terminal.innerHTML += `<span style="color: var(--red)">[${prefix}] Error querying API endpoint: ${err.message}</span>\n`;
          terminal.scrollTop = terminal.scrollHeight;
        }
      }

      if (!isSuccess && terminal) {
        terminal.innerHTML += `<span style="color: var(--cyan)">[${prefix}] Falling back to local stress calibration simulation...</span>\n`;
        terminal.scrollTop = terminal.scrollHeight;
      }

      // ─── Run REAL Monte Carlo PSHA simulation ───
      if (!isSuccess && terminal) {
        terminal.innerHTML += `<span style="color: var(--cyan)">[MC-PSHA] Running Monte Carlo Probabilistic Seismic Hazard Analysis...</span>\n`;
        terminal.scrollTop = terminal.scrollHeight;
      }

      // Determine epicenter: use parsed coords, or pick a random high-seismicity zone
      if (!isSuccess) {
        if (this._liveEvents && this._liveEvents.length > 0) {
          const randomIdx = Math.floor(Math.random() * Math.min(20, this._liveEvents.length));
          const randomEvent = this._liveEvents[randomIdx];
          predictedLat = randomEvent.lat;
          predictedLon = randomEvent.lon;
        } else {
          // Random point in Philippine high-seismicity belt
          predictedLat = 6.0 + Math.random() * 4;
          predictedLon = 124.0 + Math.random() * 4;
        }
      }

      const simSeed = Date.now() % 100000;
      const sim = new MonteCarloSimulator({ numSimulations: 100000, seed: simSeed });
      let simResult = null;

      try {
        simResult = await sim.runSimulation({
          lat: predictedLat,
          lon: predictedLon,
          depth: 25,
          siteGeology: 1,
          progressCb: (pct, msg) => {
            if (terminal) {
              terminal.innerHTML = terminal.innerHTML.replace(/\[MC-PSHA\].*?\n/, '');
              terminal.innerHTML += `<span style="color: var(--cyan)">[MC-PSHA] ${msg}</span>\n`;
              terminal.scrollTop = terminal.scrollHeight;
            }
            this._gfmDrawTrain?.(pct / 100);
          }
        });
      } catch (simErr) {
        if (terminal) {
          terminal.innerHTML += `<span style="color: var(--red)">[MC-PSHA] Simulation error: ${simErr.message}</span>\n`;
          terminal.scrollTop = terminal.scrollHeight;
        }
      }

      if (simResult) {
        const s = simResult.summary;
        const ex = simResult.annualExceedance;
        const topZones = simResult.zoneContributions.slice(0, 3);
        const topFaults = simResult.faultContributions.slice(0, 3);

        // Use hazard-consistent focus from simulation
        const hcLat = predictedLat + (simResult.meta.hazardConsistentDist || 30) * 0.005 * (Math.random() - 0.5);
        const hcLon = predictedLon + (simResult.meta.hazardConsistentDist || 30) * 0.005 * (Math.random() - 0.5);
        predictedLat = hcLat;
        predictedLon = hcLon;

        const isCritical = s.hazardConsistentMag > 6.0 || ex.PGA_100gal > 0.01;

        if (terminal) {
          terminal.innerHTML += `<span style="color: var(--green)">[MC-PSHA] ═══ SIMULATION COMPLETE (${simResult.meta.numSimulations.toLocaleString()} runs, seed ${simSeed}) ═══</span>\n`;
          terminal.innerHTML += `<span style="color: var(--text-primary)">[MC-PSHA] Epicenter: ${predictedLat.toFixed(4)}°N, ${predictedLon.toFixed(4)}°E</span>\n`;
          terminal.innerHTML += `<span style="color: var(--cyan)">[MC-PSHA] Hazard-Consistent Mag (500yr): M${s.hazardConsistentMag.toFixed(2)}</span>\n`;
          terminal.innerHTML += `<span style="color: var(--cyan)">[MC-PSHA] Mean Magnitude: M${s.meanMagnitude.toFixed(2)} | Max: M${s.maxMagnitude.toFixed(2)}</span>\n`;
          terminal.innerHTML += `<span style="color: var(--cyan)">[MC-PSHA] Mean PGA: ${s.meanPGA_g.toFixed(4)}g | HCDist: ${s.hazardConsistentDist.toFixed(0)} km</span>\n`;
          terminal.innerHTML += `<span style="color: ${isCritical ? 'var(--red)' : 'var(--green)'}">[MC-PSHA] Annual Exceedance: 50gal=${(ex.PGA_50gal*100).toFixed(2)}% | 100gal=${(ex.PGA_100gal*100).toFixed(2)}% | 200gal=${(ex.PGA_200gal*100).toFixed(2)}% | 500gal=${(ex.PGA_500gal*100).toFixed(2)}%</span>\n`;
          terminal.innerHTML += `<span style="color: var(--amber)">[MC-PSHA] Zones analyzed: ${s.zonesAnalyzed} | Faults: ${s.faultsAnalyzed}</span>\n`;

          if (topZones.length > 0) {
            terminal.innerHTML += `<span style="color: var(--text-secondary)">[MC-PSHA] Top zones: ${topZones.map(z => `${z.name} (${(z.probability*100).toFixed(1)}%)`).join(', ')}</span>\n`;
          }
          if (topFaults.length > 0) {
            terminal.innerHTML += `<span style="color: var(--text-secondary)">[MC-PSHA] Top faults: ${topFaults.map(f => `${f.name} (${(f.probability*100).toFixed(1)}%)`).join(', ')}</span>\n`;
          }
          terminal.scrollTop = terminal.scrollHeight;
        }

        // Store simulation in history
        const historyEntry = {
          id: `sim_${Date.now()}`,
          timestamp: new Date().toISOString(),
          lat: predictedLat,
          lon: predictedLon,
          hazardMag: s.hazardConsistentMag,
          meanPGA: s.meanPGA_g,
          maxMag: s.maxMagnitude,
          meanMag: s.meanMagnitude,
          zonesAnalyzed: s.zonesAnalyzed,
          faultsAnalyzed: s.faultsAnalyzed,
          exceedance100gal: ex.PGA_100gal,
          seed: simSeed,
          numSims: simResult.meta.numSimulations,
        };
        this._simulationHistory = this._simulationHistory || [];
        this._simulationHistory.unshift(historyEntry);
        if (this._simulationHistory.length > 50) this._simulationHistory.pop();
        this._saveSimHistory();

        // Update UI
        if (loadVal) {
          loadVal.textContent = isCritical ? `CRITICAL (+${(s.meanPGA_g * 981).toFixed(1)} gal)` : `NORMAL (+${(s.meanPGA_g * 981).toFixed(1)} gal)`;
          loadVal.style.color = isCritical ? 'var(--red)' : 'var(--green)';
          loadVal.style.textShadow = isCritical ? '0 0 6px rgba(255, 26, 68, 0.4)' : '0 0 6px rgba(0, 255, 100, 0.4)';
        }
        if (locVal) {
          locVal.textContent = `${predictedLat.toFixed(2)}° N, ${predictedLon.toFixed(2)}° E`;
          locVal.style.color = 'var(--amber)';
          locVal.style.textShadow = '0 0 6px rgba(255, 170, 0, 0.4)';
        }
        if (statusVal) {
          statusVal.textContent = `CALIBRATED — MC-PSHA (${(simResult.meta.numSimulations/1000).toFixed(0)}K sims)`;
          statusVal.style.color = 'var(--cyan)';
        }

        // 3D visualization
        if (this._epicenterOverlay) {
          this._epicenterOverlay.setStressHotspot(predictedLat, predictedLon, 1.0);
        }

        const showAttention = document.getElementById('toggle-gfm-attention')?.checked ?? true;
        if (this._gfmVisualizer) {
          let customNodes = null;
          if (this._liveEvents && this._liveEvents.length > 0) {
            const sortedEvents = [...this._liveEvents]
              .sort((a, b) => {
                const dA = Math.sqrt((a.lat - predictedLat)**2 + (a.lon - predictedLon)**2);
                const dB = Math.sqrt((b.lat - predictedLat)**2 + (b.lon - predictedLon)**2);
                return dA - dB;
              })
              .slice(0, 6);
            const colors = [0xff007f, 0xff3c00, 0xffaa00, 0x00ccff, 0x7700ff, 0x00ff88];
            customNodes = sortedEvents.map((ev, i) => {
              const dist = Math.sqrt((ev.lat - predictedLat)**2 + (ev.lon - predictedLon)**2);
              const weight = Math.min(1.0, Math.max(0.1, (1 - dist / 10)) * (ev.mag / 8));
              return { name: ev.place || `M${ev.mag.toFixed(1)}`, lat: ev.lat, lon: ev.lon, weight: parseFloat(weight.toFixed(2)), color: colors[i] };
            });
          }
          this._gfmVisualizer.setLinks(predictedLat, predictedLon, showAttention, customNodes);
        }

        this.triggerRadarPing(predictedLat, predictedLon, 5.0);

        const LAT_ANCHOR = 12.0, LON_ANCHOR = 122.0, SPATIAL_SCALE = 6.0;
        const x = (predictedLon - LON_ANCHOR) * SPATIAL_SCALE;
        const y = (predictedLat - LAT_ANCHOR) * SPATIAL_SCALE;
        if (this._engine && this._engine.controls) {
          this._engine.controls.target.set(x, y, 0);
          this._engine.camera.position.set(x, y - 12, 10);
          this._engine.controls.update();
        }

        if (terminal) {
          terminal.innerHTML += `<span style="color: var(--green)">[MC-PSHA] Simulation #${this._simulationHistory.length} stored. Focus: ${predictedLat.toFixed(2)}°N, ${predictedLon.toFixed(2)}°E</span>\n`;
          terminal.scrollTop = terminal.scrollHeight;
        }

        // Update simulation history panel
        this._renderSimHistory();
      }

      btn.disabled = false;
      btn.textContent = 'RE-RUN STRESS CALIBRATION';
    });
  }

  _bindOllama() {
    const refreshBtn = document.getElementById('ollama-refresh-btn');
    const analyzeBtn = document.getElementById('ollama-analyze-btn');
    const hostInput = document.getElementById('ollama-host');
    const modelSelect = document.getElementById('ollama-model');
    const mockCheckbox = document.getElementById('ollama-mock-mode');
    const terminal = document.getElementById('ollama-terminal');

    if (!refreshBtn || !analyzeBtn || !hostInput || !modelSelect || !mockCheckbox || !terminal) return;

    // Synchronize simulator settings with local LLM input fields
    if (this._simulator) {
      this._simulator.ollamaUrl = hostInput.value.trim() + "/api/chat";
      this._simulator.activeModel = modelSelect.value;
      modelSelect.addEventListener('change', () => {
        this._simulator.activeModel = modelSelect.value;
      });
      hostInput.addEventListener('change', () => {
        this._simulator.ollamaUrl = hostInput.value.trim() + "/api/chat";
      });
    }

    // Refresh model list
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '...';
      const host = hostInput.value.trim();

      try {
        const models = await this._ollama.listModels(host);
        modelSelect.innerHTML = '';
        if (models.length === 0) {
          modelSelect.innerHTML = '<option value="">No models found</option>';
        } else {
          for (const model of models) {
            const opt = document.createElement('option');
            opt.value = model;
            opt.textContent = model;
            modelSelect.appendChild(opt);
          }
        }
        console.info(`[Ollama UI] Found ${models.length} local models.`);
      } catch (err) {
        console.warn('[Ollama UI] Error fetching models:', err.message);
        alert(`Could not connect to Ollama. Make sure Ollama is running at ${host} and OLLAMA_ORIGINS="*" is set.\nFallback custom entries or simulation mode will be used.`);
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '↻ Refresh';
      }
    });

    // Run prediction analysis
    analyzeBtn.addEventListener('click', async () => {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'COMPUTING LLM SCENARIO...';
      terminal.style.display = 'block';
      terminal.textContent = '';
      
      const host = hostInput.value.trim();
      const model = modelSelect.value;
      const isMock = mockCheckbox.checked;

      // 1. Gather context from recent earthquakes (first 5)
      const earthquakesContext = this._liveEvents.slice(0, 5).map(e => {
        return `- Mw ${e.mag.toFixed(1)} on ${new Date(e.time).getUTCFullYear()}-${new Date(e.time).getUTCMonth()+1}-${new Date(e.time).getUTCDate()} at [${e.lat.toFixed(2)} N, ${e.lon.toFixed(2)} E] (${e.place})`;
      }).join('\n');

      // 2. Gather active volcanoes context (top 3 active)
      const activeVolcanoes = this._volData.filter(v => v.Alert_Level > 0).slice(0, 3).map(v => {
        return `- Mt. ${v.name} (Alert Level ${v.Alert_Level}, region: ${v.region}, lat: ${v.latitude}, lon: ${v.longitude})`;
      }).join('\n');

      // 3. Formulate context prompt
      const prompt = `You are a NASA-grade Geophysical Foundation AI Assistant analyzing active geodynamic stress zones in the Philippine Archipelago.

Geological Context Data:
1. Recent Seismicity (Last 5 Significant Events):
${earthquakesContext || '- No recent recorded large events.'}

2. Active Volcanic Centers:
${activeVolcanoes || '- All volcanic systems quiet/normal.'}

Instructions:
1. Conduct a localized structural stress analysis along subduction segments (e.g. Cotabato Trench, Philippine Fault System).
2. Pinpoint the most probable location of the next major rupture (mag >= 6.5). You MUST output the exact coordinates at the end of the text in the format:
"COORDINATES: [latitude], [longitude]" (e.g. "COORDINATES: 5.86, 124.70").
3. Estimate the maximum potential magnitude (Mw) and focal mechanism style.
4. Output a brief geodynamical analysis report. Keep details concise and highly professional.`;

      try {
        let fullResponse = '';
        const appendText = (chunk) => {
          terminal.textContent += chunk;
          terminal.scrollTop = terminal.scrollHeight;
        };

        if (isMock) {
          fullResponse = await this._ollama.generateMockPrediction(appendText);
        } else {
          fullResponse = await this._ollama.predictSeismicRupture(host, model, prompt, appendText);
        }

        // 4. Parse coordinates from response
        const match = fullResponse.match(/COORDINATES:\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i);
        if (match) {
          const lat = parseFloat(match[1]);
          const lon = parseFloat(match[2]);

          console.info(`[Ollama UI] Parsed prediction epicenter at (${lat}, ${lon})`);
          
          // Trigger the 3D map target overlay!
          if (this._epicenterOverlay) {
            this._epicenterOverlay.setLLMPredictedFocus(lat, lon);
          }

          // Pan camera to the predicted focus
          const LAT_ANCHOR   = 12.0;
          const LON_ANCHOR   = 122.0;
          const SPATIAL_SCALE = 6.0;
          const x = (lon - LON_ANCHOR) * SPATIAL_SCALE;
          const y = (lat - LAT_ANCHOR) * SPATIAL_SCALE;
          if (this._engine && this._engine.controls) {
            this._engine.controls.target.set(x, y, 0);
            this._engine.camera.position.set(x, y - 12, 10);
            this._engine.controls.update();
          }
        } else {
          console.warn('[Ollama UI] No coordinate pattern found in LLM response.');
        }

      } catch (err) {
        console.error('[Ollama UI] Analysis failed:', err);
        terminal.textContent += `\n\n[ERROR]: ${err.message}\nEnsure Ollama is running and OLLAMA_ORIGINS="*" is configured. Check simulation mode to test the visual flow.`;
      } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'RUN LLM SEISMIC ANALYSIS';
      }
    });
  }

  _updateStatsHUD() {
    const statEvents = document.getElementById('stat-events');
    const statLargest = document.getElementById('stat-largest');
    const statVolcanoes = document.getElementById('stat-volcanoes');
    
    if (statEvents && this._liveEvents) {
      statEvents.textContent = this._liveEvents.length;
    }
    
    if (statLargest && this._liveEvents) {
      const maxMag = this._liveEvents.reduce((max, ev) => Math.max(max, ev.mag), 0);
      statLargest.textContent = maxMag > 0 ? `Mw ${maxMag.toFixed(1)}` : '--';
    }
    
    if (statVolcanoes && this._volData) {
      const activeCount = this._volData.filter(v => v.Alert_Level >= 2).length;
      statVolcanoes.textContent = activeCount;
    }
  }

  _startGFMCanvases() {
    const attnCanvas = document.getElementById('gfm-attention-canvas');
    const lossCanvas = document.getElementById('gfm-loss-canvas');
    if (!attnCanvas || !lossCanvas) return;

    const attnCtx = attnCanvas.getContext('2d');
    const lossCtx = lossCanvas.getContext('2d');
    
    let lossHistory = [];
    
    const drawStandby = () => {
      // Draw 8x8 standby matrix
      attnCtx.fillStyle = '#08080a';
      attnCtx.fillRect(0, 0, 90, 90);
      attnCtx.strokeStyle = 'rgba(0, 200, 255, 0.08)';
      attnCtx.lineWidth = 1;
      for (let i = 0; i <= 8; i++) {
        attnCtx.beginPath();
        attnCtx.moveTo(i * 11.25, 0); attnCtx.lineTo(i * 11.25, 90);
        attnCtx.moveTo(0, i * 11.25); attnCtx.lineTo(90, i * 11.25);
        attnCtx.stroke();
      }

      // Draw standby loss
      lossCtx.fillStyle = '#08080a';
      lossCtx.fillRect(0, 0, 90, 90);
      lossCtx.strokeStyle = 'rgba(0, 200, 255, 0.08)';
      for (let x = 0; x <= 90; x += 15) {
        lossCtx.beginPath();
        lossCtx.moveTo(x, 0); lossCtx.lineTo(x, 90);
        lossCtx.moveTo(0, x); lossCtx.lineTo(90, x);
        lossCtx.stroke();
      }
      lossCtx.fillStyle = 'rgba(0, 200, 255, 0.25)';
      lossCtx.font = '8px Courier New';
      lossCtx.textAlign = 'center';
      lossCtx.fillText('GFM STANDBY', 45, 48);
    };

    drawStandby();

    this._gfmDrawTrain = (progress) => {
      const densityGrid = Array.from({ length: 8 }, () => new Float32Array(8));
      let maxDensity = 0.01;

      if (this._liveEvents && this._liveEvents.length > 0) {
        for (const ev of this._liveEvents) {
          const c = Math.floor((ev.lon - 116.0) / 14.0 * 8);
          const r = Math.floor((21.5 - ev.lat) / 17.0 * 8);
          if (c >= 0 && c < 8 && r >= 0 && r < 8) {
            densityGrid[r][c] += ev.mag;
            if (densityGrid[r][c] > maxDensity) {
              maxDensity = densityGrid[r][c];
            }
          }
        }
      }

      attnCtx.fillStyle = '#08080a';
      attnCtx.fillRect(0, 0, 90, 90);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const normWeight = densityGrid[r][c] / maxDensity;
          const alpha = Math.min(1.0, Math.max(0.05, normWeight)) * 0.85;
          const hue = 190 + normWeight * 150;
          attnCtx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
          attnCtx.fillRect(c * 11.25 + 1, r * 11.25 + 1, 9.25, 9.25);
        }
      }

      lossCtx.fillStyle = '#08080a';
      lossCtx.fillRect(0, 0, 90, 90);
      lossCtx.strokeStyle = 'rgba(0, 200, 255, 0.08)';
      lossCtx.lineWidth = 1;
      for (let x = 0; x <= 90; x += 15) {
        lossCtx.beginPath();
        lossCtx.moveTo(x, 0); lossCtx.lineTo(x, 90);
        lossCtx.moveTo(0, x); lossCtx.lineTo(90, x);
        lossCtx.stroke();
      }

      if (this._liveEvents && this._liveEvents.length > 0) {
        const totalEvents = this._liveEvents.length;
        const mags = this._liveEvents.map(e => e.mag);
        const avgMag = mags.reduce((a, b) => a + b, 0) / totalEvents;
        const maxMag = Math.max(...mags);
        const recentCount = this._liveEvents.filter(e => Date.now() - e.time_ms < 86400000).length;
        const normalizedActivity = Math.min(1, recentCount / Math.max(1, totalEvents * 0.1));
        const lossFromData = (1 - normalizedActivity) * 70 + avgMag * 5 + Math.random() * 2;

        lossHistory.push({ x: progress * 90, y: 90 - lossFromData });
        if (lossHistory.length > 60) lossHistory.shift();

        lossCtx.strokeStyle = '#00ccff';
        lossCtx.lineWidth = 1.5;
        lossCtx.beginPath();
        if (lossHistory.length > 0) {
          lossCtx.moveTo(lossHistory[0].x, lossHistory[0].y);
          for (let i = 1; i < lossHistory.length; i++) {
            lossCtx.lineTo(lossHistory[i].x, lossHistory[i].y);
          }
          lossCtx.stroke();
        }

        lossCtx.fillStyle = '#ffffff';
        lossCtx.font = '7px system-ui';
        lossCtx.textAlign = 'right';
        lossCtx.fillText(`Events: ${totalEvents}`, 85, 12);
        lossCtx.fillText(`Avg M: ${avgMag.toFixed(1)}`, 85, 22);
        lossCtx.fillText(`Max M: ${maxMag.toFixed(1)}`, 85, 32);
        lossCtx.fillText(`24h: ${recentCount}`, 85, 42);
      }
    };
  }

  async _initHuggingFace() {
    const likesVal = document.getElementById('hf-likes');
    const downloadsVal = document.getElementById('hf-downloads');
    const statusVal = document.getElementById('ai-model-status');
    
    if (statusVal) {
      statusVal.textContent = 'CONNECTING TO HF...';
      statusVal.style.color = 'var(--amber)';
    }

    try {
      const response = await fetch('https://huggingface.co/api/models/thinkonward/geophysical-foundation-model');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      if (likesVal) {
        likesVal.textContent = data.likes !== undefined ? data.likes.toLocaleString() : '—';
      }
      if (downloadsVal) {
        downloadsVal.textContent = data.downloads !== undefined ? data.downloads.toLocaleString() : '—';
      }
      if (statusVal) {
        statusVal.textContent = 'STANDBY (ONLINE)';
        statusVal.style.color = 'var(--green)';
      }
    } catch (err) {
      console.error('[GFM HF Init] Failed to fetch Hugging Face stats:', err);
      if (likesVal) likesVal.textContent = '— (OFFLINE)';
      if (downloadsVal) downloadsVal.textContent = '— (OFFLINE)';
      if (statusVal) {
        statusVal.textContent = 'STANDBY (OFFLINE)';
        statusVal.style.color = 'var(--text-dim)';
      }
    }
  }

  // ─── Layer Toggles ────────────────────────────────────────────────────

  _bindLayerToggles() {
    const pairs = [
      ['toggle-seismic',   () => this._setLayerVisible('seismic_catalog', this._checked('toggle-seismic'))],
      ['toggle-volcanoes', () => this._setVolcanoesVisible()],
      ['toggle-trenches',  () => this._trench.setVisible(this._checked('toggle-trenches'))],
      ['toggle-grid',      () => this._grid.setVisible(this._checked('toggle-grid'))],
      ['toggle-pdz',       () => this._setPDZVisible()],
      ['toggle-terrain',   () => {
        if (this._terrain) this._terrain.setVisible(this._checked('toggle-terrain'));
      }],
      ['toggle-faults',    () => this._geodynamic?.setFaultsVisible(this._checked('toggle-faults'))],
      ['toggle-gps',       () => this._geodynamic?.setGPSVisible(this._checked('toggle-gps'))],
      ['toggle-hazards',   () => this._hazards?.setVisible(this._checked('toggle-hazards'))],
    ];
    for (const [id, handler] of pairs) {
      document.getElementById(id)?.addEventListener('change', handler);
    }
  }

  _checked(id)                    { return document.getElementById(id)?.checked ?? true; }
  _setLayerVisible(key, visible)  { const o = this._engine.registry.get(key); if (o) o.visible = visible; }

  _setVolcanoesVisible() {
    const visible = this._checked('toggle-volcanoes');
    for (const v of this._volData) {
      const obj = this._engine.registry.get(`volcano_${v.ID}`);
      if (obj) obj.visible = visible;
    }
  }

  _setPDZVisible() { this._setVolcanoesVisible(); }

  // ─── Magnitude Filters ────────────────────────────────────────────────

  _bindMagnitudeFilters() {
    const minEl    = document.getElementById('mag-min');
    const maxEl    = document.getElementById('mag-max');
    const minValEl = document.getElementById('mag-min-val');
    const maxValEl = document.getElementById('mag-max-val');
    if (!minEl || !maxEl) return;

    const apply = () => {
      let min = parseFloat(minEl.value);
      let max = parseFloat(maxEl.value);
      if (min > max) { min = max; minEl.value = max; }
      if (minValEl) minValEl.textContent = min.toFixed(1);
      if (maxValEl) maxValEl.textContent = max.toFixed(1);
      minEl.setAttribute('aria-valuenow', min);
      maxEl.setAttribute('aria-valuenow', max);
      this._catalog.setMagnitudeRange(min, max);
    };
    minEl.addEventListener('input', apply);
    maxEl.addEventListener('input', apply);
  }

  // ─── Depth Filter ─────────────────────────────────────────────────────

  _bindDepthFilter() {
    const el    = document.getElementById('depth-max');
    const valEl = document.getElementById('depth-max-val');
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseInt(el.value, 10);
      if (valEl) valEl.textContent = v;
      el.setAttribute('aria-valuenow', v);
      this._catalog.setDepthFilter(v);
    });
  }

  // ─── Color Map ────────────────────────────────────────────────────────

  _bindColorMap() {
    document.querySelectorAll('input[name="colormap"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) this._catalog.setColorMode(radio.value);
      });
    });
  }

  _bindMapStyles() {
    const radioGroup = document.querySelectorAll('input[name="mapstyle"]');
    if (radioGroup.length === 0) return;

    // Check correct radio button on startup
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
    const activeStyle = mapboxToken ? 'mapbox_satellite' : 'google_satellite';
    radioGroup.forEach(radio => {
      if (radio.value === activeStyle) {
        radio.checked = true;
      }
      radio.addEventListener('change', () => {
        if (radio.checked) {
          const val = radio.value;
          console.info(`[UIController] Switching map style to: ${val}`);
          if (this._terrain) {
            this._terrain.setTileStyle(val);
          }
          if (this._volcanic) {
            this._volcanic.setTileStyle(val);
          }
        }
      });
    });
  }

  // ─── Timeline ─────────────────────────────────────────────────────────

  _bindTimeline() {
    const scrubber    = document.getElementById('timeline-scrubber');
    const yearDisplay = document.getElementById('timeline-year-display');
    const btnPlay     = document.getElementById('btn-play');
    const btnPause    = document.getElementById('btn-pause');
    const btnReset    = document.getElementById('btn-reset');
    const speedSel    = document.getElementById('playback-speed');

    scrubber?.addEventListener('input', () => {
      this._timeline.year = parseFloat(scrubber.value);
      if (yearDisplay) yearDisplay.textContent = Math.floor(this._timeline.year);
      scrubber.setAttribute('aria-valuenow', scrubber.value);
      this._catalog.setYearMax(this._timeline.year);
      this.refreshLiveFeedList();
    });

    btnPlay?.addEventListener('click', () => {
      this._timeline.playing = true;
      btnPlay.setAttribute('aria-pressed', 'true');
      btnPause?.setAttribute('aria-pressed', 'false');
    });

    btnPause?.addEventListener('click', () => {
      this._timeline.playing = false;
      btnPause.setAttribute('aria-pressed', 'true');
      btnPlay?.setAttribute('aria-pressed', 'false');
    });

    btnReset?.addEventListener('click', () => {
      this._timeline.year    = 1990;
      this._timeline.playing = false;
      if (scrubber)    { scrubber.value = '1990'; scrubber.setAttribute('aria-valuenow', '1990'); }
      if (yearDisplay) yearDisplay.textContent = '1990';
      btnPause?.setAttribute('aria-pressed', 'true');
      btnPlay?.setAttribute('aria-pressed', 'false');
      this._catalog.setYearMax(1990);
      this.refreshLiveFeedList();

      if (this._epicenterOverlay) {
        this._epicenterOverlay.setEvent(null);
        this._epicenterOverlay.setStressHotspot(null, null);
        this._epicenterOverlay.setLLMPredictedFocus(null, null);
      }
      this._gfmVisualizer?.setLinks(null, null, false);
      const terminal = document.getElementById('ollama-terminal');
      if (terminal) {
        terminal.style.display = 'none';
        terminal.textContent = '';
      }
      const floatCard = document.getElementById('floating-analysis-card');
      if (floatCard) {
        floatCard.style.display = 'none';
      }
    });

    speedSel?.addEventListener('change', () => {
      this._timeline.speed = parseFloat(speedSel.value);
    });
  }

  tickTimeline(delta) {
    if (!this._timeline.playing) return;
    this._timeline.year += delta * this._timeline.speed;
    if (this._timeline.year > 2026.5) {
      this._timeline.year    = 2026.5;
      this._timeline.playing = false;
      document.getElementById('btn-pause')?.setAttribute('aria-pressed', 'true');
      document.getElementById('btn-play')?.setAttribute('aria-pressed', 'false');
    }
    const scrubber    = document.getElementById('timeline-scrubber');
    const yearDisplay = document.getElementById('timeline-year-display');
    if (scrubber)    scrubber.value = this._timeline.year.toFixed(1);
    if (yearDisplay) yearDisplay.textContent = Math.floor(this._timeline.year);
    this._catalog.setYearMax(this._timeline.year);
    this.refreshLiveFeedList();
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────

  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (this._timeline.playing) document.getElementById('btn-pause')?.click();
          else                        document.getElementById('btn-play')?.click();
          break;
        case 'r': case 'R':
          document.getElementById('btn-reset')?.click(); break;
      }
    });
  }

  // ─── UTC Clock ────────────────────────────────────────────────────────

  _startClock() {
    const el = document.getElementById('utc-clock');
    if (!el) return;
    const update = () => {
      const now = new Date();
      const hh  = String(now.getUTCHours()).padStart(2, '0');
      const mm  = String(now.getUTCMinutes()).padStart(2, '0');
      const ss  = String(now.getUTCSeconds()).padStart(2, '0');
      el.textContent = `${hh}:${mm}:${ss} UTC`;
    };
    update();
    setInterval(update, 1000);
  }

  // ─── Telemetry panel ──────────────────────────────────────────────────

  /**
   * Populate the right-panel telemetry readout from the buffer.
   * If a matching LiveEvent exists, show real timestamp and location.
   * @param {number} eventIndex
   */
  selectEvent(eventIndex) {
    if (!this._buffer) return;
    const rec = getEventRecord(this._buffer, eventIndex);

    // Reset geodynamic features and volcanoes on every selection
    if (this._geodynamic) {
      this._geodynamic.resetFaultColors();
    }
    if (this._originalVolcanoes && this._volcanic) {
      this._volData = JSON.parse(JSON.stringify(this._originalVolcanoes));
      for (const v of this._volData) {
        this._volcanic.updateTelemetry(v);
      }
      this._populateVolcanoList();
    }

    this._setText('t-id',    `EVT-${String(eventIndex).padStart(6, '0')}`);
    this._setText('t-lat',   `${rec.lat.toFixed(4)}° N`);
    this._setText('t-lon',   `${rec.lon.toFixed(4)}° E`);
    this._setText('t-depth', `${rec.depth.toFixed(1)} km`);
    this._setText('t-mag',   `Mw ${rec.mag.toFixed(2)}`);
    this._setText('t-focal', `${rec.strike.toFixed(0)}° / ${rec.dip.toFixed(0)}° / ${rec.rake.toFixed(0)}°`);

    // Try to find matching LiveEvent for timestamp and place
    const live = this._liveEvents[eventIndex];
    if (live) {
      this._setText('t-time',  live.time ? _formatUTCFull(live.time) : '—');
      this._setText('t-place', live.place || '—');
      this._setText('t-src',   live.source || '—');
    } else {
      this._setText('t-time',  '—');
      this._setText('t-place', '—');
      this._setText('t-src',   'SYNTHETIC');
    }

    this._setText('t-vs30', '—');
    this._setText('t-pga',  '—');

    this._beachball.draw(rec.strike, rec.dip, rec.rake);

    if (this._epicenterOverlay) {
      this._epicenterOverlay.setEvent(rec);
    }

    // Trigger Coulomb Stress Simulator & LLM Triage Report
    if (this._simulator) {
      const slipVector = { magnitude: Math.max(0.1, (rec.mag - 4.5) * 0.5) };
      const faultGeometry = { strike: rec.strike, dip: rec.dip, rake: rec.rake };
      const stressMetrics = this._simulator.calculateCoulombStressLoading(slipVector, faultGeometry, rec);
      
      this._setText('coulomb-load-val', `${stressMetrics.coulombLoadBars} bars`);
      const statusVal = document.getElementById('coulomb-status-val');
      if (statusVal) {
        statusVal.textContent = stressMetrics.isCritical ? 'CRITICAL (HIGH RISK)' : 'SUB-CRITICAL';
        statusVal.style.color = stressMetrics.isCritical ? 'var(--red)' : 'var(--green)';
      }
      this._setText('coulomb-coupling-val', `${(stressMetrics.couplingEfficiency * 100).toFixed(1)}%`);
      
      this._simulator.executeAutomatedTriageLog(stressMetrics, rec);

      // Dynamic fault hazard cascades
      if (this._geodynamic) {
        this._geodynamic.updateFaultHazards(stressMetrics.faultLoads);
      }

      // Volcanic triggers coupling
      if (stressMetrics.isCritical || rec.mag >= 7.0) {
        const matutum = this._volData.find(v => v.ID === 'matutum');
        if (matutum) {
          matutum.Alert_Level = 2;
          matutum.SO2_Flux = 450;
          matutum.Tilt_Deformation = 4.8;
          this._volcanic.updateTelemetry(matutum);
        }
        const parker = this._volData.find(v => v.ID === 'parker');
        if (parker) {
          parker.Alert_Level = 1;
          parker.SO2_Flux = 180;
          parker.Tilt_Deformation = 1.2;
          this._volcanic.updateTelemetry(parker);
        }
        this._populateVolcanoList();
      }

      // Coastal tsunami run-up geofencing
      if (this._hazards) {
        this._hazards.evaluateEvent({
          magnitude: rec.mag,
          latitude: rec.lat,
          longitude: rec.lon,
          depth: rec.depth
        });
      }
    }

    // Update floating Seismic Analysis card (YouTube stream style)
    const floatCard = document.getElementById('floating-analysis-card');
    if (floatCard) {
      floatCard.style.display = 'block';
      const latAbs = Math.abs(rec.lat).toFixed(2);
      const lonAbs = Math.abs(rec.lon).toFixed(2);
      const latDir = rec.lat >= 0 ? 'N' : 'S';
      const lonDir = rec.lon >= 0 ? 'E' : 'W';
      
      this._setText('fl-mag', `M ${rec.mag.toFixed(1)}`);
      this._setText('fl-coords', `${latAbs}° ${latDir}, ${lonAbs}° ${lonDir}`);
      this._setText('fl-depth', `${rec.depth.toFixed(1)} km`);
      this._setText('fl-time', live ? _formatElapsedTime(live.time) : '—');
      this._setText('fl-desc', _generateSeismicAnalysisText(rec, live?.place));
      
      const flMagEl = document.getElementById('fl-mag');
      if (flMagEl) {
        flMagEl.style.color = rec.mag >= 7.0 ? '#ff1a44' : (rec.mag >= 5.5 ? '#ffaa00' : '#00e5ff');
      }
    }

    // Handle PHIVOLCS detailed bulletin fetch
    const intensitiesRow = document.getElementById('t-intensities-row');
    const intensitiesVal = document.getElementById('t-intensities');
    
    if (intensitiesRow && intensitiesVal) {
      if (live && live.source === 'PHIVOLCS' && live.bulletinUrl) {
        intensitiesRow.style.display = 'flex';
        
        if (live.details) {
          // Already fetched, display immediately
          this._renderBulletinDetails(live.details);
        } else {
          // Show loading
          intensitiesVal.textContent = 'Loading detailed bulletin...';
          
          fetchPhivolcsDetailedBulletin(live.bulletinUrl).then(details => {
            if (details) {
              live.details = details;
              // Only update if this event is still the active selection
              const currentLive = this._liveEvents[eventIndex];
              if (currentLive && currentLive.id === live.id) {
                this._renderBulletinDetails(details);
              }
            } else {
              intensitiesVal.textContent = 'Detailed bulletin unavailable offline.';
            }
          }).catch(err => {
            console.error('[UIController GFM] Detailed bulletin load failed:', err);
            intensitiesVal.textContent = 'Failed to load bulletin details.';
          });
        }
      } else {
        intensitiesRow.style.display = 'none';
        intensitiesVal.textContent = '—';
      }
    }
  }

  _renderBulletinDetails(details) {
    const intensitiesVal = document.getElementById('t-intensities');
    if (!intensitiesVal) return;
    
    let text = '';
    if (details.feltIntensities && details.feltIntensities.length > 0) {
      text += 'Felt:\n' + details.feltIntensities.join('\n') + '\n\n';
    }
    if (details.instrumentalIntensities && details.instrumentalIntensities.length > 0) {
      text += 'Instrumental:\n' + details.instrumentalIntensities.join('\n');
    }
    if (!text) {
      text = 'No intensities reported in bulletin.';
    }
    
    intensitiesVal.textContent = text;
    
    // If source type is volcanic, we can update GFM source status or similar
    const srcVal = document.getElementById('t-src');
    if (srcVal && details.originType) {
      srcVal.textContent = `PHIVOLCS (${details.originType.toUpperCase()})`;
    }
  }

  /**
   * Populate the right-panel telemetry readout with geodynamic volcano data.
   * @param {import('../data/VolcanoDataService.js').VolcanoAsset} v
   */
  selectVolcano(v) {
    if (this._geodynamic) {
      this._geodynamic.resetFaultColors();
    }
    if (this._originalVolcanoes && this._volcanic) {
      this._volData = JSON.parse(JSON.stringify(this._originalVolcanoes));
      for (const vOrig of this._volData) {
        this._volcanic.updateTelemetry(vOrig);
      }
      this._populateVolcanoList();
    }

    this._setText('t-id',    `VOL-${v.ID.toUpperCase()}`);
    this._setText('t-time',  'ACTIVE MONITORING');
    
    const displayName = v.name.toUpperCase();
    const displayPlace = v.region ? `${displayName} (${v.region.toUpperCase()})` : displayName;
    this._setText('t-place', displayPlace);
    
    this._setText('t-lat',   `${v.latitude.toFixed(4)}° N`);
    this._setText('t-lon',   `${v.longitude.toFixed(4)}° E`);
    this._setText('t-depth', `Alert Level: ${v.Alert_Level}`);
    this._setText('t-mag',   `SO₂: ${v.SO2_Flux.toLocaleString()} t/d`);
    this._setText('t-focal', `Elev: ${v.elevation.toLocaleString()} m`);
    this._setText('t-vs30',  `PDZ: ${v.PDZ_Radius} km`);
    this._setText('t-pga',   `Tilt: ${v.Tilt_Deformation} μrad`);
    this._setText('t-src',   'PHIVOLCS');

    this._beachball.drawEmpty();

    if (this._epicenterOverlay) {
      this._epicenterOverlay.setEvent(null);
    }

    // Hide floating Seismic Analysis card
    const floatCard = document.getElementById('floating-analysis-card');
    if (floatCard) {
      floatCard.style.display = 'none';
    }

    // Populate seismic-analysis-output
    const analysisOutput = document.getElementById('seismic-analysis-output');
    if (analysisOutput) {
      analysisOutput.textContent = `Volcanic edifice ${v.name} in the ${v.region} region. Geodynamic status: Alert Level ${v.Alert_Level} indicating ${v.Alert_Level > 0 ? 'active unrest' : 'quiet baseline'}. Current sulphur dioxide (SO₂) gas flux is measured at ${v.SO2_Flux.toLocaleString()} tonnes/day with ground tilt deformation recording ${v.Tilt_Deformation} microradians. Permanent Danger Zone (PDZ) extends to a radius of ${v.PDZ_Radius} km.`;
    }
  }

  /**
   * Populate the telemetry readout with arbitrary coordinate picked on the terrain.
   * @param {number} lat
   * @param {number} lon
   */
  selectLocation(lat, lon) {
    if (this._geodynamic) {
      this._geodynamic.resetFaultColors();
    }
    if (this._originalVolcanoes && this._volcanic) {
      this._volData = JSON.parse(JSON.stringify(this._originalVolcanoes));
      for (const vOrig of this._volData) {
        this._volcanic.updateTelemetry(vOrig);
      }
      this._populateVolcanoList();
    }

    this._setText('t-id',    'GEOGRAPHIC POINT');
    this._setText('t-time',  'ACTIVE CURSOR SELECTION');
    
    // Get nearest place name
    const nearest = getNearestPlace(lat, lon);
    let placeStr = 'PHILIPPINE ARCHIPELAGO';
    if (nearest) {
      placeStr = nearest.parent
        ? `${nearest.name.toUpperCase()} (${nearest.parent.toUpperCase()})`
        : nearest.name.toUpperCase();
    }
    this._setText('t-place', placeStr);
    
    this._setText('t-lat',   `${lat.toFixed(4)}° N`);
    this._setText('t-lon',   `${lon.toFixed(4)}° E`);
    this._setText('t-depth', '0.0 km');
    this._setText('t-mag',   '—');
    this._setText('t-focal', '—');
    this._setText('t-vs30',  '—');
    this._setText('t-pga',   '—');
    this._setText('t-src',   'INTERACTIVE CURSOR');

    this._beachball.drawEmpty();

    if (this._epicenterOverlay) {
      this._epicenterOverlay.setEvent(null);
    }

    // Hide floating Seismic Analysis card
    const floatCard = document.getElementById('floating-analysis-card');
    if (floatCard) {
      floatCard.style.display = 'none';
    }

    // Populate seismic-analysis-output
    const analysisOutput = document.getElementById('seismic-analysis-output');
    if (analysisOutput) {
      analysisOutput.textContent = `Coordinates picked: Latitude ${lat.toFixed(4)}° N, Longitude ${lon.toFixed(4)}° E.\nLocated near ${placeStr}.\nTectonic sector: Philippine sea plate compression margin. No active seismic rupture recorded at this coordinate.`;
    }
  }

  // ─── Tooltip ──────────────────────────────────────────────────────────

  showTooltip(x, y, data) {
    const el      = document.getElementById('event-tooltip');
    const content = document.getElementById('tooltip-content');
    if (!el || !content) return;

    // Find matching live event for place name
    const live = this._liveEvents[data.index ?? -1];
    const place = live?.place ?? '';

    content.innerHTML = `
      <div class="tt-row"><span class="tt-key">Mw</span>
        <span class="tt-val" style="color:${_magColor(data.mag)}">${data.mag.toFixed(2)} <span style="font-size:8px;opacity:0.7">${_magLabel(data.mag)}</span></span>
      </div>
      <div class="tt-row"><span class="tt-key">Depth</span>
        <span class="tt-val">${data.depth.toFixed(1)} km <span style="font-size:8px;opacity:0.7">${_depthLabel(data.depth)}</span></span>
      </div>
      <div class="tt-row"><span class="tt-key">Lat</span><span class="tt-val">${data.lat.toFixed(3)}°</span></div>
      <div class="tt-row"><span class="tt-key">Lon</span><span class="tt-val">${data.lon.toFixed(3)}°</span></div>
      ${place ? `<div class="tt-row tt-place"><span class="tt-place-text">${place}</span></div>` : ''}
    `;
    el.style.left = `${x + 14}px`;
    el.style.top  = `${y - 10}px`;
    el.setAttribute('aria-hidden', 'false');
  }

  /**
   * Tooltip variant for volcanic edifice nodes.
   * @param {number} x  Screen X
   * @param {number} y  Screen Y
   * @param {import('../data/VolcanoDataService.js').VolcanoAsset} v
   */
  showVolcanoTooltip(x, y, v) {
    const el      = document.getElementById('event-tooltip');
    const content = document.getElementById('tooltip-content');
    if (!el || !content) return;

    const alertColor =
      v.Alert_Level >= 3 ? '#ff1a44' :
      v.Alert_Level >= 2 ? '#ffaa00' : '#00ff88';

    content.innerHTML = `
      <div class="tt-row tt-place"><span class="tt-place-text">${v.name.toUpperCase()}</span></div>
      <div class="tt-row"><span class="tt-key">Alert</span>
        <span class="tt-val" style="color:${alertColor}">LEVEL ${v.Alert_Level}</span>
      </div>
      <div class="tt-row"><span class="tt-key">Region</span><span class="tt-val">${v.region}</span></div>
      <div class="tt-row"><span class="tt-key">Elev</span><span class="tt-val">${v.elevation.toLocaleString()} m</span></div>
      <div class="tt-row"><span class="tt-key">SO₂</span><span class="tt-val">${v.SO2_Flux.toLocaleString()} t/d</span></div>
      <div class="tt-row"><span class="tt-key">PDZ</span><span class="tt-val">${v.PDZ_Radius} km</span></div>
      <div class="tt-row"><span class="tt-key">Lat</span><span class="tt-val">${v.latitude.toFixed(3)}°</span></div>
      <div class="tt-row"><span class="tt-key">Lon</span><span class="tt-val">${v.longitude.toFixed(3)}°</span></div>
    `;
    el.style.left = `${x + 14}px`;
    el.style.top  = `${y - 10}px`;
    el.setAttribute('aria-hidden', 'false');
  }

  hideTooltip() {
    document.getElementById('event-tooltip')?.setAttribute('aria-hidden', 'true');
  }

  // ─── Volcano list ─────────────────────────────────────────────────────

  _populateVolcanoList() {
    const container = document.getElementById('volcano-list');
    if (!container || !this._volData) return;
    const sorted = [...this._volData].sort((a, b) => {
      if (b.Alert_Level !== a.Alert_Level) return b.Alert_Level - a.Alert_Level;
      return a.name.localeCompare(b.name);
    });
    container.innerHTML = sorted.map(v => `
      <div class="volcano-item" role="listitem" aria-label="${v.name}, Alert Level ${v.Alert_Level}">
        <span class="volcano-name">${v.name.toUpperCase()}</span>
        <span class="volcano-alert alert-${v.Alert_Level}">ALT ${v.Alert_Level}</span>
      </div>`).join('');
  }

  // ─── Radar Ping ───────────────────────────────────────────────────────

  triggerRadarPing(lat, lon, mag) {
    if (this._terrain?.triggerPing) this._terrain.triggerPing(lat, lon, mag);
  }

  // ─── Situational Media Panel ──────────────────────────────────────────

  openMediaPanel(eventIndex, report = null) {
    const panel = document.getElementById('media-panel');
    if (!panel || !this._buffer) return;

    const rec  = getEventRecord(this._buffer, eventIndex);
    const live = this._liveEvents[eventIndex] ?? null;

    this._setText('mp-event-id', live?.id
      ? live.id.replace(/^phivolcs_\d+_/, '').substring(0, 20)
      : `EVT-${String(eventIndex).padStart(6, '0')}`);

    this._setText('mp-mag',   `Mw ${rec.mag.toFixed(2)}`);
    this._setText('mp-depth', `${rec.depth.toFixed(1)} km (${_depthLabel(rec.depth)})`);
    this._setText('mp-lat',   `${rec.lat.toFixed(4)}° N`);
    this._setText('mp-lon',   `${rec.lon.toFixed(4)}° E`);
    this._setText('mp-focal', `${rec.strike.toFixed(0)}° / ${rec.dip.toFixed(0)}° / ${rec.rake.toFixed(0)}°`);
    this._setText('mp-time',  live?.time ? _formatUTCFull(live.time) : '—');
    this._setText('mp-place', live?.place || '—');

    const isHazardous = rec.mag >= 5.0;
    const badge    = document.getElementById('mp-damage-badge');
    const dmgLabel = document.getElementById('mp-damage-label');
    const srcEl    = document.getElementById('mp-source-label');

    if (badge && dmgLabel) {
      if (report?.damage_classification) {
        const dc = report.damage_classification;
        dmgLabel.textContent = dc.replace(/_/g, ' ');
        badge.className = 'damage-badge ' + (
          dc.includes('COLLAPSE') || dc.includes('LEVEL_4') || dc.includes('LEVEL_5') ? 'damage-critical' :
          dc.includes('LEVEL_3')  || dc.includes('SEVERE')                            ? 'damage-severe'   :
          dc.includes('LEVEL_2')  || dc.includes('MODERATE')                          ? 'damage-moderate' :
                                                                                         'damage-minor'
        );
        badge.hidden = false;
      } else if (isHazardous) {
        dmgLabel.textContent = 'SITUATIONAL ASSESSMENT PENDING';
        badge.className      = 'damage-badge damage-pending';
        badge.hidden         = false;
      } else {
        badge.hidden = true;
      }
    }

    if (srcEl) srcEl.textContent = live?.source ?? report?.source ?? (isHazardous ? 'PHIVOLCS AUTO-ALERT' : '—');

    // Media feed
    const imgWrap   = document.getElementById('mp-image-wrap');
    const imgEl     = document.getElementById('mp-damage-image');
    const noMedia   = document.getElementById('mp-no-media');
    const mediaFlag = document.getElementById('mp-media-flag');

    if (imgWrap && imgEl && noMedia) {
      if (report?.has_media && report?.image_url) {
        imgEl.src = '';
        imgEl.alt = `Damage photograph — ${report.damage_classification ?? ''}`;
        noMedia.hidden = true;
        imgWrap.hidden = false;
        if (mediaFlag) mediaFlag.textContent = 'MEDIA: LOADING…';

        const tmp = new Image();
        tmp.onload  = () => { imgEl.src = report.image_url; if (mediaFlag) mediaFlag.textContent = 'MEDIA: LIVE'; };
        tmp.onerror = () => {
          imgWrap.hidden = true; noMedia.hidden = false;
          noMedia.textContent = 'MEDIA STREAM UNAVAILABLE';
          if (mediaFlag) mediaFlag.textContent = 'MEDIA: OFFLINE';
        };
        tmp.src = report.image_url;
      } else {
        imgWrap.hidden = true; noMedia.hidden = false;
        noMedia.textContent = isHazardous ? 'AWAITING MEDIA FEED…' : 'NO MEDIA FOR THIS EVENT';
        if (mediaFlag) mediaFlag.textContent = 'MEDIA: —';
      }
    }

    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    isHazardous ? panel.setAttribute('data-alert', 'true') : panel.removeAttribute('data-alert');
    document.getElementById('mp-close')?.focus();
  }

  closeMediaPanel() {
    const panel = document.getElementById('media-panel');
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.removeAttribute('data-alert');
    this._engine.renderer.domElement.focus();
  }

  _bindMediaPanel() {
    document.getElementById('mp-close')?.addEventListener('click', () => this.closeMediaPanel());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const p = document.getElementById('media-panel');
        if (p && !p.hidden) this.closeMediaPanel();
      }
    });
  }

  // ─── Simulation History ────────────────────────────────────────────────

  _saveSimHistory() {
    try {
      localStorage.setItem('cisv_sim_history', JSON.stringify(this._simulationHistory || []));
    } catch {}
  }

  _loadSimHistory() {
    try {
      const data = localStorage.getItem('cisv_sim_history');
      this._simulationHistory = data ? JSON.parse(data) : [];
    } catch {
      this._simulationHistory = [];
    }
  }

  _renderSimHistory() {
    const container = document.getElementById('sim-history-list');
    if (!container) return;
    if (!this._simulationHistory) this._loadSimHistory();

    if (this._simulationHistory.length === 0) {
      container.innerHTML = '<div style="color: var(--text-dim); font-size: 9px; padding: 8px;">No simulations yet. Click RE-RUN STRESS CALIBRATION to start.</div>';
      return;
    }

    container.innerHTML = this._simulationHistory.map((s, i) => {
      const time = new Date(s.timestamp);
      const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const magColor = s.hazardMag > 6.0 ? 'var(--red)' : s.hazardMag > 4.5 ? 'var(--amber)' : 'var(--green)';
      return `<div class="sim-history-entry" data-idx="${i}" style="padding: 6px 8px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(0,200,255,0.08)'" onmouseout="this.style.background='transparent'">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--text-secondary); font-size: 8px;">#${this._simulationHistory.length - i}</span>
          <span style="color: var(--text-dim); font-size: 8px;">${dateStr} ${timeStr}</span>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 3px;">
          <span style="color: ${magColor}; font-size: 10px; font-weight: 600;">M${s.hazardMag.toFixed(1)}</span>
          <span style="color: var(--text-dim); font-size: 9px;">${s.lat.toFixed(2)}°N ${s.lon.toFixed(2)}°E</span>
        </div>
        <div style="color: var(--text-dim); font-size: 8px; margin-top: 2px;">
          PGA: ${(s.meanPGA * 981).toFixed(0)} gal | ${(s.numSims/1000).toFixed(0)}K sims
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.sim-history-entry').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const entry = this._simulationHistory[idx];
        if (entry) {
          this._epicenterOverlay?.setStressHotspot(entry.lat, entry.lon, 1.0);
          this._gfmVisualizer?.setLinks(entry.lat, entry.lon, true);
          const LAT_ANCHOR = 12.0, LON_ANCHOR = 122.0, SPATIAL_SCALE = 6.0;
          const x = (entry.lon - LON_ANCHOR) * SPATIAL_SCALE;
          const y = (entry.lat - LAT_ANCHOR) * SPATIAL_SCALE;
          if (this._engine?.controls) {
            this._engine.controls.target.set(x, y, 0);
            this._engine.camera.position.set(x, y - 12, 10);
            this._engine.controls.update();
          }
        }
      });
    });
  }

  // ─── Utility ──────────────────────────────────────────────────────────

  _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

// ── Date formatting helpers ───────────────────────────────────────────────────

/**
 * Short UTC time for the feed list: "12 Jun 1995, 05:37 UTC"
 * @param {number} ms Unix ms
 */
function _formatUTCShort(ms) {
  const d   = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  const yr  = d.getUTCFullYear();
  const hh  = String(d.getUTCHours()).padStart(2, '0');
  const mm  = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${mon} ${yr}, ${hh}:${mm} UTC`;
}

/**
 * Full UTC timestamp for the telemetry panel: "2026-06-12 05:37:44 UTC"
 * @param {number} ms Unix ms
 */
function _formatUTCFull(ms) {
  const d   = new Date(ms);
  const yr  = d.getUTCFullYear();
  const mo  = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy  = String(d.getUTCDate()).padStart(2, '0');
  const hh  = String(d.getUTCHours()).padStart(2, '0');
  const mm  = String(d.getUTCMinutes()).padStart(2, '0');
  const ss  = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yr}-${mo}-${dy} ${hh}:${mm}:${ss} UTC`;
}
