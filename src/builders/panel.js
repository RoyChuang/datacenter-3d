import { cabinet, canvasTexture, labelTexture, unit } from './common.js';
import { door, handle, led, louvres, screen } from './panels.js';

// Wall-mounted distribution board (e.g. ACP): a shallow box hung at spec.mount above the floor.
function frontTexture(width, height) {
  const ppm = 220;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    door(ctx, w, h);
    const pad = w * 0.12;
    screen(ctx, pad, h * 0.1, w * 0.45, h * 0.12, ['220V'], '#ffd48a');
    led(ctx, w * 0.7, h * 0.14, '#3ddc84');
    handle(ctx, w * 0.84, h * 0.4, h * 0.2);
    louvres(ctx, pad, h * 0.72, w - pad * 2, h * 0.16);
  });
}

export function buildPanel(item, spec) {
  const mesh = cabinet({
    width: item.width,
    depth: spec.depth,
    height: spec.height,
    color: spec.color,
    front: frontTexture(item.width, spec.height),
    top: labelTexture(item.id, { width: item.width, depth: spec.depth, bg: spec.color, fg: '#2b3036', facing: item.facing }),
  });
  mesh.position.y += spec.mount ?? 0;
  return unit(item, 'panel', mesh);
}
