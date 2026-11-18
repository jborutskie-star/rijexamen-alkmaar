// Cross-sections along +x. Each row is [x, centre height, vertical radius, half width].
// Keep the UV seam on the belly and smooth the ridges between neighbouring sections.
import * as THREE from 'three';

export function loft(rows, sides = 8, paint) {
  const positions = [], normals = [], uvs = [], colours = [], tint = new THREE.Color();
  const last = rows.length - 1, start = rows[0][0], length = rows[last][0] - start;
  const ring = rows.map(([x, y, ry, rz], i) => {
    const a = rows[Math.max(0, i - 1)], b = rows[Math.min(last, i + 1)];
    return Array.from({ length: sides + 1 }, (_, j) => {
      const angle = j / sides * 2 * Math.PI, c = Math.cos(angle), s = Math.sin(angle);
      const n = new THREE.Vector3(((b[1] - a[1]) - (b[2] - a[2]) * c) * rz * c - (b[3] - a[3]) * ry * s * s,
        -(b[0] - a[0]) * rz * c, (b[0] - a[0]) * ry * s);
      if (!ry && !rz) n.set(i ? 1 : -1, 0, 0);
      n.normalize();
      return [[x, y - ry * c, rz * s], n.toArray(), [(x - start) / length, j / sides]];
    });
  });
  for (let i = 0; i < last; i++) for (let j = 0; j < sides; j++) {
    const p = ring[i], q = ring[i + 1], verts = [];
    if (rows[i + 1][2]) verts.push(p[j], q[j], q[j + 1]);
    if (rows[i][2]) verts.push(p[j], q[j + 1], p[j + 1]);
    if (paint) tint.set(paint(i, j));
    for (const [point, normal, uv] of verts) {
      positions.push(...point); normals.push(...normal); uvs.push(...uv);
      if (paint) colours.push(tint.r, tint.g, tint.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (paint) g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return g;
}

// A broad spatulate bill with a dark nail and a duskier lower mandible, all one skin.
export function duckBill(length, width, height, pale = false) {
  const colours = pale ? ['#fbac36', '#d7781b', '#a25a25'] : ['#e8b33c', '#bd7e24', '#655338'];
  return loft([[0, 0, .27, .32], [.21, .04, .45, .47], [.65, -.03, .33, .51], [.89, -.03, .23, .40], [1, 0, 0, 0]], 8,
    (i, j) => i === 3 ? colours[2] : j < 2 || j > 5 ? colours[1] : colours[0]).scale(length, height, width);
}
