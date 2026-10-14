import * as THREE from 'three';
import './style.css';
import { createStage } from './scene/stage.js';
import { buildRoom } from './builders/room.js';
import { buildRack, rackHeight } from './builders/rack.js';
import { buildRowcool } from './builders/rowcool.js';
import { buildPdc } from './builders/pdc.js';
import { buildUps, buildBattery } from './builders/power.js';
import { buildPoints } from './builders/points.js';
import { setupPicker } from './interaction/picker.js';
import { createPanel } from './ui/panel.js';
import { startMockLive } from './live/mockLive.js';

import room from './data/room.json';
import types from './data/equipment-types.json';
import racks from './data/racks.json';
import rackDevices from './data/rack-devices.json';
import rowcools from './data/rowcools.json';
import pdcs from './data/pdcs.json';
import ups from './data/ups.json';
import batteries from './data/batteries.json';
import points from './data/points.json';

const stage = createStage(document.getElementById('app'));
const { scene, camera, controls } = stage;

// Data uses plan coordinates (origin top-left); centre the whole site on the world origin.
const site = new THREE.Group();
site.position.set(-room.width / 2, 0, -room.depth / 2);
scene.add(site);

const { group: roomGroup, layers: roomLayers } = buildRoom(room, rackHeight({}, types.rack));
site.add(roomGroup);

const equipment = new THREE.Group();
equipment.name = 'equipment';
for (const r of racks) equipment.add(buildRack(r, types.rack, rackDevices[r.id]));
for (const c of rowcools) equipment.add(buildRowcool(c, types.rowcool));
for (const p of pdcs) equipment.add(buildPdc(p, types.pdc));
for (const u of ups) equipment.add(buildUps(u, types.ups));
for (const b of batteries) equipment.add(buildBattery(b, types.battery));
site.add(equipment);

const pointSet = buildPoints(points);
site.add(pointSet.layers.sensors, pointSet.layers.cameras);

// ---------- selection + detail panel ----------
const panel = createPanel(document.getElementById('panel'), { onClose: () => picker.select(null) });
const picker = setupPicker({
  camera,
  scene,
  dom: stage.renderer.domElement,
  targets: [equipment, pointSet.layers.sensors, pointSet.layers.cameras],
  tooltip: document.getElementById('tooltip'),
  onSelect(object) {
    panel.show(object?.userData.pick ?? null);
    if (!object) return;
    // Fly to the object, keeping the current viewing direction but no farther than 9m.
    const target = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(Math.min(offset.length(), 9));
    stage.flyTo(target, target.clone().add(offset));
  },
});

startMockLive(points, (id, reading) => {
  pointSet.updateSensor(id, reading);
  const sel = picker.selected?.userData.pick;
  if (sel?.data.id === id) panel.refresh(sel);
});

// ---------- toolbar ----------
const layers = { ...roomLayers, ...pointSet.layers };
document.querySelectorAll('[data-layer]').forEach((input) => {
  input.addEventListener('change', () => { layers[input.dataset.layer].visible = input.checked; });
});

const VIEWS = {
  persp: new THREE.Vector3(0, 15, 15),
  top: new THREE.Vector3(0, 24, 0.01),
};
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => stage.flyTo(new THREE.Vector3(), VIEWS[btn.dataset.view]));
});
camera.position.copy(VIEWS.persp);
controls.target.set(0, 0, 0);

if (import.meta.env.DEV) window.__stage = stage;
