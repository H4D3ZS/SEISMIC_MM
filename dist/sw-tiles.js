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

const CACHE_NAME    = 'cisv-tiles-v1';
const TILE_ORIGINS  = [
  // Esri World Imagery — primary CISV satellite base map
  'server.arcgisonline.com',
  'services.arcgisonline.com',
  // CartoDB Dark Matter — fallback / low-bandwidth style
  'basemaps.cartocdn.com',
  'cartodb-basemaps',
];

// ── Install: activate immediately ─────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate: take control of all existing clients ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Fetch: cache-first for tile/style/font requests ───────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept requests that look like map tile/resource endpoints
  if (!TILE_ORIGINS.some(origin => url.hostname.includes(origin))) return;

  // Skip non-GET requests (e.g. mapbox analytics)
  if (event.request.method !== 'GET') return;

  event.respondWith(cacheFirst(event.request));
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
