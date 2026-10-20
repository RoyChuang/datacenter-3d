import * as THREE from 'three';

// Schematic airflow for cold-aisle containment with in-row cooling:
//   cooler front -> cold aisle -> rack front -> (heated in the rack) -> rack rear -> back of the row
//   -> cooler rear -> (cooled in the cooler) -> cooler front
// Derived from the layout only; it is not a CFD result.

const COLD = new THREE.Color('#2563eb');
const HOT = new THREE.Color('#dc2626');
const HEIGHTS = [0.7, 1.5]; // one loop per height, so the flow covers the cabinet face
// Drawn like a wind map (windy.com): many thin streaks, each a short line whose tail fades out,
// fading in and out over a short life and reappearing a little further on after a brief gap, so the
// field shimmers instead of marching in lockstep.
const PER_LOOP = 13; // streaks travelling each loop
const TRAIL_POINTS = 9; // samples per streak, head first
const TRAIL_STEP = 0.04; // m between samples, so a streak is ~0.3 m long
const BAND = 0.2; // m — how far a streak may sit off its loop (grows as the air spreads)
const SPREAD = 0.5; // mid-leg the band is this much wider; it narrows again into the next intake
const SWEEP = 0.8; // m before / after a rack where its air turns off / onto a lane
const HOT_LANE = 0.6; // m behind the rack backs where the farthest rack's exhaust runs to the cooler
const MIN_TURN = 0.3; // m — smallest radius of the U-turn between a cooler and the rack next to it
const SPEED = 0.8; // m/s along the loop, each streak ±25%
const LIFE = [0.8, 1.6]; // s visible, random per life
const GAP = [0.15, 0.45]; // s unseen between lives
const FADE = 0.3; // s of fade-in at birth and fade-out at the end of a life
const JITTER = 0.06; // m a streak may shift sideways between lives
// Screen-space width in CSS pixels, head to tail. GL lines are always 1 px, too thin to read on the
// light floor, so each streak is a camera-facing ribbon that tapers to its tail.
const WIDTH = [2.6, 0.8]; // the edges are feathered, so it reads thinner than this
const OPACITY = 0.6; // at the head
// Opacity along a streak (t: 0 head .. 1 tail): like windy.com, the head is the densest point and the
// tail thins out behind it.
const profile = (t) => (1 - t) ** 1.5;

const FACING_DIR = {
  north: new THREE.Vector3(0, 0, -1), south: new THREE.Vector3(0, 0, 1),
  east: new THREE.Vector3(1, 0, 0), west: new THREE.Vector3(-1, 0, 0),
};

// Air doesn't turn square corners: run a closed centripetal Catmull-Rom curve through the waypoints
// ([point, heat] pairs, the last repeating the first) and keep it as a dense polyline for cheap lookups.
// marks[i] is the polyline index of waypoint i.
const STEPS = 12; // polyline samples per waypoint span
const MERGE = 0.15; // m — waypoints closer than this are one: the curve ties a small loop through near-duplicates
function smoothLoop(points) {
  const way = [];
  const keptAs = []; // original waypoint -> index in `way`
  for (const [i, wp] of points.slice(0, -1).entries()) {
    if (i > 0 && wp[0].distanceTo(way[way.length - 1][0]) < MERGE) { keptAs.push(way.length - 1); continue; }
    way.push(wp);
    keptAs.push(way.length - 1);
  }
  const n = way.length;
  const curve = new THREE.CatmullRomCurve3(way.map(([p]) => p), true, 'centripetal');
  const path = [];
  const heat = [];
  const starts = [];
  for (let i = 0; i < n; i++) {
    starts.push(path.length);
    const [, t0] = way[i];
    const [, t1] = way[(i + 1) % n];
    for (let k = 0; k < STEPS; k++) {
      path.push(curve.getPoint((i + k / STEPS) / n)); // a closed curve reaches waypoint i at i / n
      heat.push(t0 + ((t1 - t0) * k) / STEPS);
    }
  }
  const marks = [...keptAs.map((k) => starts[k]), path.length];
  path.push(path[0].clone());
  heat.push(heat[0]);
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + path[i].distanceTo(path[i - 1]));
  return { path, heat, lengths, marks, total: lengths[lengths.length - 1] };
}

/**
 * @param containments compiled room.containments (with .rows)
 * @param racks, coolers compiled equipment items ({ id, row, x, z, facing })
 * @param depth { rack, rowcool } cabinet depths in metres
 */
export function buildAirflow({ containments, racks, coolers, depth }) {
  const loops = [];
  for (const aisle of containments) {
    const rows = new Set(aisle.rows ?? []);
    const alongZ = aisle.z2 - aisle.z1 > aisle.x2 - aisle.x1;
    const cross = alongZ ? (aisle.x1 + aisle.x2) / 2 : (aisle.z1 + aisle.z2) / 2;
    const along = (o) => (alongZ ? o.z : o.x);
    const onCentre = (a, h) => (alongZ ? new THREE.Vector3(cross, h, a) : new THREE.Vector3(a, h, cross));
    const aisleCoolers = coolers.filter((c) => rows.has(c.row));
    if (!aisleCoolers.length) continue;

    // nearest cooler in the same row, otherwise the nearest one across the aisle
    const served = racks.filter((r) => rows.has(r.row)).map((rack) => {
      const sameRow = aisleCoolers.filter((c) => c.row === rack.row);
      const pool = sameRow.length ? sameRow : aisleCoolers;
      const cooler = pool.reduce((a, b) => (Math.abs(along(b) - along(rack)) < Math.abs(along(a) - along(rack)) ? b : a));
      return { rack, cooler, run: along(rack) - along(cooler) };
    });
    // Each cooler drives one circulation cell per side: its racks' loops nest like rings, the nearest
    // rack's smallest, so they never cross. `ring` is how far out a loop sits (0 .. 1, farthest rack 1).
    const farthest = new Map();
    for (const { cooler, rack, run } of served) {
      const key = `${cooler.id}|${rack.row === cooler.row}|${Math.sign(run)}`;
      farthest.set(key, Math.max(farthest.get(key) ?? 0, Math.abs(run)));
    }

    for (const { rack, cooler, run } of served) {
      const ring = Math.abs(run) / (farthest.get(`${cooler.id}|${rack.row === cooler.row}|${Math.sign(run)}`) || 1);
      const f = FACING_DIR[rack.facing];
      const fc = FACING_DIR[cooler.facing];
      if (!f || !fc) continue;

      for (const h of HEIGHTS) {
        const r = new THREE.Vector3(rack.x, h, rack.z);
        const c = new THREE.Vector3(cooler.x, h, cooler.z);
        const coolerFront = c.clone().addScaledVector(fc, depth.rowcool / 2 + 0.05);
        const rackRear = r.clone().addScaledVector(f, -(depth.rack / 2 + 0.05));
        // leave the cold lane a little before the rack, so the air sweeps diagonally into its front
        // instead of making a square turn
        const sweep = Math.sign(run) * Math.min(SWEEP, Math.abs(run) / 2);
        const withAlong = (v, a) => { const p = v.clone(); if (alongZ) p.z = a; else p.x = a; return p; };
        const rackFront = r.clone().addScaledVector(f, depth.rack / 2 + 0.05);
        // How far out into the cold aisle (towards its centre) and behind the row this loop runs: its
        // ring, but never so shallow that the U-turn by the cooler gets tighter than MIN_TURN. A rack
        // across the aisle from its cooler has to cross the centre anyway.
        const toCentre = coolerFront.distanceTo(onCentre(along(cooler), h));
        const sameSide = rack.row === cooler.row;
        const reach = !sameSide || toCentre === 0 ? 1 : THREE.MathUtils.clamp(ring, MIN_TURN / toCentre, 1);
        const lane = rackRear.clone().addScaledVector(f, -HOT_LANE * Math.max(ring, MIN_TURN / HOT_LANE));
        const points = [
          [coolerFront, 0],
          [coolerFront.clone().lerp(onCentre(along(cooler), h), reach), 0],
          [withAlong(rackFront, along(rack) - sweep).lerp(onCentre(along(rack) - sweep, h), reach), 0],
          [rackFront, 0],
          [rackRear, 1],
          [withAlong(lane, along(rack) - sweep), 1],
          [withAlong(lane, along(cooler) + sweep), 1],
          [c.clone().addScaledVector(fc, -(depth.rowcool / 2 + 0.05)), 1],
          [coolerFront, 0],
        ];
        const loop = smoothLoop(points);
        // the two open-air legs (cooler -> rack front, rack rear -> cooler rear) along which the air spreads
        const at = (i) => loop.lengths[loop.marks[i]];
        loop.legs = [[at(0), at(3)], [at(4), at(7)]];
        loops.push({ rack: rack.id, cooler: cooler.id, ...loop });
      }
    }
  }

  // ---------- streaks ----------
  // Two vertices per trail sample (side -1 / +1); the vertex shader pushes them apart across the
  // streak's on-screen direction (towards `toward`, the next sample along the tail).
  const streakCount = loops.length * PER_LOOP;
  const samples = streakCount * TRAIL_POINTS;
  const positions = new Float32Array(samples * 2 * 3);
  const towards = new Float32Array(samples * 2 * 3);
  const colors = new Float32Array(samples * 2 * 4); // rgba: the alpha fades the tail and the streak's life
  const sides = new Float32Array(samples * 2);
  const widths = new Float32Array(samples * 2);
  const index = [];
  for (let v = 0; v < samples; v++) {
    const t = (v % TRAIL_POINTS) / (TRAIL_POINTS - 1); // 0 head .. 1 tail
    sides[v * 2] = -1;
    sides[v * 2 + 1] = 1;
    widths[v * 2] = widths[v * 2 + 1] = WIDTH[0] + (WIDTH[1] - WIDTH[0]) * t;
    if (v % TRAIL_POINTS === TRAIL_POINTS - 1) continue; // no quad past the tail
    const a = v * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  const dynamic = (name, array, itemSize) =>
    geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize).setUsage(THREE.DynamicDrawUsage));
  dynamic('position', positions, 3);
  dynamic('toward', towards, 3);
  dynamic('rgba', colors, 4);
  geometry.setAttribute('side', new THREE.BufferAttribute(sides, 1));
  geometry.setAttribute('width', new THREE.BufferAttribute(widths, 1));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    uniforms: { resolution: { value: new THREE.Vector2(1, 1) }, pixelRatio: { value: 1 } },
    vertexShader: `
      attribute vec3 toward;
      attribute vec4 rgba;
      attribute float side;
      attribute float width;
      uniform vec2 resolution;
      uniform float pixelRatio;
      varying vec4 vColor;
      varying float vSide;
      void main() {
        vColor = rgba;
        vSide = side;
        vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 b = projectionMatrix * modelViewMatrix * vec4(toward, 1.0);
        vec2 d = (b.xy / b.w - a.xy / a.w) * resolution;
        vec2 dir = dot(d, d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
        vec2 n = vec2(-dir.y, dir.x);
        a.xy += n * side * width * pixelRatio / resolution * a.w; // half-width px -> NDC is (w/2)*(2/res)
        gl_Position = a;
      }`,
    fragmentShader: `
      varying vec4 vColor;
      varying float vSide;
      void main() {
        gl_FragColor = vec4(vColor.rgb, vColor.a * (1.0 - vSide * vSide)); // feathered edges, densest along the centre
        if (gl_FragColor.a < 0.005) discard;
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lines = new THREE.Mesh(geometry, material);
  lines.frustumCulled = false;
  const size = new THREE.Vector2();
  lines.onBeforeRender = (renderer) => {
    material.uniforms.resolution.value.copy(renderer.getDrawingBufferSize(size));
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const streaks = [];
  loops.forEach((loop, li) => {
    for (let k = 0; k < PER_LOOP; k++) {
      const p = { loop, first: (li * PER_LOOP + k) * TRAIL_POINTS, offset: new THREE.Vector3(), s: 0, age: 0, life: 1, speed: SPEED };
      p.s = Math.random() * loop.total;
      p.offset.set(rand(-0.5, 0.5) * BAND, rand(-0.5, 0.5) * BAND * 1.2, rand(-0.5, 0.5) * BAND);
      p.speed = SPEED * rand(0.75, 1.25);
      reborn(p);
      p.age = Math.random() * (p.life + p.gap); // stagger the first generation
      streaks.push(p);
    }
  });

  // Like windy.com: a streak lives briefly, fades out, stays gone for a moment while the air it rides
  // keeps moving, then reappears a little further on in the same lane (nudged slightly sideways).
  function reborn(p) {
    p.age = 0;
    p.life = rand(LIFE[0], LIFE[1]);
    p.gap = rand(GAP[0], GAP[1]);
    p.offset.x += rand(-1, 1) * JITTER;
    p.offset.y += rand(-1, 1) * JITTER;
    p.offset.z += rand(-1, 1) * JITTER;
    p.offset.clampScalar(-BAND, BAND);
  }

  const group = new THREE.Group();
  group.name = 'airflow';
  group.visible = false;
  group.add(lines);

  const pos = new THREE.Vector3();
  const color = new THREE.Color();
  let focus = null; // show only loops involving this rack / cooler

  // How spread out the air at `s` is: 0 where it leaves a cooler / rack and again where it is drawn into
  // the next intake, widest mid-leg; inside a cabinet it is 0. Both ends meet at 0, so a streak never
  // jumps sideways at an intake.
  function spreadAt(loop, s) {
    for (const [from, to] of loop.legs) if (s >= from && s <= to) return Math.sin((Math.PI * (s - from)) / (to - from || 1));
    return 0;
  }

  // Trail sample `j` of streak `p`, at distance `s` along its loop, into `trail[j]`; returns its colour mix (0 cold .. 1 hot).
  const trail = Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3());
  function sample(p, j, s) {
    const { loop } = p;
    const { lengths } = loop;
    let lo = 1; // first polyline point at or past s
    let hi = lengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const k = (s - lengths[lo - 1]) / (lengths[lo] - lengths[lo - 1] || 1);
    trail[j].lerpVectors(loop.path[lo - 1], loop.path[lo], k).addScaledVector(p.offset, 0.5 + SPREAD * spreadAt(loop, s));
    return loop.heat[lo - 1] + (loop.heat[lo] - loop.heat[lo - 1]) * k;
  }

  function place(p) {
    const { loop } = p;
    const hide = focus && loop.rack !== focus && loop.cooler !== focus;
    const life = hide || p.age >= p.life ? 0 : Math.max(0, Math.min(1, p.age / FADE, (p.life - p.age) / FADE));
    // a newborn streak has no history yet: its tail grows out from the head over the first moments
    const step = Math.min(TRAIL_STEP, (p.age * p.speed) / (TRAIL_POINTS - 1));
    const heat = [];
    for (let j = 0; j < TRAIL_POINTS; j++) {
      const s = (((p.s - j * step) % loop.total) + loop.total) % loop.total; // tail lags behind the head
      heat.push(sample(p, j, s));
    }
    for (let j = 0; j < TRAIL_POINTS; j++) {
      // the tail sample has no next one, so it looks back past itself instead
      const next = j < TRAIL_POINTS - 1 ? trail[j + 1] : pos.copy(trail[j]).multiplyScalar(2).sub(trail[j - 1]);
      color.lerpColors(COLD, HOT, heat[j]);
      const alpha = life * OPACITY * profile(j / (TRAIL_POINTS - 1));
      for (let side = 0; side < 2; side++) {
        const v = (p.first + j) * 2 + side;
        trail[j].toArray(positions, v * 3);
        next.toArray(towards, v * 3);
        colors[v * 4] = color.r;
        colors[v * 4 + 1] = color.g;
        colors[v * 4 + 2] = color.b;
        colors[v * 4 + 3] = alpha;
      }
    }
  }

  function tick(dt) {
    for (const p of streaks) {
      p.age += dt;
      if (p.age >= p.life + p.gap) reborn(p);
      p.s = (p.s + p.speed * dt) % p.loop.total;
      place(p);
    }
    for (const name of ['position', 'toward', 'rgba']) geometry.attributes[name].needsUpdate = true;
  }
  tick(0);

  return {
    group,
    tick,
    // Focus on a rack or cooler (null = everything); returns false if the id has no airflow.
    setFocus(id) {
      focus = id && loops.some((l) => l.rack === id || l.cooler === id) ? id : null;
      tick(0);
      return focus !== null;
    },
    racksOf: (coolerId) => [...new Set(loops.filter((l) => l.cooler === coolerId).map((l) => l.rack))],
  };
}
