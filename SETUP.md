# 🚀 CISV Setup Guide

**Complete setup instructions for running the Philippine Seismic Vision Dashboard**

---

## Prerequisites

- **Node.js** v18 or higher ([Download here](https://nodejs.org/))
- **Web browser** (Chrome, Firefox, Edge recommended)
- **Internet connection** for live earthquake data

---

## Step 1: Install Dependencies

Open a terminal in the project folder and run:

```bash
npm install
```

This installs:
- `three` — 3D graphics engine
- `maplibre-gl` — Map rendering library
- `vite` — Development server

---

## Step 2: Get Your Free Mapbox Token

The default map uses **Mapbox Satellite Streets** for high-resolution satellite imagery.

### 🔑 How to get a token (100% FREE):

1. **Go to Mapbox:**
   ```
   https://account.mapbox.com/
   ```

2. **Sign up or log in** (free account, no credit card required)

3. **Create a token:**
   - Click **"Create a token"** or use the default public token
   - Copy the token (starts with `pk.`)
   - Example: `pk.eyJ1IjoibXl1c2VybmFtZSIsImEiOiJjbHNhYmNkZWYxMjM0NTZ3aWprbG1ub3AifQ.ExampleHashHere`

4. **Paste into `.env` file:**
   - Open the `.env` file in the project root folder
   - Find the line: `VITE_MAPBOX_TOKEN=`
   - Paste your token after the `=` sign

   **Before:**
   ```
   VITE_MAPBOX_TOKEN=
   ```

   **After:**
   ```
   VITE_MAPBOX_TOKEN=pk.eyJ1IjoibXl1c2VybmFtZSIsImEiOiJjbHNhYmNkZWYxMjM0NTZ3aWprbG1ub3AifQ.ExampleHashHere
   ```

5. **Save the file**

---

## Step 3: Run the Development Server

In your terminal, run:

```bash
npm run dev
```

You should see output like:

```
  VITE v5.2.0  ready in 324 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

---

## Step 4: Open the Application

**Open your browser** and go to:

```
http://localhost:5173
```

You should see:
1. 🌍 **Philippine satellite map** loaded in the background
2. 🔴 **Red/orange/cyan earthquake markers** rendered in 3D
3. 📡 **Live feed panel** on the right showing recent earthquakes
4. 🎛️ **Control panels** on left and top

---

## ✅ Verify It's Working

### Check #1: Map Loaded
- You should see **actual satellite imagery** of the Philippine islands
- If you see only a dark background, check the `.env` token

### Check #2: Live Data
- Look at the **top-right status bar**
- Should say: **FEED: LIVE** and **SOURCE: USGS + PHIVOLCS**
- If it says **SYNTHETIC**, check your internet connection

### Check #3: Interact
- **Click and drag** to rotate the map
- **Scroll** to zoom in/out
- **Click an earthquake marker** to see details in the right panel

---

## 🔧 Troubleshooting

### Problem: Map is blank or dark

**Solution 1:** Check your `.env` file
```bash
# Make sure the token is on the same line, no spaces before/after
VITE_MAPBOX_TOKEN=pk.your_actual_token_here
```

**Solution 2:** Restart the dev server
```bash
# Stop the server (Ctrl+C in terminal)
# Start it again:
npm run dev
```

**Solution 3:** Use a different map style
- Click the left panel → **MAP STYLE** section
- Select **"Dark Matter (CARTO)"** (no token required)

---

### Problem: Shows "SYNTHETIC" data instead of live

**Solution:** Check your internet connection and wait 30 seconds for the initial fetch.

The app fetches live data from:
- **USGS** — https://earthquake.usgs.gov/fdsnws/event/1/query
- **PHIVOLCS** — https://earthquake.phivolcs.dost.gov.ph/

If both fail, it falls back to synthetic test data automatically.

---

### Problem: "npm: command not found"

**Solution:** Install Node.js
1. Download from https://nodejs.org/
2. Install with default options
3. Restart your terminal
4. Try `npm install` again

---

### Problem: Port 5173 already in use

**Solution:** Kill the existing process or use a different port:
```bash
npm run dev -- --port 3000
```

Then open `http://localhost:3000`

---

## 🎮 Usage Tips

### Navigation
- **Left mouse drag** — Rotate view
- **Right mouse drag** — Pan
- **Scroll wheel** — Zoom

### Finding Recent Earthquakes
1. Look at the **LIVE FEED** panel (right side)
2. Click any earthquake item
3. A **radar ping** will show its location on the map

### Filtering Events
- Use **Magnitude Filter** sliders (left panel) to show only strong quakes
- Use **Depth Filter** to show only shallow events
- Toggle **Color Encoding** to visualize by depth, magnitude, or PGA

### Timeline Mode
- Click **▶ Play** (bottom bar) to watch historical earthquakes animate from 1990→2026
- Drag the **timeline scrubber** to jump to any year

---

## 🌐 Building for Production

When ready to deploy:

```bash
npm run build
```

This creates a `dist/` folder with optimized static files ready for hosting.

Preview the production build locally:
```bash
npm run preview
```

---

## 📦 Deployment Options

The built app is 100% static HTML/CSS/JS. Deploy to:

- **Netlify** (drag & drop the `dist/` folder)
- **Vercel** (connect your Git repo)
- **GitHub Pages** (push `dist/` to `gh-pages` branch)
- **Any static file host**

---

## 🆘 Still Having Issues?

1. **Check browser console** (F12 → Console tab) for error messages
2. **Verify Node.js version:** `node --version` (should be v18+)
3. **Clear browser cache** and reload (Ctrl+Shift+R)
4. **Try incognito mode** to rule out browser extensions

---

## ✨ You're All Set!

The CISV dashboard is now running with:
- ✅ Live earthquake data from PHIVOLCS & USGS
- ✅ High-resolution Philippine satellite imagery
- ✅ Interactive 3D visualization
- ✅ Real-time feed updates every 5 minutes

**Explore the seismic landscape of the Philippine archipelago!**
