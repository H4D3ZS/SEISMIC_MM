/**
 * bridge.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-Platform Hardware Audio & Alert Bridge.
 *
 *  - Determines if the dashboard is running in a desktop browser or inside
 *    a mobile/edge native wrapper (like Flutter or Tauri).
 *  - Routes emergency triggers to the appropriate bridge:
 *      – Flutter Hardware Bridge (`window.FlutterHardwareBridge`)
 *      – Tauri Hardware Bridge (`window.__TAURI__`)
 *      – Browser Web Audio Context Oscillator Sweep (440Hz -> 900Hz -> 440Hz)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class CrossPlatformHardwareBridge {
  constructor() {
    this.hasFlutterWrapper = window.FlutterHardwareBridge !== undefined;
    this.hasTauriWrapper   = window.__TAURI__ !== undefined;
    this.audioContext      = null;
    this._sirenActive      = false;
  }

  /**
   * Fire the sirens.
   * @param {number} magnitude
   */
  fireEmergencySystemSiren(magnitude) {
    // 1. Update Siren HUD Status Panel if present
    const statusUi = document.getElementById('siren-status-panel');
    if (statusUi) {
      statusUi.className = 'status-red-flash';
      statusUi.innerText = `ALERT // M${magnitude.toFixed(1)} ACTIVITY IDENTIFIED`;

      // Reset style and text back to standby after 8 seconds
      setTimeout(() => {
        statusUi.className = 'status-green';
        statusUi.innerText = 'MONITORING ACTIVE // STANDBY';
      }, 8000);
    }

    // 2. Dispatch to the active environment wrapper
    if (this.hasFlutterWrapper) {
      console.info(`[CISV Bridge] Routing alert (M${magnitude}) to Flutter Wrapper.`);
      window.FlutterHardwareBridge.postMessage(`TRIGGER_ALARM|${magnitude}`);
    } else if (this.hasTauriWrapper && window.__TAURI__?.invoke) {
      console.info(`[CISV Bridge] Routing alert (M${magnitude}) to Tauri native rodio.`);
      window.__TAURI__.invoke('trigger_native_siren').catch(() => {});
    } else {
      console.info(`[CISV Bridge] Executing browser Web Audio synthesizer sweep for M${magnitude}.`);
      this.executeBrowserOscillatorSweep();
    }
  }

  /**
   * Browser Audio Context Oscillator Sweep.
   * Creates a raw sweeping pattern from 440Hz to 900Hz that mimics physical
   * mechanical industrial alarms.
   */
  executeBrowserOscillatorSweep() {
    if (this._sirenActive) return; // avoid overlapping sweeps
    this._sirenActive = true;

    if (!this.audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new Ctx();
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 6.0;

    const oscillatorNode = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillatorNode.type = 'sawtooth';
    oscillatorNode.frequency.setValueAtTime(440, now);

    // Creates the sweeping pitch from 440Hz to 900Hz over 1.2 seconds, looping it
    const sweepPeriod = 1.2;
    const sweeps = Math.floor(duration / sweepPeriod);
    for (let i = 0; i < sweeps; i++) {
      const t = now + i * sweepPeriod;
      oscillatorNode.frequency.linearRampToValueAtTime(900, t + sweepPeriod * 0.5);
      oscillatorNode.frequency.linearRampToValueAtTime(440, t + sweepPeriod);
    }

    // Volume Envelope
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(1.0, now + 0.02);
    gainNode.gain.setValueAtTime(1.0, now + duration - 0.6);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillatorNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillatorNode.start(now);
    oscillatorNode.stop(now + duration);

    oscillatorNode.onended = () => {
      oscillatorNode.disconnect();
      gainNode.disconnect();
      this._sirenActive = false;
    };
  }
}
