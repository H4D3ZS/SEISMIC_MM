/**
 * BeachballRenderer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CISV Focal Mechanism Visualizer
 *
 * Renders 2D beachball (lower-hemisphere stereographic) tensor projections
 * onto a <canvas> element using the Aki-Richards convention.
 *
 * Algorithm:
 *   Given (strike, dip, rake):
 *   1. Compute the two nodal planes
 *   2. For each point on the lower hemisphere, determine first-motion polarity
 *      using the standard radiation pattern formula
 *   3. Fill compressional (P) quadrants dark cyan, dilatational (T) quadrants black
 *
 * References:
 *   Aki, K. & Richards, P. (2002) Quantitative Seismology, 2nd ed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class BeachballRenderer {
  /**
   * @param {HTMLCanvasElement} canvas  Target canvas element
   */
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.size    = canvas.width;        // Assumes square canvas
    this.radius  = this.size / 2 - 4;  // Inner circle radius with 4px padding
    this.cx      = this.size / 2;
    this.cy      = this.size / 2;
  }

  /**
   * Draw a beachball for the given focal mechanism parameters.
   *
   * @param {number} strikeDeg  Fault strike (0–360°)
   * @param {number} dipDeg     Fault dip    (0–90°)
   * @param {number} rakeDeg    Fault rake   (−180–180°)
   */
  draw(strikeDeg, dipDeg, rakeDeg) {
    const { ctx, cx, cy, radius, size } = this;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle   = '#060911';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Rasterize lower-hemisphere polarity ────────────────────────────
    const imageData = ctx.createImageData(size, size);
    const data      = imageData.data;

    const s  = strikeDeg * Math.PI / 180;
    const d  = dipDeg    * Math.PI / 180;
    const r  = rakeDeg   * Math.PI / 180;

    // Pre-compute fault-plane normal and slip vector
    // n = (-sin(d)·sin(s),  sin(d)·cos(s), -cos(d))   (upper-hemisphere normal)
    // d_vec = (cos(r)·cos(s) + sin(r)·cos(d)·sin(s),
    //          cos(r)·sin(s) - sin(r)·cos(d)·cos(s),
    //          sin(r)·sin(d))
    const nx = -Math.sin(d) * Math.sin(s);
    const ny =  Math.sin(d) * Math.cos(s);
    const nz = -Math.cos(d);

    const dx = Math.cos(r) * Math.cos(s) + Math.sin(r) * Math.cos(d) * Math.sin(s);
    const dy = Math.cos(r) * Math.sin(s) - Math.sin(r) * Math.cos(d) * Math.cos(s);
    const dz = Math.sin(r) * Math.sin(d);

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        // Map pixel → unit circle coords
        const ux = (px - cx) / radius;
        const uy = (py - cy) / radius;
        const r2 = ux * ux + uy * uy;

        if (r2 > 1.0) continue; // Outside circle

        // Lambert equal-area → 3D unit vector on lower hemisphere
        // Note: uy negated because canvas Y is inverted
        const z3d  = Math.sqrt(Math.max(0, 1 - r2));
        const vec3x = ux;
        const vec3y = -uy; // geographic North = up in canvas
        const vec3z = -z3d; // Lower hemisphere

        // First-motion amplitude: P(x) = (n·x)(d·x)
        const dot_n = nx * vec3x + ny * vec3y + nz * vec3z;
        const dot_d = dx * vec3x + dy * vec3y + dz * vec3z;
        const amp   = dot_n * dot_d;

        const idx = (py * size + px) * 4;

        if (amp >= 0) {
          // Compressional: neon cyan fill
          data[idx]     = 0;
          data[idx + 1] = 180;
          data[idx + 2] = 220;
          data[idx + 3] = 230;
        } else {
          // Dilatational: near-black
          data[idx]     = 10;
          data[idx + 1] = 14;
          data[idx + 2] = 22;
          data[idx + 3] = 230;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // ── Border ring ─────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.55)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // ── Crosshair reference lines ────────────────────────────────────────
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.18)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();
  }

  /**
   * Draw an empty "no data" placeholder.
   */
  drawEmpty() {
    const { ctx, cx, cy, radius, size } = this;
    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle   = '#060911';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.18)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.fillStyle    = 'rgba(0, 200, 255, 0.25)';
    ctx.font         = '9px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO SELECTION', cx, cy);
  }
}
