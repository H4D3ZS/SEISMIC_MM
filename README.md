# CISV — SEISMIC Movement Monitoring

**Philippine Geodynamic Command & Control Dashboard**

High-fidelity 3D seismic visualization system displaying live earthquake data from PHIVOLCS and USGS over photorealistic satellite imagery of the Philippine archipelago.

---

## ⚡ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Mapbox Token (Required for Satellite Map)

The default map style is **Mapbox Satellite Streets**, which shows high-resolution satellite imagery of the Philippines.

1. **Get a FREE Mapbox token:**
   - Go to https://account.mapbox.com/
   - Sign up or log in
   - Create a new **public token**
   - Copy the token (starts with `pk.`)

2. **Add your token to `.env`:**
   ```bash
   # Open the .env file in the project root
   # Paste your token after VITE_MAPBOX_TOKEN=
   VITE_MAPBOX_TOKEN=pk.eyJ1IjoieW91cnVzZXJuYW1lIiwiYSI6InlvdXJrZXkifQ.example
   ```

3. **Without a token:**
   - The app will automatically fallback to **CartoDB Dark Matter** (no token required)
   - You can also manually select other map styles from the left panel:
     - CartoDB Dark (no token)
     - Stadia Dark (no token)
     - OpenFreeMap Streets (no token)

### 3. Run the Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173`

---

## 🗺️ Map Styles

The application supports multiple tile styles:

| Style | Provider | Token Required | Description |
|-------|----------|----------------|-------------|
| **Satellite (Mapbox)** ⭐ | Mapbox | Yes (free) | High-res satellite imagery — **DEFAULT** |
| Dark Matter (CARTO) | CartoDB | No | Clean dark base map |
| Dark No Labels | CartoDB | No | Same as above, no labels |
| Streets (OpenFree) | OpenFreeMap | No | Vector street map |
| Smooth Dark (Stadia) | Stadia Maps | No | Elegant dark palette |

Switch styles at runtime using the **MAP STYLE** section in the left panel.

---

## 📡 Live Data Sources

CISV fetches real-time earthquake data from:

- **USGS FDSNWS** — Philippine bounds (4°N–21.5°N, 116°E–130°E), M1.0+, past 30 days
- **PHIVOLCS** — Philippine Institute of Volcanology and Seismology bulletin scraping

Data refreshes automatically every 5 minutes. Status indicators:
- 🟢 **LIVE** — Connected to USGS + PHIVOLCS
- 🟡 **UPDATING…** — Fetching new data
- 🔴 **OFFLINE** — Using cached/synthetic fallback

---

## 🎮 Controls

### Viewport Navigation
- **Left mouse drag** — Rotate camera
- **Right mouse drag** / **Middle click drag** — Pan
- **Scroll wheel** — Zoom in/out

### Layer Toggles (Left Panel)
- **Seismic Catalog** — Show/hide earthquake hypocenters
- **Base Map** — Show/hide satellite imagery
- **Volcanic Arcs** — Show/hide active volcano markers
- **Subduction Trenches** — Show/hide trench boundaries
- **Coord Grid** — Show/hide tactical grid overlay
- **PDZ Geofences** — Show/hide Permanent Danger Zones

### Filters (Left Panel)
- **Magnitude Filter** — Min/Max Mw range slider
- **Depth Filter** — Maximum depth (km)
- **Color Encoding** — Color by depth, magnitude, or PGA

### Timeline (Bottom Bar)
- **▶ Play** — Auto-advance timeline from 1990 to 2026
- **⏸ Pause** — Stop timeline playback
- **⟳ Reset** — Jump back to 1990
- **Scrubber** — Manually drag to any year
- **Speed** — Control playback speed (0.5×–10×)

### Interaction
- **Click earthquake marker** — Display telemetry + focal mechanism beachball
- **Click feed item** (right panel) — Trigger radar ping at epicenter
- **Hover marker** — Show magnitude + location tooltip

---

## 🏗️ Project Structure

```
seismologicalgraph/
├── src/
│   ├── main.js                          # Entry point, initialization
│   ├── controllers/
│   │   ├── UIController.js              # HUD, panels, live feed UI
│   │   └── RaycasterController.js       # Mouse picking, tooltips
│   ├── data/
│   │   ├── PhivolcsDataService.js       # USGS + PHIVOLCS live fetch
│   │   ├── CatalogDataService.js        # Synthetic fallback catalog
│   │   └── VolcanoDataService.js        # Active volcano database
│   ├── engine/
│   │   ├── SeismicMapEngine.js          # Core Three.js engine
│   │   ├── MapLibreTileLayer.js         # MapLibre GL tile layer
│   │   ├── AdvancedGeospatialTerrain.js # Terrain + radar pings
│   │   ├── SeismicCatalogRenderer.js    # GPU-instanced hypocenter spheres
│   │   ├── BeachballRenderer.js         # Focal mechanism diagrams
│   │   ├── VolcanicLayerRenderer.js     # Volcano markers
│   │   ├── TrenchRenderer.js            # Subduction trench geometry
│   │   └── TerrainGridRenderer.js       # Coordinate grid overlay
│   └── styles/
│       └── main.css                     # HUD styling
├── public/
│   ├── sw-tiles.js                      # Service worker for tile caching
│   └── assets/                          # Static assets
├── index.html                           # Main HTML template
├── vite.config.js                       # Vite dev server config
├── package.json                         # Dependencies
├── .env                                 # Environment variables (YOUR TOKEN HERE)
└── .env.example                         # Template for .env
```

---

## 🔧 Build for Production

```bash
npm run build
```

Output: `dist/` folder ready for deployment.

Preview production build:
```bash
npm run preview
```

---

## 🌐 Offline Support

The service worker (`sw-tiles.js`) automatically caches:
- All map tiles from any selected tile provider
- MapLibre GL CSS/fonts
- Static assets

Once loaded, the map tiles remain cached for offline use.

---

## 🚀 Technologies

- **Three.js** — 3D rendering engine
- **MapLibre GL JS** — Open-source vector/raster maps
- **Vite** — Lightning-fast dev server and build tool
- **USGS FDSNWS** — Real-time earthquake GeoJSON API
- **PHIVOLCS** — Philippine seismic monitoring

---

## 📄 License

MIT

---

## 🆘 Troubleshooting

### Map is blank / not showing satellite imagery
- ✅ Ensure you've added your `VITE_MAPBOX_TOKEN` to the `.env` file
- ✅ Restart the dev server after adding the token (`npm run dev`)
- ✅ Check the browser console for error messages
- ✅ Verify the token is valid at https://account.mapbox.com/

### No live data / shows "SYNTHETIC" badge
- ✅ Check your internet connection
- ✅ Check browser console for CORS or network errors
- ✅ USGS API may be rate-limited (wait a few minutes)
- ✅ PHIVOLCS site may be temporarily unavailable

### Performance issues
- ✅ Reduce magnitude filter range (show fewer events)
- ✅ Limit depth filter to shallow events only
- ✅ Disable layers you don't need (volcanoes, trenches)
- ✅ Try a simpler map style (CartoDB Dark)

---

**Built for emergency response, scientific research, and geospatial intelligence.**
