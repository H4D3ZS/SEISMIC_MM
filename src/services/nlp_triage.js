/**
 * nlp_triage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Local NLP Triage Engine for CISV.
 *
 *  - Communicates with a local micro-server running a crisis informatics
 *    transformer model (QCRI/HumAID or CrisisBench baselines).
 *  - Strips noise from incoming field text updates and flags verified hazards.
 *  - Heuristic offline fallback: if the local server is unreachable, uses
 *    regex-based keyword matching (e.g. collapse, damage, landslide, blocked)
 *    to classification-level confidence, ensuring full offline functionality.
 *  - Dynamic WebGL plotting: plots amber tactical wireframe cones at the reported
 *    GPS lat/lon coords in the active 3D scene.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

const LAT_ANCHOR    = 12.0;
const LON_ANCHOR    = 122.0;
const SPATIAL_SCALE = 6.0;

export class LocalNLPTriageEngine {
  /**
   * @param {import('../engine/SeismicMapEngine.js').SeismicMapEngine} engineInstance
   */
  constructor(engineInstance) {
    this.engine = engineInstance;
    this.localInferenceUrl = 'http://localhost:8081/predictions/crisis_transformer';
    this.ollamaEndpoint = 'http://localhost:11434/api/chat';
  }

  /**
   * Process raw incoming text from field reports/sensors and map if validated.
   * @param {string} rawText
   * @param {{lat: number, lon: number}} gpsData
   * @param {number} [peisLevel=0]
   */
  async processIncomingFieldText(rawText, gpsData, peisLevel = 0) {
    // 1. Try local Ollama chat triage first (structured JSON extraction)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout for local LLM

      const response = await fetch(this.ollamaEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'huihui_ai/gemma-4-abliterated:12b-q4_K',
          messages: [
            {
              role: 'system',
              content: 'You are an automated disaster response router. Analyze the text and reply ONLY with a valid JSON object. Schema: { "structural_damage": boolean, "severity": 1-5 }'
            },
            { role: 'user', content: rawText }
          ],
          stream: false,
          options: { temperature: 0.0 } // Locks consistency
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = await response.json();
      const content = data.message?.content?.trim() ?? '';
      
      // Strip markdown code blocks if the LLM output wrapped them
      const jsonText = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const structuredResult = JSON.parse(jsonText);

      console.info(`[CISV NLP Ollama] parsed field report:`, structuredResult);

      if (structuredResult.structural_damage && structuredResult.severity >= 4) {
        this.plotFieldAnomaly(gpsData.lat, gpsData.lon, "STRUCTURAL_FAILURE");
      } else if (structuredResult.structural_damage) {
        this.plotDynamicIncidentMarker(gpsData.lat, gpsData.lon, rawText, peisLevel);
      } else {
        console.info('[CISV NLP Ollama] Incident classified as non-structural/minor.');
      }
      return; // Success, end execution
    } catch (ollamaErr) {
      console.warn('[CISV NLP] Local Ollama triage failed/offline. Attempting transformer inference fallback:', ollamaErr.message);
    }

    // 2. Try Crisis Transformer prediction server next
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second timeout

      const response = await fetch(this.localInferenceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const classification = await response.json();
      if (
        classification.confidence >= 0.88 &&
        classification.category === 'infrastructure_damage'
      ) {
        console.info(`[CISV NLP] NLP classification confirmed: ${classification.category} (${(classification.confidence * 100).toFixed(0)}%)`);
        this.plotDynamicIncidentMarker(gpsData.lat, gpsData.lon, rawText, peisLevel);
      }
    } catch (error) {
      console.warn('[CISV NLP] Local NLP Inference Server unreachable. Falling back to heuristic keyword triage:', error.message);
      this._runHeuristicFallback(rawText, gpsData, peisLevel);
    }
  }

  /**
   * Plot a high-priority structural failure anomaly (red wireframe double cone/octahedron) in the 3D scene.
   * @param {number} lat
   * @param {number} lon
   * @param {string} anomalyType
   */
  plotFieldAnomaly(lat, lon, anomalyType = "STRUCTURAL_FAILURE") {
    const markerGeo = new THREE.OctahedronGeometry(0.35, 0);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xff1a44, // neon red warning
      wireframe: true,
    });
    const markerMesh = new THREE.Mesh(markerGeo, markerMat);

    // Project coordinates
    const targetX = (lon - LON_ANCHOR) * SPATIAL_SCALE;
    const targetY = (lat - LAT_ANCHOR) * SPATIAL_SCALE;
    const targetZ = 0.15; // Float above terrain

    markerMesh.position.set(targetX, targetY, targetZ);
    markerMesh.userData = {
      description: `CRITICAL FIELD ANOMALY: ${anomalyType}`,
      lat,
      lon,
      isNLPIncident: true,
      severity: 5
    };

    // Add to engine scene
    const layerKey = `nlp_anomaly_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.engine.addLayer(layerKey, markerMesh);

    console.info(`[CISV NLP] Plotted critical field anomaly at (${lat.toFixed(4)}, ${lon.toFixed(4)}): ${anomalyType}`);
  }

  /**
   * Heuristic fallback keyword analysis.
   * @param {string} rawText
   * @param {{lat: number, lon: number}} gpsData
   * @param {number} [peisLevel=0]
   */
  _runHeuristicFallback(rawText, gpsData, peisLevel = 0) {
    const textLower = rawText.toLowerCase();
    const keywords = [
      'damage', 'collapse', 'rupture', 'landslide', 'destroyed',
      'blocked', 'hazard', 'cracked', 'bridge down', 'structural'
    ];

    const matched = keywords.filter(word => textLower.includes(word));
    if (matched.length > 0) {
      const confidence = 0.9 + Math.min(0.09, matched.length * 0.03);
      console.info(`[CISV NLP Heuristic] Hazard detected via keywords [${matched.join(', ')}] (Confidence: ${confidence.toFixed(2)})`);
      this.plotDynamicIncidentMarker(gpsData.lat, gpsData.lon, rawText, peisLevel);
    } else {
      console.debug('[CISV NLP Heuristic] No hazardous patterns matched.');
    }
  }

  /**
   * Project GPS coordinates and add an amber/custom tactical cone marker to the 3D scene.
   * @param {number} lat
   * @param {number} lon
   * @param {string} descriptiveText
   * @param {number} [peisLevel=0]
   */
  plotDynamicIncidentMarker(lat, lon, descriptiveText, peisLevel = 0) {
    const markerGeo = new THREE.ConeGeometry(0.25, 0.9, 4);
    markerGeo.rotateX(Math.PI / 2);

    // Color code according to PEIS intensity scale
    let colorVal = 0xffaa00; // default amber
    if (peisLevel > 0) {
      if (peisLevel >= 9)      colorVal = 0xd000d0; // Devastating -> Purple
      else if (peisLevel >= 8) colorVal = 0xa855f7; // Very Destructive -> Violet
      else if (peisLevel >= 7) colorVal = 0xff1a44; // Destructive -> Red
      else if (peisLevel >= 6) colorVal = 0xff7700; // Very Strong -> Orange
      else if (peisLevel >= 5) colorVal = 0xffaa00; // Strong -> Yellow/Amber
      else if (peisLevel >= 4) colorVal = 0x88d000; // Moderately Strong -> Yellow-green
      else                     colorVal = 0x00d0aa; // Weak -> Greenish-blue
    }

    const markerMat = new THREE.MeshBasicMaterial({
      color: colorVal,
      wireframe: true,
    });

    const markerMesh = new THREE.Mesh(markerGeo, markerMat);

    // Project geographic coords → scene space (X-Y plane with +Z up)
    const targetX = (lon - LON_ANCHOR) * SPATIAL_SCALE;
    const targetY = (lat - LAT_ANCHOR) * SPATIAL_SCALE;
    const targetZ = 0.05; // Slightly above terrain to avoid z-fighting

    markerMesh.position.set(targetX, targetY, targetZ);
    markerMesh.userData = {
      description: descriptiveText,
      lat,
      lon,
      peisLevel,
      isNLPIncident: true
    };

    // Add to engine scene and keep track in custom registry layer if needed
    const layerKey = `nlp_incident_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.engine.addLayer(layerKey, markerMesh);

    console.info(`[CISV NLP] Plotted tactical incident marker at (${lat.toFixed(4)}, ${lon.toFixed(4)}) with PEIS ${peisLevel}: "${descriptiveText}"`);
  }
}
