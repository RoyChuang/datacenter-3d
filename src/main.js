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
import { setFade, setGhost, setSupplied } from './power/appearance.js';
import { buildHeatmap, SCALE, SCALE_MIN, SCALE_MAX } from './thermal/heatmap.js';
import { buildAirflow } from './thermal/airflow.js';
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
const units = new Map(); // id -> { group, item, top, type } for every piece of equipment
function addUnit(group, item, top, type) {
  units.set(item.id, { group, item, top, type });
  equipment.add(group);
}
for (const r of data.racks) addUnit(buildRack(r, types.rack, data['rack-devices'][r.id]), r, rackHeight(r, types.rack), 'rack');
for (const c of data.rowcools) addUnit(buildRowcool(c, types.rowcool), c, types.rowcool.height, 'rowcool');
for (const p of data.pdcs) addUnit(buildPdc(p, types.pdc), p, types.pdc.height, 'pdc');
for (const u of data.ups) addUnit(buildUps(u, types.ups), u, types.ups.height, 'ups');
for (const b of data.batteries) addUnit(buildBattery(b, types.battery), b, types.battery.height, 'battery');
for (const p of data.panels ?? []) addUnit(buildPanel(p, types.panel), p, types.panel.height + (types.panel.mount ?? 0), 'panel');
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
  kindOf: (id) => units.get(id)?.type,
});
// Run `step` while `object` is visible, at ~30 fps: smooth enough for moving dashes and arrows,
// and it keeps frames coming only while such a layer is shown.
function animateWhileVisible(object, step) {
  let elapsed = 0;
  stage.onTick((dt) => {
    if (!object.visible) return false;
    elapsed += dt;
    if (elapsed < 1 / 30) return false;
    step(elapsed);
    elapsed = 0;
    return true;
  });
}

let supplied = [];
// Layers that only add clutter in power view; hidden while it is on, then back to their checkbox state.
const HIDE_IN_POWER_VIEW = ['sensors', 'cameras', 'containment'];
function showPower(on) {
  // While the layer is on, everything outside the power chain fades back.
  for (const [id, u] of units) setGhost(u.group, on && !powerLayer.nodes.has(id));
  for (const name of HIDE_IN_POWER_VIEW) {
    layers[name].visible = !on && document.querySelector(`[data-layer="${name}"]`).checked;
  }
  setFade(roomLayers.walls, on ? 0.35 : 1);
  document.getElementById('power-legend').classList.toggle('hidden', !on);
  applyPowerSelection();
}
document.getElementById('power-show-all').addEventListener('click', () => picker.select(null));
// Light up the selected object's power chain, redundant partner and the racks it supplies.
function applyPowerSelection() {
  for (const id of supplied) setSupplied(units.get(id).group, false);
  supplied = [];
  if (!powerLayer?.group.visible) return;
  const id = picker?.selected?.userData.pick.data.id;
  document.getElementById('power-show-all').classList.toggle('hidden', !id);
  const racks = id ? powerLayer.highlight(id) : (powerLayer.clear(), null);
  for (const r of racks ?? []) {
    const u = units.get(r);
    if (!u) continue;
    setGhost(u.group, false);
    if (r !== id) setSupplied(u.group, true);
    supplied.push(r);
  }
  // racks no longer highlighted go back to ghosted
  for (const [rid, u] of units) if (!powerLayer.nodes.has(rid) && !supplied.includes(rid)) setGhost(u.group, true);
}
if (powerLayer) {
  siteRoot.add(powerLayer.group);
  layers.power = powerLayer.group;
  animateWhileVisible(powerLayer.group, (dt) => powerLayer.tick(dt));
}
// ---------- temperature heatmap ----------
// A horizontal slice at the sensors' mounting height, estimated from their live readings.
const sensorPoints = data.points.filter((p) => p.type === 'sensor');
const heatHeight = sensorPoints[0]?.y ?? 1.6;
const heat = buildHeatmap(room, sensorPoints, heatHeight);
siteRoot.add(heat.mesh);
layers.heat = heat.mesh;
const heatOn = () => heat.mesh.visible;
function showHeat(on) {
  // the map has to be seen through the racks, so all equipment fades back while it is on
  for (const u of units.values()) setGhost(u.group, on);
  for (const name of ['cameras', 'containment']) {
    layers[name].visible = !on && document.querySelector(`[data-layer="${name}"]`).checked;
  }
  setFade(roomLayers.walls, on ? 0.35 : 1);
  document.getElementById('heat-legend').classList.toggle('hidden', !on);
  if (on) heat.redraw();
}
const gradient = SCALE.map(([t, c]) => `${c} ${((t - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100}%`).join(', ');
document.querySelector('#heat-legend .heat-bar').style.background = `linear-gradient(to right, ${gradient})`;
document.querySelector('#heat-legend .legend-title').textContent = `溫度（離地 ${heatHeight} m）`;

// ---------- airflow ----------
const airflow = buildAirflow({
  containments: room.containments,
  racks: data.racks,
  coolers: data.rowcools,
  depth: { rack: types.rack.depth, rowcool: types.rowcool.depth },
});
siteRoot.add(airflow.group);
layers.airflow = airflow.group;
const airflowOn = () => airflow.group.visible;
const isCooler = (id) => data.rowcools.some((c) => c.id === id);
function showAirflow(on) {
  // racks fade so the arrows show through them; the coolers driving the flow stay solid
  for (const [id, u] of units) setGhost(u.group, on && !isCooler(id));
  layers.cameras.visible = !on && document.querySelector('[data-layer="cameras"]').checked;
  setFade(roomLayers.walls, on ? 0.35 : 1);
  document.getElementById('airflow-legend').classList.toggle('hidden', !on);
  applyAirflowSelection();
}
// Selecting a rack or cooler narrows the arrows to the loops it takes part in.
function applyAirflowSelection() {
  airflow.setFocus(airflowOn() ? picker?.selected?.userData.pick.data.id ?? null : null);
}
animateWhileVisible(airflow.group, (dt) => airflow.tick(dt));

const planUrl = site.plan && planImages[`../sites/${siteId}/${site.plan.image}`];
if (planUrl) {
  layers.plan = buildPlanOverlay(planUrl, site.plan, room.tileSize, rackTop + 0.1, stage.requestRender);
  siteRoot.add(layers.plan);
}

// ---------- selection + detail panel ----------
// ---------- focusing on a piece of equipment ----------
const FACING_DIR = {
  north: new THREE.Vector3(0, 0, -1), south: new THREE.Vector3(0, 0, 1),
  east: new THREE.Vector3(1, 0, 0), west: new THREE.Vector3(-1, 0, 0),
};
// Double-click focus: stand straight in front of the equipment. Front faces usually open onto a narrow
// aisle, so whatever stands between the camera and the face (the opposite row) is ghosted — a cutaway —
// until the selection changes.
const FOCUS_DISTANCE = 3.2;
let cutaway = [];
function unitOf(object) {
  let o = object;
  while (o.parent && o.parent !== equipment) o = o.parent;
  return o.parent === equipment ? o : null;
}
function clearCutaway() {
  // back to whatever the active analysis view wants
  for (const g of cutaway) setGhost(g, heatOn() || (airflowOn() && !isCooler(g.name)));
  cutaway = [];
}
// Boxes the camera must not end up inside (equipment and solid walls), computed once.
let solids = null;
function insideSolid(p) {
  solids ??= [...equipment.children, ...roomLayers.walls.children.filter((m) => m.userData.occluder)]
    .map((o) => new THREE.Box3().setFromObject(o).expandByScalar(0.15));
  return solids.some((b) => b.containsPoint(p));
}
function frontView(object, face, front) {
  // back off from the ideal distance until the camera stands in free space (e.g. the gap between two rows)
  let eye;
  for (let d = FOCUS_DISTANCE; d >= 1.2; d -= 0.1) {
    eye = face.clone().addScaledVector(front, d).setY(1.6);
    if (!insideSolid(eye)) break;
  }
  // Ghost everything standing between the camera and the face, across the width of the view.
  const self = unitOf(object);
  const side = new THREE.Vector3(front.z, 0, -front.x);
  const depth = eye.clone().sub(face).dot(front);
  const offset = new THREE.Vector3();
  for (const unit of equipment.children) {
    if (unit === self) continue;
    new THREE.Box3().setFromObject(unit).getCenter(offset).sub(face);
    const along = offset.dot(front);
    if (along > 0.1 && along < depth + 0.3 && Math.abs(offset.dot(side)) < 2.2) cutaway.push(unit);
  }
  for (const g of cutaway) setGhost(g, true);
  return eye;
}

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
  requestRender: stage.requestRender,
  onSelect(object) {
    clearCutaway();
    panel.show(object?.userData.pick ?? null);
    applyPowerSelection(); // after the cutaway is cleared, so power-view ghosting is re-applied on top
    applyAirflowSelection();
  },
  // Selecting leaves the camera alone; only a double-click flies in.
  onFocus(object) {
    document.getElementById('tooltip').classList.add('hidden'); // the camera moves away from the cursor
    const box = new THREE.Box3().setFromObject(object);
    const target = box.getCenter(new THREE.Vector3());
    const front = FACING_DIR[object.userData.pick?.data.facing];
    if (front) {
      // look at the middle of the front face rather than the inside of the cabinet
      const half = Math.abs(front.x) ? (box.max.x - box.min.x) / 2 : (box.max.z - box.min.z) / 2;
      const face = target.clone().addScaledVector(front, half).setY(1.1);
      stage.flyTo(face, frontView(object, face, front));
      return;
    }
    // No front (sensors, cameras): keep the current viewing direction, but no farther than 9m.
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(Math.min(offset.length(), 9));
    stage.flyTo(target, target.clone().add(offset));
  },
});

startMockLive(data.points, (id, reading) => {
  pointSet.updateSensor(id, reading);
  heat.set(id, reading.temp);
  stage.requestRender();
  const sel = picker.selected?.userData.pick;
  if (sel?.data.id === id) panel.refresh(sel);
});

// ---------- toolbar ----------
// Analysis views each take over the scene, so only one can be on at a time.
const ANALYSIS = { power: (on) => showPower(on), heat: (on) => showHeat(on), airflow: (on) => showAirflow(on) };
document.querySelectorAll('[data-layer]').forEach((input) => {
  const name = input.dataset.layer;
  const layer = layers[name];
  if (!layer) { input.closest('label').classList.add('hidden'); return; }
  layer.visible = input.checked;
  input.addEventListener('change', () => {
    if (input.checked && ANALYSIS[name]) {
      for (const other of Object.keys(ANALYSIS)) {
        const box = document.querySelector(`[data-layer="${other}"]`);
        if (other === name || !box?.checked) continue;
        box.checked = false;
        layers[other].visible = false;
        ANALYSIS[other](false);
      }
    }
    layer.visible = input.checked;
    ANALYSIS[name]?.(input.checked);
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
