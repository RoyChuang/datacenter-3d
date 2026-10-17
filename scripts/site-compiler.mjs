// site.yaml (tiles + mm, human-maintained) -> runtime JSON (metres) + validation report.
// Pure: no file system access, so it can be unit-tested or reused elsewhere.

// Colours follow common vendor finishes: matte black racks, light-grey power and cooling cabinets.
export const DEFAULT_TYPES = {
  rack: { width: 600, depth: 1200, uHeight: 42, uSize: 44.45, plinth: 65, color: '#1d2025' },
  rowcool: { width: 300, depth: 1200, height: 2000, color: '#d6dade' },
  pdc: { width: 600, depth: 1200, height: 2000, color: '#cfd4da' },
  ups: { width: 600, depth: 1000, height: 1900, color: '#d6dade' },
  battery: { width: 600, depth: 1000, height: 1900, color: '#cfd4da' },
  // wall-mounted distribution board; `mount` = height of its bottom edge
  panel: { width: 600, depth: 250, height: 900, mount: 900, color: '#cfd4da' },
};

export const DEFAULT_TYPE_RULES = [
  { match: '^PDC', type: 'pdc' },
  { match: '^R\\d', type: 'rowcool' },
  { match: '^UPS', type: 'ups' },
  { match: '^BATT', type: 'battery' },
  { match: '^ACP', type: 'panel' },
  { match: '.*', type: 'rack' },
];

const OUTPUT_FOR_TYPE = { rack: 'racks', rowcool: 'rowcools', pdc: 'pdcs', ups: 'ups', battery: 'batteries', panel: 'panels' };
const POWER_PATHS = ['A', 'B'];
const PERIMETER_THICKNESS = 0.2; // m
const AISLE_DOOR_THICKNESS = 0.1; // m
const EPS = 0.005; // m — overlaps smaller than this are ignored

const r3 = (v) => Math.round(v * 1000) / 1000;
const pad = (n) => String(n).padStart(2, '0');

export function compileSite(site, { devices: realDevices } = {}) {
  const errors = [];
  const warnings = [];
  const T = site.grid.tileSize / 1000; // metres per tile
  const m = (tiles) => r3(tiles * T);
  const rect = ([x1, z1, x2, z2]) => ({ x1: m(Math.min(x1, x2)), z1: m(Math.min(z1, z2)), x2: m(Math.max(x1, x2)), z2: m(Math.max(z1, z2)) });

  const types = {};
  for (const [name, spec] of Object.entries(DEFAULT_TYPES)) types[name] = { ...spec, ...site.types?.[name] };
  const typeRules = (site.typeRules ?? DEFAULT_TYPE_RULES).map((r) => ({ re: new RegExp(r.match), type: r.type }));
  const typeOf = (id) => typeRules.find((r) => r.re.test(id))?.type ?? 'rack';

  const width = r3(site.grid.cols * T);
  const depth = r3(site.grid.rows * T);

  // ---------- equipment from rows ----------
  const equipment = [];
  const rowExtents = new Map();
  for (const row of site.rows ?? []) {
    if (!['x', 'z'].includes(row.axis)) errors.push(`row ${row.id}: axis 必須是 x 或 z`);
    let cursor = row.from * T;
    const start = cursor;
    let rowDepth = 0;
    for (const entry of row.units ?? []) {
      if (typeof entry === 'object' && entry.gap != null) { cursor += entry.gap / 1000; continue; }
      const id = String(entry);
      const type = typeOf(id);
      const spec = types[type];
      if (!spec) { errors.push(`${id}: 未知設備類型 "${type}"`); continue; }
      const w = (site.widths?.[id] ?? row.widths?.[type] ?? spec.width) / 1000;
      const d = spec.depth / 1000;
      const along = r3(cursor + w / 2);
      const cross = m(row.line);
      cursor += w;
      rowDepth = Math.max(rowDepth, d);
      equipment.push({
        id, type, row: row.id,
        x: row.axis === 'x' ? along : cross,
        z: row.axis === 'z' ? along : cross,
        width: r3(w), depth: r3(d), facing: row.facing ?? 'south',
        ...(type === 'rack' ? { uHeight: spec.uHeight } : {}),
        ...site.props?.[id],
      });
    }
    rowExtents.set(row.id, { axis: row.axis, start: r3(start), end: r3(cursor), line: m(row.line), depth: rowDepth });
  }

  // ---------- standalone equipment ----------
  for (const e of site.equipment ?? []) {
    const type = e.type ?? typeOf(e.id);
    const spec = types[type];
    if (!spec) { errors.push(`${e.id}: 未知設備類型 "${type}"`); continue; }
    equipment.push({
      id: e.id, type, x: m(e.at[0]), z: m(e.at[1]),
      width: r3((e.width ?? spec.width) / 1000), depth: r3(spec.depth / 1000), facing: e.facing ?? 'south',
      ...(type === 'rack' ? { uHeight: spec.uHeight } : {}),
      ...site.props?.[e.id],
    });
  }

  // ---------- doors, aisles ----------
  const doors = (site.doors ?? []).map((d) => ({ id: d.id, kind: d.kind ?? 'door', ...rect(d.rect) }));
  const containments = [];
  for (const aisle of site.aisles ?? []) {
    const [a, b] = aisle.between.map((id) => rowExtents.get(id));
    if (!a || !b) { errors.push(`aisle ${aisle.id}: 找不到排 ${aisle.between.join(' / ')}`); continue; }
    if (a.axis !== b.axis) { errors.push(`aisle ${aisle.id}: 兩排方向不同`); continue; }
    const [lo, hi] = a.line < b.line ? [a, b] : [b, a];
    const c1 = r3(lo.line + lo.depth / 2);
    const c2 = r3(hi.line - hi.depth / 2);
    if (c2 - c1 <= EPS) { errors.push(`aisle ${aisle.id}: 兩排之間沒有通道空間（${r3(c2 - c1)} m）`); continue; }
    const s = Math.min(lo.start, hi.start);
    const e = Math.max(lo.end, hi.end);
    const toRect = (along1, along2) => (a.axis === 'z'
      ? { x1: c1, z1: r3(along1), x2: c2, z2: r3(along2) }
      : { x1: r3(along1), z1: c1, x2: r3(along2), z2: c2 });
    containments.push({ id: aisle.id, ...toRect(s, e) });
    for (const end of aisle.doors ?? []) {
      const r = end === 'start' ? toRect(s - AISLE_DOOR_THICKNESS, s) : toRect(e, e + AISLE_DOOR_THICKNESS);
      doors.push({ id: `${aisle.id}-${end === 'start' ? 'S' : 'E'}`, kind: 'sliding', ...r });
    }
  }

  // ---------- walls (doors are cut out automatically) ----------
  let walls = (site.walls ?? []).map((w, i) => ({ id: `W${pad(i + 1)}`, ...rect(w) }));
  if (site.perimeter) {
    const t = PERIMETER_THICKNESS;
    walls.push(
      { id: 'W-N', x1: -t, z1: -t, x2: width + t, z2: 0 },
      { id: 'W-S', x1: -t, z1: depth, x2: width + t, z2: depth + t },
      { id: 'W-W', x1: -t, z1: 0, x2: 0, z2: depth },
      { id: 'W-E', x1: width, z1: 0, x2: width + t, z2: depth },
    );
  }
  walls = walls.flatMap((w) => doors.reduce((pieces, d) => pieces.flatMap((p) => cutWall(p, d)), [w]));

  // ---------- points ----------
  const points = [];
  for (const group of site.points ?? []) {
    group.at.forEach(([x, z], i) => {
      points.push({ id: `${group.prefix}-${pad(i + 1)}`, type: group.type, x: m(x), y: r3(group.height / 1000), z: m(z) });
    });
  }

  // ---------- validation ----------
  const ids = [...equipment.map((e) => e.id), ...points.map((p) => p.id), ...doors.map((d) => d.id)];
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) errors.push(`重複的編號：${id}`);

  const boxes = equipment.map((e) => ({ id: e.id, ...footprint(e) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlap(boxes[i], boxes[j])) errors.push(`設備重疊：${boxes[i].id} ↔ ${boxes[j].id}`);
    }
    for (const w of walls) if (overlap(boxes[i], w)) warnings.push(`設備壓到牆：${boxes[i].id} ↔ ${w.id}`);
    const b = boxes[i];
    if (b.x1 < -EPS || b.z1 < -EPS || b.x2 > width + EPS || b.z2 > depth + EPS) warnings.push(`設備超出房間範圍：${b.id}`);
  }

  const known = new Set(equipment.map((e) => e.id));
  for (const key of ['widths', 'props']) {
    for (const id of Object.keys(site[key] ?? {})) if (!known.has(id)) warnings.push(`${key}.${id}：沒有這台設備（打錯字？）`);
  }

  for (const [prefix, nums] of numberSequences(equipment.map((e) => e.id))) {
    const max = Math.max(...nums);
    const missing = [];
    for (let n = Math.min(...nums); n <= max; n++) if (!nums.has(n)) missing.push(`${prefix}${n}`);
    if (missing.length) warnings.push(`編號不連續，缺少：${missing.join(', ')}`);
  }

  const power = site.power ? compilePower(site.power, equipment, errors, warnings) : null;

  // ---------- outputs ----------
  const strip = ({ type, depth: _d, ...rest }) => rest;
  const byType = Object.fromEntries(Object.values(OUTPUT_FOR_TYPE).map((k) => [k, []]));
  for (const e of equipment) byType[OUTPUT_FOR_TYPE[e.type]]?.push(strip(e));

  const rackDevices = {};
  for (const rack of byType.racks) {
    rackDevices[rack.id] = realDevices?.[rack.id] ?? (site.mockDevices ? mockDevices(rack) : []);
  }

  const files = {
    site: {
      id: site.id, name: site.name ?? site.id,
      plan: site.plan ? { image: site.plan.image, pxPerTile: site.plan.pxPerTile, originPx: site.plan.originPx ?? [0, 0] } : null,
    },
    room: { name: site.name, tileSize: T, width, depth, wallHeight: r3((site.wallHeight ?? 2600) / 1000), walls, doors, containments },
    'equipment-types': runtimeTypes(types),
    ...byType,
    'rack-devices': rackDevices,
    points,
    ...(power ? { power } : {}),
  };

  const stats = { ...Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])), points: points.length, walls: walls.length, doors: doors.length, ...(power ? { feeds: power.edges.length } : {}) };
  return { files, errors, warnings, stats };
}

// Power topology: feeds become directed edges on path A or B; batteries are linked to their UPS (DC).
function compilePower(power, equipment, errors, warnings) {
  const byId = new Map(equipment.map((e) => [e.id, e]));
  const external = new Set(power.external ?? []);
  const known = (id) => byId.has(id) || external.has(id);
  const edges = [];
  const feeders = new Map(); // id -> [{ from, path }]

  for (const feed of power.feeds ?? []) {
    if (!POWER_PATHS.includes(feed.path)) { errors.push(`power.feeds: path 必須是 ${POWER_PATHS.join(' / ')}（${feed.from}）`); continue; }
    if (!known(feed.from)) { errors.push(`power.feeds: 找不到 ${feed.from}`); continue; }
    for (const to of [].concat(feed.to)) {
      if (!byId.has(to)) { errors.push(`power.feeds: 找不到 ${to}（上游 ${feed.from}）`); continue; }
      edges.push({ id: `${feed.from}>${to}`, kind: 'ac', path: feed.path, from: feed.from, to });
      if (!feeders.has(to)) feeders.set(to, []);
      feeders.get(to).push({ from: feed.from, path: feed.path });
    }
  }

  // A loop would make "trace upstream" run forever, so reject it here.
  const visiting = new Set();
  const done = new Set();
  const visit = (id) => {
    if (done.has(id)) return;
    if (visiting.has(id)) { errors.push(`power.feeds: 供電迴圈經過 ${id}`); return; }
    visiting.add(id);
    for (const f of feeders.get(id) ?? []) visit(f.from);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of feeders.keys()) visit(id);

  // Batteries feed the UPS named in their props, as long as that UPS is part of the topology.
  const inTopology = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const b of equipment.filter((e) => e.type === 'battery' && e.ups)) {
    if (inTopology.has(b.ups)) edges.push({ id: `${b.id}>${b.ups}`, kind: 'dc', path: null, from: b.id, to: b.ups });
  }

  const redundancy = [];
  for (const [a, b] of power.redundancy ?? []) {
    if (!byId.has(a) || !byId.has(b)) { errors.push(`power.redundancy: 找不到 ${byId.has(a) ? b : a}`); continue; }
    const pa = feeders.get(a)?.map((f) => f.path) ?? [];
    const pb = feeders.get(b)?.map((f) => f.path) ?? [];
    if (pa.some((p) => pb.includes(p))) warnings.push(`power.redundancy: ${a} 和 ${b} 有同一路供電，不是真正的雙路備援`);
    redundancy.push([a, b]);
  }
  const paired = new Set(redundancy.flat());
  const singleFeed = [...feeders.keys()].filter((id) => byId.get(id).type === 'pdc' && !paired.has(id) && feeders.get(id).length < 2);

  // serves: which racks each feeder supplies, given as row ids or rack ids.
  const serves = {};
  for (const [id, targets] of Object.entries(power.serves ?? {})) {
    if (!byId.has(id)) { warnings.push(`power.serves.${id}：沒有這台設備`); continue; }
    serves[id] = [];
    for (const t of targets) {
      const racks = equipment.filter((e) => e.type === 'rack' && (e.row === t || e.id === t)).map((e) => e.id);
      if (!racks.length) warnings.push(`power.serves.${id}：${t} 沒有對應的排或機櫃`);
      serves[id].push(...racks);
    }
  }

  return { external: [...external], edges, redundancy, singleFeed, serves, servesAssumed: !!power.servesAssumed };
}

function cutWall(wall, door) {
  if (!overlap(wall, door)) return [wall];
  const alongX = wall.x2 - wall.x1 >= wall.z2 - wall.z1;
  const [a1, a2, b1, b2] = alongX ? [wall.x1, wall.x2, door.x1, door.x2] : [wall.z1, wall.z2, door.z1, door.z2];
  const pieces = [];
  if (b1 - a1 > EPS) pieces.push(alongX ? { ...wall, x2: b1 } : { ...wall, z2: b1 });
  if (a2 - b2 > EPS) pieces.push(alongX ? { ...wall, x1: b2, id: `${wall.id}b` } : { ...wall, z1: b2, id: `${wall.id}b` });
  return pieces;
}

function footprint(e) {
  const sideways = e.facing === 'east' || e.facing === 'west';
  const sx = sideways ? e.depth : e.width;
  const sz = sideways ? e.width : e.depth;
  return { x1: e.x - sx / 2, z1: e.z - sz / 2, x2: e.x + sx / 2, z2: e.z + sz / 2 };
}

function overlap(a, b) {
  return Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > EPS && Math.min(a.z2, b.z2) - Math.max(a.z1, b.z1) > EPS;
}

function numberSequences(ids) {
  const seq = new Map();
  for (const id of ids) {
    const match = /^([A-Za-z]+-?)(\d+)$/.exec(id);
    if (!match) continue;
    if (!seq.has(match[1])) seq.set(match[1], new Set());
    seq.get(match[1]).add(Number(match[2]));
  }
  return seq;
}

function runtimeTypes(types) {
  const out = {};
  for (const [name, t] of Object.entries(types)) {
    out[name] = name === 'rack'
      ? { uSize: t.uSize / 1000, plinth: t.plinth / 1000, depth: t.depth / 1000, defaultWidth: t.width / 1000, defaultUHeight: t.uHeight, color: t.color }
      : { height: t.height / 1000, depth: t.depth / 1000, color: t.color, ...(t.mount ? { mount: t.mount / 1000 } : {}) };
  }
  return out;
}

// Seeded so the same rack id always gets the same fake contents.
function mockDevices(rack) {
  let seed = [...rack.id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const top = rack.uHeight;
  const devs = [
    { u: top, size: 1, type: 'patch', name: `PP-${rack.id}`, powerW: 0 },
    { u: top - 1, size: 1, type: 'switch', name: `SW-${rack.id}-01`, powerW: 150 },
  ];
  const limit = Math.floor(2 + (top - 4) * (0.35 + rand() * 0.55));
  let u = 2;
  let n = 1;
  while (u < limit) {
    const p = rand();
    let size, type, powerW;
    if (p < 0.15) { u += 1 + Math.floor(rand() * 3); continue; }
    else if (p < 0.55) { size = 1; type = 'server'; powerW = 350 + Math.round(rand() * 150); }
    else if (p < 0.88) { size = 2; type = 'server'; powerW = 500 + Math.round(rand() * 300); }
    else { size = 4; type = 'storage'; powerW = 600 + Math.round(rand() * 300); }
    if (u + size - 1 >= top - 2) break;
    devs.push({ u, size, type, name: `${type === 'storage' ? 'STO' : 'SRV'}-${rack.id}-${pad(n++)}`, powerW });
    u += size;
  }
  return devs.sort((a, b) => a.u - b.u);
}
