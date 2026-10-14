import * as THREE from 'three';

export const TEMP_LEVELS = [
  { max: 27, color: 0x34d17a, level: 'ok' },
  { max: 30, color: 0xf2b134, level: 'warn' },
  { max: Infinity, color: 0xff4d4d, level: 'alarm' },
];
export const tempLevel = (t) => TEMP_LEVELS.find((l) => t <= l.max);

function sensorMesh(point) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x222831, emissive: 0x34d17a, emissiveIntensity: 1.2 }),
  );
  mesh.position.set(point.x, point.y, point.z);
  return mesh;
}

function cameraMesh(point) {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 16), white);
  body.rotation.z = Math.PI / 2;
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2244ff, emissiveIntensity: 0.6 }),
  );
  lens.rotation.z = Math.PI / 2;
  lens.position.x = 0.12;
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25), white);
  mount.position.y = 0.14;
  group.add(body, lens, mount);
  group.position.set(point.x, point.y, point.z);
  group.rotation.z = -0.35; // tilt the lens down a little
  return group;
}

// Returns separate layers so the UI can toggle sensors / cameras independently.
export function buildPoints(points) {
  const sensors = new THREE.Group();
  sensors.name = 'sensors';
  const cameras = new THREE.Group();
  cameras.name = 'cameras';
  const sensorMeshes = new Map();

  for (const p of points) {
    if (p.type === 'sensor') {
      const mesh = sensorMesh(p);
      mesh.userData.pick = { kind: 'sensor', data: p };
      sensorMeshes.set(p.id, mesh);
      sensors.add(mesh);
    } else if (p.type === 'camera') {
      const cam = cameraMesh(p);
      const pick = { kind: 'camera', data: p };
      cam.traverse((o) => { o.userData.pick = pick; });
      cameras.add(cam);
    }
  }

  // Apply a live reading { temp, humidity } to a sensor's colour.
  function updateSensor(id, reading) {
    const mesh = sensorMeshes.get(id);
    if (!mesh) return;
    mesh.userData.pick.live = reading;
    mesh.material.emissive.setHex(tempLevel(reading.temp).color);
  }

  return { layers: { sensors, cameras }, updateSensor };
}
