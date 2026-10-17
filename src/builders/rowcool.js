import { cabinet, canvasTexture, labelTexture, unit } from './common.js';
import { door, perforated, screen } from './panels.js';

// In-row cooling unit: light-grey cabinet, tall perforated air panel, small controller display.
function frontTexture(width, height) {
  const ppm = 220;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    door(ctx, w, h);
    const pad = w * 0.12;
    screen(ctx, pad, h * 0.05, w - pad * 2, h * 0.06, ['18.5°C']);
    perforated(ctx, pad, h * 0.15, w - pad * 2, h * 0.78);
  });
}

export function buildRowcool(item, spec) {
  const front = frontTexture(item.width, spec.height);
  const mesh = cabinet({
    width: item.width,
    depth: spec.depth,
    height: spec.height,
    color: spec.color,
    front,
    back: front, // in-row coolers blow through both faces
    top: labelTexture(item.id, { width: item.width, depth: spec.depth, bg: spec.color, fg: '#2b3036', facing: item.facing }),
  });
  return unit(item, 'rowcool', mesh);
}
