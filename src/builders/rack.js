import { cabinet, canvasTexture, labelTexture, unit } from './common.js';

const DEVICE_COLORS = { server: '#3c6e9f', storage: '#6a4f9c', switch: '#2f8a6a', patch: '#55606f' };

export function rackHeight(rack, spec) {
  return (rack.uHeight ?? spec.defaultUHeight) * spec.uSize + spec.plinth * 2;
}

// Front door drawn from the rack's device list, so the 3D view matches rack-devices.json.
function frontTexture(rack, devices, spec) {
  const uHeight = rack.uHeight ?? spec.defaultUHeight;
  const height = rackHeight(rack, spec);
  const ppm = 260;
  const w = Math.round(rack.width * ppm);
  const h = Math.round(height * ppm);
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#1a1d22';
    ctx.fillRect(0, 0, w, h);

    const margin = spec.plinth * ppm;
    const rail = w * 0.08;
    const uPx = (h - margin * 2) / uHeight;
    const yOf = (u) => h - margin - u * uPx; // top edge of U slot `u` (1-based from bottom)

    ctx.fillStyle = '#23272e';
    ctx.fillRect(rail, margin, w - rail * 2, h - margin * 2);

    for (const d of devices) {
      const y = yOf(d.u + d.size - 1);
      const dh = d.size * uPx - 1;
      ctx.fillStyle = DEVICE_COLORS[d.type] ?? '#555';
      ctx.fillRect(rail + 2, y + 0.5, w - rail * 2 - 4, dh);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 6; i++) ctx.fillRect(rail + 10 + i * 9, y + 2, 5, dh - 4);
      ctx.fillStyle = d.type === 'patch' ? '#ffd166' : '#5dff9b';
      ctx.fillRect(w - rail - 12, y + dh / 2 - 1.5, 3, 3);
    }

    // perforated door overlay
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = margin; y < h - margin; y += 6) ctx.fillRect(rail, y, w - rail * 2, 2);
    ctx.strokeStyle = '#3a414c';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
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
    top: labelTexture(rack.id, { width: rack.width, depth: spec.depth, bg: '#3a3f47', facing: rack.facing }),
  });
  const group = unit(rack, 'rack', mesh);
  mesh.userData.pick.devices = devices;
  mesh.userData.pick.height = height;
  return group;
}
