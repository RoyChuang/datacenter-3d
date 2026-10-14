import * as THREE from 'three';

// Data convention: (x, z) is the footprint centre in metres, origin at the plan's top-left,
// `width` runs along the row, `depth` is front-to-back, `facing` is where the front points.
const FACING_ROTATION = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };

export function placeOnFloor(object, item) {
  object.position.set(item.x, 0, item.z);
  object.rotation.y = FACING_ROTATION[item.facing ?? 'south'];
}

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Top-face label, drawn like the 2D plan (id in the middle of a coloured block).
// The text is counter-rotated by the unit's facing so it always reads upright in top view.
export function labelTexture(text, { width, depth, bg, fg = '#ffffff', facing = 'south' }) {
  const ppm = 200; // pixels per metre
  const angle = FACING_ROTATION[facing];
  return canvasTexture(Math.round(width * ppm), Math.round(depth * ppm), (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    const sideways = Math.abs(Math.sin(angle)) > 0.5;
    const [tw, th] = sideways ? [h, w] : [w, h];
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.min(tw / (text.length * 0.62), th * 0.55, 48);
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.fillText(text, 0, 0);
  });
}

// A box-shaped cabinet sitting on the floor. Local +Z is the front face.
// BoxGeometry material order: +x, -x, +y(top), -y(bottom), +z(front), -z(back)
export function cabinet({ width, depth, height, color, front, top, back }) {
  const side = () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 });
  const face = (map) => (map ? new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.3 }) : side());
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    [side(), side(), face(top), side(), face(front), face(back)],
  );
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Wrap a cabinet in a group placed in the room and tag it for picking.
export function unit(item, kind, mesh) {
  const group = new THREE.Group();
  group.name = item.id;
  group.add(mesh);
  placeOnFloor(group, item);
  mesh.userData.pick = { kind, data: item };
  return group;
}
