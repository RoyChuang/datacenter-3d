import { cabinet, canvasTexture, labelTexture, unit } from './common.js';
import { door, handle, led, louvres, screen } from './panels.js';

// Power distribution cabinet: meter display and indicator lamps, plain door, vents at the bottom.
function frontTexture(width, height) {
  const ppm = 220;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    door(ctx, w, h);
    const pad = w * 0.14;
    screen(ctx, pad, h * 0.08, w * 0.5, h * 0.07, ['380V', '42.1kW'], '#ffd48a');
    led(ctx, w * 0.75, h * 0.1, '#3ddc84');
    led(ctx, w * 0.75, h * 0.13, '#9aa1a9');
    handle(ctx, w * 0.84, h * 0.4, h * 0.12);
    louvres(ctx, pad, h * 0.8, w - pad * 2, h * 0.12);
  });
}

export function buildPdc(item, spec) {
  const mesh = cabinet({
    width: item.width,
    depth: spec.depth,
    height: spec.height,
    color: spec.color,
    front: frontTexture(item.width, spec.height),
    top: labelTexture(item.id, { width: item.width, depth: spec.depth, bg: spec.color, fg: '#2b3036', facing: item.facing }),
  });
  return unit(item, 'pdc', mesh);
}
