#!/usr/bin/env python3
"""
CISV — Local Geodynamic Triage Agent
─────────────────────────────────────────────────────────────────────────────
Offline multi-era anomaly triage for field deployments. Designed for
low-spec municipal disaster-response laptops; optional narrative summaries
run on local low-parameter weights (Gemma 2 2B / Mistral NeMo 12B via an
Ollama-compatible endpoint), fully offline.

Architecture decisions:
  * The integrated hazard score is DETERMINISTIC (weighted precursor
    matrix). The LLM never gates the alarm path — it only produces the
    human-readable triage narrative for field teams. An alarm must fire
    even if the model is unloaded, slow, or hallucinating.
  * Alerts cross to the Tauri native core over a loopback UDP bridge
    (127.0.0.1:8732, see src-tauri/src/main.rs::triage_bridge_loop).
    The native core sounds the hardware siren and forwards the alert to
    the webview, so the alarm works with the UI closed or asleep.

Usage:
    python tools/triage_agent.py                      # watch stdin (JSONL)
    python tools/triage_agent.py --demo               # synthetic stream
    python tools/triage_agent.py --llm http://127.0.0.1:11434  # + narratives
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import random
import socket
import sys
import time
import urllib.request
from dataclasses import dataclass, field

log = logging.getLogger("cisv.triage")

TAURI_BRIDGE_ADDR = ("127.0.0.1", 8732)
CRITICAL_THRESHOLD = 0.95


# ─── Tauri loopback bridge ────────────────────────────────────────────────────

class TauriClientBridge:
    """Fire-and-forget UDP packets to the native Rust core on loopback."""

    def __init__(self, addr: tuple[str, int] = TAURI_BRIDGE_ADDR) -> None:
        self.addr = addr
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    def invoke(self, command: str, payload: dict) -> None:
        packet = json.dumps({"command": command, **payload}).encode("utf-8")
        try:
            self._sock.sendto(packet, self.addr)
            log.info("bridge → %s %s", command, payload)
        except OSError as exc:
            # The siren still matters if the desktop shell is down — log loudly
            # so the operator sees the alert even without audio.
            log.critical("BRIDGE UNREACHABLE — manual alert required: %s | %s", payload, exc)


# ─── Deterministic hazard core ────────────────────────────────────────────────

@dataclass
class LocalGeodynamicAgent:
    bridge: TauriClientBridge
    llm_endpoint: str | None = None

    # Quantized probability weights mapping multi-era precursor metrics.
    precursor_matrix_weights: dict[str, float] = field(default_factory=lambda: {
        "seismic_p_wave":            0.45,
        "radon_gas_outgassing":      0.25,
        "satellite_thermal_anomaly": 0.20,
        "biotic_displacement":       0.10,
    })

    # Alarm hysteresis — re-arm only after the score decays below this.
    rearm_threshold: float = 0.80
    _alarm_latched: bool = field(default=False, init=False)

    def evaluate_live_trench_metrics(self, telemetry: dict) -> float:
        """Process one multi-era telemetry packet; return the unified risk score."""
        channels = {
            "seismic_p_wave":            _clamp01(telemetry.get("p_wave_amplitude", 0.0)),
            "radon_gas_outgassing":      _clamp01(telemetry.get("radon_deviation", 0.0)),
            "satellite_thermal_anomaly": _clamp01(telemetry.get("thermal_flux_spike", 0.0)),
            "biotic_displacement":       _clamp01(telemetry.get("animal_panic_index", 0.0)),
        }

        score = sum(
            channels[name] * weight
            for name, weight in self.precursor_matrix_weights.items()
        )
        log.debug("score=%.4f channels=%s", score, channels)

        if score >= CRITICAL_THRESHOLD and not self._alarm_latched:
            self._alarm_latched = True
            self.bridge.invoke("trigger_native_siren", {
                "status": "CRITICAL_EARTHQUAKE_ALERT",
                "index_score": round(score, 4),
                "tile_id": telemetry.get("tile_id", "UNKNOWN"),
                "channels": channels,
            })
            narrative = self._narrate(channels, score)
            if narrative:
                log.warning("TRIAGE NARRATIVE: %s", narrative)
        elif score < self.rearm_threshold and self._alarm_latched:
            self._alarm_latched = False
            log.info("score decayed to %.3f — alarm re-armed", score)

        return score

    # ── Optional local-LLM narrative (never on the alarm path) ──────────────

    def _narrate(self, channels: dict, score: float) -> str | None:
        if not self.llm_endpoint:
            return None
        prompt = (
            "You are a seismic triage assistant for Philippine municipal disaster "
            "response. In 3 short sentences, summarize this precursor reading for "
            "field teams. Be factual, no speculation beyond the data.\n"
            f"Integrated hazard score: {score:.2f} (critical threshold 0.95)\n"
            f"Channel readings (0-1 normalized): {json.dumps(channels)}"
        )
        body = json.dumps({
            "model": "gemma2:2b",
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 160},
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.llm_endpoint.rstrip('/')}/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read()).get("response", "").strip() or None
        except Exception as exc:  # noqa: BLE001 — narrative is best-effort only
            log.warning("local LLM unavailable, alert sent without narrative: %s", exc)
            return None


def _clamp01(value) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(v):
        return 0.0
    return max(0.0, min(1.0, v))


# ─── Input streams ────────────────────────────────────────────────────────────

def stdin_stream():
    """One JSON telemetry packet per line on stdin (sensor mux / file replay)."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError as exc:
            log.warning("malformed telemetry line skipped: %s", exc)


def demo_stream(period_s: float = 2.0):
    """Synthetic precursor stream that ramps into one critical episode."""
    t = 0
    while True:
        ramp = min(1.0, t / 30.0)  # builds toward critical over ~60 s
        yield {
            "tile_id": "SARANGANI-Z14-3462-1901",
            "p_wave_amplitude":  ramp * random.uniform(0.85, 1.0),
            "radon_deviation":   ramp * random.uniform(0.80, 1.0),
            "thermal_flux_spike": ramp * random.uniform(0.85, 1.0),
            "animal_panic_index": ramp * random.uniform(0.70, 1.0),
        }
        t += 1
        time.sleep(period_s)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="CISV local geodynamic triage agent")
    parser.add_argument("--demo", action="store_true", help="run synthetic telemetry stream")
    parser.add_argument("--llm", metavar="URL", default=None,
                        help="Ollama-compatible endpoint for triage narratives")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    agent = LocalGeodynamicAgent(bridge=TauriClientBridge(), llm_endpoint=args.llm)
    stream = demo_stream() if args.demo else stdin_stream()

    log.info("triage agent online — bridge %s:%d, threshold %.2f",
             *TAURI_BRIDGE_ADDR, CRITICAL_THRESHOLD)
    try:
        for packet in stream:
            score = agent.evaluate_live_trench_metrics(packet)
            log.info("tile=%s score=%.3f%s",
                     packet.get("tile_id", "?"), score,
                     "  ⚠ CRITICAL" if score >= CRITICAL_THRESHOLD else "")
    except KeyboardInterrupt:
        log.info("triage agent shutdown")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
