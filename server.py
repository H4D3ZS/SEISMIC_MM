"""
CISV PHIVOLCS Real-Time Data Server
────────────────────────────────────────────────────────────────────────────
Lightweight Python server that:
1. Scrapes PHIVOLCS earthquake bulletin every 30 seconds
2. Serves the data as JSON API for the frontend
3. Serves the Vite-built frontend (production mode)
4. Proxies Ollama requests (bypasses CORS)

Runs on port 3000 in production, or alongside Vite in dev mode.

Usage:
    python server.py              # Production (serves frontend + API)
    python server.py --port 3000  # Custom port
────────────────────────────────────────────────────────────────────────────
"""

import os
import sys
import json
import time
import re
import threading
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='../dist', static_url_path='')
CORS(app)

# ── PHIVOLCS Data Cache ──────────────────────────────────────────────────────

phivolcs_cache = {
    'events': [],
    'last_fetch': None,
    'fetch_count': 0,
    'error': None,
}

def fetch_phivolcs():
    """Scrape PHIVOLCS earthquake bulletin with browser-like headers."""
    import urllib.request
    import urllib.error

    now = datetime.now()
    year = now.year
    month_name = now.strftime('%B')

    urls = [
        f'https://earthquake.phivolcs.dost.gov.ph/{year}_Earthquake_Information/{month_name}/',
        f'https://earthquake.phivolcs.dost.gov.ph/Earthquake_Information/',
        f'https://earthquake.phivolcs.dost.gov.ph/',
    ]

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
    }

    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                html = resp.read().decode('utf-8', errors='ignore')
                events = parse_phivolcs_html(html)
                if events:
                    phivolcs_cache['events'] = events
                    phivolcs_cache['last_fetch'] = datetime.now().isoformat()
                    phivolcs_cache['fetch_count'] += 1
                    phivolcs_cache['error'] = None
                    print(f'[PHIVOLCS] Fetched {len(events)} events from {url}')
                    return events
        except Exception as e:
            continue

    phivolcs_cache['error'] = 'All PHIVOLCS endpoints failed'
    return phivolcs_cache['events']


def parse_phivolcs_html(html):
    """Parse PHIVOLCS earthquake bulletin HTML into structured events."""
    events = []
    # Match table rows with earthquake data
    pattern = r'<td[^>]*>\s*<a[^>]*>([^<]+)</a>\s*</td>\s*<td[^>]*>\s*([\d.]+)\s*</td>\s*<td[^>]*>\s*([\d.]+)\s*</td>\s*<td[^>]*>\s*(\d+)\s*</td>\s*<td[^>]*>\s*([\d.]+)\s*</td>\s*<td[^>]*>([^<]+)</td>'
    matches = re.findall(pattern, html, re.DOTALL)

    for m in matches:
        try:
            date_str, lat, lon, depth, mag, location = m
            lat = float(lat)
            lon = float(lon)
            depth = float(depth)
            mag = float(mag)

            # Parse date (format: "14 June 2026 - 04:58 PM")
            date_clean = date_str.strip()
            time_match = re.search(r'(\d{1,2})\s+(\w+)\s+(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)', date_clean)
            if time_match:
                day, month, year, hour, minute, ampm = time_match.groups()
                months = {'January':1,'February':2,'March':3,'April':4,'May':5,'June':6,
                         'July':7,'August':8,'September':9,'October':10,'November':11,'December':12}
                h = int(hour)
                if ampm.upper() == 'PM' and h < 12: h += 12
                if ampm.upper() == 'AM' and h == 12: h = 0
                dt = datetime(int(year), months.get(month, 1), int(day), h, int(minute))
                time_ms = int(dt.timestamp() * 1000) - 8 * 3600000  # PST to UTC
            else:
                time_ms = int(time.time() * 1000)

            # Extract bulletin URL
            url_match = re.search(r'href="([^"]*\.html)"', m[0] if '<a' in m[0] else '')
            bulletin_url = f'https://earthquake.phivolcs.dost.gov.ph{url_match.group(1)}' if url_match else ''

            events.append({
                'id': f'phivolcs_{time_ms}_{lat}_{lon}',
                'lat': lat,
                'lon': lon,
                'depth': depth,
                'mag': mag,
                'time': time_ms,
                'place': location.strip(),
                'source': 'PHIVOLCS',
                'bulletinUrl': bulletin_url,
            })
        except (ValueError, IndexError):
            continue

    return events


# ── Background fetcher thread ────────────────────────────────────────────────

def background_fetcher():
    """Fetch PHIVOLCS data every 30 seconds."""
    while True:
        try:
            fetch_phivolcs()
        except Exception as e:
            print(f'[PHIVOLCS] Background fetch error: {e}')
        time.sleep(30)


# ── API Routes ───────────────────────────────────────────────────────────────

@app.route('/api/phivolcs')
def api_phivolcs():
    """Return cached PHIVOLCS events."""
    return jsonify(phivolcs_cache)


@app.route('/api/phivolcs/refresh')
def api_phivolcs_refresh():
    """Force a fresh PHIVOLCS fetch."""
    events = fetch_phivolcs()
    return jsonify({'events': events, 'count': len(events)})


@app.route('/api/health')
def api_health():
    return jsonify({
        'status': 'ok',
        'phivolcs_events': len(phivolcs_cache['events']),
        'last_fetch': phivolcs_cache['last_fetch'],
        'fetch_count': phivolcs_cache['fetch_count'],
        'error': phivolcs_cache['error'],
    })


@app.route('/ollama/<path:path>', methods=['GET', 'POST'])
def proxy_ollama(path):
    """Proxy Ollama requests to bypass CORS."""
    import urllib.request
    import urllib.error

    ollama_url = f'http://localhost:11434/{path}'
    try:
        data = request.get_data() if request.method == 'POST' else None
        headers = {'Content-Type': 'application/json'}
        req = urllib.request.Request(ollama_url, data=data, headers=headers, method=request.method)
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read(), resp.status, {'Content-Type': resp.headers.get('Content-Type', 'application/json')}
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/')
def serve_frontend():
    return send_from_directory('../dist', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../dist', path)


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=3000)
    args = parser.parse_args()

    # Start background PHIVOLCS fetcher
    fetcher_thread = threading.Thread(target=background_fetcher, daemon=True)
    fetcher_thread.start()

    # Initial fetch
    print('[SERVER] Starting initial PHIVOLCS fetch...')
    fetch_phivolcs()

    print(f'[SERVER] Starting on http://localhost:{args.port}')
    print(f'[SERVER] Frontend: http://localhost:{args.port}')
    print(f'[SERVER] PHIVOLCS API: http://localhost:{args.port}/api/phivolcs')
    print(f'[SERVER] Ollama proxy: http://localhost:{args.port}/ollama/')

    app.run(host='0.0.0.0', port=args.port, debug=False)
