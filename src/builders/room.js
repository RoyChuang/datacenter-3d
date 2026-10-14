import * as THREE from 'three';
import { canvasTexture } from './common.js';

// Axis-aligned box from a footprint rectangle {x1,z1,x2,z2}.
function slab(rect, y0, height, material) {
  const w = Math.abs(rect.x2 - rect.x1);
  const d = Math.abs(rect.z2 - rect.z1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), material);
  mesh.position.set((rect.x1 + rect.x2) / 2, y0 + height / 2, (rect.z1 + rect.z2) / 2);
  mesh.name = rect.id ?? '';
  return mesh;
}

function raisedFloor(room) {
  const tile = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1d3a63');
    g.addColorStop(1, '#16304f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4d6f9c';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
  });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  tile.repeat.set(room.width / room.tileSize, room.depth / room.tileSize);
  // PlaneGeometry's v runs from the far edge, so shift to keep tile seams on multiples of tileSize
  tile.offset.y = (room.depth / room.tileSize) % 1;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({ map: tile, roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.width / 2, 0, room.depth / 2);
  floor.receiveShadow = true;
  return floor;
}

export function buildRoom(room, rackTopY) {
  const group = new THREE.Group();
  group.name = 'room';
  group.add(raisedFloor(room));

  const walls = new THREE.Group();
  walls.name = 'walls';
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9 });
  for (const w of room.walls) {
    const mesh = slab(w, 0, room.wallHeight, wallMat);
    mesh.castShadow = mesh.receiveShadow = true;
    walls.add(mesh);
  }

  const doorMat = new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.5 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9fdcff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false,
  });
  const frameMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  for (const d of room.doors) {
    const isGlass = d.kind === 'glass';
    const mesh = slab(d, 0, isGlass ? rackTopY : 2.1, isGlass ? glassMat : doorMat);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), frameMat));
    walls.add(mesh);
  }
  group.add(walls);

  // Glass roof over each contained aisle, flush with the rack tops.
  const containment = new THREE.Group();
  containment.name = 'containment';
  const roofMat = new THREE.MeshPhysicalMaterial({
    color: 0x7fd3ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
  });
  for (const c of room.containments) {
    const roof = slab(c, rackTopY, 0.02, roofMat);
    roof.add(new THREE.LineSegments(new THREE.EdgesGeometry(roof.geometry), new THREE.LineBasicMaterial({ color: 0x7fd3ff })));
    containment.add(roof);
  }
  group.add(containment);

  return { group, layers: { walls, containment } };
}
