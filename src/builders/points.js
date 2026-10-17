import * as THREE from 'three';

export const TEMP_LEVELS = [
  { max: 27, color: 0x34d17a, level: 'ok' },
  { max: 30, color: 0xf2b134, level: 'warn' },
  { max: Infinity, color: 0xff4d4d, level: 'alarm' },
];
export const tempLevel = (t) => TEMP_LEVELS.find((l) => t <= l.max);

const WHITE_PLASTIC = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.45, metalness: 0 });
const SENSOR_BODY = new THREE.BoxGeometry(0.08, 0.12, 0.035);
const SENSOR_LED = new THREE.SphereGeometry(0.007, 12, 8);

// Small white wall-mount sensor; only its status LED carries colour.
function sensorMesh(point) {
  const body = new THREE.Mesh(SENSOR_BODY, WHITE_PLASTIC);
  body.castShadow = true;
  const led = new THREE.Mesh(SENSOR_LED, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x34d17a, emissiveIntensity: 2 }));
  led.position.set(0.025, 0.045, 0.018);
  body.add(led);
  body.userData.led = led;
  body.position.set(point.x, point.y, point.z);
  return body;
}

function cameraMesh(point) {
  const group = new THREE.Group();
  const white = WHITE_PLASTIC;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 20), white);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20),
    new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.1, metalness: 0.8 }),
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

  // Apply a live reading { temp, humidity } to a sensor's status LED.
  function updateSensor(id, reading) {
    const mesh = sensorMeshes.get(id);
    if (!mesh) return;
    mesh.userData.pick.live = reading;
    mesh.userData.led.material.emissive.setHex(tempLevel(reading.temp).color);
  }

  return { layers: { sensors, cameras }, updateSensor };
}
