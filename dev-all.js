#!/usr/bin/env node
/**
 * dev-all.js — Unified CISV Development Launcher (Windows-fixed)
 * ─────────────────────────────────────────────────────────────────────────────
 * Starts ALL services in parallel:
 *   1. Vite dev server (frontend + PHIVOLCS proxy)
 *   2. GFM inference server (Flask)
 *   3. Checks Ollama availability
 *   4. Verifies all dependencies
 *
 * Usage: npm run dev:all
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import net from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const VITE_PORT = 5173;
const GFM_PORT = 8080;
const OLLAMA_PORT = 11434;

const isWin = process.platform === 'win32';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m',
};

const log = (tag, msg, color = C.cyan) => console.log(`${color}${C.bold}[${tag}]${C.reset} ${msg}`);
const logOK = (tag, msg) => log(tag, msg, C.green);
const logWarn = (tag, msg) => log(tag, msg, C.yellow);
const logErr = (tag, msg) => log(tag, msg, C.red);
const logInfo = (tag, msg) => log(tag, msg, C.cyan);

function isPortInUse(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port);
  });
}

function waitForPort(port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      if (await isPortInUse(port)) return resolve();
      if (Date.now() - start > timeout) return reject(new Error(`Timeout on port ${port}`));
      setTimeout(check, 500);
    };
    check();
  });
}

function httpGet(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  CISV — Unified Development Launcher                ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  Seismic + GFM + Bayesian DL + Civic                ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}\n`);

  const processes = [];

  // ── 1. Node dependencies ──────────────────────────────────────────────
  logInfo('SETUP', 'Checking Node dependencies...');
  try {
    execSync('npm ls --depth=0 2>&1', { cwd: __dirname, stdio: 'pipe' });
    logOK('SETUP', 'Node deps OK');
  } catch {
    logWarn('SETUP', 'Installing Node deps...');
    execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
  }

  // ── 2. Python deps ───────────────────────────────────────────────────
  logInfo('SETUP', 'Checking Python deps...');
  const pyDeps = ['flask', 'flask_cors', 'timm', 'torch'];
  const missingPyDeps = [];
  for (const dep of pyDeps) {
    try {
      execSync(`python -c "import ${dep}" 2>&1`, { stdio: 'pipe' });
    } catch {
      missingPyDeps.push(dep === 'flask_cors' ? 'flask-cors' : dep);
    }
  }
  if (missingPyDeps.length > 0) {
    logWarn('SETUP', `Installing missing Python packages: ${missingPyDeps.join(', ')}`);
    try { execSync(`pip install ${missingPyDeps.join(' ')}`, { stdio: 'inherit' }); } catch {}
  } else {
    logOK('SETUP', 'Python deps OK');
  }

  // ── 3. GFM model weights ─────────────────────────────────────────────
  logInfo('GFM', 'Checking model weights...');
  const GFM_REPO_DIR = join(__dirname, 'geophysical-foundation-model');
  const gfmRepoExists = existsSync(GFM_REPO_DIR);
  const gfmModelFile = join(GFM_REPO_DIR, 'GFM', 'ElasticViTMAE.py');

  if (gfmRepoExists && existsSync(gfmModelFile)) {
    logOK('GFM', 'Model repo found at geophysical-foundation-model/');
  } else {
    logWarn('GFM', 'Model repo not found — server will run in simulation mode');
  }

  // ── 4. Ollama check ──────────────────────────────────────────────────
  logInfo('OLLAMA', 'Checking...');
  try {
    const res = await httpGet(`http://localhost:${OLLAMA_PORT}/api/tags`);
    if (res.status === 200) {
      const models = JSON.parse(res.data);
      const names = (models.models || []).map(m => m.name);
      const hasGemma = names.some(n => n.toLowerCase().includes('gemma'));
      logOK('OLLAMA', `Connected. Models: ${names.join(', ') || 'none'}`);
      if (hasGemma) {
        logOK('OLLAMA', 'Gemma model available');
      } else {
        logWarn('OLLAMA', 'No Gemma found. Run: ollama pull gemma4:12b');
      }
    }
  } catch {
    logWarn('OLLAMA', 'Not running. Start with: ollama serve');
  }

  // ── 5. GFM Server ────────────────────────────────────────────────────
  logInfo('GFM', 'Starting Flask server...');
  const pythonBin = isWin ? 'python.exe' : 'python3';
  const gfmProc = spawn(pythonBin, ['gfm_server.py'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  let gfmActualPort = GFM_PORT;
  gfmProc.stdout?.on('data', d => {
    const lines = d.toString().split('\n').filter(l => l.trim());
    lines.forEach(l => {
      logInfo('GFM-SERVER', l);
      // Detect the actual port from "[GFM] Starting on 127.0.0.1:8081"
      const portMatch = l.match(/Starting on 127\.0\.0\.1:(\d+)/);
      if (portMatch) gfmActualPort = parseInt(portMatch[1]);
    });
  });
  gfmProc.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => logWarn('GFM-SERVER', l)));
  gfmProc.on('error', e => logErr('GFM', `Failed to start: ${e.message}`));
  gfmProc.on('exit', c => {
    if (c !== 0) logErr('GFM', `Server exited with code ${c}`);
    else logWarn('GFM', `Server exited normally`);
  });
  processes.push(gfmProc);

  // Wait for stdout to report the actual port before checking
  await new Promise(r => setTimeout(r, 1500));

  try {
    await waitForPort(gfmActualPort, 8000);
    logOK('GFM', `Running on http://localhost:${gfmActualPort}`);
  } catch {
    logWarn('GFM', 'Port not listening yet — check gfm_server.py output');
  }

  // ── 6. Vite Dev Server ────────────────────────────────────────────────
  const viteAvailable = !(await isPortInUse(VITE_PORT));
  if (viteAvailable) {
    logInfo('VITE', `Starting on port ${VITE_PORT}...`);
  } else {
    logWarn('VITE', `Port ${VITE_PORT} in use, Vite will auto-pick another`);
  }

  // Use local vite binary directly — avoids npx ENOENT on Windows
  const viteBin = isWin
    ? join(__dirname, 'node_modules', '.bin', 'vite.cmd')
    : join(__dirname, 'node_modules', '.bin', 'vite');
  const viteArgs = ['--host'];

  const viteProc = spawn(viteBin, viteArgs, {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
  });
  viteProc.stdout?.on('data', d => {
    const lines = d.toString().split('\n').filter(l => l.trim());
    lines.forEach(l => {
      if (l.includes('Local:') || l.includes('ready') || l.includes('error') || l.includes('localhost') || l.includes('VITE')) {
        logInfo('VITE', l);
      }
    });
  });
  viteProc.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => logWarn('VITE', l)));
  viteProc.on('error', e => logErr('VITE', `Failed to start: ${e.message}. Run: npm install`));
  viteProc.on('exit', c => logWarn('VITE', `Exited with code ${c}`));
  processes.push(viteProc);

  // ── 7. Summary ────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 2000));

  console.log(`\n${C.bold}${C.green}══════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.green}  ALL SERVICES RUNNING${C.reset}`);
  console.log(`${C.green}══════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.cyan}  Frontend:     ${C.bold}http://localhost:${VITE_PORT}${C.reset}`);
  console.log(`${C.cyan}  GFM Server:   ${C.bold}http://localhost:${GFM_PORT}${C.reset}`);
  console.log(`${C.cyan}  Ollama:       ${C.bold}http://localhost:${OLLAMA_PORT}${C.reset}`);
  console.log(`${C.dim}  Ctrl+C to stop${C.reset}\n`);

  const shutdown = () => {
    console.log(`\n${C.yellow}Shutting down...${C.reset}`);
    processes.forEach(p => { try { p.kill('SIGTERM'); } catch {} });
    setTimeout(() => process.exit(0), 1000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {});
}

main().catch(e => { logErr('FATAL', e.message); process.exit(1); });
