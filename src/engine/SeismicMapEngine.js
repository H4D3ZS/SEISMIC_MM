/**
 * SeismicMapEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Core WebGL Renderer
 *
 * alpha: true  — Three.js canvas is transparent so the MapLibre map div
 *               positioned behind it shows through as the base layer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SeismicMapEngine {
  constructor(canvasContainer) {
    if (!canvasContainer) {
      throw new Error('SeismicMapEngine: container element missing.');
    }

    this.container   = canvasContainer;
    this._isDisposed = false;

    // ── Scene ────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    // No opaque background — MapLibre div shows through the alpha channel
    this.scene.background = null;

    // Keep depth fog but only for 3D markers, not the background
    this.scene.fog = new THREE.FogExp2(0x060911, 0.003);

    // ── Renderer ─────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias:        true,
      powerPreference:  'high-performance',
      alpha:            true,   // ← transparent canvas so MapLibre shows through
      stencil:          false,
      depth:            true,
      premultipliedAlpha: false,
    });

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace  = THREE.SRGBColorSpace;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Clear to fully transparent every frame
    this.renderer.setClearColor(0x000000, 0);

    this.container.appendChild(this.renderer.domElement);

    // ── Camera ───────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    // Scene ground plane is XY (lon→X, lat→Y) with +Z up — set the camera's
    // up axis to match so orbiting tilts/rotates around the map naturally.
    this.camera.up.set(0, 0, 1);
    // Start south of the archipelago center, tilted ~50° for a 3D perspective
    this.camera.position.set(6, -55, 70);

    // ── Orbit Controls ───────────────────────────────────────────────────
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping     = true;
    this.controls.dampingFactor     = 0.05;
    this.controls.screenSpacePanning = false;
    // Polar angle is measured from +Z (up): keep the camera above the horizon
    this.controls.maxPolarAngle     = Math.PI / 2 - 0.05;
    this.controls.minDistance       = 4;
    this.controls.maxDistance       = 300;
    // Archipelago center in world space: lon 123 → x 6, lat 12.75 → y 4.5
    this.controls.target.set(6, 4.5, 0);

    // ── Lighting ─────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0x1a233a, 1.2);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x00ccff, 0.4);
    keyLight.position.set(0, 80, 40);
    this.scene.add(keyLight);

    // ── Clock & Hooks ─────────────────────────────────────────────────────
    this.clock = new THREE.Clock();

    /** @type {((elapsed: number, delta: number) => void) | null} */
    this.onBeforeRenderUpdate = null;

    /** @type {Map<string, THREE.Object3D>} */
    this.registry = new Map();

    // ── FPS Sampling ──────────────────────────────────────────────────────
    this._frameTimes  = [];
    this._fpsCallback = null;

    // ── Boot ──────────────────────────────────────────────────────────────
    this._initResizeHandler();
    this._animate();
  }

  // ─── Animation Loop ───────────────────────────────────────────────────────

  _animate() {
    if (this._isDisposed) return;
    this._rafId = requestAnimationFrame(() => this._animate());

    const delta   = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.controls.update();
    if (typeof this.onBeforeRenderUpdate === 'function') {
      this.onBeforeRenderUpdate(elapsed, delta);
    }
    this._sampleFPS(delta);
    this.renderer.render(this.scene, this.camera);
  }

  // ─── FPS ──────────────────────────────────────────────────────────────────

  _sampleFPS(delta) {
    if (delta <= 0) return;
    this._frameTimes.push(delta);
    if (this._frameTimes.length > 60) this._frameTimes.shift();
    if (typeof this._fpsCallback === 'function') {
      const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
      this._fpsCallback(Math.round(1 / avg));
    }
  }

  onFPSUpdate(cb) { this._fpsCallback = cb; }

  // ─── Resize ───────────────────────────────────────────────────────────────

  _initResizeHandler() {
    let t;
    this._resizeListener = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      }, 150);
    };
    window.addEventListener('resize', this._resizeListener);
  }

  // ─── Registry & Disposal ─────────────────────────────────────────────────

  disposeLayer(key) {
    if (!this.registry.has(key)) return;
    const obj = this.registry.get(key);
    this.scene.remove(obj);
    this._deepDispose(obj);
    this.registry.delete(key);
  }

  _deepDispose(obj) {
    if (!obj) return;
    [...(obj.children ?? [])].forEach(c => this._deepDispose(c));
    obj.geometry?.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        Object.values(mat).forEach(v => { if (v?.isTexture) v.dispose(); });
        mat.dispose();
      });
    }
  }

  addLayer(key, obj) {
    this.disposeLayer(key);
    this.scene.add(obj);
    this.registry.set(key, obj);
  }

  dispose() {
    this._isDisposed = true;
    cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._resizeListener);
    for (const key of this.registry.keys()) this.disposeLayer(key);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.parentNode?.removeChild(this.renderer.domElement);
  }
}
