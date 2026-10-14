import { cabinet, canvasTexture, labelTexture, unit } from './common.js';

// In-row cooling unit: light-blue body, grille on the front, small status display.
function frontTexture(width, height) {
  const ppm = 200;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#2aa3d6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#17668a';
    const pad = w * 0.12;
    for (let y = h * 0.22; y < h * 0.95; y += 9) ctx.fillRect(pad, y, w - pad * 2, 4);
    ctx.fillStyle = '#0d2533';
    ctx.fillRect(pad, h * 0.06, w - pad * 2, h * 0.08);
    ctx.fillStyle = '#7dffd0';
    ctx.font = `${Math.max(10, w * 0.14)}px monospace`;
    ctx.fillText('18.5°C', pad + 4, h * 0.115);
  });
}

export function buildRowcool(item, spec) {
  const mesh = cabinet({
    width: item.width,
    depth: spec.depth,
    height: spec.height,
    color: spec.color,
    front: frontTexture(item.width, spec.height),
    back: frontTexture(item.width, spec.height),
    top: labelTexture(item.id, { width: item.width, depth: spec.depth, bg: '#2aa3d6', facing: item.facing }),
  });
  return unit(item, 'rowcool', mesh);
}
