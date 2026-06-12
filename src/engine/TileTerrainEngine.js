/**
 * TileTerrainEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hierarchical Level-of-Detail tile layer for the CISV WebGL base map.
 *
 *  - Macro frame: single dark Philippines plate covering the full viewport,
 *    clipped to southern Mindanao (4.5–8.5°N, 123.5–127.0°E).
 *  - Dynamic LoD: camera scalar distance drives zoom tier swaps, up to the
 *    high-resolution offline tile pack (Z14) over GenSan / Sarangani / Balut.
 *  - Tiles resolve from the packed asset tree (`assets/tiles/{z}/{x}/{y}.jpg`)
 *    so the layer works fully offline inside the Tauri bundle.
 *  - Every tier swap deep-disposes the outgoing tier (geometry, material,
 *    texture) — zero residual GPU allocations across zoom churn.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import {
  BBOX,
  clampToBBox,
  latToTileY,
  lonToTileX,
  projectToWorld,
  tileBounds,
} from './GeoProjection.js';

/** Camera-distance → zoom tier ladder. */
const LOD_LADDER = [
  { maxDistance: 10,       zoom: 14 }, // Tactical precision (Balut Island faults)
  { maxDistance: 30,       zoom: 12 }, // GenSan urban grid / Bay overview
  { maxDistance: 70,       zoom: 9  }, // Provincial level
  { maxDistance: Infinity, zoom: 6  }, // Regional macro
];

/** Hard cap on simultaneously resident sub-grid tiles. */
const MAX_ACTIVE_TILES = 25;

export class TileTerrainEngine {
  constructor(engineInstance) {
    this.engine = engineInstance;
    this.textureLoader = new THREE.TextureLoader();

    /** @type {Map<string, THREE.Mesh>} key: `${z}_${x}_${y}` */
    this.activeTiles = new Map();
    this.currentZoom = LOD_LADDER[LOD_LADDER.length - 1].zoom;
    this.tileGroup = new THREE.Group();
    this.tileGroup.name = 'lod-tile-grid';

    this.initRegionalFrame();
    this.engine.addLayer('lod_tiles', this.tileGroup);
  }

  // ── Macro base plate ───────────────────────────────────────────────────────

  initRegionalFrame() {
    const width  = (BBOX.lonMax - BBOX.lonMin) * 8.0;
    const height = (BBOX.latMax - BBOX.latMin) * 8.0;

    const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
    const baseTexture = this.textureLoader.load('assets/maps/philippines_macro_dark.jpg');
    baseTexture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
      map: baseTexture,
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    this.basePlane = new THREE.Mesh(geometry, material);
    this.basePlane.rotation.x = -Math.PI / 2;
    const center = projectToWorld(
      (BBOX.latMin + BBOX.latMax) / 2,
      (BBOX.lonMin + BBOX.lonMax) / 2
    );
    this.basePlane.position.set(center.x, 0, center.z);
    this.engine.addLayer('terrain_base', this.basePlane);
  }

  // ── Per-frame LoD update (call from engine.onBeforeRenderUpdate) ──────────

  updateViewTiles(cameraDistance) {
    const tier = LOD_LADDER.find(t => cameraDistance < t.maxDistance);
    if (!tier || tier.zoom === this.currentZoom) return;

    this.currentZoom = tier.zoom;
    this.refreshSubGrid(tier.zoom);
  }

  /**
   * Rebuild the sub-grid around the current camera focus at the given zoom.
   * Macro tier (Z6) needs no overlay — the base plate covers it.
   */
  refreshSubGrid(zoom) {
    this._disposeActiveTiles();
    if (zoom <= 6) return;

    // Camera focus (controls target) → geographic anchor, clamped in-bounds.
    const target = this.engine.controls.target;
    const focus = clampToBBox(
      6.11 - target.z / 8.0,
      125.16 + target.x / 8.0
    );

    const centerX = lonToTileX(focus.lon, zoom);
    const centerY = latToTileY(focus.lat, zoom);
    const radius  = zoom >= 12 ? 2 : 1; // 5×5 tactical, 3×3 provincial

    let budget = MAX_ACTIVE_TILES;
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let y = centerY - radius; y <= centerY + radius; y++) {
        if (budget-- <= 0) return;
        this._mountTile(zoom, x, y);
      }
    }
  }

  _mountTile(zoom, x, y) {
    const key = `${zoom}_${x}_${y}`;
    if (this.activeTiles.has(key)) return;

    const bounds = tileBounds(x, y, zoom);
    // Skip tiles entirely outside the operational viewport.
    if (
      bounds.lonMax < BBOX.lonMin || bounds.lonMin > BBOX.lonMax ||
      bounds.latMax < BBOX.latMin || bounds.latMin > BBOX.latMax
    ) return;

    // Query the local asset tree inside the packed Tauri bundle.
    const texture = this.textureLoader.load(
      `assets/tiles/${zoom}/${x}/${y}.jpg`,
      undefined,
      undefined,
      () => this._unmountTile(key) // missing tile in the pack — drop silently
    );
    texture.colorSpace = THREE.SRGBColorSpace;

    const sw = projectToWorld(bounds.latMin, bounds.lonMin);
    const ne = projectToWorld(bounds.latMax, bounds.lonMax);

    const tileMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ne.x - sw.x, sw.z - ne.z),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    tileMesh.rotation.x = -Math.PI / 2;
    // Float just above the base plate to avoid z-fighting.
    tileMesh.position.set((sw.x + ne.x) / 2, 0.02, (sw.z + ne.z) / 2);

    this.tileGroup.add(tileMesh);
    this.activeTiles.set(key, tileMesh);
  }

  _unmountTile(key) {
    const mesh = this.activeTiles.get(key);
    if (!mesh) return;
    this.tileGroup.remove(mesh);
    this._disposeMesh(mesh);
    this.activeTiles.delete(key);
  }

  // ── Disposal ───────────────────────────────────────────────────────────────

  _disposeActiveTiles() {
    this.activeTiles.forEach(mesh => {
      this.tileGroup.remove(mesh);
      this._disposeMesh(mesh);
    });
    this.activeTiles.clear();
  }

  _disposeMesh(mesh) {
    mesh.geometry?.dispose();
    mesh.material?.map?.dispose();
    mesh.material?.dispose();
  }

  dispose() {
    this._disposeActiveTiles();
    this.engine.disposeLayer('lod_tiles');
    this.engine.disposeLayer('terrain_base');
  }
}
