import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

// A / B feed colours (common dual-feed convention): deep for trunks (UPS -> PDC), light for branches
// (PDC -> racks), grey for DC battery links.
export const PATH_COLORS = { A: 0x1d4ed8, B: 0xea580c, dc: 0x6b7280 };
const BRANCH_COLORS = { A: 0x93c5fd, B: 0xfdba74 };
// Badges for A and B sit at different heights so neighbours (e.g. UPS-A next to UPS-B) don't overlap.
const BADGE_LIFT = { A: 0.55, B: 0.95 };
// Schematic overhead routing heights (m): above racks and walls, A and B on separate levels.
const TRAY = { A: 2.85, B: 3.1, dc: 2.35 };
const STUB = 0.9; // external sources come in from above as a short vertical stub
// PDC branches: a busway along each row just above the cabinets, then a drop into every rack and
// in-row cooler it serves. A and B run on opposite sides of the cabinet top, like the A/B PDUs in a rack.
const BRANCH = { A: { height: 2.2, side: -0.3 }, B: { height: 2.35, side: 0.3 } };

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
  const partnerOf = new Map(power.redundancy.flatMap(([a, b]) => [[a, b], [b, a]]));
  const servedBy = (rackId) => Object.keys(power.serves).filter((id) => power.serves[id].includes(rackId));

  // ---------- lines ----------
  const lines = new Map(); // edge id -> { base, flow }
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
    const geometry = new LineGeometry().setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
    const base = new Line2(geometry, new LineMaterial({ color: PATH_COLORS[key], linewidth: key === 'dc' ? 2 : 4.5, transparent: true, opacity: 0.9 }));
    // Moving dashes on top show the direction of power flow.
    const flow = new Line2(geometry, new LineMaterial({
      color: 0xffffff, linewidth: key === 'dc' ? 1.5 : 2.2, dashed: true, dashSize: 0.18, gapSize: 0.6, transparent: true, opacity: 0.85,
    }));
    flow.computeLineDistances();
    flow.renderOrder = 1;
    group.add(base, flow);
    lines.set(e.id, { base, flow, edge: e });
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
  const branches = new Map(); // feeder id -> { base, flow, path }
  for (const [id, racks] of Object.entries(power.serves)) {
    const source = anchorOf(id);
    if (!source || !racks.length) continue;
    const path = (up.get(id) ?? []).find((e) => e.path)?.path ?? 'A';
    const { height: h, side } = BRANCH[path];
    const segments = [];
    const seg = (a, b) => segments.push(a.x, a.y, a.z, b.x, b.y, b.z);

    const byRow = new Map();
    for (const r of racks) {
      const top = anchorOf(r);
      if (!top) continue;
      const row = itemOf(r)?.row ?? r;
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row).push(top);
    }
    for (const tops of byRow.values()) {
      // Rows run along x or z; the busway sits `side` metres off the rack centre line.
      const alongZ = Math.max(...tops.map((t) => t.x)) - Math.min(...tops.map((t) => t.x)) < 0.01;
      const off = alongZ ? new THREE.Vector3(side, 0, 0) : new THREE.Vector3(0, 0, side);
      const along = (v) => (alongZ ? v.z : v.x);
      const sorted = [...tops].sort((a, b) => along(a) - along(b));
      const ends = [sorted[0], sorted[sorted.length - 1]].map((t) => t.clone().add(off).setY(h));
      // start the busway at the end nearest the PDC
      if (Math.abs(along(source) - along(ends[1])) < Math.abs(along(source) - along(ends[0]))) ends.reverse();
      const feed = route(source, ends[0], h);
      for (let i = 1; i < feed.length; i++) seg(feed[i - 1], feed[i]);
      seg(ends[0], ends[1]);
      for (const t of sorted) seg(t.clone().add(off).setY(h), t.clone().add(off));
    }
    if (!segments.length) continue;
    const geometry = new LineSegmentsGeometry().setPositions(segments);
    const base = new LineSegments2(geometry, new LineMaterial({ color: BRANCH_COLORS[path], linewidth: 1.3, transparent: true, opacity: 0.8 }));
    const flow = new LineSegments2(geometry, new LineMaterial({
      color: 0xffffff, linewidth: 1, dashed: true, dashSize: 0.12, gapSize: 0.4, transparent: true, opacity: 0.6,
    }));
    flow.computeLineDistances();
    flow.renderOrder = 1;
    group.add(base, flow);
    branches.set(id, { base, flow, path });
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

  function styleBranch(entry, state) {
    entry.base.material.opacity = { active: 1, partner: 0.6, dim: 0.06, normal: 0.8 }[state];
    entry.base.material.linewidth = state === 'active' ? 2.2 : 1.3;
    entry.flow.visible = state !== 'dim';
  }

  function style(entry, state) {
    const { base, flow } = entry;
    base.material.opacity = { active: 1, partner: 0.75, dim: 0.08, normal: 0.9 }[state];
    base.material.linewidth = pathOf(entry.edge) === 'dc' ? 2 : state === 'active' ? 6.5 : 4.5;
    flow.visible = state !== 'dim';
    flow.material.opacity = state === 'partner' ? 0.5 : 0.85;
  }

  /** Highlight what matters for `id`. Returns the racks it supplies (for tinting), or null if not power-related. */
  function highlight(id) {
    let active;
    let partner = new Set();
    let racks = [];
    if (inGraph(id)) {
      active = new Set([...upstream(id), ...downstream(id)]);
      const p = partnerOf.get(id);
      if (p) partner = upstream(p);
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
    if (partnerOf.has(id)) partnerFeeders.add(partnerOf.get(id));
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
      if (partnerOf.has(id)) rows.push(['備援', `2N · ${labelOf(partnerOf.get(id))}`]);
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
      for (const { flow } of lines.values()) flow.material.dashOffset -= dt * 0.9;
      for (const { flow } of branches.values()) flow.material.dashOffset -= dt * 0.6;
    },
  };
}
