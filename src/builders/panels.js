// Canvas helpers for light-grey sheet-metal fronts (cooling, PDC, UPS, battery cabinets).
export const PANEL = { body: '#d6dade', seam: '#aeb5bd', dark: '#3a3f46', screen: '#1d2a36', handle: '#8d959e' };

// Base door: body colour, a recessed seam around the edge and a darker kick plate.
export function door(ctx, w, h) {
  ctx.fillStyle = PANEL.body;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = PANEL.seam;
  ctx.lineWidth = 3;
  ctx.strokeRect(w * 0.04, h * 0.015, w * 0.92, h * 0.94);
  ctx.fillStyle = '#9aa1a9';
  ctx.fillRect(0, h * 0.965, w, h * 0.035);
}

// Horizontal louvres (air vents) in a box.
export function louvres(ctx, x, y, w, h, pitch = 9) {
  ctx.fillStyle = PANEL.dark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#5d646c';
  for (let yy = y + 3; yy < y + h - 2; yy += pitch) ctx.fillRect(x + 3, yy, w - 6, pitch * 0.45);
}

// Dot-perforated vent panel.
export function perforated(ctx, x, y, w, h) {
  ctx.fillStyle = '#c3c8ce';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PANEL.dark;
  for (let yy = y + 6; yy < y + h - 3; yy += 8) {
    for (let xx = x + 6; xx < x + w - 3; xx += 8) ctx.fillRect(xx - 1.5, yy - 1.5, 3, 3);
  }
}

// Small LCD with one or two lines of text.
export function screen(ctx, x, y, w, h, lines, color = '#bfe6ff') {
  ctx.fillStyle = '#4a5058';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = PANEL.screen;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.font = `${Math.max(9, h / (lines.length + 0.8))}px monospace`;
  ctx.textBaseline = 'top';
  lines.forEach((t, i) => ctx.fillText(t, x + 5, y + 4 + i * (h / lines.length)));
}

export function handle(ctx, x, y, h) {
  ctx.fillStyle = PANEL.handle;
  ctx.fillRect(x, y, 6, h);
}

export function led(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
}
