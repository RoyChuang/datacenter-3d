import * as THREE from 'three';
import './style.css';
import { createStage } from './scene/stage.js';
import { buildRoom } from './builders/room.js';
import { buildRack, rackHeight } from './builders/rack.js';
import { buildRowcool } from './builders/rowcool.js';
import { buildPdc } from './builders/pdc.js';
import { buildUps, buildBattery } from './builders/power.js';
import { buildPanel } from './builders/panel.js';
import { buildPowerLayer } from './power/topology.js';
import { setGhost, setTint } from './power/appearance.js';
import { buildPoints } from './builders/points.js';
import { buildPlanOverlay } from './builders/planOverlay.js';
import { setupPicker } from './interaction/picker.js';
import { createPanel } from './ui/panel.js';
import { startMockLive } from './live/mockLive.js';

// ---------- load the selected site (generated from sites/<id>/site.yaml) ----------
const generated = import.meta.glob('./generated/*/*.json', { eager: true, import: 'default' });
const planImages = import.meta.glob('../sites/*/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' });

const sites = {};
for (const [file, data] of Object.entries(generated)) {
  const [, id, name] = file.match(/generated\/([^/]+)\/([^/]+)\.json$/);
  (sites[id] ??= {})[name] = data;
}
const siteIds = Object.keys(sites).sort();
const requested = new URLSearchParams(location.search).get('site');
const siteId = sites[requested] ? requested : siteIds[0];
const data = sites[siteId];
if (!data?.room) {
  document.body.insertAdjacentHTML('beforeend', '<div class="hud" style="top:40%;left:50%;transform:translateX(-50%)">找不到案場資料，請執行 <code>npm run sites</code> 並查看錯誤訊息</div>');
  throw new Error('No compiled site data');
}
const { room, site } = data;
const types = data['equipment-types'];

document.title = `${site.name} · 3D`;
document.querySelector('.hud-title').textContent = site.name;
const siteSelect = document.getElementById('site-select');
siteSelect.classList.toggle('hidden', siteIds.length < 2);
siteSelect.innerHTML = siteIds.map((id) => `<option value="${id}">${sites[id].site.name}</option>`).join('');
siteSelect.value = siteId;
siteSelect.addEventListener('change', () => { location.search = `?site=${siteSelect.value}`; });

// ---------- build the scene ----------
const stage = createStage(document.getElementById('app'));
const { scene, camera, controls } = stage;

// Data uses plan coordinates (origin top-left); centre the whole site on the world origin.
const siteRoot = new THREE.Group();
siteRoot.position.set(-room.width / 2, 0, -room.depth / 2);
scene.add(siteRoot);

const rackTop = rackHeight({}, types.rack);
const { group: roomGroup, layers: roomLayers } = buildRoom(room, rackTop);
siteRoot.add(roomGroup);

const equipment = new THREE.Group();
equipment.name = 'equipment';
const units = new Map(); // id -> { group, item, top } for every piece of equipment
function addUnit(group, item, top) {
  units.set(item.id, { group, item, top });
  equipment.add(group);
}
for (const r of data.racks) addUnit(buildRack(r, types.rack, data['rack-devices'][r.id]), r, rackHeight(r, types.rack));
for (const c of data.rowcools) addUnit(buildRowcool(c, types.rowcool), c, types.rowcool.height);
for (const p of data.pdcs) addUnit(buildPdc(p, types.pdc), p, types.pdc.height);
for (const u of data.ups) addUnit(buildUps(u, types.ups), u, types.ups.height);
for (const b of data.batteries) addUnit(buildBattery(b, types.battery), b, types.battery.height);
for (const p of data.panels ?? []) addUnit(buildPanel(p, types.panel), p, types.panel.height + (types.panel.mount ?? 0));
siteRoot.add(equipment);

const pointSet = buildPoints(data.points);
siteRoot.add(pointSet.layers.sensors, pointSet.layers.cameras);

// Everything is static, so the shadow map only needs to be drawn once.
const span = Math.max(room.width, room.depth);
stage.refreshShadows(span / 2);

const layers = { ...roomLayers, ...pointSet.layers };

// ---------- power topology ----------
const powerLayer = data.power && buildPowerLayer(data.power, {
  anchorOf: (id) => {
    const u = units.get(id);
    return u ? new THREE.Vector3(u.item.x, u.top, u.item.z) : null;
  },
  labelOf: (id) => units.get(id)?.item.alias ?? id,
  itemOf: (id) => units.get(id)?.item,
});
let tinted = [];
function showPower(on) {
  // While the layer is on, everything outside the power chain fades back.
  for (const [id, u] of units) setGhost(u.group, on && !powerLayer.nodes.has(id));
  document.getElementById('power-legend').classList.toggle('hidden', !on);
  applyPowerSelection();
}
// Light up the selected object's power chain, redundant partner and the racks it supplies.
function applyPowerSelection() {
  for (const id of tinted) setTint(units.get(id).group, null);
  tinted = [];
  if (!powerLayer?.group.visible) return;
  const id = picker?.selected?.userData.pick.data.id;
  const racks = id ? powerLayer.highlight(id) : (powerLayer.clear(), null);
  for (const r of racks ?? []) {
    const u = units.get(r);
    if (!u) continue;
    setGhost(u.group, false);
    setTint(u.group, r === id ? null : 0x60a5fa);
    tinted.push(r);
  }
  // racks no longer highlighted go back to ghosted
  for (const [rid, u] of units) if (!powerLayer.nodes.has(rid) && !tinted.includes(rid)) setGhost(u.group, true);
}
if (powerLayer) {
  siteRoot.add(powerLayer.group);
  layers.power = powerLayer.group;
  const clock = new THREE.Clock();
  stage.onTick(() => { if (powerLayer.group.visible) powerLayer.tick(clock.getDelta()); else clock.getDelta(); });
}
const planUrl = site.plan && planImages[`../sites/${siteId}/${site.plan.image}`];
if (planUrl) {
  layers.plan = buildPlanOverlay(planUrl, site.plan, room.tileSize, rackTop + 0.1);
  siteRoot.add(layers.plan);
}

// ---------- selection + detail panel ----------
const panel = createPanel(document.getElementById('panel'), {
  onClose: () => picker.select(null),
  extra: (pick) => powerLayer?.section(pick.data.id) ?? '',
});
const picker = setupPicker({
  camera,
  scene,
  dom: stage.renderer.domElement,
  // walls are included only so they can block picks behind them
  targets: [equipment, pointSet.layers.sensors, pointSet.layers.cameras, roomLayers.walls],
  tooltip: document.getElementById('tooltip'),
  onSelect(object) {
    panel.show(object?.userData.pick ?? null);
    applyPowerSelection();
    if (!object) return;
    // Fly to the object, keeping the current viewing direction but no farther than 9m.
    const target = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(Math.min(offset.length(), 9));
    stage.flyTo(target, target.clone().add(offset));
  },
});

startMockLive(data.points, (id, reading) => {
  pointSet.updateSensor(id, reading);
  const sel = picker.selected?.userData.pick;
  if (sel?.data.id === id) panel.refresh(sel);
});

// ---------- toolbar ----------
document.querySelectorAll('[data-layer]').forEach((input) => {
  const layer = layers[input.dataset.layer];
  if (!layer) { input.closest('label').classList.add('hidden'); return; }
  layer.visible = input.checked;
  input.addEventListener('change', () => {
    layer.visible = input.checked;
    if (layer === powerLayer?.group) showPower(input.checked);
    stage.refreshShadows(); // hidden walls must not leave their shadows behind
  });
});

// Distance scales with the room so any site size fits the view.
const VIEWS = {
  persp: new THREE.Vector3(0, span * 0.75, span * 0.75),
  top: new THREE.Vector3(0, span * 1.2, 0.01),
};
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => stage.flyTo(new THREE.Vector3(), VIEWS[btn.dataset.view]));
});
camera.position.copy(VIEWS.persp);
controls.target.set(0, 0, 0);
controls.maxDistance = span * 3;

if (import.meta.env.DEV) window.__stage = stage;
