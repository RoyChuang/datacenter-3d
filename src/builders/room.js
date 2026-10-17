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
    walls.add(mesh);
  }

  const doorMat = new THREE.MeshStandardMaterial({ color: 0xbcc3cb, roughness: 0.45, metalness: 0.35 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe3f0f6, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, depthWrite: false,
  });
  const frameMat = new THREE.LineBasicMaterial({ color: 0x8a939d }); // brushed aluminium frame
  for (const d of room.doors) {
    const isGlass = d.kind === 'glass';
    const mesh = slab(d, 0, isGlass ? rackTopY : 2.1, isGlass ? glassMat : doorMat);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), frameMat));
    if (!isGlass) mesh.castShadow = mesh.receiveShadow = true;
    walls.add(mesh);
  }
  group.add(walls);

  // Glass roof over each contained aisle, flush with the rack tops.
  const containment = new THREE.Group();
  containment.name = 'containment';
  for (const c of room.containments) {
    const roof = slab(c, rackTopY, 0.02, glassMat);
    roof.add(new THREE.LineSegments(new THREE.EdgesGeometry(roof.geometry), frameMat));
    containment.add(roof);
  }
  group.add(containment);

  return { group, layers: { walls, containment } };
}
