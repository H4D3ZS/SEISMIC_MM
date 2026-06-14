/**
 * SeismicCatalogRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV GPU Ingestion Layer — Task 2 Implementation
 *
 * Responsibilities:
 *   • Parse packed Float32Array binary buffers from the seismic data worker
 *   • Batch 35+ years of hypocenters into a SINGLE InstancedMesh draw call
 *   • Custom ShaderMaterial with:
 *       – Magnitude-driven exponential geometry scaling in the vertex shader
 *       – Depth-driven neon color ramp (shallow → cyan, mid → amber, deep → violet)
 *       – AdditiveBlending fragment glow for fault-zone hotspot accumulation
 *   • Support runtime color-encoding swaps (depth / magnitude / PGA) via uniforms
 *   • Support magnitude and depth filter uniforms without full re-upload
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Binary buffer record layout (7 × Float32 per event):
 *   [0] lat      – Latitude  (°)
 *   [1] lon      – Longitude (°)
 *   [2] depth    – Hypocentral depth (km, positive down)
 *   [3] mag      – Moment Magnitude Mw
 *   [4] strike   – Fault strike (°)
 *   [5] dip      – Fault dip (°)
 *   [6] rake     – Fault rake (°)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────────────────────

/** Number of Float32 values per seismic record */
const RECORD_SIZE = 7;

/** Geographic anchor — center of the Philippine Archipelago */
const LAT_ANCHOR = 12.0;
const LON_ANCHOR = 122.0;

/** World-unit scaling factor:  1° ≈ spatialScale world units */
const SPATIAL_SCALE = 6.0;

/** Depth compression:  1 km → depthScale world units downward */
const DEPTH_SCALE = 0.25;

// ── GLSL Shaders ──────────────────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */`
  // Per-instance attributes injected by setCustomInstancedAttribute helpers
  attribute float aMag;    // Moment Magnitude
  attribute float aDepth;  // Hypocentral depth (km)
  attribute float aPGA;    // Peak Ground Acceleration (g), packed for color mode
  attribute float aYear;   // Decimal year of occurrence

  // Varyings passed to fragment shader
  varying float vDepthNorm;   // Normalized depth  [0..1]  (0 = surface, 1 = 700 km)
  varying float vMagNorm;     // Normalized magnitude [0..1] (0 = Mw2, 1 = Mw9)
  varying float vPGANorm;     // Normalized PGA [0..1]
  varying vec3  vLocalPos;    // Local geometry position for radial glow calc

  // Filter uniforms — instances outside range are collapsed to invisible
  uniform float uMagMin;
  uniform float uMagMax;
  uniform float uDepthMax;
  uniform float uYearMax;

  void main() {
    vLocalPos  = position;
    vDepthNorm = clamp(aDepth / 700.0, 0.0, 1.0);
    vMagNorm   = clamp((aMag - 2.0) / 7.0, 0.0, 1.0);
    vPGANorm   = clamp(aPGA / 2.0, 0.0, 1.0);

    // Filter: collapse filtered instances to a degenerate point (no overdraw)
    bool filtered = (aMag < uMagMin) || (aMag > uMagMax) || (aDepth > uDepthMax) || (aYear > uYearMax);
    if (filtered) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // Off-screen clipping
      return;
    }

    // Scale particle radius exponentially with Mw (matches seismic moment ratio)
    // exp(Mw * 0.4) * 0.08 gives ~0.14 at Mw2 → ~1.1 at Mw7 → ~4.0 at Mw9
    float scaleFactor = exp(aMag * 0.4) * 0.08;

    // Combine instance transform (position/orientation) with local scale
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position * scaleFactor, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  varying float vDepthNorm;
  varying float vMagNorm;
  varying float vPGANorm;
  varying vec3  vLocalPos;

  // 0 = depth, 1 = magnitude, 2 = PGA
  uniform int   uColorMode;

  // Hardcoded neon ramp key-colors (GLSL doesn't support arrays elegantly pre-330)
  vec3 depthColor(float t) {
    // Shallow  (t≈0): neon cyan      #00ffff
    // Mid      (t≈0.4): amber       #ffaa00
    // Deep     (t≈1): violet        #aa44ff
    vec3 shallow = vec3(0.0,  1.0,  1.0);
    vec3 mid     = vec3(1.0,  0.67, 0.0);
    vec3 deep    = vec3(0.67, 0.27, 1.0);
    if (t < 0.5) return mix(shallow, mid, t * 2.0);
    return mix(mid, deep, (t - 0.5) * 2.0);
  }

  vec3 magColor(float t) {
    // Low  (t≈0): dim steel  #336688
    // High (t≈1): hot red    #ff2244
    vec3 low  = vec3(0.2, 0.4, 0.53);
    vec3 high = vec3(1.0, 0.13, 0.27);
    return mix(low, high, t);
  }

  vec3 pgaColor(float t) {
    // Low PGA: green  #00ff88
    // High PGA: red   #ff0033
    vec3 safe   = vec3(0.0,  1.0,  0.53);
    vec3 danger = vec3(1.0,  0.0,  0.2);
    return mix(safe, danger, t);
  }

  void main() {
    // Radial glow: intensity decays exponentially from geometry centroid
    float dist = length(vLocalPos);
    float glow = exp(-dist * 4.5);

    // Discard near-invisible fragments — reduces fill-rate pressure
    if (glow < 0.01) discard;

    vec3 baseColor;
    if (uColorMode == 1)      baseColor = magColor(vMagNorm);
    else if (uColorMode == 2) baseColor = pgaColor(vPGANorm);
    else                      baseColor = depthColor(vDepthNorm);

    // Additive accumulation: overlapping hypocenters bloom into hotspot halos
    gl_FragColor = vec4(baseColor * glow * 2.2, glow * 0.85);
  }
`;

// ── SeismicCatalogRenderer ─────────────────────────────────────────────────

export class SeismicCatalogRenderer {
  /**
   * @param {import('./SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;
    this._instancedMesh = null;
    this._count         = 0;

    // Shared uniforms — mutated directly for zero-allocation filter updates
    this._uniforms = {
      uMagMin:    { value: 2.0  },
      uMagMax:    { value: 9.0  },
      uDepthMax:  { value: 700.0 },
      uYearMax:   { value: 2026.5 },
      uColorMode: { value: 0    }, // 0=depth, 1=mag, 2=PGA
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────

  /**
   * Parse a packed Float32Array binary buffer and upload to the GPU as a
   * single InstancedMesh.  Replaces any previously rendered catalog layer.
   *
   * @param {Float32Array} binaryBuffer  Packed seismic records (RECORD_SIZE per event)
   * @param {Float32Array} [pgaBuffer]   Optional parallel PGA array (one value per event)
   * @param {Float32Array} [yearBuffer]  Optional parallel Year array (one value per event)
   */
  renderBinarySeismicCatalog(binaryBuffer, pgaBuffer = null, yearBuffer = null) {
    // Validate buffer alignment
    if (binaryBuffer.length % RECORD_SIZE !== 0) {
      console.error(
        `SeismicCatalogRenderer: Buffer length ${binaryBuffer.length} is not a multiple of ${RECORD_SIZE}`
      );
      return;
    }

    const count = binaryBuffer.length / RECORD_SIZE;
    this._count = count;

    // Clean up the previous layer before allocating new GPU resources
    this.engine.disposeLayer('seismic_catalog');

    // ── Build per-instance attribute arrays ────────────────────────────
    const magArray   = new Float32Array(count);
    const depthArray = new Float32Array(count);
    const pgaArray   = new Float32Array(count);
    const yearArray  = new Float32Array(count);

    const dummy = new THREE.Object3D();

    // Low-poly base geometry — IcosahedronGeometry(r, detail=1) gives 20 triangles
    // Sufficient for a glowing point; detail=1 avoids excess vertex processing
    const baseGeometry = new THREE.IcosahedronGeometry(0.15, 1);

    const material = new THREE.ShaderMaterial({
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms:       this._uniforms,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,  // Additive layers must not occlude each other
      side:           THREE.FrontSide,
    });

    const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, count);
    instancedMesh.frustumCulled = false; // The mesh bounds span the full catalog

    // ── Upload instance matrices and per-instance attributes ───────────
    for (let i = 0; i < count; i++) {
      const offset = i * RECORD_SIZE;

      const lat   = binaryBuffer[offset + 0];
      const lon   = binaryBuffer[offset + 1];
      const depth = binaryBuffer[offset + 2];
      const mag   = binaryBuffer[offset + 3];
      // strike/dip/rake (offsets 4,5,6) stored for focal mechanism lookup
      // but not needed for GPU instancing geometry here

      // Project geographic coords → scene space
      const x = (lon   - LON_ANCHOR) * SPATIAL_SCALE;
      const y = (lat   - LAT_ANCHOR) * SPATIAL_SCALE;
      const z = -(depth * DEPTH_SCALE); // Negative Z = downward into crust

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1.0); // Scale is handled entirely in the vertex shader
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);

      // Store per-instance scalar attributes for GPU
      magArray[i]   = mag;
      depthArray[i] = depth;
      pgaArray[i]   = pgaBuffer ? pgaBuffer[i] : 0.0;
      yearArray[i]  = yearBuffer ? yearBuffer[i] : 2026.0;
    }

    instancedMesh.instanceMatrix.needsUpdate = true;

    // Attach per-instance attributes — these flow through as GLSL `attribute` vars
    baseGeometry.setAttribute(
      'aMag',
      new THREE.InstancedBufferAttribute(magArray, 1)
    );
    baseGeometry.setAttribute(
      'aDepth',
      new THREE.InstancedBufferAttribute(depthArray, 1)
    );
    baseGeometry.setAttribute(
      'aPGA',
      new THREE.InstancedBufferAttribute(pgaArray, 1)
    );
    baseGeometry.setAttribute(
      'aYear',
      new THREE.InstancedBufferAttribute(yearArray, 1)
    );

    this.engine.addLayer('seismic_catalog', instancedMesh);
    this._instancedMesh = instancedMesh;

    console.info(`SeismicCatalogRenderer: Rendered ${count.toLocaleString()} hypocenters in 1 draw call.`);
  }

  // ─── Filter API (zero-reupload uniform mutations) ─────────────────────

  /**
   * Set the magnitude display range.  Applied on the GPU per fragment.
   * @param {number} min  Lower Mw bound
   * @param {number} max  Upper Mw bound
   */
  setMagnitudeRange(min, max) {
    this._uniforms.uMagMin.value  = min;
    this._uniforms.uMagMax.value  = max;
  }

  /**
   * Set the maximum depth (km) displayed.  Events deeper than this are
   * collapsed off-screen in the vertex shader.
   * @param {number} maxKm
   */
  setDepthFilter(maxKm) {
    this._uniforms.uDepthMax.value = maxKm;
  }

  /**
   * Set the maximum year displayed. Events after this year are collapsed off-screen.
   * @param {number} year
   */
  setYearMax(year) {
    this._uniforms.uYearMax.value = year;
  }

  /**
   * Change the color encoding mode.
   * @param {'depth'|'magnitude'|'pga'} mode
   */
  setColorMode(mode) {
    const modeMap = { depth: 0, magnitude: 1, pga: 2 };
    if (mode in modeMap) {
      this._uniforms.uColorMode.value = modeMap[mode];
    }
  }

  /** @returns {number} Number of loaded event records */
  get count() { return this._count; }
}
