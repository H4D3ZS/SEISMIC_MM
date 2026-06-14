/**
 * projection.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the geographic → 3D-scene projection used across
 * the app (was duplicated in main.js, nlp_triage.js, the predict handler, etc.).
 *
 * The scene places the Philippine map on the X-Y plane with +Z up; longitude
 * maps to X and latitude to Y, both offset from the archipelago centre anchor
 * and scaled uniformly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const LAT_ANCHOR = 12.0;     // archipelago centre latitude
export const LON_ANCHOR = 122.0;    // archipelago centre longitude
export const SPATIAL_SCALE = 6.0;   // scene units per degree

/**
 * Project lat/lon to scene coordinates.
 * @returns {{x:number, y:number, z:number}}
 */
export function geoToScene(lat, lon, z = 0) {
  return {
    x: (lon - LON_ANCHOR) * SPATIAL_SCALE,
    y: (lat - LAT_ANCHOR) * SPATIAL_SCALE,
    z,
  };
}
