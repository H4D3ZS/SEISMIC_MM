# ⚡ CISV Quick Start

**Get the Philippine Seismic Vision Dashboard running in 3 minutes**

---

## 1️⃣ Install

```bash
npm install
```

---

## 2️⃣ Get Mapbox Token (FREE)

1. Go to: **https://account.mapbox.com/**
2. Sign up (free, no credit card)
3. Copy your token (starts with `pk.`)

---

## 3️⃣ Add Token

Open `.env` file and paste your token:

```env
VITE_MAPBOX_TOKEN=pk.your_token_here
```

---

## 4️⃣ Run

```bash
npm run dev
```

Open **http://localhost:5173**

---

## ✅ You should see:

- 🌍 **Philippine satellite map** (actual geography)
- 🔴 **Earthquake markers** in 3D
- 📡 **Live feed** from USGS + PHIVOLCS
- 🎮 **Interactive controls**

---

## 🆘 No satellite imagery?

**Option A:** Check your `.env` token is correct

**Option B:** Use a different map style:
- Click left panel → **MAP STYLE**
- Select **"Dark Matter (CARTO)"** (no token needed)

---

## 🎮 Controls

- **Drag** — Rotate
- **Right-click drag** — Pan
- **Scroll** — Zoom
- **Click marker** — See details

---

## 📖 Full Docs

- `README.md` — Complete guide
- `SETUP.md` — Detailed setup
- `CHANGES.md` — What was changed

---

**That's it! You're ready to explore Philippine seismic activity in real-time.**
