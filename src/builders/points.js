import * as THREE from 'three';

// color = LED in 3D, css = marker / badge background
export const TEMP_LEVELS = [
  { max: 27, color: 0x34d17a, css: '#16a34a', level: 'ok' },
  { max: 30, color: 0xf2b134, css: '#d97706', level: 'warn' },
  { max: Infinity, color: 0xff4d4d, css: '#dc2626', level: 'alarm' },
];
export const tempLevel = (t) => TEMP_LEVELS.find((l) => t <= l.max);

const WHITE_PLASTIC = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.45, metalness: 0 });
const SENSOR_BODY = new THREE.BoxGeometry(0.08, 0.12, 0.035);
const SENSOR_LED = new THREE.SphereGeometry(0.007, 12, 8);

// Floating status marker above a sensor. It keeps the same size on screen at any distance and is drawn
// on top, so the room's temperature state reads even from the overview. Normal sensors show only a
// small dot; warnings and alarms show their value, so the few that matter stand out.
const PILL_HEIGHT = 0.03; // fraction of the view height
const DOT_SIZE = 0.011;
function tempMarker() {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 48;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false }));
  sprite.center.set(0.5, 0); // anchored at its bottom edge, just above the sensor
  sprite.position.y = 0.1;
  // text = null draws just a dot
  sprite.userData.draw = (text, bg, priority = 0) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (text) {
      ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 20);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
      sprite.scale.set((PILL_HEIGHT * canvas.width) / canvas.height, PILL_HEIGHT, 1);
    } else {
      // dot centred in the canvas; scale keeps it round by using the canvas aspect
      ctx.arc(canvas.width / 2, canvas.height / 2, canvas.height / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
      sprite.scale.set((DOT_SIZE * canvas.width) / canvas.height, DOT_SIZE, 1);
    }
    sprite.renderOrder = 15 + priority; // alarms draw over warnings, warnings over dots
    texture.needsUpdate = true;
  };
  sprite.userData.draw(null, '#9ca3af');
  return sprite;
}

// Small white wall-mount sensor; only its status LED carries colour.
function sensorMesh(point) {
  const body = new THREE.Mesh(SENSOR_BODY, WHITE_PLASTIC);
  body.castShadow = true;
  const led = new THREE.Mesh(SENSOR_LED, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x34d17a, emissiveIntensity: 2 }));
  led.position.set(0.025, 0.045, 0.018);
  body.add(led);
  body.userData.led = led;
  const marker = tempMarker();
  body.add(marker);
  body.userData.marker = marker;
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
    const level = tempLevel(reading.temp);
    mesh.userData.led.material.emissive.setHex(level.color);
    const priority = TEMP_LEVELS.indexOf(level);
    mesh.userData.marker.userData.draw(priority ? `${reading.temp.toFixed(1)}°` : null, level.css, priority);
  }

  return { layers: { sensors, cameras }, updateSensor };
}
