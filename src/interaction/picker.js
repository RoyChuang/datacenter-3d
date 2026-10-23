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

// Which faces of an axis-aligned box face the eye: [x-, x+, y-, y+, z-, z+].
function facesSeen(box, eye) {
  const { min, max } = box;
  return [eye.x < min.x, eye.x > max.x, eye.y < min.y, eye.y > max.y, eye.z < min.z, eye.z > max.z];
}

// The box edges seen from `eye`, as line-segment pairs. An edge is kept when at least one of the two faces
// it borders faces the eye; the edges behind the box itself (both faces turned away) are left out.
function visibleBoxEdges(box, eye) {
  const { min: a, max: b } = box;
  const seen = facesSeen(box, eye);
  const X = [a.x, b.x];
  const Y = [a.y, b.y];
  const Z = [a.z, b.z];
  const out = [];
  // face index for "x = X[i]" is i, "y = Y[j]" is 2 + j, "z = Z[k]" is 4 + k
  for (const j of [0, 1]) for (const k of [0, 1]) if (seen[2 + j] || seen[4 + k]) out.push(X[0], Y[j], Z[k], X[1], Y[j], Z[k]);
  for (const i of [0, 1]) for (const k of [0, 1]) if (seen[i] || seen[4 + k]) out.push(X[i], Y[0], Z[k], X[i], Y[1], Z[k]);
  for (const i of [0, 1]) for (const j of [0, 1]) if (seen[i] || seen[2 + j]) out.push(X[i], Y[j], Z[0], X[i], Y[j], Z[1]);
  return out;
}

// Hover outline + tooltip, click to select, double-click to focus. Drags (orbiting) don't count as clicks.
// `skip(root)` lets the view make some objects transparent to picks; meshes with `userData.pickAs` pick
// that object instead of themselves.
export function setupPicker({ camera, controls, scene, dom, targets, tooltip, onSelect, onFocus, requestRender, skip }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hoverBox = new THREE.BoxHelper(undefined, 0x3b82f6);
  hoverBox.visible = false;
  // Selection: a thick amber outline drawn on top of everything, so neighbours and walls never hide it.
  // Only the object's own back edges are left out (recomputed as the camera moves). Marked transparent so it
  // is drawn in the last pass, after see-through things such as ghosted cabinets and capacity columns.
  const selectBox = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: 0xf59e0b, linewidth: 3.5, depthTest: false, transparent: true }));
  selectBox.renderOrder = 30;
  selectBox.visible = false;
  let selectedBox = null;
  let seenKey = '';
  function updateOutline(force = false) {
    if (!selectedBox) return;
    const key = facesSeen(selectedBox, camera.position).join();
    if (!force && key === seenKey) return; // the set of visible edges only changes when a face turns
    seenKey = key;
    selectBox.geometry.dispose();
    selectBox.geometry = new LineSegmentsGeometry().setPositions(visibleBoxEdges(selectedBox, camera.position));
  }
  controls.addEventListener('change', () => updateOutline());
  scene.add(hoverBox, selectBox);

  let hovered = null;
  let selected = null;
  let interacting = false;
  let hoverFrame = null;
  let pendingPointer = null;

  function clearHover() {
    if (hoverFrame !== null) cancelAnimationFrame(hoverFrame);
    hoverFrame = null;
    pendingPointer = null;
    if (hoverBox.visible) requestRender();
    hovered = null;
    hoverBox.visible = false;
    dom.style.cursor = '';
    tooltip.classList.add('hidden');
  }
  controls.addEventListener('start', () => {
    interacting = true;
    clearHover();
  });
  controls.addEventListener('end', () => { interacting = false; });
  dom.addEventListener('pointerleave', clearHover);

  function hitTest(event) {
    const rect = dom.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(targets, true).filter((hit) => isShown(hit.object));
    // A stand-in (e.g. a capacity column inside a faded rack) is what the user is looking at, so it wins
    // over faded shells in front of it; walls still block it.
    for (const hit of hits) {
      if (hit.object.userData.occluder) break;
      if (hit.object.userData.pickAs) return pickRoot(hit.object.userData.pickAs);
    }
    for (const hit of hits) {
      const root = pickRoot(hit.object);
      if (root && !skip?.(root)) return root;
      if (hit.object.userData.occluder) return null; // a wall or door is in front
    }
    return null;
  }

  function updateHover(event) {
    const previous = hovered;
    hovered = hitTest(event);
    hoverBox.visible = !!hovered && hovered !== selected;
    if (previous !== hovered) {
      if (hoverBox.visible) hoverBox.setFromObject(hovered);
      requestRender();
    }
    dom.style.cursor = hovered ? 'pointer' : '';
    tooltip.classList.toggle('hidden', !hovered);
    if (hovered) {
      const { data, live } = hovered.userData.pick;
      tooltip.textContent = live ? `${data.id} · ${live.temp.toFixed(1)}°C` : data.id;
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
    }
  }

  // Trackpads can deliver several pointer events per frame. Only the latest position matters,
  // and orbiting/panning needs no hover raycast at all.
  dom.addEventListener('pointermove', (event) => {
    if (interacting || event.buttons) return;
    pendingPointer = { clientX: event.clientX, clientY: event.clientY };
    if (hoverFrame !== null) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = null;
      const pointer = pendingPointer;
      pendingPointer = null;
      if (pointer && !interacting) updateHover(pointer);
    });
  });

  let downAt = null;
  dom.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener('pointercancel', () => { downAt = null; clearHover(); });
  dom.addEventListener('pointerup', (e) => {
    const start = downAt;
    downAt = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
    const hit = hitTest(e);
    select(hit && hit === selected ? null : hit); // clicking the selection again deselects it
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) select(null); });
  dom.addEventListener('dblclick', (e) => {
    const object = hitTest(e);
    if (object) onFocus?.(object);
  });

  function select(object) {
    clearHover();
    selected = object;
    selectBox.visible = !!object;
    // exactly the model's bounds: the outline is drawn on top, so it needs no margin against z-fighting
    selectedBox = object ? new THREE.Box3().setFromObject(object) : null;
    updateOutline(true);
    hoverBox.visible = false;
    onSelect(object);
    requestRender();
  }

  return { select, get selected() { return selected; } };
}
