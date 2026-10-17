import * as THREE from 'three';

// Temperature colour scale, 15–35 °C. Yellow sits at the 27 °C warning and orange at the 30 °C alarm
// threshold, so the map agrees with the sensor dots.
export const SCALE = [
  [15, '#1d4ed8'],
  [20, '#0ea5e9'],
  [24, '#22c55e'],
  [27, '#eab308'],
  [30, '#f97316'],
  [35, '#dc2626'],
];
export const SCALE_MIN = SCALE[0][0];
export const SCALE_MAX = SCALE[SCALE.length - 1][0];

const CELL = 0.15; // m per heatmap pixel
const RADIUS = 4; // m — beyond this from every sensor nothing is estimated (transparent)
const OPACITY = 0.75;

// Interpolate in sRGB bytes (what the canvas stores); THREE.Color would work in linear space.
const rgb = SCALE.map(([t, hex]) => [t, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);
function colorAt(t, out) {
  const v = Math.min(SCALE_MAX, Math.max(SCALE_MIN, t));
  let i = 1;
  while (i < rgb.length - 1 && v > rgb[i][0]) i++;
  const [t0, c0] = rgb[i - 1];
  const [t1, c1] = rgb[i];
  const k = (v - t0) / (t1 - t0);
  for (let c = 0; c < 3; c++) out[c] = c0[c] + (c1[c] - c0[c]) * k;
  return out;
}

/**
 * A horizontal temperature map at `height`, estimated from the sensors by inverse-distance weighting.
 * Walls are not taken into account: sensors on both sides of a wall influence each other.
 * @param sensors [{ id, x, z }] in site coordinates (metres)
 */
export function buildHeatmap(room, sensors, height) {
  const w = Math.ceil(room.width / CELL);
  const h = Math.ceil(room.depth / CELL);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2; // canvas row 0 ends up at z = 0, the plan's top edge
  mesh.position.set(room.width / 2, height, room.depth / 2);
  mesh.renderOrder = 5;
  mesh.name = 'heatmap';
  mesh.visible = false;

  const readings = new Map(); // sensor id -> °C
  const color = [0, 0, 0];

  function redraw() {
    const known = sensors.filter((s) => readings.has(s.id));
    const px = image.data;
    for (let j = 0; j < h; j++) {
      const z = (j + 0.5) * CELL;
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) * CELL;
        let sum = 0;
        let weights = 0;
        let nearest = Infinity;
        for (const s of known) {
          const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
          nearest = Math.min(nearest, d2);
          // inverse distance squared; the floor (~0.7 m) keeps a single sensor from forming a sharp bullseye
          const wgt = 1 / Math.max(d2, 0.5);
          sum += wgt * readings.get(s.id);
          weights += wgt;
        }
        const k = (j * w + i) * 4;
        const dist = Math.sqrt(nearest);
        if (!weights || dist > RADIUS) { px[k + 3] = 0; continue; }
        colorAt(sum / weights, color);
        px[k] = color[0];
        px[k + 1] = color[1];
        px[k + 2] = color[2];
        // fade out towards the edge of what the sensors can reasonably tell
        const fade = Math.min(1, (RADIUS - dist) / (RADIUS * 0.3));
        px[k + 3] = 255 * OPACITY * fade;
      }
    }
    ctx.putImageData(image, 0, 0);
    texture.needsUpdate = true;
  }

  let pending = false;
  return {
    mesh,
    // Readings arrive one sensor at a time; recompute once per batch, and only while visible.
    set(id, temp) {
      readings.set(id, temp);
      if (pending || !mesh.visible) return;
      pending = true;
      queueMicrotask(() => { pending = false; redraw(); });
    },
    redraw,
  };
}
