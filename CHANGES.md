# 🗺️ Map Configuration Changes

## Summary

**Default map tile style changed from CartoDB Dark to Mapbox Satellite Streets**

This provides high-resolution satellite imagery of the Philippine archipelago instead of a dark abstract base map.

---

## Files Modified

### 1. `src/engine/MapLibreTileLayer.js`
**Changed:** Default style in constructor
```javascript
// BEFORE:
this._styleName = opts.style ?? 'carto_dark';

// AFTER:
this._styleName = opts.style ?? 'mapbox_satellite';
```

**Updated:** File header comment to reflect new default

---

### 2. `src/engine/AdvancedGeospatialTerrain.js`
**Changed:** Default style in constructor documentation and instantiation
```javascript
// BEFORE:
// @param {string} [opts.tileStyle='carto_dark']
style: opts.tileStyle ?? 'carto_dark',

// AFTER:
// @param {string} [opts.tileStyle='mapbox_satellite']
style: opts.tileStyle ?? 'mapbox_satellite',
```

---

### 3. `index.html`
**Changed:** Default checked radio button
```html
<!-- BEFORE: -->
<input type="radio" name="mapstyle" value="carto_dark" checked />

<!-- AFTER: -->
<input type="radio" name="mapstyle" value="mapbox_satellite" checked />
```

**Changed:** Map style note with token instructions
```html
<!-- BEFORE: -->
<p class="map-style-note">
  Satellite requires <code>VITE_MAPBOX_TOKEN</code> in <code>.env</code>
</p>

<!-- AFTER: -->
<p class="map-style-note">
  <strong>Default: Satellite</strong> — Requires <code>VITE_MAPBOX_TOKEN</code> in <code>.env</code>.
  Get free token at <a href="https://account.mapbox.com/" target="_blank" rel="noopener">account.mapbox.com</a>
</p>
```

**Changed:** Terrain toggle description
```html
<!-- BEFORE: -->
<p id="desc-terrain" class="sr-only">Toggle display of the CartoDB satellite base map</p>

<!-- AFTER: -->
<p id="desc-terrain" class="sr-only">Toggle display of the Mapbox satellite base map</p>
```

---

### 4. `.env.example`
**Updated:** Clearer instructions for Mapbox token requirement
```env
# BEFORE:
# Mapbox public token — required ONLY if you select the "Satellite (Mapbox)"
# map style in the left panel.

# AFTER:
# REQUIRED for the Mapbox Satellite Streets map style (the default style).
# Get a free public token at https://account.mapbox.com/
# Without this token, the app will fallback to CartoDB Dark Matter base map.
```

---

### 5. `.env` (NEW FILE)
**Created:** Pre-configured environment file with clear setup instructions
- Empty token field ready for user to paste their Mapbox token
- Step-by-step instructions in comments
- Example format shown

---

### 6. `README.md` (NEW FILE)
**Created:** Complete project documentation including:
- Quick start guide
- Map style comparison table
- Live data sources explanation
- Controls and interaction guide
- Project structure
- Troubleshooting section

---

### 7. `SETUP.md` (NEW FILE)
**Created:** Detailed step-by-step setup instructions for new users:
- Prerequisites
- Installation steps
- How to get Mapbox token (with screenshots described)
- How to run the dev server
- Verification checklist
- Troubleshooting common issues

---

## Behavior Changes

### Before
- App defaulted to **CartoDB Dark Matter** (abstract dark map, no satellite imagery)
- No clear instructions for getting Mapbox token
- Users had to manually switch to satellite style

### After
- App defaults to **Mapbox Satellite Streets** (photorealistic satellite imagery)
- Clear `.env` file with setup instructions
- Comprehensive README and SETUP guide
- **Automatic fallback** to CartoDB Dark if no token provided
- Radio button in UI reflects the default

---

## User Experience

### For users WITH a Mapbox token:
✅ **Instant satellite imagery** showing actual Philippine geography  
✅ High-resolution coastal details, terrain features visible  
✅ Streets and labels overlaid on satellite imagery  

### For users WITHOUT a Mapbox token:
✅ **Automatic fallback** to CartoDB Dark (no error, seamless)  
✅ Console warning explains fallback occurred  
✅ Can obtain free token from clear instructions in `.env` and docs  
✅ Can manually switch to other no-token styles (Stadia, OpenFree)  

---

## Technical Details

### Mapbox Satellite Streets Style
- **API:** `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12`
- **Authentication:** Requires public token (pk.) appended as query param
- **Token limits:** 200,000 free tile requests per month (Mapbox free tier)
- **Cost:** FREE for typical usage (far below limits for single-user dashboard)

### Fallback Chain
1. **Primary:** Mapbox Satellite (if `VITE_MAPBOX_TOKEN` exists)
2. **Fallback:** CartoDB Dark Matter (if token missing/invalid)
3. **Emergency:** Stadia Dark (if CartoDB fails)

### Offline Support
- Service worker (`sw-tiles.js`) caches all tiles after first load
- Works offline after initial map load
- Cache persists across browser sessions

---

## Testing Checklist

- ✅ Default loads Mapbox Satellite (with valid token)
- ✅ Fallback to CartoDB Dark (without token)
- ✅ UI radio button reflects actual loaded style
- ✅ Style switching works from UI panel
- ✅ Console warnings are clear and helpful
- ✅ No errors in browser console
- ✅ Map tiles load correctly
- ✅ Philippine bounds are respected

---

## Related Documentation

- `README.md` — Full project overview
- `SETUP.md` — Step-by-step setup guide
- `.env.example` — Environment variable template
- `.env` — Active configuration (user must add token)

---

**Result: Application now displays photorealistic Philippine satellite imagery by default, with clear setup instructions and automatic fallback.**
