/**
 * TelemetryBridge.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-thread side of the live telemetry bridge + contextual audio siren.
 *
 *  - Owns the telemetry Web Worker (USGS 30 s stream + precursor channels)
 *    and fans events out to subscriber callbacks.
 *  - Dynamic Frequency Modulator siren: pitch, oscillation rate and timbre
 *    encode spatial threat context so an operator woken at midnight knows
 *    "close and powerful" vs "powerful but far" before reading a single
 *    number.
 *  - Browser autoplay policy: the AudioContext unlocks on the first user
 *    gesture; alerts that fire before unlock queue one pending siren.
 *  - Inside the Tauri shell the native rodio siren (hardware-level, survives
 *    webview suspension) is ALSO triggered for critical events.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Default operator location — General Santos City (configurable). */
const DEFAULT_USER_LOCATION = { lat: 6.1164, lon: 125.1716 };

const EARTH_RADIUS_KM = 6371.0;

export class TelemetryBridge {
  /**
   * @param {object} [opts]
   * @param {{lat:number, lon:number}} [opts.userLocation]
   * @param {number} [opts.usgsPollMs=30000]
   * @param {object} [opts.precursorEndpoints]  — {thermal_ir?: url, tec?: url}
   */
  constructor(opts = {}) {
    this.userLocation = opts.userLocation
      ?? this._loadStoredLocation()
      ?? DEFAULT_USER_LOCATION;

    /** @type {Set<(ev: object) => void>} */
    this._eventSubscribers = new Set();
    /** @type {Set<(channel: string, value: number) => void>} */
    this._precursorSubscribers = new Set();
    /** @type {Set<(source: string, ok: boolean, detail: string) => void>} */
    this._statusSubscribers = new Set();

    this.audioCtx = null;
    this._pendingSiren = null;
    this._sirenActive = false;
    this._armAudioUnlock();

    // ── Worker ──────────────────────────────────────────────────────────
    this._worker = new Worker(
      new URL('../workers/telemetry-worker.js', import.meta.url),
      { type: 'module' }
    );
    this._worker.onmessage = ({ data }) => this._route(data);
    this._worker.postMessage({
      type: 'configure',
      usgsPollMs: opts.usgsPollMs ?? 30_000,
      precursorEndpoints: opts.precursorEndpoints ?? null,
    });

    console.info('[CISV] TelemetryBridge online — USGS 30 s stream, PH bbox 4–21°N / 116–127°E.');
  }

  // ── Subscription API ────────────────────────────────────────────────────

  onSeismicEvent(cb)  { this._eventSubscribers.add(cb);     return () => this._eventSubscribers.delete(cb); }
  onPrecursor(cb)     { this._precursorSubscribers.add(cb); return () => this._precursorSubscribers.delete(cb); }
  onFeedStatus(cb)    { this._statusSubscribers.add(cb);    return () => this._statusSubscribers.delete(cb); }

  _route(msg) {
    switch (msg?.type) {
      case 'seismic-event':
        this._eventSubscribers.forEach(cb => cb(msg.event));
        this.executeContextualSiren(msg.event, this.userLocation.lat, this.userLocation.lon);
        break;
      case 'precursor':
        this._precursorSubscribers.forEach(cb => cb(msg.channel, msg.value));
        break;
      case 'status':
        this._statusSubscribers.forEach(cb => cb(msg.source, msg.ok, msg.detail));
        break;
    }
  }

  // ── Geodesy ─────────────────────────────────────────────────────────────

  /** Great-circle (haversine) distance in km. */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  }

  // ── Contextual siren ────────────────────────────────────────────────────

  /**
   * Threat-contextual audio alert. Pitch band + oscillation speed encode
   * proximity and intensity.
   * @param {{magnitude:number, latitude:number, longitude:number}} eventData
   */
  executeContextualSiren(eventData, userLat, userLon) {
    if (eventData.magnitude < 5.0) return;

    const distance = this.calculateDistance(
      userLat, userLon, eventData.latitude, eventData.longitude
    );

    if (distance < 100) {
      // CRITICAL THREAT — close and powerful: high-pitch rapid oscillation.
      this._requestSiren(880, 1200, 0.2, true);
    } else {
      // DISTANT THREAT — powerful but far: heavy bass rumble denoting
      // long-period structural rolling waves.
      this._requestSiren(110, 220, 0.8, false);
    }

    // Inside the Tauri shell, also fire the hardware siren — it works even
    // if the webview tab is suspended or audio is muted at the DOM level.
    if (distance < 100 && window.__TAURI__?.invoke) {
      window.__TAURI__.invoke('trigger_native_siren').catch(() => {});
    }

    console.warn(
      `[CISV] SIREN — Mw ${eventData.magnitude.toFixed(1)} at ${distance.toFixed(0)} km ` +
      `(${distance < 100 ? 'CRITICAL' : 'DISTANT'} threat profile)`
    );
  }

  _requestSiren(freqLow, freqHigh, period, rapid) {
    if (!this.audioCtx || this.audioCtx.state === 'suspended') {
      // Autoplay-locked: queue the most recent request; it plays on unlock.
      this._pendingSiren = [freqLow, freqHigh, period, rapid];
      this.audioCtx?.resume().catch(() => {});
      return;
    }
    this.playSirenSignal(freqLow, freqHigh, period, rapid);
  }

  /**
   * Dynamic Frequency Modulator: oscillator sweeps freqLow↔freqHigh every
   * `period` seconds for ~8 s. `rapid` adds a square-ish urgency timbre.
   */
  playSirenSignal(freqLow, freqHigh, period, rapid) {
    if (this._sirenActive) return; // don't stack overlapping sirens
    this._sirenActive = true;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const DURATION = 8.0;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = rapid ? 'square' : 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Frequency sweep schedule — sawtooth ramp between the two pitches
    osc.frequency.setValueAtTime(freqLow, now);
    const cycles = Math.floor(DURATION / period);
    for (let i = 0; i < cycles; i++) {
      const t = now + i * period;
      osc.frequency.linearRampToValueAtTime(freqHigh, t + period * 0.5);
      osc.frequency.linearRampToValueAtTime(freqLow,  t + period);
    }

    // Envelope: fast attack, sustain, release
    const peak = rapid ? 0.6 : 0.45;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.08);
    gain.gain.setValueAtTime(peak, now + DURATION - 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + DURATION);

    osc.start(now);
    osc.stop(now + DURATION);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this._sirenActive = false;
    };
  }

  // ── Audio unlock & location persistence ─────────────────────────────────

  _armAudioUnlock() {
    const unlock = () => {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new Ctx();
      }
      this.audioCtx.resume().then(() => {
        if (this._pendingSiren) {
          this.playSirenSignal(...this._pendingSiren);
          this._pendingSiren = null;
        }
      }).catch(() => {});
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setUserLocation(lat, lon) {
    this.userLocation = { lat, lon };
    try {
      localStorage.setItem('cisv_user_location', JSON.stringify(this.userLocation));
    } catch { /* storage unavailable — session-only */ }
  }

  _loadStoredLocation() {
    try {
      const raw = localStorage.getItem('cisv_user_location');
      if (!raw) return null;
      const loc = JSON.parse(raw);
      return Number.isFinite(loc.lat) && Number.isFinite(loc.lon) ? loc : null;
    } catch {
      return null;
    }
  }

  dispose() {
    this._worker.postMessage({ type: 'stop' });
    this._worker.terminate();
    this.audioCtx?.close().catch(() => {});
  }
}
