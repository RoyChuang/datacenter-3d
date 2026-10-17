import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A / B feed colours (common dual-feed convention), used for trunks (UPS -> PDC) and branches (PDC -> racks)
// alike — branches are only thinner; grey for DC battery links.
export const PATH_COLORS = { A: 0x1d4ed8, B: 0xea580c, dc: 0x6b7280 };
// Badges for A and B sit at different heights so neighbours (e.g. UPS-A next to UPS-B) don't overlap.
const BADGE_LIFT = { A: 0.55, B: 0.95 };
// Schematic overhead routing heights (m): above racks and walls, A and B on separate levels.
const TRAY = { A: 2.85, B: 3.1, dc: 2.35 };
const STUB = 0.9; // external sources come in from above as a short vertical stub
// PDC branches: a busway along each row just above the cabinets it serves (racks and in-row coolers).
// A and B run on opposite sides of the cabinet top, like the A/B PDUs in a rack.
const BRANCH = { A: { height: 2.2, side: -0.3 }, B: { height: 2.35, side: 0.3 } };

// Trunks (UPS -> PDC) and busways are drawn as lit tubes (radius in m).
const TUBE = { trunk: 0.025, dc: 0.015, busway: 0.018 };
// Soft pulses travel along the tubes in the direction of power flow (spacing m, speed m/s).
const PULSE = { trunk: { spacing: 1.6, speed: 0.9 }, busway: { spacing: 1.2, speed: 0.6 } };
const flowTime = { value: 0 }; // shared by every tube material

// A polyline as one tube: a cylinder per segment and a ball at each bend and end, merged. Each vertex
// carries its distance along the polyline (aDist) for the pulse shader.
function tubeGeometry(pts, radius) {
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const ball = (p, dist) => {
    const g = new THREE.SphereGeometry(radius, 12, 8);
    g.setAttribute('aDist', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(dist), 1));
    g.translate(p.x, p.y, p.z);
    parts.push(g);
  };
  let dist = 0;
  ball(pts[0], 0);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = a.distanceTo(b);
    if (len < 1e-6) continue;
    const g = new THREE.CylinderGeometry(radius, radius, len, 12, 1, true);
    const d = new Float32Array(g.attributes.position.count);
    for (let v = 0; v < d.length; v++) d[v] = g.attributes.position.getY(v) > 0 ? dist + len : dist;
    g.setAttribute('aDist', new THREE.BufferAttribute(d, 1));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g);
    dist += len;
    ball(b, dist);
  }
  return parts.length > 1 ? mergeGeometries(parts) : null;
}

// Lit tube in the path colour with a faint self-glow and soft bright pulses moving along aDist.
function tube(pts, radius, color, { spacing, speed }) {
  const geometry = tubeGeometry(pts, radius);
  if (!geometry) return null;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.95 });
  const uniforms = { uTime: flowTime, uPulse: { value: 1 }, uGlow: { value: 0.25 }, uSpacing: { value: spacing }, uSpeed: { value: speed } };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float aDist;\nvarying float vDist;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDist = aDist;');
    shader.fragmentShader = `uniform float uTime, uPulse, uGlow, uSpacing, uSpeed;\nvarying float vDist;\n${shader.fragmentShader}`
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float phase = fract((vDist - uTime * uSpeed) / uSpacing);
  float pulse = smoothstep(0.0, 0.2, phase) * (1.0 - smoothstep(0.2, 0.5, phase));
  totalEmissiveRadiance += diffuseColor.rgb * uGlow + mix(diffuseColor.rgb, vec3(1.0), 0.55) * pulse * uPulse;`);
  };
  return new THREE.Mesh(geometry, material);
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const pathOf = (edge) => edge.path ?? 'dc';

function textSprite(text, { bg, fg = '#ffffff', height = 0.3 }) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = 'bold 40px system-ui, sans-serif';
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 36;
  canvas.height = 64;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 18);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  sprite.renderOrder = 20;
  return sprite;
}

// Orthogonal run: up from the source to its tray level, along X, along Z, down into the target.
function route(from, to, h) {
  const pts = [from, new THREE.Vector3(from.x, h, from.z), new THREE.Vector3(to.x, h, from.z), new THREE.Vector3(to.x, h, to.z), to];
  return pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-6);
}

/**
 * @param power    compiled power.json
 * @param anchorOf id -> Vector3 (top centre of the equipment, site coordinates) or null
 * @param labelOf  id -> display name (e.g. alias "UPS-A")
 * @param itemOf   id -> compiled equipment item (needs .row for racks)
 */
export function buildPowerLayer(power, { anchorOf, labelOf, itemOf }) {
  const group = new THREE.Group();
  group.name = 'power';
  group.visible = false;

  const up = new Map();
  const down = new Map();
  for (const e of power.edges) {
    if (!up.has(e.to)) up.set(e.to, []);
    if (!down.has(e.from)) down.set(e.from, []);
    up.get(e.to).push(e);
    down.get(e.from).push(e);
  }
  const external = new Set(power.external);
  // A unit may back up several others (e.g. one B-side PDC paired with two A-side PDCs).
  const partnersOf = new Map();
  for (const [a, b] of power.redundancy) {
    for (const [x, y] of [[a, b], [b, a]]) partnersOf.set(x, [...(partnersOf.get(x) ?? []), y]);
  }
  const servedBy = (rackId) => Object.keys(power.serves).filter((id) => power.serves[id].includes(rackId));

  // ---------- lines ----------
  const lines = new Map(); // edge id -> { base, edge }
  for (const e of power.edges) {
    const to = anchorOf(e.to);
    if (!to) continue;
    const key = pathOf(e);
    let pts;
    if (external.has(e.from)) {
      const top = new THREE.Vector3(to.x, TRAY[key] + STUB, to.z);
      pts = [top, to];
      const label = textSprite(`${e.from} ↓`, { bg: '#374151' });
      label.position.copy(top).add(new THREE.Vector3(0, 0.18, 0));
      group.add(label);
    } else {
      const from = anchorOf(e.from);
      if (!from) continue;
      pts = route(from, to, TRAY[key]);
    }
    const base = tube(pts, key === 'dc' ? TUBE.dc : TUBE.trunk, PATH_COLORS[key], PULSE.trunk);
    if (!base) continue;
    group.add(base);
    lines.set(e.id, { base, edge: e });
  }

  // ---------- badges: name and path of each node ----------
  for (const id of new Set(power.edges.flatMap((e) => [e.from, e.to]))) {
    const anchor = anchorOf(id);
    // a node's path comes from its feeds in, or for a root (e.g. UPS) from its feeds out
    const edges = [...(up.get(id) ?? []), ...(down.get(id) ?? [])].filter((e) => e.kind === 'ac');
    if (!anchor || !edges.length) continue;
    const incoming = edges.filter((e) => e.to === id);
    const paths = [...new Set((incoming.length ? incoming : edges).map((e) => e.path))].sort();
    const path = paths.join('+');
    // an alias like "UPS-A" already says the path; otherwise "PDC1 · A"
    const name = labelOf(id) !== id ? labelOf(id) : `${id} · ${path}`;
    const badge = textSprite(name, { bg: hex(PATH_COLORS[paths[0]]) });
    const top = anchor.clone().add(new THREE.Vector3(0, BADGE_LIFT[paths[0]] ?? 0.55, 0));
    badge.position.copy(top).add(new THREE.Vector3(0, 0.15, 0));
    // thin leader line from the equipment up to its raised badge
    const leader = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([anchor, top]),
      new THREE.LineBasicMaterial({ color: PATH_COLORS[paths[0]], transparent: true, opacity: 0.6 }),
    );
    group.add(leader, badge);
  }

  // ---------- PDC -> rack branches ----------
  const branches = new Map(); // feeder id -> { busways, path }
  for (const [id, racks] of Object.entries(power.serves)) {
    const source = anchorOf(id);
    if (!source || !racks.length) continue;
    const path = (up.get(id) ?? []).find((e) => e.path)?.path ?? 'A';
    const { height: h, side } = BRANCH[path];
    const busways = []; // feed run + busway of each row

    const byRow = new Map();
    for (const r of racks) {
      const top = anchorOf(r);
      if (!top) continue;
      const row = itemOf(r)?.row ?? r;
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row).push(top);
    }
    // Each row's busway: the run along its cabinets, `side` metres off the centre line.
    const rows = [...byRow.values()].map((tops) => {
      const alongZ = Math.max(...tops.map((t) => t.x)) - Math.min(...tops.map((t) => t.x)) < 0.01;
      const off = alongZ ? new THREE.Vector3(side, 0, 0) : new THREE.Vector3(0, 0, side);
      const along = (v) => (alongZ ? v.z : v.x);
      const sorted = [...tops].sort((p, q) => along(p) - along(q));
      return { off, sorted, ends: [sorted[0], sorted[sorted.length - 1]].map((t) => t.clone().add(off).setY(h)) };
    });
    // Chain the rows like real cabling: the nearest row is fed from the PDC, every further row from the
    // nearest point already wired (the PDC or the start of a busway), not by a separate run from the PDC.
    const wired = [source];
    const flat = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.z - q.z);
    while (rows.length) {
      let best = null;
      for (const row of rows) {
        for (const end of [0, 1]) {
          for (const from of wired) {
            const d = flat(from, row.ends[end]);
            if (!best || d < best.d) best = { row, end, from, d };
          }
        }
      }
      const { row, end, from } = best;
      rows.splice(rows.indexOf(row), 1);
      const start = row.ends[end];
      const busway = tube([...route(from, start, h), row.ends[1 - end]], TUBE.busway, PATH_COLORS[path], PULSE.busway);
      if (busway) busways.push(busway);
      wired.push(start);
    }
    if (!busways.length) continue;
    group.add(...busways);
    branches.set(id, { busways, path });
  }

  // ---------- tracing ----------
  function collect(id, map, next, acc = new Set()) {
    for (const e of map.get(id) ?? []) {
      if (acc.has(e.id)) continue;
      acc.add(e.id);
      collect(next(e), map, next, acc);
    }
    return acc;
  }
  const upstream = (id, acc) => collect(id, up, (e) => e.from, acc);
  const downstream = (id, acc) => collect(id, down, (e) => e.to, acc);
  const servesOf = (id) => {
    if (power.serves[id]) return power.serves[id];
    const racks = new Set();
    for (const eid of downstream(id)) for (const r of power.serves[lines.get(eid)?.edge.to] ?? []) racks.add(r);
    return [...racks];
  };
  const inGraph = (id) => up.has(id) || down.has(id);

  function styleTube(mesh, state) {
    const m = mesh.material;
    m.opacity = { active: 1, partner: 0.6, dim: 0.07, normal: 0.95 }[state];
    m.depthWrite = state !== 'dim'; // a faded tube must not hide the ones behind it
    m.userData.uniforms.uGlow.value = state === 'active' ? 0.6 : 0.25;
    m.userData.uniforms.uPulse.value = { active: 1.2, partner: 0.6, dim: 0, normal: 1 }[state];
  }

  function styleBranch(entry, state) {
    for (const b of entry.busways) styleTube(b, state);
  }

  function style(entry, state) {
    styleTube(entry.base, state);
  }

  /** Highlight what matters for `id`. Returns the racks it supplies (for tinting), or null if not power-related. */
  function highlight(id) {
    let active;
    let partner = new Set();
    let racks = [];
    if (inGraph(id)) {
      active = new Set([...upstream(id), ...downstream(id)]);
      for (const p of partnersOf.get(id) ?? []) upstream(p, partner);
      racks = servesOf(id);
    } else {
      const feeders = servedBy(id);
      if (!feeders.length) { clear(); return null; }
      active = new Set();
      for (const f of feeders) upstream(f, active);
      racks = [id];
    }
    for (const [eid, entry] of lines) style(entry, active.has(eid) ? 'active' : partner.has(eid) ? 'partner' : 'dim');
    // A branch is active when its feeder is the selection, downstream of it, or feeds the selected rack.
    const activeFeeders = new Set([id, ...[...active].map((eid) => lines.get(eid)?.edge.to)]);
    const partnerFeeders = new Set([...partner].map((eid) => lines.get(eid)?.edge.to));
    for (const p of partnersOf.get(id) ?? []) partnerFeeders.add(p);
    for (const [fid, entry] of branches) {
      styleBranch(entry, activeFeeders.has(fid) ? 'active' : partnerFeeders.has(fid) ? 'partner' : 'dim');
    }
    return racks;
  }
  function clear() {
    for (const entry of lines.values()) style(entry, 'normal');
    for (const entry of branches.values()) styleBranch(entry, 'normal');
  }

  // ---------- panel section ----------
  const feedText = (id) => (up.get(id) ?? []).filter((e) => e.kind === 'ac')
    .map((e) => `<span class="feed feed-${e.path}">${e.path}</span> ${labelOf(e.from)}`).join('<br>');

  function section(id) {
    const rows = [];
    if (inGraph(id)) {
      const feeds = feedText(id);
      if (feeds) rows.push(['上游', feeds]);
      const children = (down.get(id) ?? []).filter((e) => e.kind === 'ac').map((e) => labelOf(e.to));
      if (children.length) rows.push(['下游', children.join('、')]);
      const batteries = (up.get(id) ?? []).filter((e) => e.kind === 'dc').map((e) => e.from);
      if (batteries.length) rows.push(['電池', batteries.join('、')]);
      if (partnersOf.has(id)) rows.push(['備援', `2N · ${partnersOf.get(id).map(labelOf).join('、')}`]);
      const racks = servesOf(id);
      if (racks.length) rows.push(['供電範圍', `${racks.length} 台${power.servesAssumed ? '（推定）' : ''}`]);
    } else {
      const feeders = servedBy(id);
      if (!feeders.length) return '';
      rows.push(['供電來源', feeders.map((f) => {
        const p = (up.get(f) ?? []).find((e) => e.path)?.path;
        return `${p ? `<span class="feed feed-${p}">${p}</span> ` : ''}${labelOf(f)}`;
      }).join('<br>')]);
      if (power.servesAssumed) rows.push(['', '<span class="muted">依位置推定，尚無迴路資料</span>']);
    }
    return `<div class="section-title">電力</div><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  }

  // Power-related ids (shown solid while the layer is on; everything else is ghosted).
  // Served racks and in-row coolers stay ghosted until something they hang off is selected.
  const nodes = new Set(power.edges.flatMap((e) => [e.from, e.to]));

  return {
    group,
    nodes,
    highlight,
    clear,
    section,
    tick(dt) {
      flowTime.value += dt;
    },
  };
}
