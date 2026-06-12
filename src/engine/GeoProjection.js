/**
 * GeoProjection.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared geographic ↔ world-space mapping for CISV layers.
 *
 * Local linear (equirectangular) projection centered on the Sarangani fault
 * junction. Engine convention: X = east, Z = south (−north), Y = up;
 * hypocentral depth plots as negative Y below the terrain plane.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Southern Mindanao viewport clip bounds. */
export const BBOX = Object.freeze({
  latMin: 4.5,
  latMax: 8.5,
  lonMin: 123.5,
  lonMax: 127.0,
});

/** Projection origin — Sarangani Bay focal point. */
export const CENTER = Object.freeze({ lat: 6.11, lon: 125.16 });

/** World units per degree. */
export const DEG_SCALE = 8.0;

/** Vertical world units per km of hypocentral depth. */
export const DEPTH_SCALE = 0.15;

/**
 * Project geographic coordinates into engine world space.
 * @returns {{x:number, y:number, z:number}}
 */
export function projectToWorld(lat, lon, depthKm = 0) {
  return {
    x: (lon - CENTER.lon) * DEG_SCALE,
    y: -(depthKm * DEPTH_SCALE),
    z: -(lat - CENTER.lat) * DEG_SCALE,
  };
}

/** Clamp a lat/lon pair to the viewport bounds. */
export function clampToBBox(lat, lon) {
  return {
    lat: Math.min(BBOX.latMax, Math.max(BBOX.latMin, lat)),
    lon: Math.min(BBOX.lonMax, Math.max(BBOX.lonMin, lon)),
  };
}

// ── Slippy-map (XYZ) tile math ───────────────────────────────────────────────

export function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

export function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom
  );
}

/** Geographic bounds of an XYZ tile. */
export function tileBounds(x, y, zoom) {
  const n = 2 ** zoom;
  const lonMin = (x / n) * 360 - 180;
  const lonMax = ((x + 1) / n) * 360 - 180;
  const latMax = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const latMin = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return { latMin, latMax, lonMin, lonMax };
}
