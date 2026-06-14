/**
 * CommandPalette.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ⌘K / Ctrl+K global command palette. Type a place / barangay / fault / zone /
 * volcano / live event → ranked results narrow as you type → Enter (or click)
 * flies the camera there and emits a select event (for the hazard readout HUD).
 *
 * DOM contract (declared in index.html):
 *   #command-palette   overlay container (display:none when closed)
 *   #cmdk-input        text input
 *   #cmdk-results      results list container
 *   #cmdk-trigger      optional header button/bar that opens the palette
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TYPE_ICON = {
  place: '◎', barangay: '▰', zone: '◇', fault: '╱', city: '⬡', volcano: '▲', event: '✶',
};
const TYPE_COLOR = {
  place: '#7fd4ff', barangay: '#ffd166', zone: '#00e5ff', fault: '#ff7c4d',
  city: '#8affc1', volcano: '#ff5c7a', event: '#c8a8ff',
};

export class CommandPalette {
  /**
   * @param {import('./SearchIndex.js').SearchIndex} searchIndex
   * @param {object} opts { onSelect(result), onClose() }
   */
  constructor(searchIndex, opts = {}) {
    this.index = searchIndex;
    this.onSelect = opts.onSelect || (() => {});
    this.overlay = document.getElementById('command-palette');
    this.input = document.getElementById('cmdk-input');
    this.results = document.getElementById('cmdk-results');
    this.trigger = document.getElementById('cmdk-trigger');
    this.items = [];
    this.active = 0;
    this._debounce = null;
    if (!this.overlay || !this.input || !this.results) {
      console.warn('[CommandPalette] DOM not found — palette disabled.');
      return;
    }
    this._bind();
  }

  _bind() {
    // Global hotkey: Ctrl+K / Cmd+K toggles; Esc closes.
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        this.isOpen() ? this.close() : this.open();
      } else if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    this.trigger?.addEventListener('click', () => this.open());

    this.input.addEventListener('input', () => {
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this._render(this.input.value), 80);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this._move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this._move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this._choose(this.active); }
    });

    // Click outside the result panel closes.
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  isOpen() { return this.overlay && this.overlay.style.display !== 'none'; }

  open() {
    if (!this.overlay) return;
    this.overlay.style.display = 'flex';
    this.input.value = '';
    this.input.focus();
    this._render('');
  }

  close() {
    if (!this.overlay) return;
    this.overlay.style.display = 'none';
  }

  _move(d) {
    if (!this.items.length) return;
    this.active = (this.active + d + this.items.length) % this.items.length;
    this._highlight();
  }

  _highlight() {
    const nodes = this.results.querySelectorAll('.cmdk-item');
    nodes.forEach((n, i) => {
      n.classList.toggle('active', i === this.active);
      if (i === this.active) n.scrollIntoView({ block: 'nearest' });
    });
  }

  _choose(i) {
    const r = this.items[i];
    if (!r) return;
    this.close();
    this.onSelect(r);
  }

  _render(q) {
    this.items = this.index.query(q, 30);
    this.active = 0;
    if (!this.items.length) {
      this.results.innerHTML = `<div style="padding:14px;color:var(--text-dim,#667);font-family:var(--font-mono,monospace);font-size:11px;">No matches for "${this._esc(q)}".</div>`;
      return;
    }
    const rows = this.items.map((r, i) => {
      const color = TYPE_COLOR[r.type] || '#9ad';
      const icon = TYPE_ICON[r.type] || '•';
      return `<div class="cmdk-item${i === 0 ? ' active' : ''}" data-i="${i}">
        <span class="cmdk-ico" style="color:${color}">${icon}</span>
        <span class="cmdk-main">
          <span class="cmdk-name">${this._esc(r.name)}</span>
          <span class="cmdk-sub">${this._esc(r.subtitle)}</span>
        </span>
        <span class="cmdk-coord">${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}</span>
      </div>`;
    }).join('');
    this.results.innerHTML = rows;
    this.results.querySelectorAll('.cmdk-item').forEach((n) => {
      const i = parseInt(n.dataset.i, 10);
      n.addEventListener('mouseenter', () => { this.active = i; this._highlight(); });
      n.addEventListener('click', () => this._choose(i));
    });
  }

  _esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
}
