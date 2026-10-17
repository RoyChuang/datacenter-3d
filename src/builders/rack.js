import { cabinet, canvasTexture, labelTexture, unit } from './common.js';

// Device faces seen through the door: dark greys rather than colours, like real server bezels.
const DEVICE_COLORS = { server: '#2c3138', storage: '#33373e', switch: '#262a30', patch: '#3a3f46' };

export function rackHeight(rack, spec) {
  return (rack.uHeight ?? spec.defaultUHeight) * spec.uSize + spec.plinth * 2;
}

// Perforated front door with the rack's devices (from rack-devices.json) visible behind it.
function frontTexture(rack, devices, spec) {
  const uHeight = rack.uHeight ?? spec.defaultUHeight;
  const height = rackHeight(rack, spec);
  const ppm = 260;
  const w = Math.round(rack.width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#16181c';
    ctx.fillRect(0, 0, w, h);

    const margin = spec.plinth * ppm;
    const frame = w * 0.07;
    const uPx = (h - margin * 2) / uHeight;
    ctx.fillStyle = '#0e1013';
    ctx.fillRect(frame, margin, w - frame * 2, h - margin * 2);

    const leds = [];
    for (const d of devices) {
      const y = h - margin - (d.u + d.size - 1) * uPx;
      const dh = d.size * uPx - 1;
      ctx.fillStyle = DEVICE_COLORS[d.type] ?? DEVICE_COLORS.server;
      ctx.fillRect(frame + 3, y + 0.5, w - frame * 2 - 6, dh);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; // top edge catch-light
      ctx.fillRect(frame + 3, y + 0.5, w - frame * 2 - 6, 1);
      leds.push({ x: w - frame - 12, y: y + dh / 2 - 1.5, color: d.type === 'patch' ? '#e0a83a' : '#3ddc84' });
    }

    // Perforated steel mesh over the door opening
    ctx.fillStyle = 'rgba(22,24,28,0.62)';
    for (let y = margin; y < h - margin; y += 6) ctx.fillRect(frame, y, w - frame * 2, 2);
    for (let x = frame; x < w - frame; x += 6) ctx.fillRect(x, margin, 2, h - margin * 2);

    // Status LEDs shine through the mesh
    for (const led of leds) {
      ctx.fillStyle = led.color;
      ctx.fillRect(led.x, led.y, 3, 3);
    }

    // Door frame, handle and plinth
    ctx.strokeStyle = '#25282e';
    ctx.lineWidth = frame;
    ctx.strokeRect(frame / 2, margin - frame / 2, w - frame, h - margin * 2 + frame);
    ctx.fillStyle = '#aeb5bd';
    ctx.fillRect(w - frame * 0.75, h * 0.42, frame * 0.4, h * 0.14);
    ctx.fillStyle = '#0c0d0f';
    ctx.fillRect(0, h - margin * 0.7, w, margin * 0.7);
  });
}

export function buildRack(rack, spec, devices = []) {
  const height = rackHeight(rack, spec);
  const mesh = cabinet({
    width: rack.width,
    depth: spec.depth,
    height,
    color: spec.color,
    front: frontTexture(rack, devices, spec),
    top: labelTexture(rack.id, { width: rack.width, depth: spec.depth, bg: spec.color, fg: '#1c1f24', plate: '#e8ebee', facing: rack.facing }),
  });
  const group = unit(rack, 'rack', mesh);
  mesh.userData.pick.devices = devices;
  mesh.userData.pick.height = height;
  return group;
}
