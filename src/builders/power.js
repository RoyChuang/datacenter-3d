import { cabinet, canvasTexture, labelTexture, unit } from './common.js';
import { PANEL, door, handle, led, louvres, screen } from './panels.js';

function upsFront(width, height) {
  const ppm = 220;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    door(ctx, w, h);
    const pad = w * 0.12;
    // dark control strip across the top, like most modular UPS fronts
    ctx.fillStyle = PANEL.dark;
    ctx.fillRect(pad, h * 0.06, w - pad * 2, h * 0.16);
    screen(ctx, pad + 8, h * 0.08, (w - pad * 2) * 0.62, h * 0.07, ['ONLINE', 'LOAD 46%']);
    led(ctx, w - pad - 14, h * 0.1, '#3ddc84');
    handle(ctx, w * 0.84, h * 0.42, h * 0.12);
    louvres(ctx, pad, h * 0.62, w - pad * 2, h * 0.3);
  });
}

function batteryFront(width, height) {
  const ppm = 220;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    door(ctx, w, h);
    const pad = w * 0.12;
    louvres(ctx, pad, h * 0.08, w - pad * 2, h * 0.14);
    louvres(ctx, pad, h * 0.74, w - pad * 2, h * 0.14);
    handle(ctx, w * 0.84, h * 0.42, h * 0.12);
  });
}

export function buildUps(item, spec) {
  const mesh = cabinet({
    width: item.width,
    depth: spec.depth,
    height: spec.height,
    color: spec.color,
    front: upsFront(item.width, spec.height),
    top: labelTexture(item.id, { width: item.width, depth: spec.depth, bg: spec.color, fg: '#2b3036', facing: item.facing }),
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
    top: labelTexture('Batt', { width: item.width, depth: spec.depth, bg: spec.color, fg: '#2b3036', facing: item.facing }),
  });
  return unit(item, 'battery', mesh);
}
