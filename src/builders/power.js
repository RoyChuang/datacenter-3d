import { cabinet, canvasTexture, labelTexture, unit } from './common.js';

function upsFront(width, height) {
  const ppm = 200;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#3552c4';
    ctx.fillRect(0, 0, w, h);
    const pad = w * 0.12;
    ctx.fillStyle = '#0b1530';
    ctx.fillRect(pad, h * 0.1, w - pad * 2, h * 0.14);
    ctx.fillStyle = '#5dff9b';
    ctx.font = `${w * 0.11}px monospace`;
    ctx.fillText('ONLINE', pad + 6, h * 0.16);
    ctx.fillText('LOAD 46%', pad + 6, h * 0.21);
    ctx.fillStyle = '#2a43a8';
    for (let y = h * 0.32; y < h * 0.95; y += 10) ctx.fillRect(pad, y, w - pad * 2, 5);
  });
}

function batteryFront(width, height) {
  const ppm = 200;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#3552c4';
    ctx.fillRect(0, 0, w, h);
    const shelves = 5;
    const pad = w * 0.06;
    for (let s = 0; s < shelves; s++) {
      const y = h * 0.04 + s * (h * 0.92 / shelves);
      ctx.fillStyle = '#1d2a5c';
      ctx.fillRect(pad, y, w - pad * 2, h * 0.92 / shelves - 6);
      ctx.fillStyle = '#2b2f36';
      for (let c = 0; c < 4; c++) {
        ctx.fillRect(pad + 4 + c * ((w - pad * 2) / 4), y + 6, (w - pad * 2) / 4 - 8, h * 0.92 / shelves - 18);
      }
    }
  });
}

export function buildUps(item, spec) {
  const mesh = cabinet({
    width: item.width,
    depth: spec.depth,
    height: spec.height,
    color: spec.color,
    front: upsFront(item.width, spec.height),
    top: labelTexture(item.id, { width: item.width, depth: spec.depth, bg: '#3552c4', facing: item.facing }),
  });
  return unit(item, 'ups', mesh);
}

export function buildBattery(item, spec) {
  const mesh = cabinet({
    width: item.width,
    depth: spec.depth,
    height: spec.height,
    color: spec.color,
    front: batteryFront(item.width, spec.height),
    top: labelTexture('Batt', { width: item.width, depth: spec.depth, bg: '#3552c4', facing: item.facing }),
  });
  return unit(item, 'battery', mesh);
}
