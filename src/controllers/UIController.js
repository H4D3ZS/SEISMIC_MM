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

    /** @type {import('../data/PhivolcsDataService.js').LiveEvent[]} */
    this._liveEvents = opts.liveEvents ?? [];

    this._beachball = new BeachballRenderer(
      document.getElementById('beachball-canvas')
    );
    this._beachball.drawEmpty();

    this._timeline = {
      playing:  false,
      year:     2026,
      speed:    1.0,
    };

    this._bindLayerToggles();
    this._bindMagnitudeFilters();
    this._bindDepthFilter();
    this._bindColorMap();
    this._bindTimeline();
    this._bindKeyboard();
    this._bindMediaPanel();
    this._bindLiveFeedToggle();
    this._startClock();
    this._populateVolcanoList();
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
   * @param {import('../data/PhivolcsDataService.js').LiveEvent[]} events
   */
  refreshLiveFeedList(events) {
    const container = document.getElementById('live-feed-list');
    if (!container) return;

    if (!events || events.length === 0) {
      container.innerHTML = '<div class="feed-empty">No live events available</div>';
      return;
    }

    // Show newest 60 only — older history is visible through the 3D catalog
    const recent = events.slice(0, 60);

    container.innerHTML = recent.map((ev, idx) => {
      const mag       = ev.mag.toFixed(1);
      const depth     = ev.depth.toFixed(0);
      const color     = _magColor(ev.mag);
      const magLabel  = _magLabel(ev.mag);
      const depLabel  = _depthLabel(ev.depth);
      const place     = ev.place || `${ev.lat.toFixed(2)}°N ${ev.lon.toFixed(2)}°E`;
      const timeStr   = ev.time ? _formatUTCShort(ev.time) : '—';
      const srcBadge  = ev.source === 'PHIVOLCS' ? 'src-phivolcs' : 'src-usgs';

      return `
        <div class="feed-item" role="button" tabindex="0"
             data-index="${idx}"
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
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        const mag = parseFloat(item.dataset.mag);
        this.triggerRadarPing(lat, lon, mag);
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
    });

    speedSel?.addEventListener('change', () => {
      this._timeline.speed = parseFloat(speedSel.value);
    });
  }

  tickTimeline(delta) {
    if (!this._timeline.playing) return;
    this._timeline.year += delta * this._timeline.speed;
    if (this._timeline.year > 2026) {
      this._timeline.year    = 2026;
      this._timeline.playing = false;
      document.getElementById('btn-pause')?.setAttribute('aria-pressed', 'true');
      document.getElementById('btn-play')?.setAttribute('aria-pressed', 'false');
    }
    const scrubber    = document.getElementById('timeline-scrubber');
    const yearDisplay = document.getElementById('timeline-year-display');
    if (scrubber)    scrubber.value = this._timeline.year.toFixed(1);
    if (yearDisplay) yearDisplay.textContent = Math.floor(this._timeline.year);
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

  // ─── Utility ──────────────────────────────────────────────────────────

  _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

// ── Date formatting helpers ───────────────────────────────────────────────────

/**
 * Short UTC time for the feed list: "12 Jun 05:37 UTC"
 * @param {number} ms Unix ms
 */
function _formatUTCShort(ms) {
  const d   = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  const hh  = String(d.getUTCHours()).padStart(2, '0');
  const mm  = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${mon} ${hh}:${mm} UTC`;
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
