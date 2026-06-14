# CISV — SEISMIC Movement Monitoring

**Philippine Geodynamic Command & Control Dashboard**

High-fidelity 3D seismic visualization system displaying live earthquake data from PHIVOLCS and USGS over photorealistic satellite imagery of the Philippine archipelago. Features NASA-grade Probabilistic Seismic Hazard Analysis (PSHA), Bayesian deep learning prediction, and multi-hazard assessment (liquefaction, tsunami, sinkhole, seabed uplift).

---

## Citation

This system is built upon and incorporates data and methodologies from the following research:

> **Torregosa, M.S., Sugito, M., & Nojima, Y. (2002).** *"Seismic Hazard and Microzoning of the Philippines."* Journal of Structural Mechanics and Earthquake Engineering, JSCE, Vol. 19, No. 710/2002, pp. 1-14.

The seismogenic zone parameters (Table 1: 27 zones with occurrence rates, b-values, max magnitudes), active fault data (Table 3: 41 faults with slip rates, lengths, dip, strike), attenuation equations (Eqs. 17-19: PGA, PGV, effective PGA), and geology amplification factors (Eq. 21) used throughout this system are extracted from this paper.

**BibTeX:**
```bibtex
@article{torregosa2002seismic,
  author  = {Torregosa, M.S. and Sugito, M. and Nojima, Y.},
  title   = {Seismic Hazard and Microzoning of the Philippines},
  journal = {Journal of Structural Mechanics and Earthquake Engineering},
  volume  = {19},
  number  = {710},
  pages   = {1--14},
  year    = {2002},
  publisher = {Japan Society of Civil Engineers (JSCE)}
}
```

### Additional References

- **Bautista, M.L.P. & Oike, K. (2000).** "Estimation of the magnitudes and epicenters of Philippine historical earthquakes." *Tectonophysics*, Vol. 317, pp. 137-169.
- **SEASEE (1985).** *Series on Seismology: Philippines IV.* Government Printing Office, Washington D.C.
- **McIntire et al. (2024).** "Geophysical Foundation Model: Improving results with trace masking." *IMAGE Conference*, Houston, Texas. DOI: 10.57967/hf/2908.
- **Gal, Y. & Ghahramani, Z. (2016).** "Dropout as a Bayesian Approximation: Representing Model Uncertainty in Deep Learning." *ICML 2016*.
- **Blundell, C. et al. (2015).** "Weight Uncertainty in Neural Networks." *arXiv:1505.05424*.
- **BLiTZ — Bayesian Layers in Torch Zoo.** Pi Esposito (2020). https://github.com/piEsposito/blitz-bayesian-deep-learning/

### Data Sources

- **PHIVOLCS** — DOST-Philippine Institute of Volcanology and Seismology. Earthquake bulletin and hazard maps. https://earthquake.phivolcs.dost.gov.ph/
- **USGS FDSNWS** — United States Geological Survey, Earthquake Hazards Program. https://earthquake.usgs.gov/fdsnws/
- **PHIVOLCS Liquefaction Hazard Maps** — City-scale liquefaction hazard maps for General Santos City, South Cotabato (DOST-CIA funded, May 2025).
- **PHIVOLCS Earthquake Advisory** — "Primer on the 08 June 2026 M7.8 Offshore Sarangani Earthquake." DOST-PHIVOLCS, June 8, 2026.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
pip install flask flask-cors timm torch huggingface_hub
```

### 2. Run Unified Development Server

```bash
npm run dev:all
```

This starts:
- **Vite dev server** at http://localhost:5173 (frontend)
- **GFM inference server** at http://localhost:8081 (Python Flask)
- **Checks Ollama** availability at http://localhost:11434

### 3. Or Run Individual Services

```bash
npm run dev          # Frontend only
python gfm_server.py # GFM server only
ollama serve         # LLM server only
```

---

## Features

### Live Data Pipeline
- **USGS FDSNWS** — Philippine bounds (4°N–21.5°N, 116°E–130°E), M1.0+, past 30 days
- **PHIVOLCS** — Monthly bulletin scraping with fallback chain
- **Real-time WebSocket** streaming (when available)
- **8,000+** historical earthquakes loaded from USGS since 1990

### Monte Carlo PSHA Engine
- 100K–1M simulations per run using Torregosa et al. (2002) parameters
- Gutenberg-Richter magnitude sampling
- Poisson timing distribution
- Torregosa attenuation equations (Eqs. 17-19)
- Soil amplification factors (Eq. 21)
- Hazard-consistent magnitude for 500-year return period

### Multi-Hazard Assessment
- **Liquefaction** — 20+ barangay-level zones from PHIVOLCS hazard maps
- **Sinkhole risk** — Limestone bedrock proximity analysis
- **Tsunami inundation** — Coastal segment exposure modeling
- **Seabed uplift** — Subduction zone coupling ratio analysis
- **Landslide susceptibility** — Slope + shaking intensity

### Bayesian Deep Learning
- Variational inference (Bayes by Backprop) following BLiTZ library approach
- Trainable mu/rho posterior parameters per weight
- Scale mixture prior for KL divergence
- Epistemic + aleatoric uncertainty decomposition
- 50 MC forward passes for confidence intervals

### 3D Visualization
- Three.js instanced mesh rendering for 10K+ hypocenters
- GFM attention weight visualization (Bezier curves)
- Volcanic arc markers (23 active volcanoes)
- Trench geometry rendering
- Focal mechanism beachball diagrams
- Radar ping animation for new events

### GFM Integration
- ThinkOnward/geophysical-foundation-model (ElasticViTMAE)
- ViT-MAE forward pass on canvas snapshots
- Dynamic tectonic coupling computation
- Coulomb stress loading analysis

### Civic Dashboard
- Per-barangay utility status (water/power)
- Business operating status tracking
- Post-earthquake simulation
- 3 cities: General Santos (26 barangays), Koronadal (15), Davao (15)

---

## Project Structure

```
seismologicalgraph/
├── src/
│   ├── main.js                          # Entry point, initialization
│   ├── controllers/
│   │   ├── UIController.js              # HUD, panels, live feed, simulation history
│   │   └── RaycasterController.js       # Mouse picking, tooltips
│   ├── data/
│   │   ├── ResearchPaperData.js         # Torregosa et al. (2002) structured data
│   │   ├── PhivolcsDataService.js       # USGS + PHIVOLCS live fetch
│   │   ├── CatalogDataService.js        # Synthetic fallback catalog
│   │   ├── CivicInfrastructureData.js   # Civic utility data
│   │   └── PlaceLabelCatalog.js         # City/place labels
│   ├── engine/
│   │   ├── SeismicMapEngine.js          # Core Three.js engine
│   │   ├── MonteCarloSimulator.js       # NASA-grade PSHA engine
│   │   ├── EarthquakePredictor.js       # Temporal prediction (WHEN)
│   │   ├── BayesianPredictor.js         # Bayesian DL with uncertainty
│   │   ├── PhilippineHazardAssessor.js  # Multi-hazard assessment
│   │   ├── GFMVisualizer.js            # GFM attention visualization
│   │   ├── CivicDashboard.js           # Civic infrastructure dashboard
│   │   ├── BarangayRenderer.js          # 3D barangay polygon renderer
│   │   ├── EpicenterOverlayRenderer.js  # Stress hotspot overlay
│   │   ├── GeodynamicLayerRenderer.js   # Fault lines + GPS vectors
│   │   ├── VolcanicLayerRenderer.js     # Volcano markers
│   │   ├── AdvancedGeospatialTerrain.js # Terrain + satellite tiles
│   │   ├── PlaceLabelRenderer.js        # City/place labels
│   │   └── simulation_engine.js         # Dynamic computation engine
│   ├── services/
│   │   ├── OllamaService.js             # LLM integration
│   │   ├── nlp_triage.js                # NLP crisis triage
│   │   └── TelemetryBridge.js           # Web Worker binary ingestion
│   ├── workers/
│   │   └── stream.worker.js             # Off-thread WebSocket + polling
│   └── styles/
│       └── main.css                     # HUD styling
├── gfm_server.py                        # GFM Flask inference server
├── dev-all.js                           # Unified dev launcher
├── index.html                           # Main HTML template
├── package.json                         # Dependencies
└── vite.config.js                       # Vite dev server config
```

---

## Technologies

- **Three.js** — 3D rendering engine
- **MapLibre GL JS** — Open-source vector/raster maps
- **Vite** — Lightning-fast dev server and build tool
- **Python Flask** — GFM inference server
- **Ollama** — Local LLM (gemma4:12b) for narrative generation
- **USGS FDSNWS** — Real-time earthquake GeoJSON API
- **PHIVOLCS** — Philippine seismic monitoring

---

## Build for Production

```bash
npm run build
```

Output: `dist/` folder ready for deployment.

---

## License

MIT

---

**Built for emergency response, scientific research, and geospatial intelligence.**

**Primary Research Credit:** Torregosa, M.S., Sugito, M., & Nojima, Y. (2002). "Seismic Hazard and Microzoning of the Philippines." JSCE Vol. 19, No. 710/2002.
