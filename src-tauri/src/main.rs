// CISV — SEISMIC Movement Monitoring
// Native System Entry Point: Telemetry Ingestion + Hardware Audio Core
//
// Responsibilities:
//   1. Persistent background poll loop — USGS FDSNWS GeoJSON, southern
//      Mindanao bounding box [4.5N, 123.5E] → [8.5N, 127.0E], every 30 s.
//   2. Critical threshold (Mw >= 5.0) → hardware-level dual-frequency siren
//      via rodio, independent of the webview audio context.
//   3. UDP triage bridge (127.0.0.1:8732) — lets the offline Python/LLM
//      triage agent (tools/triage_agent.py) trigger the siren and push
//      alerts into the frontend without going through the webview.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rodio::source::{SineWave, Source};
use rodio::{Decoder, OutputStream, Sink};
use serde::Serialize;
use std::collections::HashSet;
use std::fs::File;
use std::io::BufReader;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Manager;

// ── Tuning constants ─────────────────────────────────────────────────────────

const POLL_INTERVAL: Duration = Duration::from_secs(30);
const CRITICAL_MW: f64 = 5.0;

// Southern Mindanao viewport (Sarangani / Cotabato / Philippine Trench junction)
const MIN_LAT: f64 = 4.5;
const MAX_LAT: f64 = 8.5;
const MIN_LON: f64 = 123.5;
const MAX_LON: f64 = 127.0;

/// Loopback port the Python triage agent posts CRITICAL packets to.
const TRIAGE_BRIDGE_ADDR: &str = "127.0.0.1:8732";

/// Re-entrancy guard: one siren at a time, repeat triggers are no-ops while sounding.
static SIREN_ACTIVE: AtomicBool = AtomicBool::new(false);

// ── Typed IPC payloads (strict schema across the bridge) ─────────────────────

#[derive(Serialize, Clone, Debug)]
struct SeismicEvent {
    id: String,
    magnitude: f64,
    place: String,
    latitude: f64,
    longitude: f64,
    /// Hypocentral depth, km
    depth: f64,
    /// Origin time, Unix epoch milliseconds
    time_ms: i64,
    critical: bool,
}

#[derive(Serialize, Clone, Debug)]
struct TriageAlert {
    status: String,
    index_score: f64,
    source: String,
}

// ── Native siren ─────────────────────────────────────────────────────────────

#[tauri::command]
fn trigger_native_siren() {
    // Already sounding — don't stack overlapping sinks on the device.
    if SIREN_ACTIVE.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        if let Err(e) = play_siren() {
            eprintln!("[CISV][audio] siren failed: {e}");
        }
        SIREN_ACTIVE.store(false, Ordering::SeqCst);
    });
}

fn play_siren() -> Result<(), String> {
    let (_stream, stream_handle) =
        OutputStream::try_default().map_err(|e| format!("audio hardware missing: {e}"))?;
    let sink =
        Sink::try_new(&stream_handle).map_err(|e| format!("failed to bind audio handle: {e}"))?;
    sink.set_volume(1.0);

    // Prefer the bundled asset; fall back to a synthesized dual-frequency
    // industrial siren so the alert can never fail on a missing file.
    if let Some(path) = resolve_siren_asset() {
        if let Ok(file) = File::open(&path) {
            if let Ok(source) = Decoder::new(BufReader::new(file)) {
                sink.append(source);
                sink.sleep_until_end();
                return Ok(());
            }
            eprintln!("[CISV][audio] undecodable asset {path:?}, using synthesized siren");
        }
    }

    // Synthesized fallback: 12 s alternating 660 Hz / 880 Hz two-tone.
    for _ in 0..12 {
        sink.append(
            SineWave::new(660.0)
                .take_duration(Duration::from_millis(500))
                .amplify(0.95),
        );
        sink.append(
            SineWave::new(880.0)
                .take_duration(Duration::from_millis(500))
                .amplify(0.95),
        );
    }
    sink.sleep_until_end();
    Ok(())
}

fn resolve_siren_asset() -> Option<PathBuf> {
    // Bundled resource dir first, then the dev working directory.
    let candidates = [
        std::env::current_exe()
            .ok()?
            .parent()?
            .join("assets/audio/emergency_siren.wav"),
        PathBuf::from("assets/audio/emergency_siren.wav"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

// ── USGS live telemetry poll loop ────────────────────────────────────────────

fn poll_loop(window: tauri::Window) {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("CISV-Geodynamic-Map/1.0")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[CISV][poll] HTTP client init failed, telemetry loop disabled: {e}");
            return;
        }
    };

    // De-duplicate across polls — only newly observed event IDs are emitted.
    let mut seen: HashSet<String> = HashSet::new();

    loop {
        match fetch_recent_events(&client) {
            Ok(events) => {
                for ev in events {
                    if !seen.insert(ev.id.clone()) {
                        continue;
                    }
                    if let Err(e) = window.emit("realtime-seismic-stream", &ev) {
                        eprintln!("[CISV][poll] emit failed: {e}");
                    }
                    if ev.critical {
                        eprintln!(
                            "[CISV][poll] CRITICAL Mw {:.1} — {} — siren engaged",
                            ev.magnitude, ev.place
                        );
                        trigger_native_siren();
                    }
                }
                // Bound memory across long uptimes.
                if seen.len() > 50_000 {
                    seen.clear();
                }
            }
            Err(e) => eprintln!("[CISV][poll] fetch error (will retry): {e}"),
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

fn fetch_recent_events(client: &reqwest::blocking::Client) -> Result<Vec<SeismicEvent>, String> {
    // 2 h lookback window — overlaps generously with the 30 s cadence so
    // transient outages can't drop events; the seen-set absorbs duplicates.
    let start = chrono::Utc::now() - chrono::Duration::hours(2);
    let url = format!(
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson\
         &starttime={}&minlatitude={MIN_LAT}&maxlatitude={MAX_LAT}\
         &minlongitude={MIN_LON}&maxlongitude={MAX_LON}&orderby=time",
        start.format("%Y-%m-%dT%H:%M:%S")
    );

    let body: serde_json::Value = client
        .get(&url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let features = body["features"].as_array().cloned().unwrap_or_default();
    let mut events = Vec::with_capacity(features.len());

    for f in &features {
        let props = &f["properties"];
        let coords = &f["geometry"]["coordinates"];
        let magnitude = props["mag"].as_f64().unwrap_or(0.0);
        events.push(SeismicEvent {
            id: f["id"].as_str().unwrap_or_default().to_string(),
            magnitude,
            place: props["place"].as_str().unwrap_or("Unknown region").to_string(),
            longitude: coords[0].as_f64().unwrap_or(0.0),
            latitude: coords[1].as_f64().unwrap_or(0.0),
            depth: coords[2].as_f64().unwrap_or(0.0),
            time_ms: props["time"].as_i64().unwrap_or(0),
            critical: magnitude >= CRITICAL_MW,
        });
    }
    Ok(events)
}

// ── UDP triage bridge (offline Python agent → native core) ──────────────────

fn triage_bridge_loop(window: tauri::Window) {
    let socket = match UdpSocket::bind(TRIAGE_BRIDGE_ADDR) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[CISV][bridge] bind {TRIAGE_BRIDGE_ADDR} failed, triage bridge disabled: {e}");
            return;
        }
    };
    let mut buf = [0u8; 4096];

    loop {
        let Ok((len, peer)) = socket.recv_from(&mut buf) else {
            continue;
        };
        // Loopback only — refuse anything routed in from off-host.
        if !peer.ip().is_loopback() {
            continue;
        }
        let Ok(packet) = serde_json::from_slice::<serde_json::Value>(&buf[..len]) else {
            eprintln!("[CISV][bridge] malformed packet from {peer}");
            continue;
        };

        let status = packet["status"].as_str().unwrap_or_default();
        let score = packet["index_score"].as_f64().unwrap_or(0.0);

        if status == "CRITICAL_EARTHQUAKE_ALERT" {
            let alert = TriageAlert {
                status: status.to_string(),
                index_score: score,
                source: "local-triage-agent".to_string(),
            };
            let _ = window.emit("triage-critical-alert", &alert);
            trigger_native_siren();
        }
    }
}

// ── Entry point ──────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_window("main").expect("main window missing");

            // Isolated background worker — real-time telemetry ingestion.
            let poll_window = window.clone();
            std::thread::spawn(move || poll_loop(poll_window));

            // Loopback bridge for the offline triage agent.
            std::thread::spawn(move || triage_bridge_loop(window));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![trigger_native_siren])
        .run(tauri::generate_context!())
        .expect("Tauri deployment runtime error");
}
