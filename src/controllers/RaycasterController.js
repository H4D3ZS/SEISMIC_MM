/**
 * RaycasterController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Mouse Interaction — THREE.Raycaster integration
 *
 * Detects pointer hover / click on instanced mesh earthquake markers
 * and routes selected event data to the UIController for panel display.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

export class RaycasterController {
  /**
   * @param {import('../engine/SeismicMapEngine.js').SeismicMapEngine} engine
   * @param {import('./UIController.js').UIController}                  ui
   */
  constructor(engine, ui) {
    this._engine     = engine;
    this._ui         = ui;
    this._raycaster  = new THREE.Raycaster();
    this._pointer    = new THREE.Vector2(-9999, -9999);
    this._lastHover  = -1;

    // Raycaster threshold for instanced mesh point picking
    this._raycaster.params.Points   = { threshold: 0.5 };
    this._raycaster.params.Mesh     = {};

    this._bindEvents();
  }

  // ─── Event Binding ───────────────────────────────────────────────────

  _bindEvents() {
    const canvas = this._engine.renderer.domElement;

    canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    canvas.addEventListener('pointerleave', () => {
      this._pointer.set(-9999, -9999);
      this._ui.hideTooltip();
    });
  }

  // ─── Pointer Handlers ────────────────────────────────────────────────

  _onPointerMove(event) {
    const rect = this._engine.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;

    const hit = this._castRay();
    if (hit) {
      const rec = this._getRecord(hit.instanceId);
      if (rec) {
        this._ui.showTooltip(event.clientX, event.clientY, { ...rec, index: hit.instanceId });
        this._engine.renderer.domElement.style.cursor = 'crosshair';
        return;
      }
    }

    // No seismic hit — try the volcanic edifice nodes
    const volcano = this._castVolcanoRay();
    if (volcano) {
      this._ui.showVolcanoTooltip?.(event.clientX, event.clientY, volcano);
      this._engine.renderer.domElement.style.cursor = 'pointer';
    } else {
      this._ui.hideTooltip();
      this._engine.renderer.domElement.style.cursor = '';
    }
  }

  _onPointerDown(event) {
    if (event.button !== 0) return; // Left click only

    const hit = this._castRay();
    if (!hit) {
      // Volcano click — ping its location so the operator sees the PDZ context
      const volcano = this._castVolcanoRay();
      if (volcano) {
        this._ui.triggerRadarPing(volcano.latitude, volcano.longitude, 5.0);
      }
      return;
    }
    {
      const rec = this._getRecord(hit.instanceId);
      // Populate the standard right-panel telemetry readout
      this._ui.selectEvent(hit.instanceId);

      if (rec) {
        // Fire radar ping for any selected event
        this._ui.triggerRadarPing(rec.lat, rec.lon, rec.mag);

        // For hazardous events (≥Mw 5.0) open the situational media panel.
        // In production this payload would arrive via WebSocket.  Here we
        // simulate the report so the UI path is fully exercised.
        if (rec.mag >= 5.0) {
          const simulatedReport = _buildSimulatedReport(hit.instanceId, rec);
          this._ui.openMediaPanel(hit.instanceId, simulatedReport);
        } else {
          this._ui.openMediaPanel(hit.instanceId, null);
        }
      }
    }
  }

  // ─── Ray Casting ─────────────────────────────────────────────────────

  /**
   * Cast a ray and return the first intersection on the seismic catalog mesh.
   * @returns {THREE.Intersection|null}
   * @private
   */
  _castRay() {
    const catalogMesh = this._engine.registry.get('seismic_catalog');
    if (!catalogMesh) return null;

    this._raycaster.setFromCamera(this._pointer, this._engine.camera);
    const hits = this._raycaster.intersectObject(catalogMesh, false);

    return hits.length > 0 ? hits[0] : null;
  }

  /**
   * Cast against all volcano node groups; returns the hit VolcanoAsset or null.
   * Volcano meshes carry their asset in userData.volcano (set by the renderer).
   * @returns {object|null}
   * @private
   */
  _castVolcanoRay() {
    const targets = [];
    for (const [key, obj] of this._engine.registry) {
      if (key.startsWith('volcano_') && obj.visible) targets.push(obj);
    }
    if (targets.length === 0) return null;

    this._raycaster.setFromCamera(this._pointer, this._engine.camera);
    const hits = this._raycaster.intersectObjects(targets, true);

    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData?.volcano) return o.userData.volcano;
        o = o.parent;
      }
    }
    return null;
  }

  /**
   * Look up the seismic record for a given instance index.
   * @param {number} index
   * @returns {{ lat, lon, depth, mag }|null}
   * @private
   */
  _getRecord(index) {
    // Pull per-instance attributes from the geometry buffer
    const mesh = this._engine.registry.get('seismic_catalog');
    if (!mesh) return null;

    const geom       = mesh.geometry;
    const magAttr    = geom.getAttribute('aMag');
    const depthAttr  = geom.getAttribute('aDepth');

    if (!magAttr || !depthAttr || index >= magAttr.count) return null;

    // Reconstruct lat/lon from instance matrix
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    const pos = new THREE.Vector3().setFromMatrixPosition(matrix);

    const LAT_ANCHOR   = 12.0;
    const LON_ANCHOR   = 122.0;
    const SPATIAL_SCALE = 6.0;
    const DEPTH_SCALE   = 0.25;

    return {
      lat:   LAT_ANCHOR  + pos.y / SPATIAL_SCALE,
      lon:   LON_ANCHOR  + pos.x / SPATIAL_SCALE,
      depth: -pos.z / DEPTH_SCALE,
      mag:   magAttr.getX(index),
    };
  }
}

// ── Simulation helper ──────────────────────────────────────────────────────

/**
 * Build a simulated situational_report payload for a selected event.
 * In a live deployment this would originate from a verified WebSocket stream.
 *
 * @param {number} instanceId
 * @param {{ lat: number, lon: number, depth: number, mag: number }} rec
 * @returns {object}
 */
function _buildSimulatedReport(instanceId, rec) {
  // Derive damage classification from magnitude tiers
  let dmgClass;
  if      (rec.mag >= 7.5) dmgClass = 'STRUCTURAL_COLLAPSE_LEVEL_5';
  else if (rec.mag >= 7.0) dmgClass = 'STRUCTURAL_COLLAPSE_LEVEL_4';
  else if (rec.mag >= 6.0) dmgClass = 'SEVERE_DAMAGE_LEVEL_3';
  else if (rec.mag >= 5.5) dmgClass = 'MODERATE_DAMAGE_LEVEL_2';
  else                     dmgClass = 'MINOR_DAMAGE_LEVEL_1';

  // For a real deployment, image_url would be a CDN-signed asset URL.
  // We expose the structure so the UI pipeline is production-ready.
  return {
    id: `${String(instanceId).padStart(6, '0')}_${Date.now()}`,
    has_media: false,          // No live media in offline/demo mode
    image_url: null,
    source: 'PHIVOLCS_AUTO_ALERT',
    damage_classification: dmgClass,
  };
}
