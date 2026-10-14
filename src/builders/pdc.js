import { cabinet, canvasTexture, labelTexture, unit } from './common.js';

// Power distribution cabinet: meter panel on top, rows of breakers below.
function frontTexture(width, height) {
  const ppm = 200;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#3552c4';
    ctx.fillRect(0, 0, w, h);
    const pad = w * 0.1;
    ctx.fillStyle = '#0d1733';
    ctx.fillRect(pad, h * 0.06, w - pad * 2, h * 0.1);
    ctx.fillStyle = '#ffb347';
    ctx.font = `${w * 0.1}px monospace`;
    ctx.fillText('380V  42.1kW', pad + 6, h * 0.125);
    ctx.fillStyle = '#25389a';
    ctx.fillRect(pad, h * 0.22, w - pad * 2, h * 0.68);
    ctx.fillStyle = '#d9dee8';
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillRect(pad + 8 + c * ((w - pad * 2 - 16) / 8), h * 0.25 + r * h * 0.053, 8, h * 0.035);
      }
    }
  });
}

export function buildPdc(item, spec) {
  const mesh = cabinet({
    width: item.width,
    depth: spec.depth,
    height: spec.height,
    color: spec.color,
    front: frontTexture(item.width, spec.height),
    top: labelTexture(item.id, { width: item.width, depth: spec.depth, bg: '#3552c4', facing: item.facing }),
  });
  return unit(item, 'pdc', mesh);
}
