# 🚀 CISV Deployment Checklist

## Pre-Deployment Verification

### ✅ Code Changes Complete
- [x] MapLibreTileLayer.js defaults to `mapbox_satellite`
- [x] AdvancedGeospatialTerrain.js defaults to `mapbox_satellite`
- [x] index.html radio button checked for satellite
- [x] .env file created with instructions
- [x] .env.example updated with clear requirements
- [x] Documentation created (README, SETUP, QUICKSTART)
- [x] Build completed successfully (`npm run build`)

### ✅ Configuration Files
- [x] `.env` exists in project root
- [x] `.env.example` documents required variables
- [x] `.gitignore` includes `.env` (prevents token leak)
- [x] `vite.config.js` has PHIVOLCS proxy configured

### ✅ Documentation
- [x] `README.md` — Full project overview
- [x] `SETUP.md` — Step-by-step setup guide
- [x] `QUICKSTART.md` — 3-minute quick start
- [x] `CHANGES.md` — Technical change log
- [x] `SATELLITE_MAP_IMPLEMENTATION.md` — Implementation details
- [x] `DEPLOYMENT_CHECKLIST.md` — This file

---

## Local Testing

### Test #1: Development Mode WITH Token
```bash
# Add token to .env
echo "VITE_MAPBOX_TOKEN=pk.your_token_here" > .env

# Start dev server
npm run dev

# Open http://localhost:5173
```

**Expected:**
- ✅ Satellite imagery loads immediately
- ✅ Philippine islands clearly visible
- ✅ No console errors
- ✅ Live feed shows USGS + PHIVOLCS data
- ✅ Radio button "Satellite (Mapbox)" is checked

### Test #2: Development Mode WITHOUT Token
```bash
# Remove or empty the token
echo "VITE_MAPBOX_TOKEN=" > .env

# Start dev server
npm run dev

# Open http://localhost:5173
```

**Expected:**
- ✅ CartoDB Dark Matter loads (fallback)
- ✅ Console warning: "No Mapbox token — falling back to carto_dark"
- ✅ App functions normally
- ✅ Can manually switch to satellite (will show token instruction)

### Test #3: Production Build
```bash
# Build
npm run build

# Preview
npm run preview

# Open http://localhost:4173
```

**Expected:**
- ✅ Same behavior as dev mode
- ✅ Faster load times
- ✅ Minified assets
- ✅ Service worker caches tiles

### Test #4: Map Style Switching
```bash
npm run dev
```

**In browser:**
1. Click left panel → MAP STYLE
2. Select each style:
   - CartoDB Dark ✓
   - CartoDB Dark No Labels ✓
   - OpenFreeMap Streets ✓
   - Stadia Dark ✓
   - Mapbox Satellite ✓

**Expected:**
- ✅ Map updates instantly
- ✅ No white flash
- ✅ No console errors
- ✅ Attribution updates correctly

### Test #5: Live Data Feed
```bash
npm run dev
```

**Expected:**
- ✅ Top bar shows "FEED: LIVE"
- ✅ Source badge shows "USGS + PHIVOLCS"
- ✅ Right panel shows recent earthquakes
- ✅ Last fetch time updates every 5 minutes
- ✅ Clicking feed item triggers radar ping

### Test #6: Offline Mode
```bash
npm run dev
# Open browser → Load map fully
# Open DevTools → Network tab → Set to "Offline"
# Refresh page
```

**Expected:**
- ✅ Map tiles load from cache
- ✅ UI renders correctly
- ✅ Live feed shows "OFFLINE" status
- ✅ Falls back to cached/synthetic data

---

## Deployment Options

### Option 1: Netlify (Easiest)
```bash
# Build
npm run build

# Drag & drop dist/ folder to Netlify
```

**Environment Variables (Netlify Dashboard):**
```
VITE_MAPBOX_TOKEN=pk.your_token_here
```

**Build Settings:**
- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 18+

### Option 2: Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Environment Variables (Vercel Dashboard):**
```
VITE_MAPBOX_TOKEN=pk.your_token_here
```

### Option 3: GitHub Pages
```bash
# Build
npm run build

# Install gh-pages
npm i -D gh-pages

# Add to package.json scripts:
"deploy": "gh-pages -d dist"

# Deploy
npm run deploy
```

**Note:** Add Mapbox token to repository secrets for GitHub Actions.

### Option 4: Static File Host
```bash
# Build
npm run build

# Upload dist/ folder contents to:
# - AWS S3 + CloudFront
# - Google Cloud Storage
# - Azure Static Web Apps
# - Any web server (Apache, Nginx)
```

---

## Production Configuration

### Mapbox Token for Production

**Option A: Public Token (Recommended)**
1. Go to https://account.mapbox.com/
2. Create a new public token
3. Add URL restrictions:
   ```
   https://your-domain.com/*
   https://www.your-domain.com/*
   ```
4. Add to hosting platform environment variables

**Option B: Multiple Tokens**
- Development: `VITE_MAPBOX_TOKEN_DEV`
- Staging: `VITE_MAPBOX_TOKEN_STAGING`
- Production: `VITE_MAPBOX_TOKEN_PROD`

Update `MapLibreTileLayer.js` to read based on environment.

### Security Headers (Recommended)

Add to hosting configuration:

```
Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.mapbox.com https://earthquake.usgs.gov https://*.basemaps.cartocdn.com https://tiles.stadiamaps.com https://tiles.openfreemap.org; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### Performance Optimizations

- [x] Vite build minifies JS/CSS automatically
- [x] Service worker caches tiles
- [x] MapLibre uses WebGL (GPU accelerated)
- [x] Three.js uses instanced rendering for 10k+ markers
- [ ] Optional: Add CDN (CloudFlare, Fastly)
- [ ] Optional: Enable gzip/brotli compression on server
- [ ] Optional: Add lazy loading for volcano/trench data

---

## Post-Deployment Verification

### Checklist
```bash
# Open production URL
https://your-domain.com
```

**Verify:**
- [ ] Satellite imagery loads
- [ ] Philippine islands visible
- [ ] Live feed active (USGS + PHIVOLCS)
- [ ] No console errors (F12)
- [ ] All UI controls work
- [ ] Map style switching works
- [ ] Timeline playback works
- [ ] Raycaster (click marker) works
- [ ] Tooltip on hover works
- [ ] Mobile responsive (test on phone)
- [ ] Fast load time (<3 seconds)
- [ ] Service worker registered
- [ ] Tiles cached after first load

### Browser Testing
- [ ] Chrome (Windows/Mac)
- [ ] Firefox (Windows/Mac)
- [ ] Safari (Mac/iOS)
- [ ] Edge (Windows)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

### Network Testing
- [ ] Fast 3G (throttled)
- [ ] Offline after initial load
- [ ] High latency (500ms+)

### Lighthouse Audit
```bash
# Run in Chrome DevTools
# Target scores:
# Performance: >85
# Accessibility: >90
# Best Practices: >90
# SEO: >80
```

---

## Monitoring & Analytics

### Recommended Integrations

**Error Tracking:**
- Sentry: https://sentry.io/
- LogRocket: https://logrocket.com/

**Analytics:**
- Google Analytics
- Plausible (privacy-friendly)
- Cloudflare Web Analytics

**Uptime Monitoring:**
- UptimeRobot
- Pingdom
- Better Uptime

### Key Metrics to Track
- Page load time
- Map tile load time
- Live feed fetch success rate
- API error rate (USGS/PHIVOLCS)
- Browser compatibility issues
- User interactions (clicks, zooms)

---

## Maintenance

### Weekly
- [ ] Check live data feeds (USGS/PHIVOLCS)
- [ ] Review console errors
- [ ] Test on latest browsers

### Monthly
- [ ] Update dependencies: `npm update`
- [ ] Rebuild: `npm run build`
- [ ] Test all features end-to-end
- [ ] Check Mapbox usage (stay within free tier)

### Quarterly
- [ ] Major dependency updates: `npm outdated`
- [ ] Security audit: `npm audit fix`
- [ ] Performance review (Lighthouse)
- [ ] User feedback review

---

## Rollback Plan

### If deployment fails:

**Option 1: Revert Build**
```bash
# Previous dist/ backup
cp -r dist.backup/ dist/

# Redeploy
```

**Option 2: Git Revert**
```bash
# Find last working commit
git log --oneline

# Revert
git revert <commit-hash>

# Rebuild & deploy
npm run build
```

**Option 3: Hosting Platform Rollback**
- Netlify: Deploy → Rollback to previous deploy
- Vercel: Deployments → Promote previous deployment
- GitHub Pages: Revert commit, re-run action

---

## Support & Troubleshooting

### Common Issues

**Issue:** Map tiles not loading in production
- Check CORS headers on hosting platform
- Verify Mapbox token in environment variables
- Check browser console for errors

**Issue:** Live feed shows "OFFLINE"
- Check PHIVOLCS proxy configuration
- Verify USGS API accessible from production
- Check browser CORS policy

**Issue:** Performance slow on mobile
- Reduce magnitude filter to show fewer events
- Use CartoDB Dark instead of satellite
- Disable layers (volcanoes, trenches)

### Getting Help
- GitHub Issues: (your-repo-url)/issues
- USGS API Docs: https://earthquake.usgs.gov/fdsnws/event/1/
- MapLibre Docs: https://maplibre.org/maplibre-gl-js/docs/
- Three.js Docs: https://threejs.org/docs/

---

## ✅ READY TO DEPLOY

All systems verified and documented.

**Final Command:**
```bash
npm run build
# Upload dist/ to your hosting platform
# Configure environment variables
# Go live!
```

**🎉 Your Philippine Seismic Vision Dashboard is ready for the world!**
