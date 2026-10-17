// Visual states for equipment while the power layer is on.

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

// Tint a unit (e.g. racks supplied by the selected PDC); null removes the tint.
export function setTint(group, color) {
  for (const m of materialsOf(group)) {
    if (!m.emissive) continue;
    m.emissive.setHex(color ?? 0x000000);
    m.emissiveIntensity = color ? 0.35 : 1;
  }
}
