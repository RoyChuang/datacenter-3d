import * as THREE from 'three';
import { canvasTexture } from './common.js';

const FLOOR = '#cdd2d8';
const SEAM = '#a2a9b2';

// Axis-aligned box from a footprint rectangle {x1,z1,x2,z2}.
function slab(rect, y0, height, material) {
  const w = Math.abs(rect.x2 - rect.x1);
  const d = Math.abs(rect.z2 - rect.z1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), material);
  mesh.position.set((rect.x1 + rect.x2) / 2, y0 + height / 2, (rect.z1 + rect.z2) / 2);
  mesh.name = rect.id ?? '';
  return mesh;
}

// One raised-floor tile; `perforated` adds the airflow holes used in cold aisles.
function tileTexture(perforated) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = FLOOR;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e6e9ec'; // bevel highlight
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.strokeStyle = SEAM;
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, w, h);
    if (perforated) {
      ctx.fillStyle = '#8d949c';
      for (let y = 24; y < h - 16; y += 14) {
        for (let x = 24; x < w - 16; x += 14) {
          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
}

// A tiled plane over rect, with tile seams kept on multiples of tileSize (plan coordinates).
function tiledPlane(rect, tileSize, texture, y) {
  const w = rect.x2 - rect.x1;
  const d = rect.z2 - rect.z1;
  const map = texture.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(w / tileSize, d / tileSize);
  // PlaneGeometry's u starts at x1 and v at the far edge z2
  map.offset.set((rect.x1 / tileSize) % 1, (((-rect.z2 / tileSize) % 1) + 1) % 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0.05 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(rect.x1 + w / 2, y, rect.z1 + d / 2);
  mesh.receiveShadow = true;
  return mesh;
}

const DOOR_HEIGHT = 2.1;
const MATERIALS = {
  frame: new THREE.MeshStandardMaterial({ color: 0x7e8791, roughness: 0.4, metalness: 0.6 }), // powder-coated steel / aluminium
  leaf: new THREE.MeshStandardMaterial({ color: 0xc9cfd6, roughness: 0.45, metalness: 0.35 }), // steel door leaf
  handle: new THREE.MeshStandardMaterial({ color: 0xc3c9d0, roughness: 0.25, metalness: 0.9 }),
  vision: new THREE.MeshStandardMaterial({ color: 0x2b3640, roughness: 0.1, metalness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xe3f0f6, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, depthWrite: false }),
};

// A door built in its own frame: length along local X, wall thickness along local Z.
function doorAssembly(rect, { glass, sliding, height, wallHeight, wallMat }) {
  const alongX = rect.x2 - rect.x1 >= rect.z2 - rect.z1;
  const len = alongX ? rect.x2 - rect.x1 : rect.z2 - rect.z1;
  const thick = alongX ? rect.z2 - rect.z1 : rect.x2 - rect.x1;
  const group = new THREE.Group();
  group.name = rect.id ?? '';
  group.position.set((rect.x1 + rect.x2) / 2, 0, (rect.z1 + rect.z2) / 2);
  if (!alongX) group.rotation.y = Math.PI / 2;

  const box = (w, h, d, material, x, y, z = 0, shadow = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = shadow;
    mesh.userData.occluder = material !== MATERIALS.glass; // solid parts block picking
    group.add(mesh);
    return mesh;
  };

  if (glass) {
    // Aluminium-framed glass; wide openings get a centre mullion like a pair of sliding doors.
    const f = 0.04;
    box(len - f * 2, height - f * 2, 0.012, MATERIALS.glass, 0, height / 2, 0, false);
    box(f, height, f, MATERIALS.frame, -len / 2 + f / 2, height / 2);
    box(f, height, f, MATERIALS.frame, len / 2 - f / 2, height / 2);
    box(len, f, f, MATERIALS.frame, 0, height - f / 2);
    box(len, f, f, MATERIALS.frame, 0, f / 2);
    if (len > 0.9) box(f * 0.75, height - f * 2, f, MATERIALS.frame, 0, height / 2);
    // containment doors get vertical pull handles on both faces; plain glass partitions don't
    if (sliding) {
      const hx = len > 0.9 ? -0.08 : len / 2 - 0.1;
      for (const side of [1, -1]) box(0.025, 0.35, 0.025, MATERIALS.handle, hx, 1.05, side * 0.03);
    }
    return group;
  }

  // Wall above the opening, then frame, leaves, handles and vision panels.
  if (wallHeight > height) box(len, wallHeight - height, thick, wallMat, 0, height + (wallHeight - height) / 2);
  const f = 0.06;
  const frameDepth = thick + 0.02;
  box(f, height, frameDepth, MATERIALS.frame, -len / 2 + f / 2, height / 2);
  box(f, height, frameDepth, MATERIALS.frame, len / 2 - f / 2, height / 2);
  box(len, f, frameDepth, MATERIALS.frame, 0, height - f / 2);

  const opening = len - f * 2;
  const leaves = opening > 1.4 ? 2 : 1;
  const leafW = opening / leaves - 0.006;
  const leafH = height - f - 0.01;
  const leafT = 0.05;
  for (let i = 0; i < leaves; i++) {
    const x = -opening / 2 + (opening / leaves) * (i + 0.5);
    box(leafW, leafH, leafT, MATERIALS.leaf, x, leafH / 2 + 0.005);
    // handle sits at the meeting edge of a pair, otherwise at the right-hand edge
    const edge = leaves === 2 ? (i === 0 ? 1 : -1) : 1;
    const hx = x + edge * (leafW / 2 - 0.09);
    for (const side of [1, -1]) {
      box(0.04, 0.04, 0.03, MATERIALS.handle, hx, 1.05, side * (leafT / 2 + 0.015)); // rose
      box(0.14, 0.02, 0.02, MATERIALS.handle, hx - edge * 0.06, 1.05, side * (leafT / 2 + 0.035)); // lever
    }
    box(0.14, 0.55, leafT + 0.004, MATERIALS.vision, x - edge * 0.12, 1.5, 0, false); // narrow vision panel
  }
  return group;
}

export function buildRoom(room, rackTopY) {
  const group = new THREE.Group();
  group.name = 'room';

  // Building slab around the room so the floor doesn't float in the void.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width * 4, room.depth * 4),
    new THREE.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(room.width / 2, -0.01, room.depth / 2);
  ground.receiveShadow = true;
  group.add(ground);

  group.add(tiledPlane({ x1: 0, z1: 0, x2: room.width, z2: room.depth }, room.tileSize, tileTexture(false), 0));
  // Perforated tiles in the contained (cold) aisles
  const perforated = tileTexture(true);
  for (const c of room.containments) group.add(tiledPlane(c, room.tileSize, perforated, 0.002));

  const walls = new THREE.Group();
  walls.name = 'walls';
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe4e2de, roughness: 0.92 });
  for (const w of room.walls) {
    const mesh = slab(w, 0, room.wallHeight, wallMat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.occluder = true;
    walls.add(mesh);
  }

  for (const d of room.doors) {
    const sliding = d.kind === 'sliding';
    const glass = sliding || d.kind === 'glass';
    walls.add(doorAssembly(d, { glass, sliding, height: glass ? rackTopY : DOOR_HEIGHT, wallHeight: room.wallHeight, wallMat }));
  }
  group.add(walls);

  // Glass roof over each contained aisle, flush with the rack tops.
  const containment = new THREE.Group();
  containment.name = 'containment';
  const roofFrame = new THREE.LineBasicMaterial({ color: 0x7e8791 });
  for (const c of room.containments) {
    const roof = slab(c, rackTopY, 0.02, MATERIALS.glass);
    roof.add(new THREE.LineSegments(new THREE.EdgesGeometry(roof.geometry), roofFrame));
    containment.add(roof);
  }
  // Nested under the walls, so the walls / doors checkbox shows and hides the roofs too.
  walls.add(containment);

  return { group, layers: { walls, containment } };
}
