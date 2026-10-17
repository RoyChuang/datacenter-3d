import * as THREE from 'three';

// Schematic airflow for cold-aisle containment with in-row cooling:
//   cooler front -> cold aisle -> rack front -> (heated in the rack) -> rack rear -> back of the row
//   -> cooler rear -> (cooled in the cooler) -> cooler front
// Derived from the layout only; it is not a CFD result.

const COLD = new THREE.Color('#3b82f6');
const HOT = new THREE.Color('#ef4444');
const HEIGHTS = [0.7, 1.5]; // one loop per height, so the flow covers the cabinet face
const PER_LOOP = 4; // mist puffs travelling each loop
// Each puff is a dense head followed by fainter, smaller trailing blobs, so the flow direction reads
// at a glance. Kept to ~2,000 points in total; tails are small, so the pixel cost stays low too.
const TRAIL = [ // [size m, opacity] from head to tail
  [0.42, 0.45],
  [0.34, 0.28],
  [0.26, 0.16],
  [0.19, 0.08],
];
const TRAIL_GAP = 0.2; // m between blobs of one puff — far enough apart that the tail reads as a tail
const DRIFT = 0.25; // m — how far a puff may sit off its loop
const SPEED = 0.8; // m/s along the loop

// A round, soft-edged blob used for every puff.
function puffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
const FACING_DIR = {
  north: new THREE.Vector3(0, 0, -1), south: new THREE.Vector3(0, 0, 1),
  east: new THREE.Vector3(1, 0, 0), west: new THREE.Vector3(-1, 0, 0),
};

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

    for (const rack of racks.filter((r) => rows.has(r.row))) {
      // nearest cooler in the same row, otherwise the nearest one across the aisle
      const sameRow = aisleCoolers.filter((c) => c.row === rack.row);
      const pool = sameRow.length ? sameRow : aisleCoolers;
      const cooler = pool.reduce((a, b) => (Math.abs(along(b) - along(rack)) < Math.abs(along(a) - along(rack)) ? b : a));
      const f = FACING_DIR[rack.facing];
      const fc = FACING_DIR[cooler.facing];
      if (!f || !fc) continue;

      for (const h of HEIGHTS) {
        const r = new THREE.Vector3(rack.x, h, rack.z);
        const c = new THREE.Vector3(cooler.x, h, cooler.z);
        const coolerFront = c.clone().addScaledVector(fc, depth.rowcool / 2 + 0.05);
        const rackRear = r.clone().addScaledVector(f, -(depth.rack / 2 + 0.05));
        const points = [
          [coolerFront, 0],
          [onCentre(along(cooler), h), 0],
          [onCentre(along(rack), h), 0],
          [r.clone().addScaledVector(f, depth.rack / 2 + 0.05), 0],
          [rackRear, 1],
          [rackRear.clone().addScaledVector(f, -0.5), 1],
          [c.clone().addScaledVector(fc, -(depth.rowcool / 2 + 0.55)), 1],
          [c.clone().addScaledVector(fc, -(depth.rowcool / 2 + 0.05)), 1],
          [coolerFront, 0],
        ];
        const lengths = [0];
        for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i][0].distanceTo(points[i - 1][0]));
        loops.push({ rack: rack.id, cooler: cooler.id, points, lengths, total: lengths[lengths.length - 1] });
      }
    }
  }

  // ---------- mist ----------
  const blobs = TRAIL.length;
  const count = loops.length * PER_LOOP * blobs;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  for (let i = 0; i < count; i++) [sizes[i], alphas[i]] = TRAIL[i % blobs]; // fixed per blob, uploaded once
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  // Points with per-point size (metres, perspective-scaled) and opacity — PointsMaterial has neither.
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: puffTexture() }, scale: { value: 1 } },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      attribute vec3 color;
      uniform float scale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float a = texture2D(map, gl_PointCoord).a * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  // pixels per metre at distance 1, from the current viewport and field of view
  points.onBeforeRender = (renderer, scene, camera) => {
    material.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };

  const particles = [];
  loops.forEach((loop, li) => {
    for (let k = 0; k < PER_LOOP; k++) {
      particles.push({
        loop,
        s: ((k + Math.random()) / PER_LOOP) * loop.total,
        // fixed random drift away from the loop, so puffs spread into a soft band
        drift: new THREE.Vector3((Math.random() - 0.5) * DRIFT, (Math.random() - 0.5) * DRIFT, (Math.random() - 0.5) * DRIFT),
        first: (li * PER_LOOP + k) * blobs,
      });
    }
  });

  const group = new THREE.Group();
  group.name = 'airflow';
  group.visible = false;
  group.add(points);

  const pos = new THREE.Vector3();
  const color = new THREE.Color();
  let focus = null; // show only loops involving this rack / cooler

  // Write the point at distance `s` along `loop` into slot `index`.
  function write(loop, s, drift, index) {
    let i = 1;
    while (i < loop.lengths.length - 1 && s > loop.lengths[i]) i++;
    const [a, ta] = loop.points[i - 1];
    const [b, tb] = loop.points[i];
    const k = (s - loop.lengths[i - 1]) / (loop.lengths[i] - loop.lengths[i - 1] || 1);
    pos.lerpVectors(a, b, k).add(drift);
    color.lerpColors(COLD, HOT, ta + (tb - ta) * k);
    const o = index * 3;
    positions[o] = pos.x;
    positions[o + 1] = pos.y;
    positions[o + 2] = pos.z;
    colors[o] = color.r;
    colors[o + 1] = color.g;
    colors[o + 2] = color.b;
  }

  function place(p) {
    const { loop } = p;
    const hide = focus && loop.rack !== focus && loop.cooler !== focus;
    for (let b = 0; b < blobs; b++) {
      if (hide) { positions[(p.first + b) * 3 + 1] = -1000; continue; } // parked out of sight
      const s = (((p.s - b * TRAIL_GAP) % loop.total) + loop.total) % loop.total; // tail lags behind the head
      write(loop, s, p.drift, p.first + b);
    }
  }

  function tick(dt) {
    for (const p of particles) {
      p.s = (p.s + SPEED * dt) % p.loop.total;
      place(p);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
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
