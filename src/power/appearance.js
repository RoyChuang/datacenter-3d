// Visual states for equipment and room while the power layer is on.

function materialsOf(group) {
  const out = [];
  group.traverse((o) => { if (o.isMesh) out.push(...[].concat(o.material)); });
  return out;
}

// Fade a unit back so the power chain stands out.
export function setGhost(group, on) {
  if (group.userData.ghost === on) return;
  group.userData.ghost = on;
  for (const m of materialsOf(group)) {
    m.transparent = on;
    m.opacity = on ? 0.15 : 1;
    m.depthWrite = !on;
    m.needsUpdate = true;
  }
}

// Mark a rack as supplied by the selection: only its roof lightens, so the colour stays with the cables.
// Cabinet meshes use BoxGeometry material order, where index 2 is the top face.
export function setSupplied(group, on) {
  group.traverse((o) => {
    if (!o.isMesh || !Array.isArray(o.material)) return;
    const top = o.material[2];
    top.emissive?.setHex(on ? 0x64748b : 0x000000);
  });
}

// Set every material in a group to `opacity`; 1 restores what it was before.
export function setFade(group, opacity) {
  for (const m of new Set(materialsOf(group))) {
    m.userData.base ??= { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
    const restore = opacity >= 1;
    m.transparent = restore ? m.userData.base.transparent : true;
    m.opacity = restore ? m.userData.base.opacity : Math.min(m.userData.base.opacity, opacity);
    m.depthWrite = restore ? m.userData.base.depthWrite : false;
    m.needsUpdate = true;
  }
}
