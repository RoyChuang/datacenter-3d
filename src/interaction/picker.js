import * as THREE from 'three';

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

// Hover outline + tooltip, click to select. Drags (orbiting) don't count as clicks.
export function setupPicker({ camera, scene, dom, targets, tooltip, onSelect }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hoverBox = new THREE.BoxHelper(undefined, 0x3b82f6);
  const selectBox = new THREE.BoxHelper(undefined, 0xf59e0b);
  hoverBox.visible = selectBox.visible = false;
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
    tooltip.classList.toggle('hidden', !hovered);
    if (hovered) {
      tooltip.textContent = hovered.userData.pick.data.id;
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
    }
  });

  let downAt = null;
  dom.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
    select(hitTest(e));
  });

  function select(object) {
    selected = object;
    selectBox.visible = !!object;
    if (object) selectBox.setFromObject(object);
    hoverBox.visible = false;
    onSelect(object);
  }

  return { select, get selected() { return selected; } };
}
