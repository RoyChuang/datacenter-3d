import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Renderer, camera, controls, lights and the render loop.
export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1424);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 2;
  controls.maxDistance = 60;

  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a2233, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(8, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
  scene.add(sun);

  // Smooth camera moves: ease for a fixed number of frames, then snap.
  // Damping fights the lerp near the end, so a distance threshold alone may never be reached.
  const FLIGHT_FRAMES = 45;
  let flight = null;
  function flyTo(target, position) {
    flight = { target: target.clone(), position: position?.clone(), frame: 0 };
  }
  controls.addEventListener('start', () => { flight = null; }); // user grabbed the camera

  const tickers = [];
  renderer.setAnimationLoop(() => {
    if (flight) {
      const last = ++flight.frame >= FLIGHT_FRAMES;
      const k = last ? 1 : 0.15;
      controls.target.lerp(flight.target, k);
      if (flight.position) camera.position.lerp(flight.position, k);
      if (last) flight = null;
    }
    controls.update();
    for (const fn of tickers) fn();
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { renderer, scene, camera, controls, flyTo, onTick: (fn) => tickers.push(fn) };
}
