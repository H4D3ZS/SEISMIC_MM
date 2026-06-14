/**
 * CivicDashboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time civic infrastructure monitoring dashboard controller.
 * Manages the Overview, Utilities, and Business tabs.
 * Integrates with BarangayRenderer for map overlay and BayesianPredictor.
 *
 * Features:
 *   - Per-barangay status tracking (water, power, hazard)
 *   - Business status monitoring (malls, hospitals, infrastructure)
 *   - Post-earthquake utility degradation simulation
 *   - Bayesian deep learning confidence intervals
 *   - Live advisory banner from seismic events
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  CITIES, STATUS_COLORS,
  generateEarthquakeAdvisory,
  simulatePostEarthquakeStatus,
  computeCityStats,
} from '../data/CivicInfrastructureData.js';
import { BayesianPredictor } from './BayesianPredictor.js';

export class CivicDashboard {
  constructor(barangayRenderer, gfmVisualizer) {
    this.barangayRenderer = barangayRenderer;
    this.gfmVisualizer = gfmVisualizer;
    this.bayesianPredictor = new BayesianPredictor();
    this.activeCity = 'General Santos City';
    this.activeTab = 'overview';
    this.activeStatusField = 'hazard';

    this._bindUI();
  }

  _bindUI() {
    // Tab switching
    document.querySelectorAll('.civic-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.civic-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = tab.dataset.tab;
        this._renderTab();
      });
    });

    // City selector
    const citySelect = document.getElementById('civic-city-select');
    citySelect?.addEventListener('change', () => {
      this.activeCity = citySelect.value;
      this._renderTab();
      this.barangayRenderer.renderCity(this.activeCity, this.activeStatusField);
    });

    // Status field toggle
    document.querySelectorAll('.civic-status-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.civic-status-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeStatusField = btn.dataset.field;
        this.barangayRenderer.updateStatus(this.activeStatusField);
        this._renderUtilitiesList();
      });
    });

    // Bayesian prediction button
    const bayesBtn = document.getElementById('bayesian-predict-btn');
    bayesBtn?.addEventListener('click', async () => {
      const lat = parseFloat(document.getElementById('bayesian-lat')?.value || '6.11');
      const lon = parseFloat(document.getElementById('bayesian-lon')?.value || '125.17');
      const terminal = document.getElementById('bayesian-terminal');
      const progress = document.getElementById('bayesian-progress');

      bayesBtn.disabled = true;
      bayesBtn.textContent = 'COMPUTING...';
      terminal.style.display = 'block';
      progress.style.display = 'block';

      try {
        // Simulate progressive computation
        for (let pct = 0; pct <= 100; pct += 5) {
          progress.style.width = `${pct}%`;
          terminal.textContent = `Running Bayesian inference... ${pct}%`;
          await new Promise(r => setTimeout(r, 30));
        }

        const result = this.bayesianPredictor.predict(lat, lon);
        const report = this.bayesianPredictor.formatReport(result);
        terminal.textContent = report;

        // Update GFM attention
        this.gfmVisualizer.setLinks(lat, lon, true);
      } catch (err) {
        terminal.textContent = `ERROR: ${err.message}`;
      } finally {
        bayesBtn.disabled = false;
        bayesBtn.textContent = 'RUN BAYESIAN DL PREDICTION';
      }
    });

    // Initial render
    this._renderTab();
  }

  /**
   * Handle incoming seismic event — update civic status
   */
  onSeismicEvent(event) {
    if (!event || !event.mag) return;

    // Generate advisory
    const advisory = generateEarthquakeAdvisory(event);
    this._updateAdvisoryBanner(advisory);

    // Simulate utility impact for all cities
    for (const cityName of Object.keys(CITIES)) {
      simulatePostEarthquakeStatus(cityName, event);
    }

    // Re-render current tab
    this._renderTab();

    // Update map overlay
    if (this.barangayRenderer._city === this.activeCity) {
      this.barangayRenderer.updateStatus(this.activeStatusField);
    }
  }

  _updateAdvisoryBanner(advisory) {
    const banner = document.getElementById('civic-advisory-banner');
    if (!banner || !advisory) return;

    banner.style.display = 'flex';
    banner.style.borderLeftColor = advisory.color;
    banner.innerHTML = `
      <span style="color: ${advisory.color}; font-weight: bold; font-size: 10px;">⚠ ${advisory.level}:</span>
      <span style="font-size: 9px; flex: 1;">${advisory.message}</span>
      <button onclick="this.parentElement.style.display='none'" style="background: none; border: none; color: #888; cursor: pointer; font-size: 12px;">✕</button>
    `;
  }

  _renderTab() {
    switch (this.activeTab) {
      case 'overview': this._renderOverview(); break;
      case 'utilities': this._renderUtilities(); break;
      case 'business': this._renderBusiness(); break;
    }
    this._renderStatusBar();
  }

  _renderOverview() {
    const city = CITIES[this.activeCity];
    if (!city) return;

    const stats = computeCityStats(this.activeCity);
    const container = document.getElementById('civic-tab-content');
    if (!container) return;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="font-size: 11px; font-weight: bold; color: var(--cyan);">${this.activeCity}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
          <div class="civic-stat-card">
            <div class="civic-stat-value" style="color: var(--cyan);">${stats.totalBarangays}</div>
            <div class="civic-stat-label">Barangays</div>
          </div>
          <div class="civic-stat-card">
            <div class="civic-stat-value" style="color: #00cc44;">${city.powerRestoredPct}%</div>
            <div class="civic-stat-label">Power Restored</div>
          </div>
          <div class="civic-stat-card">
            <div class="civic-stat-value" style="color: ${stats.waterRationingActive ? '#ffaa00' : '#00cc44'};">${stats.waterStats.INTERRUPTED > 0 ? 'ACTIVE' : 'NONE'}</div>
            <div class="civic-stat-label">Water Rationing</div>
          </div>
          <div class="civic-stat-card">
            <div class="civic-stat-value" style="color: var(--red);">${stats.hazardStats.FLOODED + stats.hazardStats.SINKHOLE + stats.hazardStats.CRITICAL}</div>
            <div class="civic-stat-label">At-Risk Zones</div>
          </div>
        </div>

        <div style="font-size: 9px; color: var(--text-secondary); margin-top: 4px; font-weight: bold; text-transform: uppercase;">Utility Summary</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div class="civic-bar-row">
            <span>Water OK</span>
            <div class="civic-bar"><div class="civic-bar-fill" style="width: ${(stats.waterStats.OK / stats.totalBarangays * 100).toFixed(0)}%; background: #00cc44;"></div></div>
            <span>${stats.waterStats.OK}/${stats.totalBarangays}</span>
          </div>
          <div class="civic-bar-row">
            <span>Low Press</span>
            <div class="civic-bar"><div class="civic-bar-fill" style="width: ${(stats.waterStats.LOW_PRESS / stats.totalBarangays * 100).toFixed(0)}%; background: #ffaa00;"></div></div>
            <span>${stats.waterStats.LOW_PRESS}/${stats.totalBarangays}</span>
          </div>
          <div class="civic-bar-row">
            <span>Interrupted</span>
            <div class="civic-bar"><div class="civic-bar-fill" style="width: ${(stats.waterStats.INTERRUPTED / stats.totalBarangays * 100).toFixed(0)}%; background: #ff4444;"></div></div>
            <span>${stats.waterStats.INTERRUPTED}/${stats.totalBarangays}</span>
          </div>
        </div>

        ${stats.hazardStats.FLOODED > 0 || stats.hazardStats.SINKHOLE > 0 ? `
          <div style="font-size: 9px; color: var(--red); margin-top: 4px; font-weight: bold; text-transform: uppercase;">⚠ Active Hazards</div>
          <div style="display: flex; flex-direction: column; gap: 2px;">
            ${city.barangays.filter(b => b.hazard === 'FLOODED').map(b => `<div style="color: #0066ff; font-size: 8px;">🌊 ${b.name} — FLOODED (tectonic uplift)</div>`).join('')}
            ${city.barangays.filter(b => b.hazard === 'SINKHOLE').map(b => `<div style="color: #800080; font-size: 8px;">🕳️ ${b.name} — SINKHOLE detected</div>`).join('')}
            ${city.barangays.filter(b => b.hazard === 'CRITICAL').map(b => `<div style="color: #ff4444; font-size: 8px;">⚠ ${b.name} — CRITICAL hazard</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderUtilities() {
    this._renderUtilitiesList();
  }

  _renderUtilitiesList() {
    const city = CITIES[this.activeCity];
    if (!city) return;

    const container = document.getElementById('civic-tab-content');
    if (!container) return;

    const field = this.activeStatusField;
    const colorMap = STATUS_COLORS[field];

    const sortedBarangays = [...city.barangays].sort((a, b) => {
      const order = { INTERRUPTED: 0, OUTAGE: 0, SINKHOLE: 0, FLOODED: 0, CRITICAL: 0, UNKNOWN: 1, PARTIAL: 1, LOW_PRESS: 2, ELEVATED: 2, RESTORED: 3, OK: 3, NORMAL: 3, OPEN: 3 };
      return (order[a[field]] ?? 99) - (order[b[field]] ?? 99);
    });

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 2px;">
        ${sortedBarangays.map(b => {
          const status = b[field];
          const color = colorMap[status] || colorMap[Object.keys(colorMap)[0]];
          return `
            <div class="civic-barangay-row" style="display: flex; align-items: center; justify-content: space-between; padding: 3px 6px; border-radius: 2px; background: rgba(255,255,255,0.02);">
              <span style="font-size: 9px; color: var(--text-primary);">${b.name}</span>
              <span style="font-size: 8px; padding: 1px 6px; border-radius: 2px; background: ${color.bg}; color: ${color.fg || '#fff'}; font-weight: bold; font-family: var(--font-mono);">${color.label}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  _renderBusiness() {
    const city = CITIES[this.activeCity];
    if (!city) return;

    const container = document.getElementById('civic-tab-content');
    if (!container) return;

    const allBusinesses = city.barangays.flatMap(b =>
      b.businesses.map(biz => ({ ...biz, barangay: b.name }))
    );

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="font-size: 9px; color: var(--text-secondary); font-weight: bold; text-transform: uppercase;">Businesses (${allBusinesses.length})</div>
        ${allBusinesses.length === 0 ? '<div style="font-size: 8px; color: var(--text-dim);">No business data available</div>' :
          allBusinesses.map(biz => {
            const typeInfo = STATUS_COLORS.businessType[biz.type] || { icon: '🏢', color: '#888' };
            const statusColor = STATUS_COLORS.business[biz.status] || STATUS_COLORS.business.OPEN;
            return `
              <div style="display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 2px; background: rgba(255,255,255,0.02);">
                <span style="font-size: 11px;">${typeInfo.icon}</span>
                <div style="flex: 1;">
                  <div style="font-size: 9px; color: var(--text-primary);">${biz.name}</div>
                  <div style="font-size: 7px; color: var(--text-dim);">${biz.barangay}</div>
                </div>
                <span style="font-size: 7px; padding: 1px 4px; border-radius: 2px; background: ${statusColor.bg}; color: ${statusColor.fg || '#fff'}; font-weight: bold;">${statusColor.label}</span>
              </div>
            `;
          }).join('')
        }
      </div>
    `;
  }

  _renderStatusBar() {
    const city = CITIES[this.activeCity];
    if (!city) return;

    const stats = computeCityStats(this.activeCity);
    const statusBar = document.getElementById('civic-status-bar');
    if (!statusBar) return;

    statusBar.innerHTML = `
      <span>⚡ Power: ${city.powerRestoredPct}% restored</span>
      <span>💧 Water: ${stats.waterRationingActive ? 'Rationing active' : 'Normal'} — ${stats.waterStats.LOW_PRESS} low press, ${stats.waterStats.INTERRUPTED} interrupted</span>
      <span>🔴 Post-earthquake monitoring active</span>
    `;
  }
}
