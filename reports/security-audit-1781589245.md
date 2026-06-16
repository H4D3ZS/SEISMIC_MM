# Static Security Audit

## Executive summary

**70 confirmed finding(s)**, **10 HIGH**.

## Scope & methodology

- **Scope:** .
- **Depth:** standard
- **Files scanned:** 153
- **Total findings:** 70
- **Dependencies:** `package.json` present — Run `npm audit` / `pnpm audit` to check npm dependencies for known CVEs.

Pipeline: static/heuristic signals → LLM triage → evidence verification at cited line → confidence threshold.

## Summary by severity

| Severity | Count |
|----------|------:|
| HIGH | 10 |
| MEDIUM | 59 |
| LOW | 1 |

## Confirmed findings

### SEC-001 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\.hades\ml\scripts\inference.py:38` |
| **Confidence** | 0.50 |

**Code context**

```
  35|     x = torch.tensor([values], dtype=torch.float32)
  36|     model = MLP(len(feature_cols), hidden, len(classes))
  37|     model.load_state_dict(ckpt["state_dict"])
  38|     model.eval()
  39|     with torch.no_grad():
  40|         probs = torch.softmax(model(x), dim=1)[0]
  41|         idx = int(probs.argmax().item())
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-002 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\.hades\ml\scripts\ml_toolkit.py:40` |
| **Confidence** | 0.50 |

**Code context**

```
  37|     hidden = int(ckpt.get("hidden_size", 64))
  38|     model = MLP(len(feature_cols), hidden, len(classes))
  39|     model.load_state_dict(ckpt["state_dict"])
  40|     model.eval()
  41|     return model, ckpt
  42| 
  43| 
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-003 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\.hades\ml\scripts\ml_toolkit.py:253` |
| **Confidence** | 0.50 |

**Code context**

```
 250|             opt.zero_grad()
 251|             loss_fn(model(xt), yt).backward()
 252|             opt.step()
 253|         model.eval()
 254|         with torch.no_grad():
 255|             acc = float((model(xv).argmax(1) == yv).float().mean().item())
 256|         return acc
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-004 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\.hades\ml\scripts\train_classifier.py:178` |
| **Confidence** | 0.50 |

**Code context**

```
 175|             n_batches += 1
 176|         train_loss = total / max(n_batches, 1)
 177| 
 178|         model.eval()
 179|         with torch.no_grad():
 180|             val_loss = float(loss_fn(model(x_val), y_val).item())
 181|             preds = model(x_val).argmax(dim=1)
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-005 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\.hades\ml\scripts\train_classifier.py:245` |
| **Confidence** | 0.50 |

**Code context**

```
 242|             print(f"Early stopping at epoch {epoch+1} (no val_loss improvement for {patience} epochs)", flush=True)
 243|             break
 244| 
 245|     model.eval()
 246|     confusion = {}
 247|     with torch.no_grad():
 248|         preds = model(x_val).argmax(dim=1).cpu().numpy()
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-006 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\.hades\ml\scripts\train_vision.py:135` |
| **Confidence** | 0.50 |

**Code context**

```
 132|             n_batches += 1
 133|         train_loss = total / max(n_batches, 1)
 134| 
 135|         model.eval()
 136|         correct = 0
 137|         val_total = 0
 138|         val_loss_sum = 0.0
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-007 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\gfm_server.py:68` |
| **Confidence** | 0.50 |

**Code context**

```
  65|             local_files_only=hf_offline
  66|         )
  67| 
  68|     model.eval()
  69|     MODEL_LOADED = True
  70|     print("[GFM] Model loaded successfully!")
  71| except Exception as e:
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-068 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\test.py:6` |
| **Confidence** | 0.50 |

**Code context**

```
   3| 
   4| def calculate(expression):
   5|     """ Evaluates a mathematical expression using numpy/math functions. """
   6|     # Allowed names for eval()
   7|     allowed_names = {
   8|         **np.__dict__,
   9|         **math.__dict__
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-069 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\test.py:12` |
| **Confidence** | 0.50 |

**Code context**

```
   9|         **math.__dict__
  10|     }
  11|     try:
  12|         result = eval(expression, {"__builtins__": None}, allowed_names)
  13|         return result
  14|     except Exception as e:
  15|         return f"Error evaluating expression '{expression}' : {str(e)}"
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-070 — Dangerous Eval

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **CWE** | CWE-95 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\tools\gfm_offline_server.py:167` |
| **Confidence** | 0.50 |

**Code context**

```
 164|             import torch
 165|             from GFM import ElasticViTMAE
 166|             model = ElasticViTMAE.ElasticViTMAE.from_pretrained(args.weights)
 167|             model.eval()
 168|             MODEL_LOADED = True
 169|             log.info("Weights loaded successfully.")
 170|         except Exception as e:
```

**Remediation**

Avoid eval; parse/allow-list input instead of executing it.

### SEC-008 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:262` |
| **Confidence** | 0.50 |

**Code context**

```
 259|     if (!container) return;
 260| 
 261|     if (!this._liveEvents || this._liveEvents.length === 0) {
 262|       container.innerHTML = '<div class="feed-empty">No live events available</div>';
 263|       return;
 264|     }
 265| 
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-009 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:274` |
| **Confidence** | 0.50 |

**Code context**

```
 271|     });
 272| 
 273|     if (filtered.length === 0) {
 274|       container.innerHTML = '<div class="feed-empty">No events for selected year window</div>';
 275|       return;
 276|     }
 277| 
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-010 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:281` |
| **Confidence** | 0.50 |

**Code context**

```
 278|     // Show newest 60 only — older history is visible through the 3D catalog
 279|     const recent = filtered.slice(0, 60);
 280| 
 281|     container.innerHTML = recent.map((ev, idx) => {
 282|       const mag       = ev.mag.toFixed(1);
 283|       const depth     = ev.depth.toFixed(0);
 284|       const color     = _magColor(ev.mag);
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-011 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:496` |
| **Confidence** | 0.50 |

**Code context**

```
 493| 
 494|       if (terminal) {
 495|         terminal.style.display = 'block';
 496|         terminal.innerHTML = `<span style="color: var(--cyan)">[${prefix}] Initiating API call to ${endpoint}...</span>\n`;
 497|       }
 498|       if (statusVal) {
 499|         statusVal.textContent = 'QUERYING MODEL...';
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-012 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:659` |
| **Confidence** | 0.50 |

**Code context**

```
 656|       // Determine epicenter: use parsed coords, or pick a random high-seismicity zone
 657|       if (!isSuccess) {
 658|         if (this._liveEvents && this._liveEvents.length > 0) {
 659|           const randomIdx = Math.floor(Math.random() * Math.min(20, this._liveEvents.length));
 660|           const randomEvent = this._liveEvents[randomIdx];
 661|           predictedLat = randomEvent.lat;
 662|           predictedLon = randomEvent.lon;
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-013 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:665` |
| **Confidence** | 0.50 |

**Code context**

```
 662|           predictedLon = randomEvent.lon;
 663|         } else {
 664|           // Random point in Philippine high-seismicity belt
 665|           predictedLat = 6.0 + Math.random() * 4;
 666|           predictedLon = 124.0 + Math.random() * 4;
 667|         }
 668|       }
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-014 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:666` |
| **Confidence** | 0.50 |

**Code context**

```
 663|         } else {
 664|           // Random point in Philippine high-seismicity belt
 665|           predictedLat = 6.0 + Math.random() * 4;
 666|           predictedLon = 124.0 + Math.random() * 4;
 667|         }
 668|       }
 669| 
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-015 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:682` |
| **Confidence** | 0.50 |

**Code context**

```
 679|           siteGeology: 1,
 680|           progressCb: (pct, msg) => {
 681|             if (terminal) {
 682|               terminal.innerHTML = terminal.innerHTML.replace(/\[MC-PSHA\].*?\n/, '');
 683|               terminal.innerHTML += `<span style="color: var(--cyan)">[MC-PSHA] ${msg}</span>\n`;
 684|               terminal.scrollTop = terminal.scrollHeight;
 685|             }
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-016 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:703` |
| **Confidence** | 0.50 |

**Code context**

```
 700|         const topFaults = simResult.faultContributions.slice(0, 3);
 701| 
 702|         // Use hazard-consistent focus from simulation
 703|         const hcLat = predictedLat + (simResult.meta.hazardConsistentDist || 30) * 0.005 * (Math.random() - 0.5);
 704|         const hcLon = predictedLon + (simResult.meta.hazardConsistentDist || 30) * 0.005 * (Math.random() - 0.5);
 705|         predictedLat = hcLat;
 706|         predictedLon = hcLon;
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-017 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:704` |
| **Confidence** | 0.50 |

**Code context**

```
 701| 
 702|         // Use hazard-consistent focus from simulation
 703|         const hcLat = predictedLat + (simResult.meta.hazardConsistentDist || 30) * 0.005 * (Math.random() - 0.5);
 704|         const hcLon = predictedLon + (simResult.meta.hazardConsistentDist || 30) * 0.005 * (Math.random() - 0.5);
 705|         predictedLat = hcLat;
 706|         predictedLon = hcLon;
 707| 
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-018 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:846` |
| **Confidence** | 0.50 |

**Code context**

```
 843| 
 844|       try {
 845|         const models = await this._ollama.listModels(host);
 846|         modelSelect.innerHTML = '';
 847|         if (models.length === 0) {
 848|           modelSelect.innerHTML = '<option value="">No models found</option>';
 849|         } else {
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-019 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:848` |
| **Confidence** | 0.50 |

**Code context**

```
 845|         const models = await this._ollama.listModels(host);
 846|         modelSelect.innerHTML = '';
 847|         if (models.length === 0) {
 848|           modelSelect.innerHTML = '<option value="">No models found</option>';
 849|         } else {
 850|           for (const model of models) {
 851|             const opt = document.createElement('option');
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-020 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:886` |
| **Confidence** | 0.50 |

**Code context**

```
 883|           const models = await this._ollama.listModels(host);
 884|           if (models.length === 0) throw new Error('No models installed. Run e.g. `ollama pull gemma2:9b`.');
 885|           model = models[0];
 886|           modelSelect.innerHTML = models.map(m => `<option value="${m}"${m === model ? ' selected' : ''}>${m}</option>`).join('');
 887|           terminal.textContent += `[Ollama] Using model: ${model}\n`;
 888|         } catch (e) {
 889|           terminal.textContent += `[ERROR] Cannot reach Ollama at ${host}: ${e.message}\n` +
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-021 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:1084` |
| **Confidence** | 0.50 |

**Code context**

```
1081|         const maxMag = Math.max(...mags);
1082|         const recentCount = this._liveEvents.filter(e => Date.now() - e.time_ms < 86400000).length;
1083|         const normalizedActivity = Math.min(1, recentCount / Math.max(1, totalEvents * 0.1));
1084|         const lossFromData = (1 - normalizedActivity) * 70 + avgMag * 5 + Math.random() * 2;
1085| 
1086|         lossHistory.push({ x: progress * 90, y: 90 - lossFromData });
1087|         if (lossHistory.length > 60) lossHistory.shift();
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-022 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:1672` |
| **Confidence** | 0.50 |

**Code context**

```
1669|     const live = this._liveEvents[data.index ?? -1];
1670|     const place = live?.place ?? '';
1671| 
1672|     content.innerHTML = `
1673|       <div class="tt-row"><span class="tt-key">Mw</span>
1674|         <span class="tt-val" style="color:${_magColor(data.mag)}">${data.mag.toFixed(2)} <span style="font-size:8px;opacity:0.7">${_magLabel(data.mag)}</span></span>
1675|       </div>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-023 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:1703` |
| **Confidence** | 0.50 |

**Code context**

```
1700|       v.Alert_Level >= 3 ? '#ff1a44' :
1701|       v.Alert_Level >= 2 ? '#ffaa00' : '#00ff88';
1702| 
1703|     content.innerHTML = `
1704|       <div class="tt-row tt-place"><span class="tt-place-text">${v.name.toUpperCase()}</span></div>
1705|       <div class="tt-row"><span class="tt-key">Alert</span>
1706|         <span class="tt-val" style="color:${alertColor}">LEVEL ${v.Alert_Level}</span>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-024 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:1733` |
| **Confidence** | 0.50 |

**Code context**

```
1730|       if (b.Alert_Level !== a.Alert_Level) return b.Alert_Level - a.Alert_Level;
1731|       return a.name.localeCompare(b.name);
1732|     });
1733|     container.innerHTML = sorted.map(v => `
1734|       <div class="volcano-item" role="listitem" aria-label="${v.name}, Alert Level ${v.Alert_Level}">
1735|         <span class="volcano-name">${v.name.toUpperCase()}</span>
1736|         <span class="volcano-alert alert-${v.Alert_Level}">ALT ${v.Alert_Level}</span>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-025 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:1871` |
| **Confidence** | 0.50 |

**Code context**

```
1868|     if (!this._simulationHistory) this._loadSimHistory();
1869| 
1870|     if (this._simulationHistory.length === 0) {
1871|       container.innerHTML = '<div style="color: var(--text-dim); font-size: 9px; padding: 8px;">No simulations yet. Click RE-RUN STRESS CALIBRATION to start.</div>';
1872|       return;
1873|     }
1874| 
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-026 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\controllers\UIController.js:1875` |
| **Confidence** | 0.50 |

**Code context**

```
1872|       return;
1873|     }
1874| 
1875|     container.innerHTML = this._simulationHistory.map((s, i) => {
1876|       const time = new Date(s.timestamp);
1877|       const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
1878|       const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-027 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\data\CatalogDataService.js:135` |
| **Confidence** | 0.50 |

**Code context**

```
 132| // ── RNG (seeded for reproducible demo renders) ──────────────────────────────
 133| 
 134| /**
 135|  * Mulberry32 deterministic PRNG — avoids Math.random() non-reproducibility.
 136|  * @param {number} seed  32-bit integer seed
 137|  * @returns {() => number}  Returns values in [0, 1)
 138|  */
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-028 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\data\CivicInfrastructureData.js:265` |
| **Confidence** | 0.50 |

**Code context**

```
 262| 
 263|   for (const b of city.barangays) {
 264|     // Water status degradation
 265|     const waterRoll = Math.random();
 266|     if (combinedImpact > 0.7 && waterRoll < 0.3) {
 267|       b.water = 'INTERRUPTED';
 268|     } else if (combinedImpact > 0.3 && waterRoll < 0.6) {
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-029 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\data\CivicInfrastructureData.js:275` |
| **Confidence** | 0.50 |

**Code context**

```
 272|     }
 273| 
 274|     // Power status
 275|     const powerRoll = Math.random();
 276|     if (combinedImpact > 0.8 && powerRoll < 0.2) {
 277|       b.power = 'OUTAGE';
 278|     } else if (combinedImpact > 0.4 && powerRoll < 0.4) {
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-030 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\data\CivicInfrastructureData.js:284` |
| **Confidence** | 0.50 |

**Code context**

```
 281| 
 282|     // Hazard status
 283|     if (combinedImpact > 0.6) {
 284|       const hazardRoll = Math.random();
 285|       if (hazardRoll < 0.05) b.hazard = 'SINKHOLE';
 286|       else if (hazardRoll < 0.15) b.hazard = 'FLOODED';
 287|       else if (hazardRoll < 0.30) b.hazard = 'CRITICAL';
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-031 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\data\CivicInfrastructureData.js:297` |
| **Confidence** | 0.50 |

**Code context**

```
 294|         biz.status = 'RESTRICTED';
 295|       } else if (combinedImpact > 0.8 && biz.type === 'INFRASTRUCTURE') {
 296|         biz.status = 'RESTRICTED';
 297|       } else if (combinedImpact > 0.5 && Math.random() < 0.3) {
 298|         biz.status = 'CLOSED';
 299|       }
 300|     }
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-032 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\BayesianPredictor.js:82` |
| **Confidence** | 0.50 |

**Code context**

```
  79|   _normalInit(size, mean, std) {
  80|     const arr = new Float64Array(size);
  81|     for (let i = 0; i < size; i++) {
  82|       const u1 = Math.random() || 0.0001;
  83|       const u2 = Math.random();
  84|       arr[i] = mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
  85|     }
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-033 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\BayesianPredictor.js:83` |
| **Confidence** | 0.50 |

**Code context**

```
  80|     const arr = new Float64Array(size);
  81|     for (let i = 0; i < size; i++) {
  82|       const u1 = Math.random() || 0.0001;
  83|       const u2 = Math.random();
  84|       arr[i] = mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
  85|     }
  86|     return arr;
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-034 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\BayesianPredictor.js:106` |
| **Confidence** | 0.50 |

**Code context**

```
 103|   }
 104| 
 105|   _randn() {
 106|     const u1 = Math.random() || 0.0001;
 107|     const u2 = Math.random();
 108|     return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
 109|   }
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-035 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\BayesianPredictor.js:107` |
| **Confidence** | 0.50 |

**Code context**

```
 104| 
 105|   _randn() {
 106|     const u1 = Math.random() || 0.0001;
 107|     const u2 = Math.random();
 108|     return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
 109|   }
 110| 
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-036 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\BayesianPredictor.js:557` |
| **Confidence** | 0.50 |

**Code context**

```
 554|     const lossHistory = [];
 555|     for (let ep = 0; ep < epochs; ep++) {
 556|       // Shuffle (Fisher-Yates) for SGD.
 557|       for (let i = samples.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [samples[i], samples[j]] = [samples[j], samples[i]]; }
 558|       let epochLoss = 0;
 559|       for (const s of samples) epochLoss += this._sgdStep(s.x, s.y, s.mask, lr);
 560|       epochLoss /= samples.length;
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-037 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\BayesianPredictor.js:639` |
| **Confidence** | 0.50 |

**Code context**

```
 636|     for (let i = 0; i < B; i++) {
 637|       // Bootstrap resample (with replacement) of the real magnitudes.
 638|       const sample = new Array(N);
 639|       for (let k = 0; k < N; k++) sample[k] = local[(Math.random() * N) | 0].mag;
 640|       const fit = fitB(sample);
 641|       if (!fit) continue;
 642|       // 100-year characteristic magnitude: N(≥M)=0.01/yr ⇒ M = (a − log10(0.01)) / b
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-038 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\CivicDashboard.js:160` |
| **Confidence** | 0.50 |

**Code context**

```
 157| 
 158|     banner.style.display = 'flex';
 159|     banner.style.borderLeftColor = advisory.color;
 160|     banner.innerHTML = `
 161|       <span style="color: ${advisory.color}; font-weight: bold; font-size: 10px;">⚠ ${advisory.level}:</span>
 162|       <span style="font-size: 9px; flex: 1;">${advisory.message}</span>
 163|       <button onclick="this.parentElement.style.display='none'" style="background: none; border: none; color: #888; cursor: pointer; font-size: 12px;">✕</button>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-039 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\CivicDashboard.js:184` |
| **Confidence** | 0.50 |

**Code context**

```
 181|     const container = document.getElementById('civic-tab-content');
 182|     if (!container) return;
 183| 
 184|     container.innerHTML = `
 185|       <div style="display: flex; flex-direction: column; gap: 6px;">
 186|         <div style="font-size: 11px; font-weight: bold; color: var(--cyan);">${this.activeCity}</div>
 187|         <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-040 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\CivicDashboard.js:256` |
| **Confidence** | 0.50 |

**Code context**

```
 253|       return (order[a[field]] ?? 99) - (order[b[field]] ?? 99);
 254|     });
 255| 
 256|     container.innerHTML = `
 257|       <div style="display: flex; flex-direction: column; gap: 2px;">
 258|         ${sortedBarangays.map(b => {
 259|           const status = b[field];
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-041 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\CivicDashboard.js:283` |
| **Confidence** | 0.50 |

**Code context**

```
 280|       b.businesses.map(biz => ({ ...biz, barangay: b.name }))
 281|     );
 282| 
 283|     container.innerHTML = `
 284|       <div style="display: flex; flex-direction: column; gap: 4px;">
 285|         <div style="font-size: 9px; color: var(--text-secondary); font-weight: bold; text-transform: uppercase;">Businesses (${allBusinesses.length})</div>
 286|         ${allBusinesses.length === 0 ? '<div style="font-size: 8px; color: var(--text-dim);">No business data available</div>' :
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-042 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\CivicDashboard.js:314` |
| **Confidence** | 0.50 |

**Code context**

```
 311|     const statusBar = document.getElementById('civic-status-bar');
 312|     if (!statusBar) return;
 313| 
 314|     statusBar.innerHTML = `
 315|       <span>⚡ Power: ${city.powerRestoredPct}% restored</span>
 316|       <span>💧 Water: ${stats.waterRationingActive ? 'Rationing active' : 'Normal'} — ${stats.waterStats.LOW_PRESS} low press, ${stats.waterStats.INTERRUPTED} interrupted</span>
 317|       <span>🔴 Post-earthquake monitoring active</span>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-043 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\CommandPalette.js:116` |
| **Confidence** | 0.50 |

**Code context**

```
 113|     this.items = this.index.query(q, 30);
 114|     this.active = 0;
 115|     if (!this.items.length) {
 116|       this.results.innerHTML = `<div style="padding:14px;color:var(--text-dim,#667);font-family:var(--font-mono,monospace);font-size:11px;">No matches for "${this._esc(q)}".</div>`;
 117|       return;
 118|     }
 119|     const rows = this.items.map((r, i) => {
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-044 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\CommandPalette.js:131` |
| **Confidence** | 0.50 |

**Code context**

```
 128|         <span class="cmdk-coord">${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}</span>
 129|       </div>`;
 130|     }).join('');
 131|     this.results.innerHTML = rows;
 132|     this.results.querySelectorAll('.cmdk-item').forEach((n) => {
 133|       const i = parseInt(n.dataset.i, 10);
 134|       n.addEventListener('mouseenter', () => { this.active = i; this._highlight(); });
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-045 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\GFMVisualizer.js:209` |
| **Confidence** | 0.50 |

**Code context**

```
 206|         dash: dashMesh,
 207|         weight: node.weight,
 208|         speed: 1.2 + node.weight * 0.8,
 209|         offset: Math.random() * 10
 210|       });
 211|     }
 212| 
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-046 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\simulation_engine.js:454` |
| **Confidence** | 0.50 |

**Code context**

```
 451|     const pgaG = (pga / 981).toFixed(3);
 452| 
 453|     // Scenario magnitudes derived from zone maxMag and event magnitude
 454|     const scenarioBmag = Math.max(4.0, Math.min(rupture?.maxMag || 7.5, eventMag - 1.0 + (Math.random() - 0.5) * 0.5));
 455|     const scenarioCmag = Math.max(3.5, Math.min(rupture?.maxMag || 7.0, eventMag - 1.8 + (Math.random() - 0.5) * 0.5));
 456| 
 457|     const localReport = `[CISV DISASTER RESPONSE // OFFLINE MODE]
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-047 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\simulation_engine.js:455` |
| **Confidence** | 0.50 |

**Code context**

```
 452| 
 453|     // Scenario magnitudes derived from zone maxMag and event magnitude
 454|     const scenarioBmag = Math.max(4.0, Math.min(rupture?.maxMag || 7.5, eventMag - 1.0 + (Math.random() - 0.5) * 0.5));
 455|     const scenarioCmag = Math.max(3.5, Math.min(rupture?.maxMag || 7.0, eventMag - 1.8 + (Math.random() - 0.5) * 0.5));
 456| 
 457|     const localReport = `[CISV DISASTER RESPONSE // OFFLINE MODE]
 458| ZONE: ${zone} (b=${bValue.toFixed(2)}, max M${rupture?.maxMag || '?'})
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-048 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:228` |
| **Confidence** | 0.50 |

**Code context**

```
 225| 
 226|       // Respawn at crater mouth when particle exceeds altitude ceiling
 227|       if (posArr[i + 2] > PLUME_CEILING) {
 228|         posArr[i]     = x + (Math.random() - 0.5) * 0.15;
 229|         posArr[i + 1] = y + (Math.random() - 0.5) * 0.15;
 230|         posArr[i + 2] = craterZ;
 231|       }
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-049 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:229` |
| **Confidence** | 0.50 |

**Code context**

```
 226|       // Respawn at crater mouth when particle exceeds altitude ceiling
 227|       if (posArr[i + 2] > PLUME_CEILING) {
 228|         posArr[i]     = x + (Math.random() - 0.5) * 0.15;
 229|         posArr[i + 1] = y + (Math.random() - 0.5) * 0.15;
 230|         posArr[i + 2] = craterZ;
 231|       }
 232|     }
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-050 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:439` |
| **Confidence** | 0.50 |

**Code context**

```
 436|       const numFissures = 4;
 437|       for (let f = 0; f < numFissures; f++) {
 438|         const fPoints = [];
 439|         const fAngle = (f / numFissures) * Math.PI * 2 + Math.random() * 0.5;
 440|         const fLength = 10; // more steps for smoother lava paths
 441|         for (let j = 0; j <= fLength; j++) {
 442|           const t = j / fLength; // 0 = top rim, 1 = base
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-051 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:525` |
| **Confidence** | 0.50 |

**Code context**

```
 522|       velocities = new Float32Array(particleCount * 3);
 523| 
 524|       for (let i = 0; i < particleCount * 3; i += 3) {
 525|         positions[i]     = x + (Math.random() - 0.5) * 0.3;
 526|         positions[i + 1] = y + (Math.random() - 0.5) * 0.3;
 527|         positions[i + 2] = z + height + Math.random() * 6.0;
 528| 
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-052 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:526` |
| **Confidence** | 0.50 |

**Code context**

```
 523| 
 524|       for (let i = 0; i < particleCount * 3; i += 3) {
 525|         positions[i]     = x + (Math.random() - 0.5) * 0.3;
 526|         positions[i + 1] = y + (Math.random() - 0.5) * 0.3;
 527|         positions[i + 2] = z + height + Math.random() * 6.0;
 528| 
 529|         const alertVelocityBoost = 1.0 + alertLevel * 0.3;
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-053 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:527` |
| **Confidence** | 0.50 |

**Code context**

```
 524|       for (let i = 0; i < particleCount * 3; i += 3) {
 525|         positions[i]     = x + (Math.random() - 0.5) * 0.3;
 526|         positions[i + 1] = y + (Math.random() - 0.5) * 0.3;
 527|         positions[i + 2] = z + height + Math.random() * 6.0;
 528| 
 529|         const alertVelocityBoost = 1.0 + alertLevel * 0.3;
 530|         velocities[i]     = (Math.random() - 0.5) * 0.20;
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-054 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:530` |
| **Confidence** | 0.50 |

**Code context**

```
 527|         positions[i + 2] = z + height + Math.random() * 6.0;
 528| 
 529|         const alertVelocityBoost = 1.0 + alertLevel * 0.3;
 530|         velocities[i]     = (Math.random() - 0.5) * 0.20;
 531|         velocities[i + 1] = (Math.random() - 0.5) * 0.20;
 532|         velocities[i + 2] = (Math.random() * 0.5 + 0.25) * alertVelocityBoost;
 533|       }
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-055 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:531` |
| **Confidence** | 0.50 |

**Code context**

```
 528| 
 529|         const alertVelocityBoost = 1.0 + alertLevel * 0.3;
 530|         velocities[i]     = (Math.random() - 0.5) * 0.20;
 531|         velocities[i + 1] = (Math.random() - 0.5) * 0.20;
 532|         velocities[i + 2] = (Math.random() * 0.5 + 0.25) * alertVelocityBoost;
 533|       }
 534| 
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-056 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:532` |
| **Confidence** | 0.50 |

**Code context**

```
 529|         const alertVelocityBoost = 1.0 + alertLevel * 0.3;
 530|         velocities[i]     = (Math.random() - 0.5) * 0.20;
 531|         velocities[i + 1] = (Math.random() - 0.5) * 0.20;
 532|         velocities[i + 2] = (Math.random() * 0.5 + 0.25) * alertVelocityBoost;
 533|       }
 534| 
 535|       pGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-057 — Insecure Randomness

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-330 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\engine\VolcanicLayerRenderer.js:642` |
| **Confidence** | 0.50 |

**Code context**

```
 639|     const angle = (i / 8) * Math.PI * 2;
 640|     ctx.moveTo(128, 128);
 641|     ctx.lineTo(
 642|       128 + Math.cos(angle) * (60 + Math.random() * 40),
 643|       128 + Math.sin(angle) * (60 + Math.random() * 40)
 644|     );
 645|   }
```

**Remediation**

Use a CSPRNG (crypto.randomBytes, secrets, getrandom) for security tokens.

### SEC-058 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\main.js:191` |
| **Confidence** | 0.50 |

**Code context**

```
 188|   if (!listEl) return;
 189|   const sorted = [...responders].sort((a, b) => b.points - a.points);
 190|   
 191|   listEl.innerHTML = sorted.map((res, idx) => {
 192|     const rank = idx + 1;
 193|     const levelProgress = ((res.points % 500) / 500) * 100;
 194|     return `
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-059 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\main.js:614` |
| **Confidence** | 0.50 |

**Code context**

```
 611|     ];
 612|     for (const [label, val, ok] of lines) {
 613|       const div = document.createElement('div');
 614|       div.innerHTML = `<span class="${ok ? 'boot-ok' : 'boot-pending'}">${ok ? '✓' : '○'}</span> ${label} … <span class="${ok ? 'boot-ok' : 'boot-pending'}">${val}</span>`;
 615|       _bootLog.appendChild(div);
 616|       await new Promise(r => setTimeout(r, 110));
 617|     }
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-060 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\main.js:680` |
| **Confidence** | 0.50 |

**Code context**

```
 677|     if (zone) html += `<div style="margin:6px 0 2px;"><b>NEAREST ZONE:</b> ${zone.name} (${Math.round(zd)} km) · max M${zone.maxMag} · b=${zone.bValue}</div>`;
 678|     html += `<div style="margin:2px 0;"><b>RECENT SEISMICITY:</b> ${nNear} events ≤80 km in 1 yr${maxNear ? `, largest M${maxNear.toFixed(1)}` : ''}</div>`;
 679|     html += `<div style="margin-top:7px;color:#5b7585;font-size:8.5px;">Liquefaction/tsunami: DRRMO GenSan + DOST-PHIVOLCS (TSU-2025-126303-02). Zones: Torregosa et al. (2002).</div>`;
 680|     bodyEl.innerHTML = html;
 681|     card.style.display = 'block';
 682|   }
 683| 
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-061 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\main.js:1187` |
| **Confidence** | 0.50 |

**Code context**

```
1184| 
1185|   const alert = document.createElement('div');
1186|   alert.className = `alert-popup alert-${severity}`;
1187|   alert.innerHTML = `
1188|     <button class="alert-dismiss" onclick="this.parentElement.remove()">✕</button>
1189|     <div class="alert-header">
1190|       <span class="alert-badge">${severityLabel} M${mag.toFixed(1)}</span>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-062 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\src\main.js:1297` |
| **Confidence** | 0.50 |

**Code context**

```
1294|   const avatarLetter = reporterName.charAt(0);
1295|   const initialConfirms = Math.floor(Math.random() * 3);
1296| 
1297|   item.innerHTML = `
1298|     <div class="incident-header">
1299|       <div class="incident-reporter">
1300|         <div class="reporter-avatar">${avatarLetter}</div>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-064 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\supertonic\web\main.js:38` |
| **Confidence** | 0.50 |

**Code context**

```
  35| const errorBox = document.getElementById('error');
  36| 
  37| function showStatus(message, type = 'info') {
  38|     statusText.innerHTML = message;
  39|     statusBox.className = 'status-box';
  40|     if (type === 'success') {
  41|         statusBox.classList.add('success');
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-065 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\supertonic\web\main.js:183` |
| **Confidence** | 0.50 |

**Code context**

```
 180|         hideError();
 181|         
 182|         // Clear results and show placeholder
 183|         resultsContainer.innerHTML = `
 184|             <div class="results-placeholder generating">
 185|                 <div class="results-placeholder-icon">⏳</div>
 186|                 <p>Generating speech...</p>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-066 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\supertonic\web\main.js:227` |
| **Confidence** | 0.50 |

**Code context**

```
 224|         const audioDurationSec = duration[0].toFixed(2);
 225|         
 226|         // Display result with full text
 227|         resultsContainer.innerHTML = `
 228|             <div class="result-item">
 229|                 <div class="result-text-container">
 230|                     <div class="result-text-label">Input Text</div>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-067 — Cross-Site Scripting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **CWE** | CWE-79 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\supertonic\web\main.js:265` |
| **Confidence** | 0.50 |

**Code context**

```
 262|         showError(`Error during synthesis: ${error.message}`);
 263|         
 264|         // Restore placeholder
 265|         resultsContainer.innerHTML = `
 266|             <div class="results-placeholder">
 267|                 <div class="results-placeholder-icon">🎤</div>
 268|                 <p>Generated speech will appear here</p>
```

**Remediation**

Escape/encode output; prefer textContent or a sanitizer (DOMPurify).

### SEC-063 — Rust unsafe block

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **CWE** | CWE-119 |
| **Location** | `\\?\C:\Users\HADES\Desktop\seismologicalgraph\supertonic\rust\src\example_onnx.rs:141` |
| **Confidence** | 0.50 |

**Code context**

```
 138|     mem::forget(text_to_speech);
 139|     
 140|     // Use _exit to bypass all cleanup handlers and avoid ONNX Runtime mutex issues on macOS
 141|     unsafe {
 142|         libc::_exit(0);
 143|     }
 144| }
```

**Remediation**

Audit unsafe blocks for memory-safety invariants; minimize their scope.

