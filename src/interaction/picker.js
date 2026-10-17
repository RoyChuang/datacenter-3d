import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

function isShown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// Climb to the outermost ancestor that shares the same pick record (e.g. a camera's group).
function pickRoot(object) {
  let o = object;
  while (!o.userData.pick && o.parent) o = o.parent;
  if (!o.userData.pick) return null;
  while (o.parent?.userData.pick === o.userData.pick) o = o.parent;
  return o;
}

// The 12 edges of a box as line-segment pairs.
function boxEdges(box) {
  const { min: a, max: b } = box;
  const c = [[a.x, a.y, a.z], [b.x, a.y, a.z], [b.x, a.y, b.z], [a.x, a.y, b.z], [a.x, b.y, a.z], [b.x, b.y, a.z], [b.x, b.y, b.z], [a.x, b.y, b.z]];
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return pairs.flatMap(([i, j]) => [...c[i], ...c[j]]);
}

// Hover outline + tooltip, click to select, double-click to focus. Drags (orbiting) don't count as clicks.
export function setupPicker({ camera, scene, dom, targets, tooltip, onSelect, onFocus, requestRender }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hoverBox = new THREE.BoxHelper(undefined, 0x3b82f6);
  hoverBox.visible = false;
  // Selection: a thick amber outline drawn on top of everything, so it stays visible behind walls and neighbours.
  const selectBox = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: 0xf59e0b, linewidth: 3.5, depthTest: false }));
  selectBox.renderOrder = 30;
  selectBox.visible = false;
  scene.add(hoverBox, selectBox);

  let hovered = null;
  let selected = null;

  function hitTest(event) {
    const rect = dom.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(targets, true)) {
      if (!isShown(hit.object)) continue;
      const root = pickRoot(hit.object);
      if (root) return root;
      if (hit.object.userData.occluder) return null; // a wall or door is in front
    }
    return null;
  }

  dom.addEventListener('pointermove', (event) => {
    hovered = hitTest(event);
    hoverBox.visible = !!hovered && hovered !== selected;
    if (hoverBox.visible) hoverBox.setFromObject(hovered);
    dom.style.cursor = hovered ? 'pointer' : '';
    requestRender();
    tooltip.classList.toggle('hidden', !hovered);
    if (hovered) {
      const { data, live } = hovered.userData.pick;
      tooltip.textContent = live ? `${data.id} · ${live.temp.toFixed(1)}°C` : data.id;
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
    }
  });

  let downAt = null;
  dom.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
    const hit = hitTest(e);
    select(hit && hit === selected ? null : hit); // clicking the selection again deselects it
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) select(null); });
  dom.addEventListener('dblclick', (e) => {
    const object = hitTest(e);
    if (object) onFocus?.(object);
  });

  function select(object) {
    selected = object;
    selectBox.visible = !!object;
    if (object) {
      const box = new THREE.Box3().setFromObject(object).expandByScalar(0.03);
      selectBox.geometry.dispose();
      selectBox.geometry = new LineSegmentsGeometry().setPositions(boxEdges(box));
    }
    hoverBox.visible = false;
    onSelect(object);
    requestRender();
  }

  return { select, get selected() { return selected; } };
}
