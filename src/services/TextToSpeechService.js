/**
 * TextToSpeechService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-Time Earthquake Alert Text-to-Speech
 *
 * Uses Supertonic (on-device ONNX TTS) when available via local server,
 * falls back to browser Web Speech API (SpeechSynthesis) for instant alerts.
 *
 * Features:
 *   - Auto-announces new earthquakes with magnitude, location, depth
 *   - Generates hazard warnings (liquefaction, tsunami, sinkhole)
 *   - Speaks simulation results and prediction summaries
 *   - Configurable voice, rate, pitch
 *   - Queue system to prevent overlapping announcements
 *
 * References:
 *   - Supertone Inc. (2026). "Supertonic 3 — Lightning Fast On-Device TTS."
 *     https://github.com/supertone-inc/supertonic
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class TextToSpeechService {
  constructor() {
    this.enabled = true;
    this.rate = 1.0;
    this.pitch = 0.9;
    this.volume = 0.8;
    this.queue = [];
    this.speaking = false;
    this.supertonicUrl = 'http://localhost:8090/v1/audio/speech';
    this.useSupertonic = false;
    this.lang = 'en';

    // Check if Web Speech API is available
    this.hasSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

    // Try to detect Supertonic server
    this._checkSupertonic();
  }

  async _checkSupertonic() {
    try {
      const res = await fetch(this.supertonicUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'test', model: 'supertonic-3', voice: 'M1' }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok || res.status === 422) {
        this.useSupertonic = true;
        console.info('[TTS] Supertonic server detected');
      }
    } catch {
      this.useSupertonic = false;
      console.info('[TTS] Using browser Speech API (Supertonic not available)');
    }
  }

  /**
   * Speak text aloud. Queues if already speaking.
   */
  async speak(text, options = {}) {
    if (!this.enabled || !text) return;

    const item = {
      text,
      priority: options.priority || 'normal', // 'urgent' bypasses queue
      ...options,
    };

    if (item.priority === 'urgent' && this.speaking) {
      // Cancel current speech for urgent alerts
      if (this.hasSpeechSynthesis) window.speechSynthesis.cancel();
      this.queue = [];
    }

    this.queue.push(item);
    this._processQueue();
  }

  async _processQueue() {
    if (this.speaking || this.queue.length === 0) return;

    this.speaking = true;
    const item = this.queue.shift();

    try {
      if (this.useSupertonic) {
        await this._speakSupertonic(item.text);
      } else if (this.hasSpeechSynthesis) {
        await this._speakBrowser(item.text);
      }
    } catch (err) {
      console.warn('[TTS] Speech error:', err.message);
    } finally {
      this.speaking = false;
      if (this.queue.length > 0) {
        setTimeout(() => this._processQueue(), 200);
      }
    }
  }

  _speakBrowser(text) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.lang;
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;
      utterance.volume = this.volume;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  async _speakSupertonic(text) {
    const res = await fetch(this.supertonicUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        model: 'supertonic-3',
        voice: 'M1',
        lang: this.lang,
      }),
    });
    if (!res.ok) throw new Error(`Supertonic HTTP ${res.status}`);

    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    return new Promise((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.play();
    });
  }

  // ── Earthquake Alert Generators ──────────────────────────────────────

  /**
   * Announce a new earthquake event.
   */
  announceEarthquake(event) {
    const { mag, lat, lon, depth, place } = event;
    const severity = mag >= 7 ? 'MAJOR' : mag >= 6 ? 'STRONG' : mag >= 5 ? 'MODERATE' : 'MINOR';

    let text = `${severity} earthquake detected. `;
    text += `Magnitude ${mag.toFixed(1)} `;
    text += `at ${lat.toFixed(2)} degrees North, ${lon.toFixed(2)} degrees East. `;
    text += `Depth ${Math.round(depth)} kilometers. `;

    if (place) text += `Location: ${place}. `;

    if (mag >= 6) {
      text += `This is a significant seismic event. Monitor for aftershocks and secondary hazards. `;
    }

    this.speak(text, { priority: mag >= 5 ? 'urgent' : 'normal' });
  }

  /**
   * Announce hazard warnings.
   */
  announceHazard(hazard) {
    const { type, location, severity } = hazard;
    let text = `Hazard alert: ${type} reported at ${location}. `;
    text += `Severity level: ${severity}. `;
    text += `Take appropriate precautions.`;

    this.speak(text, { priority: 'urgent' });
  }

  /**
   * Announce simulation results.
   */
  announceSimulation(results) {
    const { hazardMag, exceedance100gal, location } = results;
    let text = `Simulation complete. `;
    text += `Hazard consistent magnitude: ${hazardMag.toFixed(1)}. `;
    text += `Annual exceedance probability for 100 gal PGA: ${(exceedance100gal * 100).toFixed(1)} percent. `;

    if (exceedance100gal > 0.05) {
      text += `Elevated seismic hazard detected in this region. `;
    }

    this.speak(text, { priority: 'normal' });
  }

  /**
   * Announce prediction results.
   */
  announcePrediction(results) {
    const { location, probability, window } = results;
    let text = `Prediction analysis complete. `;
    text += `Highest risk location: ${location}. `;
    text += `Probability in ${window}: ${probability.toFixed(1)} percent. `;

    if (probability > 30) {
      text += `Elevated risk detected. Monitor closely. `;
    }

    this.speak(text, { priority: 'normal' });
  }

  /**
   * Announce new PHIVOLCS data arrival.
   */
  announceDataArrival(count, source) {
    if (count > 0) {
      this.speak(`${count} new earthquake events detected from ${source}.`, { priority: 'normal' });
    }
  }

  // ── Controls ─────────────────────────────────────────────────────────

  enable() { this.enabled = true; }
  disable() { this.enabled = false; window.speechSynthesis?.cancel(); this.queue = []; }
  setRate(r) { this.rate = r; }
  setPitch(p) { this.pitch = p; }
  setVolume(v) { this.volume = v; }
  setLang(l) { this.lang = l; }
}
