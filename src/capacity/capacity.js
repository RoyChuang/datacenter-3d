import * as THREE from 'three';
import { placeOnFloor } from '../builders/common.js';

// Capacity view: each rack holds a coloured column whose height is how full it is, by U space or by power.
// Power is measured against the rack's `ratedKW` (from site.yaml), or the site's demo rating when no rack
// has a real one. Racks without either show a grey stub in power mode.
const NO_DATA = '#9ca3af';

// Upper bound (exclusive) of each band → colour; the last band catches everything above.
export const BANDS = [
  [0.6, '#22c55e', '< 60%'],
  [0.8, '#eab308', '60–80%'],
  [0.9, '#f97316', '80–90%'],
  [Infinity, '#dc2626', '≥ 90%'],
];
const bandOf = (frac) => BANDS.find(([max]) => frac < max);

// Power is stranded when the rack's power budget is (nearly) spent while U space is still left over.
const STRANDED = { power: 0.85, space: 0.75 };

export function rackUsage(rack, devices = [], ratedKW = null) {
  const usedU = devices.reduce((s, d) => s + d.size, 0);
  const kw = devices.reduce((s, d) => s + (d.powerW ?? 0), 0) / 1000;
  const space = usedU / rack.uHeight;
  const power = ratedKW ? kw / ratedKW : null;
  return {
    usedU, totalU: rack.uHeight, kw, ratedKW, space, power,
    stranded: power != null && power >= STRANDED.power && space < STRANDED.space,
  };
}

export function buildCapacity(racks, devicesOf, spec, mockRatedKW = null) {
  const group = new THREE.Group();
  group.name = 'capacity';
  group.visible = false;

  const inner = spec.defaultUHeight * spec.uSize; // the U space, without plinths
  const columns = racks.map((rack) => {
    const usage = rackUsage(rack, devicesOf[rack.id], rack.ratedKW ?? mockRatedKW);
    const height = inner * (rack.uHeight / spec.defaultUHeight);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true, opacity: 0.92 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(rack.width * 0.82, 1, spec.depth * 0.82), material);
    mesh.name = rack.id;
    const holder = new THREE.Group();
    placeOnFloor(holder, rack);
    holder.add(mesh);
    group.add(holder);
    return { rack, usage, mesh, height };
  });

  function setMode(mode) {
    for (const { usage, mesh, height } of columns) {
      const frac = usage[mode];
      const h = frac == null ? 0.05 : Math.max(height * Math.min(frac, 1), 0.02);
      mesh.scale.y = h;
      mesh.position.y = spec.plinth + h / 2;
      mesh.material.color.set(frac == null ? NO_DATA : bandOf(frac)[1]);
    }
  }

  // Room totals for the legend; power only counts racks that have a rating.
  const sum = (list, f) => list.reduce((s, c) => s + f(c.usage), 0);
  const rated = columns.filter((c) => c.usage.ratedKW);
  const totals = {
    usedU: sum(columns, (u) => u.usedU),
    totalU: sum(columns, (u) => u.totalU),
    kw: sum(rated, (u) => u.kw),
    ratedKw: sum(rated, (u) => u.ratedKW),
    ratedRacks: rated.length,
    racks: columns.length,
    mock: !racks.some((r) => r.ratedKW) && !!mockRatedKW,
    stranded: columns.filter((c) => c.usage.stranded).map((c) => c.rack.id),
  };

  return { group, setMode, totals, usageOf: (id) => columns.find((c) => c.rack.id === id)?.usage };
}
