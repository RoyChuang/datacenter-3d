import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const BACKGROUND = 0xeef1f4;

// Renderer, camera, controls, lights and an on-demand render loop: a frame is drawn only when
// something changed (camera moved, data updated, a layer toggled ...), not continuously.
export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Nothing in the room moves, so the shadow map is rendered once (see refreshShadows) instead of every frame.
  renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  // Soft studio reflections for painted metal; computed once.
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.15;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 2;
  controls.maxDistance = 60;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xa9afb8, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Fit the shadow camera to the site (half-extent in metres) and re-render the shadow map.
  function refreshShadows(halfExtent) {
    if (halfExtent) {
      const s = halfExtent + 2;
      Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 });
      sun.shadow.camera.updateProjectionMatrix();
    }
    renderer.shadowMap.needsUpdate = true;
    requestRender();
  }

  let dirty = true;
  function requestRender() { dirty = true; }
  controls.addEventListener('change', requestRender);

  // Smooth camera moves: ease for a fixed number of frames, then snap.
  // Damping fights the lerp near the end, so a distance threshold alone may never be reached.
  const FLIGHT_FRAMES = 45;
  let flight = null;
  function flyTo(target, position) {
    flight = { target: target.clone(), position: position?.clone(), frame: 0 };
  }
  controls.addEventListener('start', () => { flight = null; }); // user grabbed the camera

  // Tickers run every frame and return true while they are animating something.
  const tickers = [];
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (flight) {
      const last = ++flight.frame >= FLIGHT_FRAMES;
      const k = last ? 1 : 0.15;
      controls.target.lerp(flight.target, k);
      if (flight.position) camera.position.lerp(flight.position, k);
      if (last) flight = null;
      dirty = true;
    }
    if (controls.update()) dirty = true; // true while damping is still moving the camera
    for (const fn of tickers) if (fn(dt)) dirty = true;
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    requestRender();
  });

  return { renderer, scene, camera, controls, flyTo, refreshShadows, requestRender, onTick: (fn) => tickers.push(fn) };
}
