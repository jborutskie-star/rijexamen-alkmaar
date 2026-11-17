// Landmarks and props for round 3: the Grote Kerk, Molen van Piet, canal boats, water life, the cheese market, street and roof furniture.
// One-off models return a THREE.Group (a few meshes); instanced props return one fused, vertex-coloured BufferGeometry (position, normal, color).
// Metres; x east, z south, y up. Geometry builds without a DOM (node): textures are only made when `document` exists.
import * as THREE from 'three';
import { fuse, canvasTex, bikeGeo } from './world.js';

const { PI, sin, cos, hypot, min, max, atan2, abs, sqrt } = Math;
const HAS_DOM = typeof document !== 'undefined';
const C = (h) => new THREE.Color(h);
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, s = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const Cone = (r, h, s = 8, open = false) => new THREE.ConeGeometry(r, h, s, 1, open);
const Sph = (r, w = 8, h = 6, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const Tor = (r, t, rs = 4, ts = 12, arc = PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
const Lathe = (pts, seg = 12, a0 = 0, len = PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, a0, len);
// an outline ([x, y] pairs) pushed out along z, centred on z
const ext = (pts, depth) => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
const raw = (P, N) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return g; };
const ccw = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; } return a < 0 ? [...pts].reverse() : pts; };
// a convex outline standing `d` proud of the plane z = 0: front face and edges only (the back is against a wall)
const slab = (pts, d) => {
  pts = ccw(pts); const P = [], N = [], n = pts.length;
  for (let i = 1; i + 1 < n; i++) for (const q of [pts[0], pts[i], pts[i + 1]]) { P.push(q[0], q[1], d); N.push(0, 0, 1); }
  for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n], l = hypot(x1 - x0, y1 - y0) || 1; for (const q of [[x0, y0, 0], [x1, y1, 0], [x1, y1, d], [x0, y0, 0], [x1, y1, d], [x0, y0, d]]) { P.push(...q); N.push((y1 - y0) / l, -(x1 - x0) / l, 0); } }
  return raw(P, N);
};
// a frame between two outlines with the same number of points, `d` proud of z = 0: front, outer edge and the reveal of the opening
const ring = (O, I, d) => {
  const P = [], N = [], n = O.length, put = (a, nx, ny, nz) => { for (const q of a) { P.push(...q); N.push(nx, ny, nz); } };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, o0 = O[i], o1 = O[j], i0 = I[i], i1 = I[j];
    put([[o0[0], o0[1], d], [o1[0], o1[1], d], [i1[0], i1[1], d], [o0[0], o0[1], d], [i1[0], i1[1], d], [i0[0], i0[1], d]], 0, 0, 1);
    let l = hypot(o1[0] - o0[0], o1[1] - o0[1]) || 1; put([[o0[0], o0[1], 0], [o1[0], o1[1], 0], [o1[0], o1[1], d], [o0[0], o0[1], 0], [o1[0], o1[1], d], [o0[0], o0[1], d]], (o1[1] - o0[1]) / l, -(o1[0] - o0[0]) / l, 0);
    l = hypot(i1[0] - i0[0], i1[1] - i0[1]) || 1; put([[i0[0], i0[1], 0], [i1[0], i1[1], d], [i1[0], i1[1], 0], [i0[0], i0[1], 0], [i0[0], i0[1], d], [i1[0], i1[1], d]], -(i1[1] - i0[1]) / l, (i1[0] - i0[0]) / l, 0);
  }
  return raw(P, N);
};
// outline of a pointed (Gothic) arch w wide and h tall, foot on y = 0
const arch = (w, h, seg = 3) => {
  const s = h - 0.866 * w, pts = [[-w / 2, 0], [w / 2, 0]];
  for (let i = 0; i < seg; i++) { const a = (i / seg) * PI / 3; pts.push([-w / 2 + w * cos(a), s + w * sin(a)]); }
  pts.push([0, h]);
  for (let i = seg - 1; i >= 0; i--) { const a = (i / seg) * PI / 3; pts.push([w / 2 - w * cos(a), s + w * sin(a)]); }
  return pts;
};
const join = (...gs) => {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) { const a = new Float32Array(gs.reduce((s, q) => s + q.attributes[k].array.length, 0)); let o = 0; for (const q of gs) { a.set(q.attributes[k].array, o); o += q.attributes[k].array.length; } g.setAttribute(k, new THREE.BufferAttribute(a, 3)); }
  return g;
};

// Flat-shaded faces with colour and texture coordinates laid over each face in metres (k repeats per metre), so courses of brick or slate run level round a building
class Skin {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
  poly(pts, want, col, k = 0.3) { // a flat convex polygon looking towards `want`
    let nx = 0, ny = 0, nz = 0; const m = pts.length, c = col.isColor ? col : C(col);
    for (let i = 0; i < m; i++) { const p = pts[i], q = pts[(i + 1) % m]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
    const l = hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const flip = nx * want[0] + ny * want[1] + nz * want[2] < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    let ax = nz, az = -nx; const al = hypot(ax, az); if (al < 1e-4) { ax = 1; az = 0; } else { ax /= al; az /= al; } // along the face, level
    const bx = -nz * 0 + ny * az, by = nz * ax - nx * az, bz = -ny * ax; // up the face
    for (let i = 1; i + 1 < m; i++) for (const q of flip ? [pts[0], pts[i + 1], pts[i]] : [pts[0], pts[i], pts[i + 1]]) {
      this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(c.r, c.g, c.b); this.uv.push((q[0] * ax + q[2] * az) * k, (q[0] * bx + q[1] * by + q[2] * bz) * k);
    }
    return this;
  }
  wall(ax, az, bx, bz, y0, y1, col, k) { return this.poly([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [bz - az, 0, ax - bx], col, k); } // outside is on the left of a -> b seen from above (north wall: west to east)
  add(geo, col, su = 1, sv = 1) { // a ready-made shape with its own texture coordinates; col may be a function of (x, y, z)
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position.array, U = g.attributes.uv.array, k = typeof col === 'function' ? null : C(col);
    for (let i = 0; i < P.length; i += 3) { const c = k || col(P[i], P[i + 1], P[i + 2]); this.p.push(P[i], P[i + 1], P[i + 2]); this.c.push(c.r, c.g, c.b); }
    this.n.push(...g.attributes.normal.array); for (let i = 0; i < U.length; i += 2) this.uv.push(U[i] * su, U[i + 1] * sv);
    return this;
  }
  geo() { const g = new THREE.BufferGeometry(); for (const [k, a, s] of [['position', this.p, 3], ['normal', this.n, 3], ['color', this.c, 3], ['uv', this.uv, 2]]) g.setAttribute(k, new THREE.Float32BufferAttribute(a, s)); return g; }
}

// Collects coloured parts, each placed in the frame set by at(), and fuses them into one geometry
class Kit {
  constructor() { this.a = []; this.x = []; this.m = new THREE.Matrix4(); }
  at(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { this.m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z); return this; } // local +z looks along (sin ry, 0, cos ry)
  add(geo, col, x = 0, y = 0, z = 0) { if (x || y || z) geo.translate(x, y, z); this.a.push([geo.applyMatrix4(this.m), col]); return this; }
  box(w, h, d, col, x = 0, y = 0, z = 0) { return this.add(Box(w, h, d), col, x, y, z); }
  bar(a, b, t, col, w = t) { // a beam from a to b, t thick
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), g = Box(d.length(), t, w);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize())); A.lerp(B, 0.5); return this.add(g, col, A.x, A.y, A.z);
  }
  skin(s) { this.x.push(s.geo().applyMatrix4(this.m)); return this; } // faces that already carry their own colours
  pre(g) { this.x.push(g.applyMatrix4(this.m)); return this; }
  geo() { return join(fuse(...this.a), ...this.x); }
}

// ---- materials: three small tiling textures (masonry, slates, planks), all near white so the vertex colours decide what they are ----
let MATS;
const mats = () => MATS || (MATS = (() => {
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  if (!HAS_DOM) return { plain, masonry: plain, roofing: plain, planks: plain };
  const pair = (draw, bumpScale, roughness = 0.85) => {
    const map = canvasTex(256, 256, (g, w, h) => draw(g, w, h, false)), bumpMap = canvasTex(256, 256, (g, w, h) => draw(g, w, h, true)); bumpMap.colorSpace = THREE.NoColorSpace;
    return new THREE.MeshStandardMaterial({ vertexColors: true, roughness, map, bumpMap, bumpScale });
  };
  const grey = (v) => `rgb(${v},${v},${v})`;
  const masonry = pair((g, w, h, bump) => { // eight staggered courses of blocks; mortar is the low, dark line
    const r = rnd(7); g.fillStyle = bump ? '#3a3a3a' : '#b8b2a6'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 4; i++) { const v = bump ? 215 + r() * 40 : 205 + r() * 50; g.fillStyle = bump ? grey(v | 0) : `rgb(${v | 0},${(v - 2 - r() * 6) | 0},${(v - 6 - r() * 10) | 0})`; g.fillRect(i * 64 + (j % 2) * 32 + 2, j * 32 + 2, 60, 28); }
  }, 1.2);
  const roofing = pair((g, w, h, bump) => { // rows of slates: each row is dark under the row above and lightens towards its own lower edge
    const r = rnd(11); g.fillStyle = bump ? '#000' : '#8a8a8a'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 8; i++) {
      const x = i * 32 + (j % 2) * 16, y = j * 32, v = 195 + r() * 60, s = g.createLinearGradient(0, y, 0, y + 32);
      if (bump) { s.addColorStop(0, '#444'); s.addColorStop(1, '#fff'); } else { s.addColorStop(0, grey((v * 0.72) | 0)); s.addColorStop(0.25, grey(v | 0)); s.addColorStop(1, grey(min(255, v + 10) | 0)); }
      g.fillStyle = s; g.fillRect(x + 1, y, 30, 31);
    }
  }, 1.6);
  const planks = pair((g, w, h, bump) => { // eight boards with dark seams and a little grain
    const r = rnd(5); g.fillStyle = bump ? '#222' : '#7d7468'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) { const v = 210 + r() * 45; g.fillStyle = grey(v | 0); g.fillRect(0, j * 32 + 2, w, 29); if (!bump) { g.fillStyle = 'rgba(90,70,50,0.18)'; for (let q = 0; q < 5; q++) g.fillRect(r() * w, j * 32 + 4 + r() * 24, 30 + r() * 60, 1.5); g.fillStyle = '#6f675c'; g.fillRect(((j * 97) % 256), j * 32 + 2, 2, 29); } }
  }, 0.8);
  return { plain, masonry, roofing, planks };
})());
const mesh = (geo, material) => { const m = new THREE.Mesh(geo, material); m.castShadow = m.receiveShadow = true; return m; };
const noUV = (s) => { const g = s.geo(); g.deleteAttribute('uv'); return g; };

// ---- shared small parts ----
const SKIN = '#f0c39a', GLASS = '#1d2f55', WHITE = '#f6f1e4', GREEN = '#1f5a3c', GOLD = '#f2c230', RED = '#c8102e', BLUE = '#21468b';
// the Dutch flag, w wide and h tall, hanging from x = 0 towards +x, its top edge at y = 0
const flag = (K, w, h, x = 0, y = 0, z = 0) => { [RED, '#ffffff', BLUE].forEach((c, i) => K.box(w, h / 3, 0.025, c, x + w / 2, y - h / 6 - (i * h) / 3, z)); };

// ---- Grote of Sint-Laurenskerk ----
// Built along its own axis (u along the nave, w across, nave on w = 0) and then set into the footprint frame: the real axis lies 3.45 m south of the
// footprint centroid and 0.86 degrees off the frame's x axis. A brick basilica clad in pale Gobertange stone, slate roofs, little brick houses against its south side.
const KERK_TURN = 0.015, KERK_N = 3.45;
const kerkXZ = (u, w) => [u * cos(KERK_TURN) + w * sin(KERK_TURN), -u * sin(KERK_TURN) + w * cos(KERK_TURN) + KERK_N];
export const groteKerkSolids = [[-36, 0, 8, 33], [-24, 0, 8, 33], [-12, 0, 8, 33], [2.2, 0, 8.5, 33], [2.2, 0, 3, 53], [14, 0, 8, 33], [26, 0, 8, 33], [35.5, 0, 7, 32], [2.2, -13, 8, 33], [2.2, -22, 8, 33], [2.2, 13, 8, 33], [2.2, 21.5, 8, 33],
  [-36, -12, 6, 18], [-24, -12, 6, 18], [-12, -12, 6, 18], [-36, 12, 6, 18], [-24, 12, 6, 18], [-12, 12, 6, 18], [15, -9, 5.5, 18], [25, -9, 5.5, 18], [15, 13.5, 7.5, 18], [24, 13.5, 7.5, 18], [-18, 21.5, 4, 9], [-9, 22.5, 5, 9]] // nave, crossing and spire, choir, apse, transepts; then the aisles and the houses
  .map(([u, w, r, h]) => { const [x, z] = kerkXZ(u, w); return { x, z, r, h }; });
export function groteKerk() {
  const M = mats(), S = new Skin(), R = new Skin(), K = new Kit(), g = new THREE.Group();
  const stone = '#f1ebdc', hi = '#fcf8ee', lo = '#ddd3bd', base = '#aaa193', brick = '#b5553b', brick2 = '#a54d37', slate = '#74849f', slate2 = '#687891', lead = '#6c7684', tile = '#cf6238', tile2 = '#bf5530', door = '#6a2f24';
  const kS = 0.3, kB = 0.55, kR = 0.42;
  const AW = 17.9, NW = 6.5, EA = 10.5, LT = 17, EV = 22.5, RG = 31.5, W0 = -42.45, T0 = -4.55, T1 = 8.95, TN = -28.25, TS = 27.7, TC = 2.2, CH = 31, CN = -14.35, CS = 21.15;
  const A = [[33.4, CN], [39.6, -10.55], [43.4, -3.5], [43.4, 2.9], [39.7, 9.8], [33.8, 13.45], [33.75, 17.6], [32.7, 19.55], [30.8, CS]]; // outer wall of the ambulatory, round to the south-east chapel
  const I = [[CH, -NW], [35.3, -5.28], [37.2, -1.75], [37.2, 1.45], [35.35, 4.9], [CH, NW]]; // the high choir closes in five sides
  const wall = (ax, az, bx, bz, y0, y1, col = stone, k = kS) => S.wall(ax, az, bx, bz, y0, y1, col, k);
  const gable = (cx, cz, nx, nz, half, y0, y1, th, col = stone, k = kS) => { // a gable wall standing a little above its roof, with a pale coping
    const tx = -nz, tz = nx, a = [cx - tx * half, y0, cz - tz * half], b = [cx + tx * half, y0, cz + tz * half], p = [cx, y1, cz], bk = (q) => [q[0] - nx * th, q[1], q[2] - nz * th];
    S.poly([a, b, p], [nx, 0, nz], col, k).poly([bk(a), bk(b), bk(p)], [-nx, 0, -nz], col, k).poly([a, p, bk(p), bk(a)], [-tx, 1, -tz], hi, k).poly([b, p, bk(p), bk(b)], [tx, 1, tz], hi, k);
  };
  const face = (a, b, t = 0.5, y = 0) => K.at(a[0] + (b[0] - a[0]) * t, y, a[1] + (b[1] - a[1]) * t, atan2(b[1] - a[1], a[0] - b[0])); // stand on a wall, looking out
  const band = (ax, az, bx, bz, y0, y1, th, col, out = 0, e = 0) => { const l = hypot(bx - ax, bz - az), nx = (bz - az) / l, nz = (ax - bx) / l; K.at((ax + bx) / 2 + nx * out, (y0 + y1) / 2, (az + bz) / 2 + nz * out, atan2(nx, nz)).box(l + 2 * e, y1 - y0, th, col); };

  // --- walls ---
  wall(W0, AW, W0, -AW, 0, EA); wall(W0, NW, W0, -NW, EA, EV); gable(W0, 0, -1, 0, NW, EV, RG + 0.9, 0.6); // west front
  for (const o of [-1, 1]) S.poly([[W0, EA, o * AW], [W0, EA, o * NW], [W0, LT, o * NW]], [-1, 0, 0], stone, kS);
  wall(W0, -AW, T0, -AW, 0, EA); wall(T0, AW, W0, AW, 0, EA); // aisles
  wall(W0, -NW, T0, -NW, LT - 0.5, EV); wall(T0, NW, W0, NW, LT - 0.5, EV); wall(T1, -NW, CH, -NW, LT - 0.5, EV); wall(CH, NW, T1, NW, LT - 0.5, EV); // clerestory
  for (let i = 0; i < 5; i++) wall(...I[i], ...I[i + 1], LT - 0.5, EV);
  wall(T0, TS, T0, TN, 0, EV); wall(T1, TN, T1, TS, 0, EV); wall(T0, TN, T1, TN, 0, EV); wall(T1, TS, T0, TS, 0, EV); // transept
  gable(TC, TN, 0, -1, 6.75, EV, RG + 0.9, 0.6); gable(TC, TS, 0, 1, 6.75, EV, RG + 0.9, 0.6);
  wall(T1, CN, ...A[0], 0, EA); for (let i = 0; i + 1 < A.length; i++) wall(...A[i], ...A[i + 1], 0, EA); wall(...A[8], T1, CS, 0, EA); // choir aisles and ambulatory
  wall(T1, -18.85, 14.75, -18.85, 0, 8, lo); wall(14.75, -18.85, 14.75, CN, 0, 8, lo); S.poly([[14.75, 8, -18.85], [14.75, 8, CN], [14.75, 9.8, CN]], [1, 0, 0], lo, kS); // sacristy
  wall(-34.45, -AW, -34.45, -21.15, 0, 5.4); wall(-34.45, -21.15, -31.05, -21.15, 0, 5.4); wall(-31.05, -21.15, -31.05, -AW, 0, 5.4); gable(-32.75, -21.15, 0, -1, 1.7, 5.4, 8.3, 0.4); // north porch
  wall(-46.7, -2.4, W0, -2.4, 0, 6); wall(W0, 2.4, -46.7, 2.4, 0, 6); wall(-46.7, 2.4, -46.7, -2.4, 0, 6); gable(-46.7, 0, -1, 0, 2.4, 6, 9.7, 0.45); // west porch
  wall(43.4, -2.2, 47.05, -2.2, 0, 6.2); wall(47.05, -2.2, 47.05, 1.5, 0, 6.2); wall(47.05, 1.5, 43.4, 1.5, 0, 6.2); // east chapel
  for (const w of [-2.2, 1.5]) S.poly([[43.4, 6.2, w], [47.05, 6.2, w], [43.4, 8.8, w]], [0, 0, w], stone, kS);
  // the little brick houses built against the south side
  const house = (u0, u1, w1, eave, top, w0, col, rc, west, east) => {
    wall(u1, w1, u0, w1, 0, eave, col, kB);
    for (const [u, d, on] of [[u0, -1, west], [u1, 1, east]]) if (on) S.poly([[u, 0, w0], [u, 0, w1], [u, eave, w1], [u, top, w0]], [d, 0, 0], col, kB);
    R.poly([[u0, eave, w1], [u1, eave, w1], [u1, top, w0], [u0, top, w0]], [0, 1, 1], rc, kR);
    band(u1, w1, u0, w1, eave - 0.18, eave + 0.04, 0.24, WHITE, 0.06); // gutter board
  };
  house(-22.75, -16.45, 25.3, 6, 9.8, AW, brick, tile, true, true); house(-16.45, T0, 27.55, 5.2, 9.4, AW, brick2, tile2, true, false); house(T1, 14.7, 27.5, 5.5, 8.8, CS, brick, tile, false, true);

  // --- roofs ---
  for (const o of [-1, 1]) {
    R.poly([[W0 + 0.6, EV, o * NW], [CH, EV, o * NW], [CH, RG, 0], [W0 + 0.6, RG, 0]], [0, 1, o], o < 0 ? slate : slate2, kR); // nave and choir
    R.poly([[TC + o * 6.75, EV, TN + 0.6], [TC + o * 6.75, EV, TS - 0.6], [TC, RG, TS - 0.6], [TC, RG, TN + 0.6]], [o, 1, 0], o < 0 ? slate2 : slate, kR); // transept
    R.poly([[W0, EA, o * AW], [T0, EA, o * AW], [T0, LT, o * NW], [W0, LT, o * NW]], [0, 1, o], o < 0 ? slate2 : slate, kR); // lean-to roofs over the aisles
    R.poly([[-46.25, 6, o * 2.4], [W0, 6, o * 2.4], [W0, 9.3, 0], [-46.25, 9.3, 0]], [0, 1, o], slate, kR); // west porch
    R.poly([[-32.75 + o * 1.7, 5.4, -20.75], [-32.75 + o * 1.7, 5.4, -AW], [-32.75, 8, -AW], [-32.75, 8, -20.75]], [o, 1, 0], slate, kR); // north porch
  }
  R.poly([[T1, EA, CN], [CH, EA, CN], [CH, LT, -NW], [T1, LT, -NW]], [0, 1, -1], slate, kR).poly([[T1, EA, CS], [...A[8]].toSpliced(1, 0, EA), [CH, LT, NW], [T1, LT, NW]], [0, 1, 1], slate2, kR);
  const lo3 = (p) => [p[0], EA, p[1]], hi3 = (p) => [p[0], LT, p[1]], out = (p, q) => [(p[0] + q[0]) / 2 - CH, 1.2, (p[1] + q[1]) / 2];
  R.poly([[CH, EA, CN], lo3(A[0]), hi3(I[0])], [0, 1, -1], slate2, kR);
  for (let i = 0; i < 5; i++) R.poly([lo3(A[i]), lo3(A[i + 1]), hi3(I[i + 1]), hi3(I[i])], out(A[i], A[i + 1]), i % 2 ? slate2 : slate, kR); // round the ambulatory
  for (let i = 5; i < 8; i++) R.poly([lo3(A[i]), lo3(A[i + 1]), hi3(I[5])], out(A[i], A[i + 1]), i % 2 ? slate2 : slate, kR);
  for (let i = 0; i < 5; i++) R.poly([[I[i][0], EV, I[i][1]], [I[i + 1][0], EV, I[i + 1][1]], [CH, RG, 0]], out(I[i], I[i + 1]), i % 2 ? slate : slate2, kR); // the apse roof
  R.poly([[T1, 8, -18.85], [14.75, 8, -18.85], [14.75, 9.8, CN], [T1, 9.8, CN]], [0, 1, -1], slate, kR).poly([[47.05, 6.2, -2.2], [47.05, 6.2, 1.5], [43.4, 8.8, 1.5], [43.4, 8.8, -2.2]], [1, 1, 0], slate, kR);
  K.at().box(CH - W0 - 0.6, 0.3, 0.36, lead, (W0 + 0.6 + CH) / 2, RG + 0.04, 0).box(0.36, 0.3, TS - TN - 1.2, lead, TC, RG + 0.02, (TN + TS) / 2); // lead ridges

  // --- stonework: windows, buttresses, parapets ---
  const win = (w, h, { mull = 1, rose = false, t = 0.28, d = 0.22 } = {}) => { // a pointed window: stone frame standing proud, glass set back in it, mullions and a bar of tracery
    const s = h - 0.866 * w; K.add(ring(arch(w + 2 * t, h + 1.6 * t).map(([x, y]) => [x, y - t]), arch(w, h), d), hi).add(slab(arch(w, h), 0.05), GLASS);
    for (let i = 1; i <= mull; i++) { const x = -w / 2 + (i * w) / (mull + 1), top = s + sqrt(max(0, w * w - (abs(x) + w / 2) ** 2)) - 0.03; K.box(0.14, top, 0.1, hi, x, top / 2, 0.1); }
    if (mull) K.box(w, 0.16, 0.1, hi, 0, max(s, h * 0.45), 0.1);
    if (rose) K.add(Tor(w * 0.2, 0.09, 4, 12), hi, 0, s + w * 0.42, 0.12).box(w, 0.16, 0.1, hi, 0, s * 0.5, 0.1);
  };
  const portal = (w, h) => { K.add(ring(arch(w + 0.8, h + 0.6).map(([x, y]) => [x, y - 0.02]), arch(w, h), 0.3), hi).add(slab(arch(w, h), 0.08), door).box(0.07, h - 0.1, 0.06, '#3a1a14', 0, h / 2, 0.08); for (const x of [-0.25, 0.25]) K.add(Ico(0.07), GOLD, x, h * 0.42, 0.13); };
  const pinnacle = (y, r = 0.3, h = 2.8, z = 0.1) => K.box(r * 1.9, h * 0.5, r * 1.9, hi, 0, y + h * 0.25, z).add(Cone(r * 1.25, h * 0.55, 4).rotateY(PI / 4), lo, 0, y + h * 0.5 + h * 0.275, z);
  const buttress = (h, d = 1.25, w = 0.95, pin = true) => { // two stages with sloping offsets, a pinnacle above the parapet
    K.box(w, h * 0.5, d, hi, 0, h * 0.25, d / 2 - 0.1).add(ext([[0, 0], [d * 0.45, 0], [0, 0.7]], w).rotateY(-PI / 2), lo, 0, h * 0.5, d * 0.55 - 0.1);
    K.box(w * 0.9, h * 0.42, d * 0.55, hi, 0, h * 0.71, d * 0.275 - 0.1).add(ext([[0, 0], [d * 0.55, 0], [0, 0.8]], w * 0.9).rotateY(-PI / 2), lo, 0, h * 0.92, -0.1);
    if (pin) pinnacle(h - 0.2);
  };
  const pilaster = (y0, y1) => { K.box(0.7, y1 - y0, 0.5, hi, 0, (y0 + y1) / 2, 0.15); pinnacle(y1 - 0.1, 0.26, 3, 0.12); };
  const eave = (ax, az, bx, bz, y) => { band(ax, az, bx, bz, y - 0.5, y - 0.18, 0.5, lo, 0, 0.25); band(ax, az, bx, bz, y - 0.18, y + 0.78, 0.3, hi, 0, 0.15); }; // cornice and the balustrade along the gutter
  const plinth = (ax, az, bx, bz) => band(ax, az, bx, bz, 0, 0.9, 0.3, base, 0, 0.15);
  const sash = (w, h) => K.box(w + 0.22, h + 0.22, 0.1, WHITE, 0, 0, 0.03).box(w, h, 0.1, GLASS, 0, 0, 0.06).box(0.06, h, 0.1, WHITE, 0, 0, 0.09).box(w, 0.06, 0.1, WHITE, 0, 0, 0.09);

  for (const [a, b, y] of [[[W0, -AW], [T0, -AW], EA], [[T0, AW], [W0, AW], EA], [[T1, CN], A[0], EA], ...A.slice(0, 8).map((p, i) => [p, A[i + 1], EA]), [A[8], [T1, CS], EA],
    [[W0, -NW], [T0, -NW], EV], [[T0, NW], [W0, NW], EV], [[T1, -NW], [CH, -NW], EV], [[CH, NW], [T1, NW], EV], ...I.slice(0, 5).map((p, i) => [p, I[i + 1], EV]),
    [[T0, -NW], [T0, TN], EV], [[T0, TS], [T0, NW], EV], [[T1, TN], [T1, -NW], EV], [[T1, NW], [T1, TS], EV]]) eave(...a, ...b, y);
  for (const [a, b] of [[[W0, -AW], [T0, -AW]], [[-22.75, AW], [W0, AW]], [[T1, -18.85], [14.75, -18.85]], [[14.75, -18.85], [14.75, CN]], [[14.75, CN], A[0]], ...A.slice(0, 8).map((p, i) => [p, A[i + 1]]), [A[8], [14.7, CS]],
    [[T0, -AW], [T0, TN]], [[T0, TN], [T1, TN]], [[T1, TN], [T1, -18.85]], [[T1, TS], [T0, TS]], [[W0, AW], [W0, 2.4]], [[W0, -2.4], [W0, -AW]]]) plinth(...a, ...b);
  for (const o of [-1, 1]) K.at().bar([W0 + 0.2, EA + 0.25, o * AW], [W0 + 0.2, LT + 0.25, o * NW], 0.4, hi, 0.4); // raking parapets on the aisle ends

  // aisles: a window in every bay, a buttress between
  for (const u of [-42.1, -35.85, -29.5, -23.25, -16.9, -10.6]) { K.at(u, 0, -AW, PI); buttress(EA); }
  for (const u of [-39, -26.4, -20.1, -13.75, -7.6]) { K.at(u, 3, -AW, PI); win(3, 6, { mull: 2 }); }
  for (const u of [-42, -35.7, -29.4]) { K.at(u, 0, AW, 0); buttress(EA); }
  for (const u of [-38.85, -32.55, -26.1]) { K.at(u, 3, AW, 0); win(3, 6, { mull: 2 }); }
  for (const u of [20.85, 27]) { K.at(u, 0, CN, PI); buttress(EA); }
  for (const u of [17.8, 23.9, 30.2]) { K.at(u, 3, CN, PI); win(2.8, 6, { mull: 2 }); }
  for (const u of [20.2, 25.7]) { K.at(u, 0, CS, 0); buttress(EA, 0.65, 0.55); }
  for (const u of [17.45, 22.95, 28.3]) { K.at(u, 3, CS, 0); win(2.8, 6, { mull: 2 }); }
  for (const i of [0, 1, 3, 4]) { face(A[i], A[i + 1], 0.5, 3); win(2.8, 6, { mull: 2 }); }
  face(A[5], A[6], 0.5, 3.4); win(1.6, 4.6, { mull: 1 });
  for (const [x, z, nx, nz, d, w] of [[33.4, CN, 0.27, -0.96, 1.45, 0.9], [39.6, -10.55, 0.73, -0.69, 1.1, 0.8], [43.1, -4.15, 0.96, -0.26, 1.4, 0.8], [43.2, 3.5, 0.96, 0.27, 1.4, 0.8], [39.7, 9.85, 0.7, 0.71, 1.1, 0.85]]) { K.at(x, 0, z, atan2(nx, nz)); buttress(EA, d, w); }
  K.at(47.05, 1.6, -0.35, PI / 2); win(1.5, 3.4, { mull: 1 }); band(47.05, -2.2, 47.05, 1.5, 6, 6.3, 0.4, lo, 0, 0.1);
  // clerestory
  for (const o of [-1, 1]) {
    for (const u of [-39, -32.7, -26.4, -20.1, -13.75, -7.75, 11.75, 17.25, 22.75, 28.25]) { K.at(u, 17.7, o * NW, o < 0 ? PI : 0); win(2.5, 4.2, { mull: 1, t: 0.22 }); }
    for (const u of [-35.85, -29.5, -23.25, -16.9, -10.6, 14.5, 20, 25.5]) { K.at(u, 0, o * NW, o < 0 ? PI : 0); pilaster(LT - 0.4, EV); }
    for (const w of [-23.1, 22.8]) { K.at(TC + o * 6.75, 13, w, o * PI / 2); win(2.6, 7.6, { mull: 1 }); } // tall windows in the sides of the transept arms
  }
  for (let i = 0; i < 5; i++) { face(I[i], I[i + 1], 0.5, 17.7); win(min(2.3, hypot(I[i + 1][0] - I[i][0], I[i + 1][1] - I[i][1]) - 1.5), 4.2, { mull: 1, t: 0.22 }); }
  for (let i = 0; i < 6; i++) { const p = I[i], a = atan2(p[0] - CH + 0.01, p[1]); K.at(p[0], 0, p[1], i === 0 ? PI : i === 5 ? 0 : a); pilaster(LT - 0.4, EV); }
  // transept fronts: a huge window over a door, corner buttresses carried up into pinnacles
  for (const [w, ry, o] of [[TN, PI, -1], [TS, 0, 1]]) {
    K.at(TC, 6.2, w, ry); win(7.6, 14.7, { mull: 4, rose: true, t: 0.34, d: 0.26 }); K.at(TC, 0, w, ry); portal(2.4, 4.3);
    for (const u of [T0 + 0.45, T1 - 0.45]) { K.at(u, 0, w, ry); buttress(EV, 1.15, 1); }
    K.at(TC, RG + 0.9, w - o * 0.3).box(0.16, 1.9, 0.16, GOLD, 0, 0.9, 0).box(0.9, 0.16, 0.16, GOLD, 0, 1.25, 0);
  }
  for (const w of [-27.75, -22.8]) for (const [u, ry] of [[T0, -PI / 2], [T1, PI / 2]]) { K.at(u, 0, w, ry); buttress(EV, 1.4, 1); }
  // west front: porch, the great window, buttresses, a massif at each corner
  K.at(W0, 10.3, 0, -PI / 2); win(6.2, 11.4, { mull: 3, rose: true, t: 0.34, d: 0.26 }); K.at(-46.7, 0, 0, -PI / 2); portal(2.6, 4.6);
  K.at(W0 + 0.3, RG + 0.9, 0).box(0.16, 1.9, 0.16, GOLD, 0, 0.9, 0).box(0.16, 0.16, 0.9, GOLD, 0, 1.25, 0);
  for (const o of [-1, 1]) {
    K.at(W0, 0, o * 6.55, -PI / 2); buttress(EV, 1.5, 1.1); K.at(W0, 3.2, o * 9.7, -PI / 2); win(2.3, 5.6, { mull: 1 });
    const c = o * 15.2, U = W0 - 1.4; // the corner massif: masonry like the rest, with corner strips, a string course, a small window and a stone coping
    wall(U, c + 2.6, U, c - 2.6, 0, 11.6); wall(U, c - 2.6, W0, c - 2.6, 0, 11.6); wall(W0, c + 2.6, U, c + 2.6, 0, 11.6); plinth(U, c + 2.6, U, c - 2.6);
    K.at(W0, 0, c, -PI / 2).add(ext([[0, 0], [1.5, 0], [0, 1.3]], 5.2).rotateY(-PI / 2), lo, 0, 11.6, -0.1);
    K.at(U, 0, c, -PI / 2).box(5.3, 0.3, 0.3, lo, 0, 5.7, 0).box(5.36, 0.35, 0.36, hi, 0, 11.45, 0); for (const q of [-2.3, 2.3]) K.box(0.5, 11.2, 0.3, hi, q, 5.6, 0.05);
    K.at(U, 6.5, c, -PI / 2); win(1.5, 3.6, { mull: 1 });
    for (const q of [-2.1, 2.1]) { K.at(W0, 0, o * 15.2 + q, -PI / 2); pinnacle(11.2, 0.3, 3, 0.9); }
  }
  K.at(-32.75, 0, -21.15, PI); portal(1.7, 3.5);
  // the sacristy and its stair turret; the houses' windows, doors and chimneys
  K.at(15, 0, -19.1).add(Cyl(0.55, 0.55, 12.2, 8), hi, 0, 6.1, 0).add(Cone(0.6, 1.9, 8), slate2, 0, 13.15, 0); K.at(11.8, 4.2, -18.85, PI); sash(1.1, 1.8);
  for (const [u, y, w, s, h] of [[-21.1, 1.9, 25.3, 1, 1.6], [-18.1, 1.9, 25.3, 1, 1.6], [-21.1, 4.5, 25.3, 1, 1.2], [-18.1, 4.5, 25.3, 1, 1.2], [-11.2, 1.9, 27.55, 1.1, 1.6], [-8.4, 1.9, 27.55, 1.1, 1.6], [-5.9, 1.9, 27.55, 1, 1.6], [-12.6, 4.2, 27.55, 0.9, 0.8], [-7.2, 4.2, 27.55, 0.9, 0.8], [12.9, 1.9, 27.5, 1.1, 1.6], [11.6, 4.4, 27.5, 0.9, 0.9]]) { K.at(u, y, w, 0); sash(s, h); }
  K.at(-22.75, 2.2, 21.6, -PI / 2); sash(1, 1.6); K.at(-22.75, 5, 20.6, -PI / 2); sash(0.9, 1.1); K.at(14.7, 2.2, 24.4, PI / 2); sash(1, 1.6);
  for (const [u, w] of [[-14.6, 27.55], [10.3, 27.5], [-19.6, 25.3]]) K.at(u, 0, w, 0).box(1.2, 2.3, 0.1, WHITE, 0, 1.15, 0.03).box(0.98, 2.14, 0.1, GREEN, 0, 1.1, 0.06).box(0.6, 0.4, 0.1, GLASS, 0, 1.75, 0.08).add(Ico(0.05), GOLD, 0.36, 1.1, 0.14);
  for (const [u, w, y] of [[-20.4, 19.6, 9.4], [-9.5, 20.3, 8.8], [12, 22.6, 8.6]]) K.at(u, y, w).box(0.7, 1.9, 0.7, brick2, 0, 0, 0).box(0.84, 0.14, 0.84, hi, 0, 1, 0).add(Cyl(0.12, 0.15, 0.36, 6), tile, 0, 1.2, 0);
  // the turret over the crossing: lead-clad, an open lantern with the bells in it, a slender spire
  K.at(TC, 0, 0).add(Cyl(1.75, 2.15, 5, 8), lead, 0, 31, 0).add(Cyl(2.2, 2.2, 0.32, 8), hi, 0, 33.6, 0);
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) * PI / 4; K.at(TC + sin(a) * 1.6, 0, cos(a) * 1.6, a).box(0.3, 3.5, 0.3, hi, 0, 35.5, 0).box(0.9, 0.5, 0.16, hi, 0, 37, -0.05); }
  K.at(TC, 0, 0).add(Cyl(0.4, 0.85, 1.15, 10), GOLD, 0, 35.4, 0).add(Cyl(0.09, 0.09, 1.6, 6), '#3a3f47', 0, 36.5, 0).add(Cyl(1.95, 1.95, 0.4, 8), hi, 0, 37.45, 0);
  for (let k = 0; k < 8; k++) { const a = k * PI / 4; K.at(TC + sin(a) * 1.05, 34.6, cos(a) * 1.05).add(Cyl(0.13, 0.26, 0.42, 6), GOLD); } // the carillon
  K.at(TC, 0, 0).add(Cyl(1.2, 1.4, 2.3, 8), lead, 0, 38.8, 0).add(Cyl(1.55, 1.55, 0.26, 8), hi, 0, 40.05, 0).add(Sph(1.15, 8, 5), slate2, 0, 40.9, 0).add(Cone(0.8, 8.6, 8), slate2, 0, 45.9, 0).add(Sph(0.36, 8, 6), GOLD, 0, 50.3, 0)
    .box(0.12, 1.7, 0.12, GOLD, 0, 51.3, 0).box(0.8, 0.12, 0.12, GOLD, 0, 51.5, 0);
  for (let k = 0; k < 4; k++) K.at(TC, 38.8, 0, k * PI / 4 + PI / 8).box(2.66, 1.3, 0.5, '#252c3d'); // louvres in the upper stage

  const fin = (q) => q.rotateY(KERK_TURN).translate(0, 0, KERK_N);
  g.add(mesh(fin(S.geo()), M.masonry), mesh(fin(R.geo()), M.roofing), mesh(fin(K.geo()), M.plain));
  return g;
}

//@@MILL
// ---- Molen van Piet (De Groot, 1769): a round brick tower mill with a white gallery, a dark cap and a white tail ----
// Origin on the ground at the centre; the sails face +z. `sails` spins about its own z axis; it hangs in a holder that tips the wind shaft up 15 degrees,
// as on every Dutch mill, which is also what carries the sail tips clear of the gallery rail (they sweep a circle of 12.05 m).
export function molen() {
  const M = mats(), g = new THREE.Group(), K = new Kit(), T = new Skin(), CAP = new Skin(), SK = new Kit();
  const white = WHITE, dark = '#3a2c22', thatch = '#51483b', cloth = '#f1e4c2', iron = '#2b2f36';
  const HT = 16.4, rad = (y) => 5.7 - (2.8 * y) / HT, LEAN = -atan2(2.8, HT), GY = 7.2, GR = 6.5, TILT = 0.262;
  const b0 = C('#8c4b2c'), b1 = C('#b8713f');
  T.add(new THREE.CylinderGeometry(rad(HT), rad(0), HT, 20, 4, true).translate(0, HT / 2, 0), (x, y) => b0.clone().lerp(b1, y / HT), 14, 8.2);
  K.at().add(Cyl(5.72, 5.82, 0.8, 20), '#7a432c', 0, 0.4, 0).add(Cyl(3.06, 3, 0.5, 20), white, 0, HT + 0.2, 0);
  // the gallery: deck on radial beams, struts down to the tower, a railing all round
  K.add(Cyl(GR + 0.05, GR + 0.05, 0.26, 16), white, 0, GY - 0.13, 0).add(Cyl(GR - 0.1, GR - 0.1, 0.2, 16), '#a07a4c', 0, GY - 0.08, 0);
  for (let k = 0; k < 16; k++) {
    const a = ((k + 0.5) * PI) / 8, a2 = ((k + 1.5) * PI) / 8, P = (r, y) => [sin(a) * r, y, cos(a) * r], Q = (r, y) => [sin(a2) * r, y, cos(a2) * r];
    K.bar(P(rad(3.4) - 0.12, 3.4), P(6.15, GY - 0.3), 0.17, white).bar(P(rad(GY) - 0.1, GY - 0.36), P(GR - 0.02, GY - 0.36), 0.18, dark, 0.14).bar(P(6.36, GY), P(6.36, GY + 1.08), 0.1, white);
    K.bar(P(6.36, GY + 1.06), Q(6.36, GY + 1.06), 0.09, white, 0.11).bar(P(6.36, GY + 0.56), Q(6.36, GY + 0.56), 0.06, white);
  }
  const on = (y, a) => K.at(sin(a) * rad(y), y, cos(a) * rad(y), a, LEAN); // stand on the tower wall, leaning with it
  for (const [y, a] of [[3.3, PI / 2], [3.3, -PI / 2], [10, 0.62], [10, 0.62 + PI], [12.5, PI / 2 + 0.3], [12.5, -PI / 2 + 0.3], [14.7, 0], [14.7, PI]]) {
    on(y, a); K.box(1.04, 1.44, 0.3, white).box(0.8, 1.2, 0.3, GLASS, 0, 0, 0.03).box(0.06, 1.2, 0.3, white, 0, 0, 0.06).box(0.8, 0.06, 0.3, white, 0, 0, 0.06).box(1.24, 0.1, 0.44, white, 0, -0.77, 0.02);
  }
  for (const a of [0, PI]) { on(1.5, a); K.box(2.1, 2.9, 0.5, white).box(1.7, 2.6, 0.5, GREEN, 0, -0.1, 0.04).box(0.05, 2.6, 0.5, '#123a26', 0, -0.1, 0.07); for (const x of [-0.2, 0.2]) K.add(Ico(0.06), GOLD, x, -0.2, 0.34); }
  for (const a of [PI / 2, -PI / 2]) { on(GY + 1.12, a); K.box(1.2, 2.1, 0.3, white).box(0.95, 1.9, 0.3, GREEN, 0, -0.06, 0.03).box(0.5, 0.4, 0.3, GLASS, 0, 0.45, 0.06); }
  // the cap, the beard under the wind shaft, and a flag for a festive day
  CAP.add(Sph(1, 14, 5, 0, PI * 2, 0, PI / 2).scale(3.2, 3, 3.7).translate(0, HT + 0.5, 0.5), thatch, 10, 3);
  K.at().add(Cyl(1, 1, 0.14, 16).scale(3.28, 1, 3.78), white, 0, HT + 0.47, 0.5);
  K.box(2, 0.95, 0.5, GREEN, 0, HT + 1.05, 4).box(2.2, 0.12, 0.56, white, 0, HT + 1.55, 4).box(2.2, 0.12, 0.56, white, 0, HT + 0.56, 4).add(Cyl(0.2, 0.2, 0.04, 8).rotateX(PI / 2), GOLD, 0, HT + 1.05, 4.27);
  K.bar([0, 18.9, -2], [0, 22.6, -2], 0.08, white).add(Ico(0.09), GOLD, 0, 22.66, -2); K.at(0, 22.5, -2, PI / 2); flag(K, 1.6, 1.05); K.at();
  // the tail: beams through the cap, the long pole down to the gallery with its braces, and the wheel that winds the cap round
  K.bar([-4.2, 17.6, -1.3], [4.2, 17.6, -1.3], 0.28, white).bar([-1.9, 17.3, -2.7], [1.9, 17.3, -2.7], 0.22, white).bar([0, 17.5, -3], [0, 7.9, -5.5], 0.3, white);
  for (const o of [-1, 1]) K.box(0.34, 0.34, 0.34, GREEN, o * 4.2, 17.6, -1.3).bar([o * 4.1, 17.6, -1.3], [o * 0.12, 9.6, -5.15], 0.18, white).bar([o * 1.6, 17.3, -2.7], [o * 0.1, 12.2, -4.4], 0.14, white);
  K.box(0.36, 0.5, 0.36, GREEN, 0, 8.05, -5.46).add(Cyl(0.07, 0.07, 0.5, 6).rotateZ(PI / 2), iron, 0.2, 8.75, -5.3);
  K.at(0.36, 8.75, -5.3, PI / 2).add(Tor(0.6, 0.045, 4, 12), white); for (let k = 0; k < 3; k++) K.at(0.36, 8.75, -5.3, PI / 2, 0, (k * PI) / 3).box(1.2, 0.05, 0.05, white);
  // the sails: two stocks through the shaft head, each arm a lattice frame behind a wind board, with cloth spread over the inner half
  SK.at().add(Cyl(0.34, 0.34, 2.6, 10).rotateX(PI / 2), '#7a2d22', 0, 0, -1).box(0.8, 0.8, 0.8, dark, 0, 0, 0).add(Cyl(0.22, 0.22, 0.2, 8).rotateX(PI / 2), GOLD, 0, 0, 0.45);
  for (let k = 0; k < 4; k++) {
    SK.at(0, 0, k % 2 ? -0.15 : 0.15, 0, 0, (k * PI) / 2).box(0.3, 12, 0.26, dark, 0, 6, 0).box(0.34, 0.6, 0.3, white, 0, 11.75, 0);
    for (let r = 2.5; r < 11.7; r += 0.83) SK.box(2.1, 0.07, 0.08, dark, 1.2, r, 0);
    for (const x of [0.85, 1.55, 2.25]) SK.box(0.07, 9.5, 0.06, dark, x, 6.95, 0);
    SK.box(0.5, 9.5, 0.05, '#e9e1cf', -0.4, 6.95, 0).box(2, 5.2, 0.03, cloth, 1.22, 4.95, -0.045);
  }
  const sails = new THREE.Object3D(), holder = new THREE.Group(); holder.position.set(0, 18.5, 4.5); holder.rotation.x = -TILT; holder.add(sails); sails.add(mesh(SK.geo(), M.plain));
  g.add(mesh(T.geo(), M.masonry), mesh(CAP.geo(), M.roofing), mesh(K.geo(), M.plain), holder);
  return { group: g, sails };
}

// ---- boats: origin at the waterline amidships, bow towards +x ----
// How far world.js lets a boat bob (m) and roll (radians). The water is one flat plane, so whatever floor you can see into must stay above it at the worst of both (tools/check-boats.mjs).
export const SWAY = { bob: 0.035, roll: 0.022 };
// a hull from stations [x, half beam, keel y, sheer y]: topsides, bilge, bottom, a rim, the inside and a floor or deck.
// The water is a flat opaque plane, so an open boat's floor sits above the waterline (bottom boards), or the canal shows inside the hull.
function hull(B, st, { col, inner, rimCol, floor, rim = 0.09, floorY = 0, strake }) {
  const n = st.length, pt = st.map(([x, hb, yb, ys], i) => {
    const hi = max(0.012, hb - rim), xi = i === 0 ? x + rim : i === n - 1 ? x - rim * 1.5 : x, fy = typeof floorY === 'function' ? floorY(ys) : floorY, yc = yb + (ys - yb) * 0.35, xs = strake && i === 0 ? x - strake.out : x;
    return { S: (o) => [x, ys, o * hb], C: (o) => [x, yc, o * hb * 0.84], K: (o) => [x, yb, o * hb * 0.5], T: (o) => [xi, ys, o * hi], F: (o) => [xi, fy, o * hi * 0.94], P: (o, dy, e) => [xs, ys - dy, o * (hb + e)] };
  });
  for (let i = 0; i + 1 < n; i++) {
    const a = pt[i], b = pt[i + 1];
    for (const o of [-1, 1]) {
      B.poly([a.S(o), b.S(o), b.C(o), a.C(o)], [0, 0.2, o], col).poly([a.C(o), b.C(o), b.K(o), a.K(o)], [0, -0.6, o], col).poly([a.S(o), b.S(o), b.T(o), a.T(o)], [0, 1, 0], rimCol).poly([a.T(o), b.T(o), b.F(o), a.F(o)], [0, 0.2, -o], inner);
      if (strake) { const { col: c, y0, y1, out } = strake; B.poly([a.P(o, y1, out), b.P(o, y1, out), b.P(o, y0, out), a.P(o, y0, out)], [0, 0, o], c).poly([a.P(o, y1, out), b.P(o, y1, out), b.P(o, y1, -0.04), a.P(o, y1, -0.04)], [0, 1, 0], c).poly([a.P(o, y0, out), b.P(o, y0, out), b.P(o, y0, -0.06), a.P(o, y0, -0.06)], [0, -1, 0], c); }
    }
    B.poly([a.K(-1), b.K(-1), b.K(1), a.K(1)], [0, -1, 0], col).poly([a.F(-1), b.F(-1), b.F(1), a.F(1)], [0, 1, 0], floor);
  }
  for (const [p, d] of [[pt[0], -1], [pt[n - 1], 1]]) B.poly([p.S(-1), p.C(-1), p.K(-1), p.K(1), p.C(1), p.S(1)], [d, 0, 0], col).poly([p.S(-1), p.S(1), p.T(1), p.T(-1)], [0, 1, 0], rimCol).poly([p.T(-1), p.T(1), p.F(1), p.F(-1)], [-d, 0.1, 0], inner);
  if (strake) { const p = pt[0], { col: c, y0, y1, out } = strake; B.poly([p.P(-1, y1, out), p.P(1, y1, out), p.P(1, y0, out), p.P(-1, y0, out)], [-1, 0, 0], c).poly([p.P(-1, y1, out), p.P(1, y1, out), pt[0].S(1), pt[0].S(-1)], [0, 1, 0], c); }
}
const stations = (L, n, f) => Array.from({ length: n + 1 }, (_, i) => [-L / 2 + (L * i) / n, ...f(i / n)]);
const boat = (B, K) => { const g = new THREE.Group(); g.add(mesh(join(noUV(B), K.geo()), mats().plain)); return g; };
const JACKETS = ['#e9503a', '#2f6fc9', '#f2c230', '#3aa66a', '#f08a2c', '#8e5bd0', '#ff7fb0', '#35b5c9'], HAIRS = ['#3a2a1e', '#d9b25a', '#7a4a2a', '#1c1c1c', '#b9b9b9'], WOOD = '#b98a52', WOOD2 = '#9a6a3a';
// someone sitting, facing +x, on a seat at height y: 0.69 m from the seat to the top of the head
const sitter = (K, x, y, z, i, hat) => K.box(0.26, 0.42, 0.38, JACKETS[i % 8], x, y + 0.21, z).box(0.36, 0.13, 0.32, '#39425c', x + 0.2, y + 0.065, z).add(Sph(0.125, 6, 3), SKIN, x + 0.02, y + 0.535, z).add(Sph(0.135, 6, 3, 0, PI * 2, 0, PI / 2), hat || HAIRS[i % 5], x, y + 0.55, z);
const miniBike = (K, x, y, z, col) => { // a bike standing on y, along x
  for (const dx of [-0.52, 0.52]) K.add(Tor(0.3, 0.03, 3, 10), '#1c1c1c', x + dx, y + 0.33, z);
  for (const [a, b, c, d] of [[-0.52, 0.33, -0.2, 0.85], [-0.2, 0.85, 0.36, 0.8], [0, 0.33, -0.2, 0.85], [0, 0.33, 0.36, 0.8], [-0.52, 0.33, 0, 0.33], [0.52, 0.33, 0.32, 1.05]]) K.bar([x + a, y + b, z], [x + c, y + d, z], 0.04, col);
  K.box(0.05, 0.04, 0.5, '#c9ccd2', x + 0.3, y + 1.07, z).box(0.24, 0.06, 0.14, '#5a3d2b', x - 0.22, y + 0.9, z);
};
const pot = (K, x, y, z, c, r = 0.16) => K.add(Cyl(r, r * 0.75, r * 1.7, 5), '#c96a3d', x, y + r * 0.85, z).add(Ico(r * 1.15), '#4ca649', x, y + r * 2.3, z).add(Ico(r * 0.45), c, x + r * 0.5, y + r * 3.1, z + r * 0.3);

// The low open canal-tour boat: 9.0 x 2.5 m, 0.96 m above the water with everyone seated, so it clears the low bridges
export function rondvaartboot() {
  const B = new Skin(), K = new Kit();
  hull(B, stations(9, 9, (t) => [1.2 * (t < 0.2 ? 0.8 + t : t < 0.62 ? 1 : sqrt(max(0.0012, 1 - ((t - 0.62) / 0.38) ** 2))), -0.3 + (0.22 * max(0, t - 0.7)) / 0.3, 0.42 + 0.14 * t ** 4]),
    { col: '#1f5a3c', inner: '#e8dcc0', rimCol: WHITE, floor: WOOD, floorY: 0.08, rim: 0.1, strake: { col: RED, y0: 0.2, y1: 0.08, out: 0.035 } });
  let i = 0;
  for (const x of [-2.6, -1.5, -0.4, 0.7, 1.8]) { K.box(0.34, 0.29, 1.96, WOOD2, x, 0.125, 0); for (const z of [-0.5, 0.5]) { sitter(K, x, 0.27, z, i); if (i % 3 === 0) K.box(0.1, 0.07, 0.06, '#222222', x + 0.2, 0.72, z); i++; } }
  K.box(0.5, 0.29, 1.6, WOOD2, -3.75, 0.125, 0); sitter(K, -3.75, 0.27, 0, 3, '#ffffff'); K.box(0.2, 0.03, 0.2, '#1d2f55', -3.62, 0.83, 0); // the skipper and the peak of his cap
  K.box(0.28, 0.5, 0.6, WHITE, -3.1, 0.23, 0).add(Tor(0.16, 0.025, 4, 10).rotateY(PI / 2), WOOD2, -3.26, 0.62, 0).box(0.1, 0.04, 0.04, WOOD2, -3.2, 0.62, 0);
  K.bar([-4.36, 0.4, 0], [-4.36, 0.98, 0], 0.035, WHITE); K.at(-4.36, 0.97, 0); flag(K, 0.32, 0.21); K.at();
  K.box(0.5, 0.2, 0.05, WHITE, 3.2, 0.3, 0).add(Cyl(0.06, 0.06, 0.14, 6), '#fff1c4', 3.9, 0.56, 0).box(0.5, 0.05, 0.3, WOOD2, 3.7, 0.47, 0); // bow seat and lantern
  return boat(B, K);
}
// An open launch: 5.65 x 2.0 m, 1.45 m above the water at the flag
export function sloep() {
  const B = new Skin(), K = new Kit();
  hull(B, stations(5.5, 8, (t) => [0.96 * (t < 0.25 ? 0.78 + 0.88 * t : t < 0.55 ? 1 : sqrt(max(0.0015, 1 - ((t - 0.55) / 0.45) ** 2))), -0.3 + (0.2 * max(0, t - 0.65)) / 0.35, 0.5 + 0.2 * t ** 3]),
    { col: '#1d3a66', inner: WOOD, rimCol: '#e8dcc0', floor: '#a97c4a', floorY: 0.08, rim: 0.13, strake: { col: '#e8dcc0', y0: 0.17, y1: 0.06, out: 0.04 } });
  K.box(0.45, 0.26, 1.2, WOOD2, -2.3, 0.17, 0).box(0.3, 0.26, 1.5, WOOD2, 0.3, 0.17, 0); sitter(K, -2.3, 0.3, -0.35, 1, '#f2c230'); sitter(K, -2.3, 0.3, 0.35, 6);
  K.box(0.3, 0.6, 0.5, WHITE, -1.2, 0.28, 0.3).add(Tor(0.17, 0.025, 4, 10).rotateY(PI / 2), WOOD2, -1.38, 0.66, 0.3).box(0.12, 0.04, 0.04, WOOD2, -1.3, 0.66, 0.3);
  K.box(0.26, 0.36, 0.3, '#22262d', -2.86, 0.68, 0).box(0.08, 0.8, 0.08, '#22262d', -2.86, 0.15, 0); // outboard
  K.box(0.42, 0.26, 0.3, '#35b5c9', 0.9, 0.11, -0.35).box(0.44, 0.05, 0.32, WHITE, 0.9, 0.265, -0.35);
  const dog = '#c98b4a'; K.box(0.42, 0.2, 0.18, dog, 1.5, 0.3, 0).box(0.17, 0.17, 0.16, dog, 1.76, 0.44, 0).box(0.1, 0.07, 0.08, '#8a5a2e', 1.87, 0.41, 0).box(0.05, 0.16, 0.05, dog, 1.3, 0.45, 0); for (const [x, z] of [[1.35, -0.06], [1.35, 0.06], [1.65, -0.06], [1.65, 0.06]]) K.box(0.05, 0.22, 0.05, dog, x, 0.09, z);
  for (const z of [-0.09, 0.09]) K.box(0.03, 0.09, 0.05, '#8a5a2e', 1.72, 0.55, z);
  K.bar([-2.7, 0.5, 0.55], [-2.7, 1.45, 0.55], 0.035, WHITE); K.at(-2.7, 1.44, 0.55); flag(K, 0.42, 0.28); K.at();
  return boat(B, K);
}
// A rowing boat with its oars resting on the gunwales: 3.6 m long (4.05 with the oar blades), 1.3 m beam (2.35 across the oars), 0.5 m above the water
export function roeiboot() {
  const B = new Skin(), K = new Kit();
  hull(B, stations(3.6, 7, (t) => [0.65 * (t < 0.3 ? 0.7 + t : t < 0.5 ? 1 : sqrt(max(0.002, 1 - ((t - 0.5) / 0.5) ** 2))), -0.22 + (0.15 * max(0, t - 0.6)) / 0.4, 0.32 + 0.12 * t ** 3]),
    { col: WHITE, inner: '#d9a765', rimCol: '#a86e38', floor: WOOD, floorY: 0.08, rim: 0.07, strake: { col: RED, y0: 0.13, y1: 0.05, out: 0.025 } });
  for (const [x, w] of [[-1.25, 1.02], [-0.1, 1.08], [0.85, 0.74]]) K.box(0.22, 0.04, w, WOOD2, x, 0.2, 0);
  for (const o of [-1, 1]) K.bar([0.4, 0.5, o * 0.25], [-1.75, 0.2, o * 0.98], 0.045, '#d9a765').bar([-1.72, 0.2, o * 0.97], [-2.24, 0.13, o * 1.14], 0.03, RED, 0.17).box(0.07, 0.08, 0.07, '#2b2f36', -0.78, 0.33, o * 0.64);
  K.add(Cyl(0.13, 0.1, 0.22, 6), '#e9503a', 1.2, 0.16, 0).add(Tor(0.14, 0.035, 4, 10).rotateX(PI / 2), '#e8dcc0', -0.65, 0.11, 0.1);
  return boat(B, K);
}
// A moored tjalk: black bluff-bowed barge, 11.8 m over the rudder, 3.5 m across the leeboards, mast top 10.3 m above the water; sail furled brown on the boom
export function tjalk() {
  const B = new Skin(), K = new Kit(), ys = (x) => 0.72 + 0.38 * abs(x / 5.5) ** 2.5, tan = '#8a4b2f', spar = '#a0652f', iron = '#2b2f36';
  hull(B, stations(11, 12, (t) => { const e = abs(2 * t - 1); return [1.6 * max(0.03, sqrt(1 - e ** 3.2)), -0.3 + 0.12 * e ** 4, 0.72 + 0.38 * e ** 2.5]; }),
    { col: '#26221f', inner: '#26221f', rimCol: '#3f7a52', floor: WOOD2, floorY: (y) => y - 0.14, rim: 0.12, strake: { col: '#e8dcc0', y0: 0.3, y1: 0.16, out: 0.05 } });
  K.box(4.6, 0.12, 2.16, '#7a4a2a', 0.7, 0.62, 0).add(ext([[-1, 0], [-1, 0.26], [-0.5, 0.42], [0.5, 0.42], [1, 0.26], [1, 0]], 4.4).rotateY(PI / 2), '#6d7f5a', 0.7, 0.66, 0); // the hold under its hatch covers
  for (const x of [-0.75, 0.7, 2.15]) K.box(0.07, 0.04, 1.1, '#e8dcc0', x, 1.09, 0);
  K.box(1.7, 0.62, 2, WHITE, -3.05, 0.93, 0).box(1.86, 0.08, 2.16, GREEN, -3.05, 1.27, 0).box(0.1, 0.5, 0.1, spar, -3.05, 1.52, 0); // deckhouse
  for (const o of [-1, 1]) for (const x of [-3.45, -2.65]) K.box(0.36, 0.26, 0.05, GLASS, x, 0.98, o * 1);
  K.add(Cyl(0.08, 0.13, 9.7, 8), spar, 3.2, 5.45, 0).box(0.42, 1, 0.42, GREEN, 3.2, 1.1, 0).add(Ico(0.1), GOLD, 3.2, 10.33, 0); K.at(3.2, 10.2, 0, PI); flag(K, 1.3, 0.24); K.at();
  K.bar([3.05, 1.9, 0], [-3.4, 1.75, 0], 0.12, spar).add(Cyl(0.2, 0.24, 5.6, 7).rotateZ(PI / 2), tan, -0.1, 2.03, 0).bar([2.95, 2.32, 0], [-2.3, 2.3, 0], 0.09, spar);
  for (const x of [-2.2, -0.8, 0.6, 2]) K.add(Cyl(0.255, 0.255, 0.07, 7).rotateZ(PI / 2), '#e8dcc0', x, 2.03, 0);
  K.bar([3.2, 10, 0], [5.3, ys(5.3) + 0.02, 0], 0.035, iron); for (const o of [-1, 1]) K.bar([3.2, 9.2, 0], [3, ys(3) - 0.02, o * 1.42], 0.035, iron);
  const board = [[0, 0.05], [0.26, 0.1], [0.42, -0.5], [0.46, -1.4], [0.2, -2.2], [-0.35, -2.3], [-0.6, -1.6], [-0.32, -0.5], [-0.16, 0]];
  for (const o of [-1, 1]) K.add(ext(board, 0.07).rotateZ(-1.31), spar, 1.9, 0.8, o * 1.685).add(Cyl(0.06, 0.06, 0.16, 6).rotateX(PI / 2), iron, 1.9, 0.8, o * 1.66); // leeboards, raised
  K.box(0.85, 1.25, 0.09, spar, -5.86, 0.42, 0).bar([-5.6, 1.12, 0], [-4.3, 1.3, 0], 0.08, spar).box(0.22, 0.26, 0.13, GREEN, -5.62, 1.12, 0); // rudder and tiller
  for (const o of [-1, 1]) K.add(Cyl(0.07, 0.07, 0.3, 6), iron, 4.6, ys(4.6) - 0.02, o * 0.4); K.box(0.5, 0.3, 0.8, iron, 4.1, ys(4.1), 0);
  return boat(B, K);
}
// A houseboat: 12.0 x 4.1 m, roof 2.95 m above the water, the bike on the roof 4.05 m
export function woonboot() {
  const B = new Skin(), K = new Kit(), wall = '#3f8f8a', FL = ['#e9503a', '#ff7fb0', '#f2c230'];
  hull(B, stations(12, 6, (t) => { const e = abs(2 * t - 1); return [2 * (1 - 0.1 * max(0, (e - 0.67) / 0.33) ** 2), -0.3, 0.55]; }),
    { col: '#39464a', inner: '#39464a', rimCol: WHITE, floor: '#a07a4c', floorY: 0.47, rim: 0.12, strake: { col: WHITE, y0: 0.2, y1: 0.08, out: 0.04 } });
  K.box(8.2, 2.3, 2.9, wall, -0.8, 1.6, 0).box(8.28, 0.3, 2.98, '#2c6966', -0.8, 0.6, 0).box(8.36, 0.18, 3.06, WHITE, -0.8, 2.78, 0).box(8.5, 0.08, 3.2, '#4b5058', -0.8, 2.91, 0);
  let i = 0;
  for (const o of [-1, 1]) for (const x of [-3.6, -1.4, 0.8]) {
    K.box(1.2, 1, 0.08, WHITE, x, 1.8, o * 1.46).box(1, 0.8, 0.08, GLASS, x, 1.8, o * 1.49).box(0.05, 0.8, 0.08, WHITE, x, 1.8, o * 1.52);
    if (x !== -1.4) { K.box(1.1, 0.16, 0.2, '#8a4b2f', x, 1.2, o * 1.56); for (const q of [-0.3, 0.3]) K.box(0.3, 0.14, 0.16, FL[i++ % 3], x + q, 1.33, o * 1.56); }
  }
  K.box(0.08, 1.95, 0.9, WHITE, 3.31, 1.45, -0.5).box(0.08, 1.8, 0.75, '#e9503a', 3.34, 1.4, -0.5).add(Ico(0.05), GOLD, 3.4, 1.4, -0.22).add(Cyl(0.36, 0.36, 0.08, 10).rotateZ(PI / 2), WHITE, 3.31, 1.85, 0.7).add(Cyl(0.28, 0.28, 0.08, 10).rotateZ(PI / 2), GLASS, 3.34, 1.85, 0.7);
  for (const [x, z] of [[3.5, -1.7], [3.5, 1.7], [5.7, -1.55], [5.7, 1.55]]) K.box(0.08, 0.9, 0.08, WHITE, x, 0.92, z); // the terrace at the bow
  K.bar([3.5, 1.35, -1.7], [5.7, 1.35, -1.55], 0.07, WHITE).bar([3.5, 1.35, 1.7], [5.7, 1.35, 1.55], 0.07, WHITE).bar([5.7, 1.35, -1.55], [5.7, 1.35, 1.55], 0.07, WHITE);
  K.add(Cyl(0.4, 0.4, 0.05, 8), WHITE, 4.6, 1.12, 0.3).add(Cyl(0.04, 0.04, 0.65, 5), WHITE, 4.6, 0.79, 0.3); pot(K, 5.3, 0.47, -1.1, '#ff7fb0', 0.2); pot(K, 3.75, 0.47, 1.25, '#f2c230', 0.17);
  const RY = 2.95; miniBike(K, 0.6, RY, 0.5, '#e9503a'); pot(K, 3, RY, -1.2, '#e9503a'); pot(K, -4.6, RY, 1.2, '#ffffff');
  for (const [z, c] of [[-0.86, RED], [-0.7, '#ffffff'], [-0.54, RED]]) K.bar([-3.5, RY + 0.12, z], [-2.5, RY + 0.95, z], 0.03, c, 0.16); // deck chair
  for (const z of [-0.97, -0.43]) K.bar([-3.4, RY + 0.8, z], [-2.55, RY, z], 0.05, WOOD2).bar([-3.55, RY, z], [-2.45, RY + 1, z], 0.05, WOOD2);
  K.add(Cyl(0.09, 0.09, 0.9, 6), '#8d9399', -1.2, RY + 0.45, -0.9).add(Cone(0.2, 0.16, 6), '#8d9399', -1.2, RY + 1.02, -0.9);
  return boat(B, K);
}

// ---- small props: one fused, vertex-coloured geometry each ----
// A tint multiplies every vertex colour, so props with a tintable part take an argument: nothing = the whole prop, 'tint' = only the white part, 'rest' = only the baked part.
const part = (T, R, want) => (want === 'tint' ? T.geo() : want === 'rest' ? R.geo() : join(T.geo(), R.geo()));
const rod = (K, a, b, r, col, s = 5, r1 = r) => { // a round bar from a to b
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), g = Cyl(r1, r, d.length(), s);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); A.lerp(B, 0.5); return K.add(g, col, A.x, A.y, A.z);
};
// a profile ([radius, y] from the bottom up the outside) turned round the y axis; one colour per profile segment, faces looking outwards
const turn = (pts, seg, cols, a0 = 0, len = PI * 2) => {
  const P = [], N = [], K = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1], l = hypot(r1 - r0, y1 - y0) || 1, nr = (y1 - y0) / l, ny = -(r1 - r0) / l, c = C(Array.isArray(cols) ? cols[i] : cols);
    for (let k = 0; k < seg; k++) {
      const a = a0 + (len * k) / seg, b = a0 + (len * (k + 1)) / seg, v = (r, y, t) => [r * cos(t), y, r * sin(t), nr * cos(t), ny, nr * sin(t)];
      const A = v(r0, y0, a), B = v(r1, y1, a), D = v(r1, y1, b), E = v(r0, y0, b);
      for (const q of [...(r1 > 1e-6 ? [A, B, D] : []), ...(r0 > 1e-6 ? [A, D, E] : [])]) { P.push(q[0], q[1], q[2]); N.push(q[3], q[4], q[5]); K.push(c.r, c.g, c.b); }
    }
  }
  const g = raw(P, N); g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3)); return g;
};

// -- water life (origin on the waterline) --
// A mallard drake swimming towards +x, 0.46 m long
export function duckGeo() {
  const K = new Kit();
  K.add(Sph(1, 8, 5).scale(0.19, 0.1, 0.125), '#9c9186', -0.02, 0.045, 0).add(Sph(1, 6, 4).scale(0.09, 0.085, 0.1), '#6b3f2a', 0.11, 0.055, 0);
  for (const o of [-1, 1]) K.add(Sph(1, 6, 4).scale(0.13, 0.06, 0.035), '#7d7166', -0.05, 0.085, o * 0.1).box(0.06, 0.03, 0.02, '#2f6fc9', -0.1, 0.09, o * 0.128);
  K.add(Cone(0.05, 0.13, 4).rotateZ(0.95), '#2a2a2a', -0.22, 0.1, 0);
  K.add(Cyl(0.036, 0.046, 0.1, 6), '#f4f4f0', 0.15, 0.14, 0).add(Sph(0.066, 6, 5), '#1f6b45', 0.165, 0.215, 0).box(0.085, 0.022, 0.05, GOLD, 0.25, 0.2, 0).box(0.014, 0.014, 0.137, '#111111', 0.19, 0.235, 0);
  return K.geo().scale(0.8, 0.8, 0.8);
}
// A mute swan, 1.0 m long, head 0.83 m above the water
export function swanGeo() {
  const K = new Kit(), w = '#ffffff', w2 = '#eef0ee';
  K.add(Sph(1, 8, 5).scale(0.42, 0.2, 0.25), w, 0, 0.1, 0).add(Cone(0.11, 0.3, 4).rotateZ(1.05), w2, -0.42, 0.2, 0);
  for (const o of [-1, 1]) K.add(Sph(1, 6, 4).scale(0.3, 0.19, 0.07), w2, -0.08, 0.25, o * 0.19);
  rod(K, [0.3, 0.14, 0], [0.45, 0.5, 0], 0.07, w, 6, 0.05); rod(K, [0.455, 0.46, 0], [0.38, 0.76, 0], 0.052, w, 6, 0.045);
  K.add(Sph(0.075, 6, 4).scale(1.25, 1, 1), w, 0.41, 0.78, 0).box(0.12, 0.035, 0.05, '#f08a2c', 0.53, 0.76, 0).box(0.045, 0.045, 0.058, '#111111', 0.478, 0.79, 0).box(0.014, 0.014, 0.155, '#111111', 0.44, 0.805, 0);
  return K.geo();
}
// A patch of water lilies 1.15 m across, 0 to 0.06 m high: five notched pads and two flowers
export function lilyGeo() {
  const K = new Kit();
  [[-0.3, -0.12, 0.27, 0.4, '#3f8f4a'], [0.25, -0.25, 0.22, 2.2, '#4ca649'], [0.33, 0.26, 0.25, 4, '#35803f'], [-0.15, 0.35, 0.2, 5.2, '#58ad4f'], [0.02, 0.04, 0.1, 1, '#4ca649']]
    .forEach(([x, z, r, a, c], i) => K.at(x, 0.024 + i * 0.001, z, a).add(new THREE.CylinderGeometry(r, r * 0.9, 0.02, 9, 1, false, 0.35, PI * 2 - 0.7), c));
  for (const [x, z, c] of [[-0.3, -0.12, '#fff6fb'], [0.33, 0.26, '#ff9ec4']]) K.at(x, 0, z).add(Cone(0.075, 0.022, 6).rotateX(PI), c, 0, 0.046, 0).add(Cyl(0.022, 0.022, 0.006, 5), GOLD, 0, 0.057, 0);
  return K.geo();
}
// A clump of reed with three cattails, 1.6 m tall, rooted 0.3 m under the water
export function reedGeo() {
  const K = new Kit(), r = rnd(5);
  for (let i = 0; i < 11; i++) {
    const a = r() * PI * 2, d = 0.04 + r() * 0.2, h = 1.0 + r() * 0.62;
    K.at(cos(a) * d, -0.3, sin(a) * d, a, 0.04 + r() * 0.12).add(Cone(0.03, h + 0.3, 3, true).translate(0, (h + 0.3) / 2, 0), ['#6f9a3c', '#8fae4a', '#5d8a35'][i % 3]);
  }
  for (const [a, d, h] of [[0.5, 0.1, 1.28], [2.7, 0.14, 1.12], [4.6, 0.07, 1.36]]) K.at(cos(a) * d, -0.3, sin(a) * d, a, 0.06).add(Cyl(0.012, 0.016, h + 0.3, 4).translate(0, (h + 0.3) / 2, 0), '#8fae4a').add(Cyl(0.036, 0.036, 0.2, 5), '#5a3a22', 0, h + 0.36, 0).add(Cone(0.012, 0.1, 4), '#8fae4a', 0, h + 0.51, 0);
  return K.geo();
}
// A mooring post: 1.5 m above the water, 0.3 m below, white head band, a rope round it
export function mooringPostGeo() {
  const K = new Kit();
  K.add(Cyl(0.12, 0.14, 1.7, 8), '#5b4332', 0, 0.55, 0).add(Cyl(0.155, 0.155, 0.22, 8), '#f6f1e4', 0, 1.2, 0).add(Cyl(0.1, 0.15, 0.1, 8), '#2b2f36', 0, 1.45, 0)
    .add(Cyl(0.16, 0.17, 0.34, 8), '#3d5a3a', 0, 0, 0).add(Tor(0.165, 0.032, 4, 8).rotateX(PI / 2), '#c9a86a', 0, 0.74, 0).add(Tor(0.165, 0.032, 4, 8).rotateX(PI / 2 + 0.12), '#b89658', 0, 0.8, 0);
  return K.geo();
}
// A gull gliding towards +x, wings out along z: span 1.17 m, origin in the middle of the body
export function gullGeo() {
  const K = new Kit(), w = '#fbfbf7', gr = '#b4bcc6';
  K.add(Sph(1, 6, 4).scale(0.2, 0.065, 0.07), w).add(Sph(0.055, 6, 4), w, 0.18, 0.03, 0).box(0.07, 0.02, 0.026, GOLD, 0.255, 0.025, 0).box(0.14, 0.014, 0.1, w, -0.24, 0.005, 0).box(0.012, 0.012, 0.113, '#111111', 0.2, 0.045, 0);
  for (const o of [-1, 1]) K.add(Box(0.17, 0.02, 0.3).rotateX(-o * 0.42), gr, 0.02, 0.07, o * 0.17).add(Box(0.13, 0.018, 0.22).rotateX(o * 0.18), gr, 0, 0.112, o * 0.41).add(Box(0.09, 0.016, 0.07).rotateX(o * 0.18), '#22262d', -0.01, 0.086, o * 0.552);
  return K.geo();
}

// -- the cheese market --
const WAXES = ['#f2b632', '#eeaa2c', '#f5c043'];
const wheel = (K, x, y, z, r, t, seg, { a0 = 0, len = PI * 2, bottom = true, wax = WAXES[0] } = {}) => {
  const b = r * 0.16, full = [[0, 0], [r - b, 0], [r, b], [r, t - b], [r - b, t], [r * 0.46, t], [0, t]], cols = ['#d99a26', wax, C(wax).multiplyScalar(0.88), wax, wax, '#f6ecd0'];
  K.at(x, y, z).pre(turn(bottom ? full : full.slice(1), seg, bottom ? cols : cols.slice(1), a0, len));
  if (len < PI * 2 - 1e-3) { const S = new Skin(); for (const [a, s] of [[a0, 1], [a0 + len, -1]]) S.poly(full.map(([q, h]) => [q * cos(a), h, q * sin(a)]), [s * sin(a), 0, -s * cos(a)], '#f7e2a0'); K.skin(S); }
  return K.at();
};
// One Gouda wheel lying flat: r 0.36, 0.11 thick, origin under its centre; wax yellow with a pale round label on top
export function cheeseWheelGeo() { return wheel(new Kit(), 0, 0, 0, 0.36, 0.11, 14).geo(); }
// Nine small wheels (r 0.2) stacked 6 + 2 + 1 on a slatted pallet 1.3 x 1.0; the top one is cut open
export function cheeseStackGeo() {
  const K = new Kit();
  for (const x of [-0.58, 0, 0.58]) K.box(0.1, 0.09, 1, '#8a6238', x, 0.045, 0);
  for (let i = 0; i < 5; i++) K.box(1.3, 0.024, 0.17, i % 2 ? '#c9a26a' : '#b98a52', 0, 0.102, -0.415 + i * 0.2075);
  let n = 0; const top = 0.114, o = () => ({ bottom: false, wax: WAXES[n++ % 3] });
  for (const x of [-0.42, 0, 0.42]) for (const z of [-0.215, 0.215]) wheel(K, x, top, z, 0.2, 0.12, 9, o());
  for (const x of [-0.21, 0.21]) wheel(K, x, top + 0.12, 0, 0.2, 0.12, 9, o());
  wheel(K, 0, top + 0.24, 0, 0.2, 0.12, 9, { a0: PI / 4 + 0.5, len: PI * 2 - 1, wax: WAXES[0] });
  return K.geo();
}
// An Edam ball: red wax, r 0.16, flattened poles, origin under it
export function edamGeo() { return new Kit().add(Sph(0.16, 10, 6).scale(1, 0.86, 1), '#c8102e', 0, 0.1376, 0).add(Cyl(0.05, 0.05, 0.012, 8), '#f6ecd0', 0, 0.277, 0).geo(); }
// The cheese carriers' barrow, at carrying height: 2.2 x 0.68, long axis x. Runners, end bars and handles are white (the guild colour goes on as a tint);
// the slatted floor is wood, 0.55 m above the ground in the middle and rising to 0.84 at the ends: floor(x) = 0.55 + 0.3 (x / 0.85)^2. A leather strap hangs from each end.
export function berrieGeo(want) {
  const T = new Kit(), R = new Kit(), fy = (x) => 0.54 + 0.3 * (x / 0.85) ** 2, W = '#ffffff';
  for (const o of [-1, 1]) {
    for (let i = 0; i < 6; i++) { const x0 = -0.85 + (i * 1.7) / 6, x1 = x0 + 1.7 / 6; T.bar([x0, fy(x0), o * 0.31], [x1, fy(x1), o * 0.31], 0.07, W, 0.06); }
    for (const e of [-1, 1]) T.bar([e * 0.82, 0.83, o * 0.31], [e * 1.1, 0.87, o * 0.31], 0.05, W);
  }
  for (const e of [-1, 1]) {
    T.box(0.06, 0.07, 0.56, W, e * 0.85, 0.84, 0);
    R.bar([e * 1.04, 0.84, -0.31], [e * 1.04, 0.46, -0.11], 0.02, '#5a3d2b', 0.05).bar([e * 1.04, 0.46, -0.12], [e * 1.04, 0.46, 0.12], 0.02, '#4a3122', 0.05).bar([e * 1.04, 0.46, 0.11], [e * 1.04, 0.84, 0.31], 0.02, '#5a3d2b', 0.05);
  }
  for (let i = 0; i < 8; i++) { const x = -0.74 + (i * 1.48) / 7; R.at(x, fy(x), 0, 0, 0, Math.atan((0.6 * x) / 0.7225)).box(0.17, 0.025, 0.56, i % 2 ? '#c9a26a' : '#b98a52'); }
  R.at();
  return part(T, R, want);
}
// The weighing balance of the Waag: 2.5 m wide, 2.5 m tall, a cheese on the low pan and iron weights on the other
export function scaleGeo() {
  const K = new Kit(), iron = '#2b2f36', TL = 0.07, bx = 0.95, by = 2.02, bz = 0.125;
  K.box(1, 0.1, 0.16, '#3a2c22', 0, 0.05, 0).box(0.16, 0.09, 0.8, '#3a2c22', 0, 0.045, 0).box(0.13, 2.2, 0.13, GREEN, 0, 1.2, 0).box(0.2, 0.06, 0.2, GOLD, 0, 2.33, 0).add(Ico(0.07), GOLD, 0, 2.42, 0);
  for (const o of [-1, 1]) K.bar([o * 0.38, 0.1, 0], [0, 0.72, 0], 0.06, GREEN);
  K.at(0, by, bz, 0, 0, TL).box(2, 0.08, 0.06, iron).box(0.03, 0.34, 0.03, GOLD, 0, 0.2, 0).box(0.1, 0.1, 0.22, GOLD, 0, 0, -0.04); K.at();
  for (const e of [-1, 1]) {
    const ex = e * bx * cos(TL), ey = by + e * bx * sin(TL), py = ey - 1.45;
    K.box(0.07, 0.07, 0.07, iron, ex, ey - 0.03, bz).box(0.62, 0.05, 0.62, e < 0 ? '#b98a52' : '#a97c4a', ex, py, bz);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(K, [ex, ey - 0.03, bz], [ex + u * 0.28, py + 0.02, bz + v * 0.28], 0.012, iron, 3);
    if (e < 0) wheel(K, ex, py + 0.025, bz, 0.25, 0.1, 9);
    else K.add(Cyl(0.11, 0.125, 0.15, 6), iron, ex - 0.08, py + 0.1, bz - 0.04).box(0.05, 0.05, 0.05, GOLD, ex - 0.08, py + 0.2, bz - 0.04).add(Cyl(0.07, 0.08, 0.1, 6), iron, ex + 0.15, py + 0.075, bz + 0.12).box(0.04, 0.04, 0.04, GOLD, ex + 0.15, py + 0.14, bz + 0.12);
  }
  return K.geo();
}

// -- street and bridge furniture --
// A park bench: cast-iron ends with armrests and a ring, four seat slats and three back slats. Long axis x, back on +z; 1.65 x 0.6, 0.94 tall
export function benchGeo() {
  const K = new Kit(), iron = '#1f2a24', t = 0.05;
  for (const x of [-0.8, 0.8]) {
    K.bar([x, 0.03, -0.25], [x, 0.43, -0.21], t, iron).bar([x, 0.03, 0.26], [x, 0.43, 0.15], t, iron).bar([x, 0.4, 0.15], [x, 0.915, 0.26], t, iron).bar([x, 0.42, -0.23], [x, 0.42, 0.17], t, iron)
      .bar([x, 0.42, -0.2], [x, 0.66, -0.23], t, iron).bar([x, 0.665, -0.26], [x, 0.685, 0.22], t, iron, 0.07).box(0.09, 0.03, 0.1, iron, x, 0.015, -0.25).box(0.09, 0.03, 0.1, iron, x, 0.015, 0.26)
      .add(Tor(0.075, 0.018, 3, 8).rotateY(PI / 2), iron, x, 0.54, -0.02);
  }
  [-0.2, -0.087, 0.026, 0.139].forEach((z, i) => K.box(1.56, 0.03, 0.097, i % 2 ? '#b47d47' : '#a8713e', 0, 0.46, z));
  [0.58, 0.71, 0.84].forEach((y, i) => K.at(0, y, 0.15 + (0.11 * (y - 0.4)) / 0.515 - 0.04, 0, 0.21).box(1.56, 0.1, 0.03, i % 2 ? '#a8713e' : '#b47d47'));
  K.at(); return K.geo();
}
// A bridge lantern on a cast-iron post: 3.25 m tall, foot 0.28 wide, cream glass
export function bridgeLampGeo() {
  const K = new Kit(), iron = '#1f2a24', gy = 2.56;
  K.add(Cyl(0.1, 0.14, 0.45, 8), iron, 0, 0.225, 0).add(Cyl(0.135, 0.135, 0.06, 8), iron, 0, 0.48, 0).add(Cyl(0.045, 0.07, 1.95, 6), iron, 0, 1.485, 0).add(Cyl(0.09, 0.09, 0.05, 6), iron, 0, 1.25, 0)
    .box(0.5, 0.035, 0.035, iron, 0, 2.3, 0).add(Ico(0.035), GOLD, -0.25, 2.3, 0).add(Ico(0.035), GOLD, 0.25, 2.3, 0).add(Cyl(0.13, 0.05, 0.12, 6), iron, 0, gy - 0.06, 0)
    .add(Cyl(0.2, 0.13, 0.42, 6), '#fff1c4', 0, gy + 0.21, 0).add(Cyl(0.06, 0.25, 0.14, 6), iron, 0, gy + 0.49, 0).add(Cyl(0.05, 0.07, 0.08, 6), iron, 0, gy + 0.6, 0).add(Ico(0.04), GOLD, 0, gy + 0.67, 0);
  for (let k = 0; k < 6; k++) { const a = (k * PI) / 3 + PI / 6, p = (r, y) => [sin(a) * r, y, cos(a) * r]; rod(K, p(0.137, gy), p(0.208, gy + 0.42), 0.012, iron, 3); }
  return K.geo();
}
// One metre of white bridge railing along x (-0.5 to 0.5), 1.0 tall, 0.09 thick: a post in the middle, four pickets and two rings. Sections butt end to end.
export function railingGeo() {
  const K = new Kit(), W = '#ffffff';
  K.box(1, 0.07, 0.09, W, 0, 0.965, 0).box(1, 0.05, 0.05, W, 0, 0.2, 0).box(0.07, 0.93, 0.06, W, 0, 0.465, 0).box(1, 0.04, 0.04, W, 0, 0.7, 0);
  for (const x of [-0.375, -0.125, 0.125, 0.375]) K.box(0.03, 0.455, 0.03, W, x, 0.4525, 0);
  for (const x of [-0.25, 0.25]) K.add(Tor(0.085, 0.016, 3, 8), W, x, 0.825, 0);
  return K.geo();
}
// A herring cart, serving side +z: 2.45 x 1.6, awning ridge 2.5, flag top 3.0. White cart with red and blue bands, red-and-white striped awning, a sign with a fish, herring on the counter
export function haringkarGeo() {
  const K = new Kit(), iron = '#2b2f36', zinc = '#c9ccd2';
  for (const o of [-1, 1]) {
    K.add(Tor(0.4, 0.035, 4, 12), iron, -0.15, 0.435, o * 0.6).add(Cyl(0.07, 0.07, 0.1, 6).rotateX(PI / 2), GOLD, -0.15, 0.435, o * 0.6);
    for (let k = 0; k < 3; k++) K.at(-0.15, 0.435, o * 0.6, 0, 0, (k * PI) / 3).box(0.78, 0.04, 0.03, RED);
    K.at().box(0.06, 0.55, 0.06, WHITE, 0.9, 0.275, o * 0.4).bar([0.95, 0.95, o * 0.4], [1.27, 1.02, o * 0.4], 0.05, WOOD2);
    for (const x of [-0.95, 0.95]) K.box(0.05, 1.2, 0.05, WHITE, x, 1.7, o * 0.47);
    for (let i = 0; i < 7; i++) K.at(-0.9857 + i * 0.32857, 2.35, o * 0.4, 0, o * 0.3588).box(0.32857, 0.035, 0.84, i % 2 ? '#ffffff' : RED);
    K.at().box(2.3, 0.14, 0.03, BLUE, 0, 2.13, o * 0.785);
  }
  K.add(Cyl(0.03, 0.03, 1.2, 5).rotateX(PI / 2), iron, -0.15, 0.435, 0).box(2, 0.5, 1, WHITE, 0, 0.8, 0).box(2.06, 0.14, 1.06, BLUE, 0, 0.64, 0).box(2.06, 0.08, 1.06, RED, 0, 0.99, 0).box(2.14, 0.05, 1.14, WOOD, 0, 1.075, 0);
  K.box(1.2, 0.26, 0.04, WHITE, 0, 1.98, 0.5).box(0.42, 0.11, 0.03, BLUE, 0.05, 1.98, 0.535).add(Box(0.13, 0.13, 0.03).rotateZ(PI / 4), BLUE, -0.24, 1.98, 0.535);
  K.box(0.75, 0.04, 0.45, zinc, -0.45, 1.12, 0.15); for (let i = 0; i < 5; i++) K.box(0.05, 0.03, 0.22, i % 2 ? '#8fa6b8' : '#a9bccb', -0.71 + i * 0.13, 1.155, 0.15);
  K.add(Cyl(0.12, 0.09, 0.08, 6), '#ffffff', 0.25, 1.14, 0.25).add(Ico(0.07), '#f3ead2', 0.25, 1.19, 0.25).box(0.3, 0.1, 0.22, '#ffffff', 0.7, 1.15, 0.1).box(0.26, 0.2, 0.2, '#3aa66a', 0.6, 1.2, -0.3);
  rod(K, [-0.95, 2.3, -0.47], [-0.95, 3, -0.47], 0.02, WHITE, 5); K.at(-0.93, 2.98, -0.47); flag(K, 0.5, 0.33); K.at();
  return K.geo();
}
// A flower stall, open side +z: 2.5 x 1.6, 2.45 tall. Three wooden steps of buckets with tulips under a green-and-white lean-to awning
export function bloemenkraamGeo() {
  const K = new Kit(), TUL = ['#e9503a', '#f2c230', '#ff7fb0', '#f08a2c', '#8e5bd0', '#ffffff'];
  for (const x of [-1.2, 1.2]) K.box(0.06, 2.38, 0.06, WHITE, x, 1.19, -0.72).box(0.06, 2.05, 0.06, WHITE, x, 1.025, 0.72);
  for (let i = 0; i < 8; i++) K.at(-1.09375 + i * 0.3125, 2.235, 0.025, 0, 0.222).box(0.3125, 0.035, 1.57, i % 2 ? '#ffffff' : '#2f8f5a');
  K.at().box(2.5, 0.16, 0.03, '#2f8f5a', 0, 1.99, 0.785).box(2.34, 1.1, 0.05, GREEN, 0, 1.55, -0.72);
  [[0.3, 0.42, '#b98a52'], [0.6, 0.03, '#a97c4a'], [0.9, -0.36, '#b98a52']].forEach(([h, z, c], j) => {
    K.box(2.2, h, 0.39, c, 0, h / 2, z);
    for (let i = 0; i < 4; i++) {
      const x = -0.84 + i * 0.56 + (j % 2) * 0.1, col = TUL[(i + j * 2) % 6];
      K.add(Cyl(0.13, 0.1, 0.26, 5), j === 1 ? '#2b2f36' : '#8d9399', x, h + 0.13, z).add(Cone(0.17, 0.2, 5).rotateX(PI), '#3f8f4a', x, h + 0.34, z).add(Ico(0.16).scale(1, 0.62, 1), col, x, h + 0.47, z);
    }
  });
  return K.geo();
}
// A low bike rack with three bikes parked nose-in from +z (the film's own bikes, colours baked in)
export function fietsenrekGeo() {
  const K = new Kit(), steel = '#aab0b6', cols = ['#e9503a', '#2f6fc9', '#3aa66a'], { HUB, WR } = bikeGeo;
  K.box(2.1, 0.05, 0.05, steel, 0, 0.025, -0.22).box(2.1, 0.05, 0.05, steel, 0, 0.025, 0.22);
  for (let i = 0; i < 5; i++) { const x = -0.9 + i * 0.45; K.bar([x, 0.03, -0.22], [x, 0.5, 0], 0.04, steel).bar([x, 0.5, 0], [x, 0.03, 0.22], 0.04, steel); }
  [-0.675, 0.225, 0.675].forEach((x, i) => {
    const g = bikeGeo.all().rotateY(-PI / 2).translate(x, 0, HUB), c = g.attributes.color, k = C(cols[i]);
    for (let j = 0; j < c.count; j++) if (c.getX(j) > 0.9 && c.getY(j) > 0.9 && c.getZ(j) > 0.9) c.setXYZ(j, k.r, k.g, k.b);
    K.pre(g);
  });
  return K.geo();
}

// -- roof kit (origin on the roof surface) --
// A dormer for a 45 degree roof that falls towards local +z; origin at the middle of its foot, front wall on z = 0. 1.6 wide over its little gabled roof, 1.84 above the origin.
// Everything behind and below the roof plane (y < -z) is meant to be buried in the roof. The gabled roof is white for the house's roof tint; walls, frame and glass are baked.
export function dormerGeo(want) {
  const T = new Kit(), R = new Kit(), wood = '#f6f1e4';
  T.add(ext([[-0.8, 1.22], [0, 1.76], [0.8, 1.22], [0.8, 1.3], [0, 1.84], [-0.8, 1.3]], 2), '#ffffff', 0, 0, -0.88);
  R.box(1.3, 1.45, 1.5, '#d9d2c2', 0, 0.525, -0.75).add(ext([[-0.72, 1.25], [0.72, 1.25], [0, 1.76]], 0.1), wood, 0, 0, -0.05)
    .box(1.1, 0.95, 0.12, wood, 0, 0.72, 0).box(0.94, 0.79, 0.06, GLASS, 0, 0.72, 0.06).box(0.05, 0.79, 0.06, wood, 0, 0.72, 0.09).box(0.94, 0.05, 0.06, wood, 0, 0.86, 0.09).box(1.26, 0.06, 0.2, wood, 0, 0.21, 0.07);
  return part(T, R, want);
}
// A chimney 0.6 x 0.6, 1.4 tall (1.82 with its pots), carried 0.6 m down below the origin so it can stand on any slope. Brick white for tinting; stone cap and band, two pots.
export function chimneyGeo(want) {
  const T = new Kit(), R = new Kit();
  T.box(0.6, 2, 0.6, '#ffffff', 0, 0.4, 0);
  R.box(0.72, 0.1, 0.72, '#cfc8b8', 0, 1.45, 0).box(0.66, 0.08, 0.66, '#cfc8b8', 0, 1.12, 0);
  for (const x of [-0.14, 0.14]) R.add(Cyl(0.09, 0.11, 0.3, 6), '#c96a3d', x, 1.65, 0).add(Cyl(0.065, 0.065, 0.02, 6), '#22262d', x, 1.805, 0);
  return part(T, R, want);
}
// A roof window lying in the local xz plane (turn it to the slope): 1.36 x 1.16 over its lead flashing, 0.15 high
export function skylightGeo() {
  return new Kit().box(1.36, 0.03, 1.16, '#5a6068', 0, 0.015, 0).box(1.2, 0.1, 1, '#3a3f47', 0, 0.05, 0).box(1, 0.04, 0.8, '#7fb4dc', 0, 0.11, 0).box(0.04, 0.03, 0.8, '#3a3f47', 0, 0.135, 0).box(0.2, 0.03, 0.04, '#c9ccd2', 0, 0.115, 0.45).geo();
}
// A flat-roof ventilation unit: 1.1 x 0.9, 0.92 tall, louvres front and back, a cowl on top
export function ventGeo() {
  const K = new Kit(), zinc = '#aab0b6';
  K.box(1, 0.5, 0.8, zinc, 0, 0.25, 0).box(1.1, 0.06, 0.9, '#8d9399', 0, 0.53, 0).add(Cyl(0.12, 0.12, 0.26, 8), zinc, 0.2, 0.69, 0).add(Cone(0.2, 0.12, 8), '#8d9399', 0.2, 0.86, 0).box(0.3, 0.12, 0.3, '#8d9399', -0.25, 0.62, 0);
  for (const o of [-1, 1]) for (let i = 0; i < 4; i++) K.box(0.8, 0.04, 0.07, '#4b5058', 0, 0.11 + i * 0.095, o * 0.4);
  return K.geo();
}
// A roof terrace on a flat roof: decking 3 x 2.5 with a rail, a parasol (2.3 tall), a table, two chairs and three pots
export function roofTerraceGeo() {
  const K = new Kit(), rail = '#3a3f47';
  for (let i = 0; i < 6; i++) K.box(0.5, 0.08, 2.5, i % 2 ? '#b98a52' : '#a97c4a', -1.25 + i * 0.5, 0.04, 0);
  for (const x of [-1.46, 0, 1.46]) for (const z of [-1.21, 1.21]) K.box(0.06, 0.95, 0.06, rail, x, 0.555, z);
  for (const z of [-1.21, 1.21]) K.box(2.98, 0.05, 0.07, rail, 0, 1.055, z).box(2.92, 0.03, 0.03, rail, 0, 0.6, z);
  K.box(0.07, 0.05, 2.36, rail, -1.46, 1.055, 0).box(0.03, 0.03, 2.36, rail, -1.46, 0.6, 0);
  rod(K, [0.3, 0.08, -0.2], [0.3, 2.2, -0.2], 0.025, '#e8e8e8', 5); K.add(Cone(1, 0.32, 8), '#e9503a', 0.3, 2.1, -0.2).add(Ico(0.05), '#ffffff', 0.3, 2.29, -0.2);
  K.add(Cyl(0.4, 0.4, 0.04, 8), '#f6f1e4', 0.3, 0.8, -0.2).add(Cyl(0.16, 0.2, 0.03, 6), rail, 0.3, 0.095, -0.2);
  for (const [x, s] of [[-0.45, 1], [1.05, -1]]) K.box(0.42, 0.05, 0.42, '#35b5c9', x, 0.52, -0.2).box(0.05, 0.5, 0.42, '#35b5c9', x - s * 0.21, 0.79, -0.2).box(0.05, 0.44, 0.4, rail, x - s * 0.17, 0.3, -0.2).box(0.05, 0.44, 0.4, rail, x + s * 0.17, 0.3, -0.2);
  pot(K, -1.15, 0.08, 0.9, '#ff7fb0', 0.2); pot(K, 1.1, 0.08, 0.85, '#f2c230', 0.17); pot(K, -1.1, 0.08, -0.9, '#e9503a', 0.15);
  return K.geo();
}
