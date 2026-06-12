/**
 * AdvancedGeospatialTerrain.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Geospatial Map Manager & Radar Ping System — SINGLE-LAYER ARCHITECTURE
 *
 * The satellite Philippine map is rendered INSIDE the Three.js scene as
 * textured tile meshes on the ground plane — no separate MapLibre DOM layer.
 * Every feature (seismic catalog, volcanic nodes, trenches, pings, grid)
 * shares one scene, one camera, one projection, so everything stays
 * pixel-locked to the imagery at any orbit angle.
 *
 *   • Base mosaic: Esri World Imagery (Z7) covering the full archipelago
 *   • Detail tier: higher-zoom ring around the camera focus (Z9/11/13)
 *   • Radar ping waves + tactical coordinate grid as before
 *
 * Coordinate system (shared with all renderers):
 *   x = (lon - 122.0) * 6.0
 *   y = (lat - 12.0)  * 6.0
 *   z = elevation (markers ≥ 0, hypocenters < 0)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { latToTileY, lonToTileX, tileBounds } from './GeoProjection.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;

const LAT_MIN = 4.0;
const LAT_MAX = 21.5;
const LON_MIN = 116.0;
const LON_MAX = 130.0;

const PLANE_CX = ((LON_MIN + LON_MAX) / 2 - LON_ANCHOR) * SPATIAL_SCALE; // 6.0
const PLANE_CY = ((LAT_MIN + LAT_MAX) / 2 - LAT_ANCHOR) * SPATIAL_SCALE; // 4.5

/** Z-order inside the scene: base mosaic < detail tiles < grid (0) < markers */
const Z_BASE_TILES   = -0.012;
const Z_DETAIL_TILES = -0.006;

const BASE_ZOOM = 7;

/** Camera-distance → detail zoom ladder (Infinity = base mosaic only). */
const DETAIL_LADDER = [
  { maxDistance: 12,       zoom: 13 },
  { maxDistance: 30,       zoom: 11 },
  { maxDistance: 70,       zoom: 9  },
  { maxDistance: Infinity, zoom: 0  },
];

const MAX_DETAIL_TILES = 36;

// ── Raster sources (XYZ, keyless) ─────────────────────────────────────────────

export const TILE_SOURCES = {
  /** Esri World Imagery — high-resolution satellite, no API key. */
  esri_satellite: {
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  /** CartoDB Dark Matter — fallback / low-bandwidth mode. */
  carto_dark: {
    url: (z, x, y) =>
      `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`,
    attribution: '© OpenStreetMap © CARTO',
  },
};

// ── Radar ping shaders ────────────────────────────────────────────────────────

const PING_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PING_FRAG = /* glsl */`
  varying vec2  vUv;
  uniform vec3  uColor;
  uniform float uTime;
  void main() {
    float dist      = distance(vUv, vec2(0.5));
    float thickness = 0.018;
    float r         = uTime * 0.5;
    float intensity = smoothstep(r - thickness, r, dist) *
                      smoothstep(r + thickness, r, dist);
    float fade      = max(0.0, 1.0 - uTime);
    gl_FragColor    = vec4(uColor * intensity * 3.5, intensity * fade * 0.9);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

// ── AdvancedGeospatialTerrain ─────────────────────────────────────────────────

export class AdvancedGeospatialTerrain {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engine
   * @param {object} [opts]
   * @param {string} [opts.tileStyle='esri_satellite']
   */
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.textureLoader = new THREE.TextureLoader();
    this.textureLoader.setCrossOrigin('anonymous');

    this._styleName = opts.tileStyle in TILE_SOURCES ? opts.tileStyle : 'esri_satellite';

    /** @type {Map<string, THREE.Mesh>} */
    this._detailTiles = new Map();
    this._detailZoom  = 0;
    this._lodAccum    = 0;

    this._baseGroup   = new THREE.Group();
    this._detailGroup = new THREE.Group();
    this.engine.addLayer('satellite_base', this._baseGroup);
    this.engine.addLayer('satellite_detail', this._detailGroup);

    /** @type {Array<{mesh: THREE.Mesh, speed: number}>} */
    this.pings = [];

    this._addCoordinateGrid();
    this._buildBaseMosaic();
    this._addAttribution();
  }

  // ─── Projection helpers ───────────────────────────────────────────────────

  _toWorld(lat, lon) {
    return {
      x: (lon - LON_ANCHOR) * SPATIAL_SCALE,
      y: (lat - LAT_ANCHOR) * SPATIAL_SCALE,
    };
  }

  // ─── Satellite base mosaic (whole archipelago, Z7) ───────────────────────

  _buildBaseMosaic() {
    const x0 = lonToTileX(LON_MIN, BASE_ZOOM);
    const x1 = lonToTileX(LON_MAX, BASE_ZOOM);
    const y0 = latToTileY(LAT_MAX, BASE_ZOOM); // tile Y grows southward
    const y1 = latToTileY(LAT_MIN, BASE_ZOOM);

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        this._baseGroup.add(this._buildTileMesh(BASE_ZOOM, x, y, Z_BASE_TILES));
      }
    }
    console.info(
      `[CISV] Satellite base mosaic: ${(x1 - x0 + 1) * (y1 - y0 + 1)} tiles @ Z${BASE_ZOOM} (${this._styleName})`
    );
  }

  /**
   * One textured tile mesh, positioned by its geographic bounds so tile
   * corners stay exactly aligned with the marker projection.
   */
  _buildTileMesh(zoom, x, y, zOrder) {
    const b  = tileBounds(x, y, zoom);
    const sw = this._toWorld(b.latMin, b.lonMin);
    const ne = this._toWorld(b.latMax, b.lonMax);

    const texture = this.textureLoader.load(TILE_SOURCES[this._styleName].url(zoom, x, y));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ne.x - sw.x, ne.y - sw.y),
      new THREE.MeshBasicMaterial({ map: texture, depthWrite: false })
    );
    mesh.position.set((sw.x + ne.x) / 2, (sw.y + ne.y) / 2, zOrder);
    mesh.renderOrder = zOrder === Z_BASE_TILES ? -2 : -1;
    return mesh;
  }

  // ─── Detail tier LoD (rebuilt as the camera moves) ────────────────────────

  _updateDetailTier() {
    const cam      = this.engine.camera;
    const target   = this.engine.controls.target;
    const distance = cam.position.distanceTo(target);

    const tier = DETAIL_LADDER.find(t => distance < t.maxDistance);
    const zoom = tier?.zoom ?? 0;

    // Geographic focus under the camera target, clamped to the archipelago.
    const lon = Math.min(LON_MAX, Math.max(LON_MIN, LON_ANCHOR + target.x / SPATIAL_SCALE));
    const lat = Math.min(LAT_MAX, Math.max(LAT_MIN, LAT_ANCHOR + target.y / SPATIAL_SCALE));

    if (zoom === 0) {
      if (this._detailZoom !== 0) this._clearDetailTiles();
      this._detailZoom = 0;
      return;
    }

    const cx = lonToTileX(lon, zoom);
    const cy = latToTileY(lat, zoom);
    const focusKey = `${zoom}_${cx}_${cy}`;

    if (zoom === this._detailZoom && focusKey === this._focusKey) return;
    this._detailZoom = zoom;
    this._focusKey   = focusKey;

    this._clearDetailTiles();

    const radius = 2; // 5×5 ring around the focus tile
    let budget = MAX_DETAIL_TILES;
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let y = cy - radius; y <= cy + radius; y++) {
        if (budget-- <= 0) return;
        const mesh = this._buildTileMesh(zoom, x, y, Z_DETAIL_TILES);
        this._detailGroup.add(mesh);
        this._detailTiles.set(`${zoom}_${x}_${y}`, mesh);
      }
    }
  }

  _clearDetailTiles() {
    this._detailTiles.forEach(mesh => {
      this._detailGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    });
    this._detailTiles.clear();
  }

  // ─── Coordinate Grid ──────────────────────────────────────────────────────

  _addCoordinateGrid() {
    const grid = new THREE.GridHelper(100, 50, 0x00ffff, 0x1a233a);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(PLANE_CX, PLANE_CY, -0.002);
    grid.material.transparent = true;
    grid.material.opacity = 0.18; // faint overlay — satellite imagery reads through
    this.engine.scene.add(grid);
    this.engine.registry.set('philippine_map_grid', grid);
  }

  // ─── Imagery attribution (required by Esri terms) ─────────────────────────

  _addAttribution() {
    this._attribDiv = document.createElement('div');
    this._attribDiv.id = 'cisv-map-attribution';
    this._attribDiv.textContent = TILE_SOURCES[this._styleName].attribution;
    Object.assign(this._attribDiv.style, {
      position: 'absolute', right: '6px', bottom: '4px', zIndex: '5',
      font: '10px/1.4 monospace', color: 'rgba(160,180,200,0.55)',
      pointerEvents: 'none', textShadow: '0 0 4px #000',
    });
    this.engine.container.appendChild(this._attribDiv);
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────

  /** Called every frame from the engine's onBeforeRenderUpdate hook. */
  update(_elapsed, delta) {
    this._tickPings(delta);

    // LoD check throttled to ~4 Hz — tile rebuilds are not per-frame work.
    this._lodAccum += delta;
    if (this._lodAccum >= 0.25) {
      this._lodAccum = 0;
      this._updateDetailTier();
    }
  }

  // ─── Radar pings ─────────────────────────────────────────────────────────

  /**
   * Spawn a radiating ring at an epicenter.
   * @param {number} lat  °N
   * @param {number} lon  °E
   * @param {number} mag  Mw
   */
  triggerPing(lat, lon, mag) {
    const { x, y } = this._toWorld(lat, lon);
    const size  = Math.max(10.0, mag * 4.5);
    const color =
      mag >= 7.0 ? new THREE.Color(0xff1a44) :
      mag >= 6.0 ? new THREE.Color(0xffaa00) :
                   new THREE.Color(0x00ffcc);

    const mat = new THREE.ShaderMaterial({
      vertexShader:   PING_VERT,
      fragmentShader: PING_FRAG,
      uniforms: { uColor: { value: color }, uTime: { value: 0.0 } },
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.position.set(x, y, 0.05);
    this.engine.scene.add(mesh);
    this.pings.push({ mesh, speed: 0.85 });
  }

  _tickPings(delta) {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.mesh.material.uniforms.uTime.value += delta * p.speed;
      if (p.mesh.material.uniforms.uTime.value >= 1.0) {
        this.engine.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.pings.splice(i, 1);
      }
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Switch raster source at runtime (esri_satellite | carto_dark). */
  setTileStyle(styleName) {
    if (!(styleName in TILE_SOURCES) || styleName === this._styleName) return;
    this._styleName = styleName;

    // Rebuild base mosaic with the new source; detail tier rebuilds itself.
    this.engine.disposeLayer('satellite_base');
    this._baseGroup = new THREE.Group();
    this.engine.addLayer('satellite_base', this._baseGroup);
    this._buildBaseMosaic();

    this._clearDetailTiles();
    this._detailZoom = 0;
    this._focusKey   = null;

    if (this._attribDiv) {
      this._attribDiv.textContent = TILE_SOURCES[styleName].attribution;
    }
  }

  /** Toggle the satellite map + coordinate grid overlay. */
  setVisible(visible) {
    this._baseGroup.visible   = visible;
    this._detailGroup.visible = visible;
    const grid = this.engine.registry.get('philippine_map_grid');
    if (grid) grid.visible = visible;
  }

  dispose() {
    this._clearDetailTiles();
    this.engine.disposeLayer('satellite_base');
    this.engine.disposeLayer('satellite_detail');
    for (const p of this.pings) {
      this.engine.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this.pings = [];
    const grid = this.engine.registry.get('philippine_map_grid');
    if (grid) {
      this.engine.scene.remove(grid);
      this.engine.registry.delete('philippine_map_grid');
    }
    this._attribDiv?.remove();
  }
}
