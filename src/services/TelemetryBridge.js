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
 *  - Browser autoplay policy: the AudioContext unlocks on the first  * ─────────────────────────────────────────────────────────────────────────────
 */

import { CrossPlatformHardwareBridge } from './bridge.js';

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

    this.hardwareBridge = new CrossPlatformHardwareBridge();

    // ── Worker ──────────────────────────────────────────────────────────
    this._worker = new Worker(
      new URL('../workers/stream.worker.js', import.meta.url),
      { type: 'module' }
    );
    this._worker.onmessage = ({ data }) => this._route(data);
    this._worker.postMessage({
      type: 'configure',
      usgsPollMs: opts.usgsPollMs ?? 30_000,
      precursorEndpoints: opts.precursorEndpoints ?? null,
    });

    console.info('[CISV] TelemetryBridge online — Web Worker binary ingestion initialized.');
  }

  // ── Subscription API ────────────────────────────────────────────────────

  onSeismicEvent(cb)  { this._eventSubscribers.add(cb);     return () => this._eventSubscribers.delete(cb); }
  onPrecursor(cb)     { this._precursorSubscribers.add(cb); return () => this._precursorSubscribers.delete(cb); }
  onFeedStatus(cb)    { this._statusSubscribers.add(cb);    return () => this._statusSubscribers.delete(cb); }

  _route(msg) {
    switch (msg?.type) {
      case 'seismic-event-bin':
        const view = new Float32Array(msg.buffer);
        const event = {
          id: msg.id,
          magnitude: view[3],
          place: msg.place,
          latitude: view[0],
          longitude: view[1],
          depth: view[2],
          time_ms: msg.time_ms,
          x: view[4],
          y: view[5],
          z: view[6],
          source: msg.source,
          situational_report: msg.situational_report
        };
        this._eventSubscribers.forEach(cb => cb(event));
        this.executeContextualSiren(event, this.userLocation.lat, this.userLocation.lon);
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
   * Threat-contextual audio alert. Proximity dictates the siren type.
   * @param {{magnitude:number, latitude:number, longitude:number}} eventData
   */
  executeContextualSiren(eventData, userLat, userLon) {
    const magInput  = document.getElementById('siren-mag-threshold');
    const distInput = document.getElementById('siren-dist-threshold');

    const minMag  = magInput  ? parseFloat(magInput.value)  : 5.0;
    const maxDist = distInput ? parseFloat(distInput.value) : 100.0;

    if (eventData.magnitude < minMag) return;

    const distance = this.calculateDistance(
      userLat, userLon, eventData.latitude, eventData.longitude
    );

    if (distance > maxDist) return;

    // Call unified hardware bridge to play siren signal
    this.hardwareBridge.fireEmergencySystemSiren(eventData.magnitude);

    console.warn(
      `[CISV] SIREN — Mw ${eventData.magnitude.toFixed(1)} at ${distance.toFixed(0)} km ` +
      `(Threat profile matched: Mag >= ${minMag}, Dist <= ${maxDist})`
    );
  }

  // ── Location persistence ────────────────────────────────────────────────

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
    this.hardwareBridge.audioContext?.close().catch(() => {});
  }
}
