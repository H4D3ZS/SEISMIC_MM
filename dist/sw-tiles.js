/**
 * sw-tiles.js — CISV Tile Cache Service Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Intercepts all map tile, style JSON, and font requests from MapLibre GL JS
 * and stores them in a Cache Storage bucket named 'cisv-tiles-v1'.
 *
 * Caching strategy: Cache-First with Network Fallback
 *   1. Try the cache first (zero network, instant response)
 *   2. If not cached, fetch from network and store the response in cache
 *   3. If both fail (offline + uncached), return a 503 stub response so
 *      MapLibre degrades gracefully instead of throwing unhandled errors
 *
 * Matched requests:
 *   • *.openfreemap.org   — OpenFreeMap tile/style endpoints
 *   • *.stadiamaps.com    — Stadia Maps tile/style endpoints
 *   • *.mapbox.com        — Mapbox tile/style endpoints
 *   • *.maplibre.org      — MapLibre CDN assets
 *   • fonts.gstatic.com (glyph ranges used by MapLibre labels)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CACHE_NAME    = 'cisv-v2';
const APP_CACHE     = 'cisv-app-v1';
const TILE_ORIGINS  = [
  // Esri World Imagery — primary CISV satellite base map
  'server.arcgisonline.com',
  'services.arcgisonline.com',
  // Google Maps Satellite tiles
  'mt0.google.com',
  'mt1.google.com',
  'mt2.google.com',
  'mt3.google.com',
  // Mapbox Satellite
  'api.mapbox.com',
  // CartoDB Dark Matter — fallback / low-bandwidth style
  'basemaps.cartocdn.com',
  'cartodb-basemaps',
];

// ── Install: cache app shell for offline use ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/src/styles/main.css',
        '/manifest.json',
      ]).catch(() => console.warn('[SW] App shell cache failed'));
    })
  );
  self.skipWaiting();
});

// ── Activate: take control of all existing clients ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== APP_CACHE && k !== CACHE_NAME).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for tiles, network-first for API calls ─────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls — network-first (for live data)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ollama/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // PHIVOLCS proxy — network-first
  if (url.pathname.startsWith('/phivolcs-proxy/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Map tiles — cache-first
  if (TILE_ORIGINS.some(origin => url.hostname.includes(origin))) {
    if (event.request.method !== 'GET') return;
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // App shell (HTML, CSS, JS) — cache-first with network fallback
  if (event.request.method === 'GET') {
    event.respondWith(cacheFirst(event.request));
  }
});

/**
 * Cache-first strategy.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  // 1. Try cache
  const cached = await cache.match(request);
  if (cached) return cached;

  // 2. Network fetch + store
  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      // Clone before consuming the body
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // 3. Offline and not cached — return empty 503 so MapLibre doesn't crash
    return new Response('', {
      status:     503,
      statusText: 'Service Unavailable — tile not in offline cache',
    });
  }
}

/**
 * Network-first strategy with cache fallback (for API calls).
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline — cached data not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
