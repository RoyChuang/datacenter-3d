import * as THREE from 'three';

// The original floor-plan image laid over the model at its calibrated scale,
// so the generated layout can be checked against the drawing in top view.
export function buildPlanOverlay(url, plan, tileSize, y, onLoad) {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 10;
  mesh.name = 'plan-overlay';

  new THREE.TextureLoader().load(url, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
    const metresPerPx = tileSize / plan.pxPerTile;
    const w = texture.image.width * metresPerPx;
    const h = texture.image.height * metresPerPx;
    const [ox, oz] = plan.originPx.map((v) => v * metresPerPx);
    mesh.scale.set(w, h, 1);
    mesh.position.set(w / 2 - ox, y, h / 2 - oz);
    onLoad?.();
  });
  return mesh;
}
