// The city: real Alkmaar footprints, streets and canals (OpenStreetMap) built as a chunky toy town.
import * as THREE from 'three';
import { inPoly, lerp } from './drive.js';
import { placeProps, planBridges } from './props.js';
export { inPoly };

const { PI, sin, cos, hypot, min, max, floor, round, atan2 } = Math;
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const area = (p) => { let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1]; return a / 2; };
const centroid = (p) => { let x = 0, z = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; z += p[i + 1]; } return [x / (p.length / 2), z / (p.length / 2)]; };
const bbox = (p) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < p.length; i += 2) { a = min(a, p[i]); c = max(c, p[i]); b = min(b, p[i + 1]); d = max(d, p[i + 1]); } return [a, b, c, d]; };
const C = (h) => new THREE.Color(h);
export const GROUND = 0.05; // road surface height: wheels and feet stand on this
const Y0 = GROUND - 0.012; // the street itself. Everything flat is painted onto this one plane in a fixed order, so no two layers can flicker
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });

// collects triangles; every face is given the direction it should look so winding can never be wrong
class Soup {
  constructor(wuv = 0) { this.p = []; this.n = []; this.c = []; this.uv = []; this.wuv = wuv; } // wuv: texture repeats per metre, laid flat over the ground
  tri(a, b, c, want, col, ua = [0.02, 0.02], ub = ua, uc = ua) { // col: one colour, or one for each corner
    let [ca, cb, cc] = col.isColor ? [col, col, col] : col;
    if (this.wuv) { const k = this.wuv; ua = [a[0] * k, a[2] * k]; ub = [b[0] * k, b[2] * k]; uc = [c[0] * k, c[2] * k]; }
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; [cb, cc] = [cc, cb]; nx = -nx; ny = -ny; nz = -nz; }
    this.p.push(...a, ...b, ...c); this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.c.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b); this.uv.push(...ua, ...ub, ...uc);
  }
  quad(a, b, c, d, want, col, uvs) { const k = col.isColor ? [col, col, col, col] : col; this.tri(a, b, c, want, [k[0], k[1], k[2]], uvs?.[0], uvs?.[1], uvs?.[2]); this.tri(a, c, d, want, [k[0], k[2], k[3]], uvs?.[0], uvs?.[2], uvs?.[3]); }
  wall(ax, az, bx, bz, y0, y1, want, col, uvs, top) { this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], want, top ? [col, col, top, top] : col, uvs); } // upright, between two points on the map; `top` is a second colour for its upper edge
  flat(poly, y, col) { // triangulated polygon lying flat at height y
    const pts = []; for (let i = 0; i < poly.length; i += 2) pts.push(new THREE.Vector2(poly[i], poly[i + 1]));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, [])) this.tri([pts[a].x, y, pts[a].y], [pts[b].x, y, pts[b].y], [pts[c].x, y, pts[c].y], [0, 1, 0], col);
  }
  ribbon(line, w, y, col) { // a road: polyline widened to w
    const n = line.length / 2, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = max(0, i - 1), b = min(n - 1, i + 1);
      let dx = line[2 * b] - line[2 * a], dz = line[2 * b + 1] - line[2 * a + 1]; const l = hypot(dx, dz) || 1; dx /= l; dz /= l;
      L.push([line[2 * i] + dz * w / 2, y, line[2 * i + 1] - dx * w / 2]); R.push([line[2 * i] - dz * w / 2, y, line[2 * i + 1] + dx * w / 2]);
    }
    for (let i = 0; i + 1 < n; i++) this.quad(L[i], L[i + 1], R[i + 1], R[i], [0, 1, 0], col);
    for (const i of [0, n - 1]) { // round caps hide the joints between ways
      const cx = line[2 * i], cz = line[2 * i + 1];
      for (let k = 0; k < 8; k++) { const a0 = (k / 8) * PI * 2, a1 = ((k + 1) / 8) * PI * 2; this.tri([cx, y, cz], [cx + cos(a0) * w / 2, y, cz + sin(a0) * w / 2], [cx + cos(a1) * w / 2, y, cz + sin(a1) * w / 2], [0, 1, 0], col); }
    }
  }
  mesh(material, shadow = 'receive') {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.castShadow = shadow === 'cast'; return m;
  }
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export { canvasTex };
// A normal map worked out from a painted height picture (white = high). It is what gives the bricks, roof tiles and window frames their relief.
export function reliefTex(w, h, draw, depth = 2) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); draw(g, w, h);
  const src = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h), H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * depth, dy = (H(x, y + 1) - H(x, y - 1)) * depth, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (0.5 / l + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// several coloured shapes fused into one geometry, so each kind of street furniture is a single draw call
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d), Cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s), Ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
// a prism: the outline pts ([across, up] pairs) pushed out to `len` along x, centred. Turn it a quarter (rotateY) to run it along z instead
const prof = (len, pts) => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([v, y]) => new THREE.Vector2(-v, y))), { depth: len, bevelEnabled: false }).rotateY(PI / 2).translate(-len / 2, 0, 0);
export const fuse = (...parts) => {
  const p = [], n = [], c = [];
  for (const [geo, col, x = 0, y = 0, z = 0, rz = 0] of parts) {
    const g = (geo.index ? geo.toNonIndexed() : geo).rotateZ(rz).translate(x, y, z), k = C(col);
    p.push(...g.attributes.position.array); n.push(...g.attributes.normal.array); for (let i = 0; i < g.attributes.position.count; i++) c.push(k.r, k.g, k.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
};

// One Dutch town bike, x forward, standing on y = 0: upright bars, step-through frame, mudguards, chain case, rack and lights. Fused, so a street
// of them is one draw call; the white parts take the instance (or material) colour. Forks and stays run in pairs either side of the wheel, never through it.
const SIL = '#c9ccd2', BLK = '#1c1c1c', WR = 0.345, HUB = 0.52;
const tube = (x0, y0, x1, y1, col = '#ffffff', t = 0.045, z = 0) => [Box(Math.hypot(x1 - x0, y1 - y0), t, t), col, (x0 + x1) / 2, (y0 + y1) / 2, z, Math.atan2(y1 - y0, x1 - x0)];
const both = (...a) => [0.07, -0.07].map((z) => tube(...a, 0.03, z));
const bikeWheel = (x = 0, y = 0) => [[new THREE.TorusGeometry(0.31, 0.032, 6, 18), BLK, x, y, 0], [Cyl(0.035, 0.035, 0.11, 8).rotateX(PI / 2), SIL, x, y, 0], ...[0, 1, 2, 3].map((i) => [Box(0.59, 0.012, 0.012), SIL, x, y, 0, i * PI / 4])];
const bikeFrame = () => [
  tube(0, 0.33, -0.235, 0.9), tube(0.39, 0.8, 0, 0.33), tube(0.37, 0.88, -0.1, 0.56), tube(0.4, 0.75, 0.3, 1.12, '#ffffff', 0.05), // seat tube, the two swan-neck tubes, steerer
  ...both(0, 0.33, -HUB, WR), ...both(-0.17, 0.76, -HUB, WR), ...both(0.4, 0.75, HUB, WR), ...both(-0.74, 0.75, -HUB, WR, BLK), // chain stays, seat stays, fork, rack stays
  [Box(0.05, 0.04, 0.18), '#ffffff', 0.4, 0.75, 0], [Box(0.05, 0.04, 0.18), '#ffffff', -0.17, 0.76, 0], [Box(0.05, 0.05, 0.18), '#ffffff', 0, 0.33, 0],
  [new THREE.TorusGeometry(0.365, 0.014, 4, 10, 1.7).scale(1, 1, 3.5), '#ffffff', HUB, WR, 0, 0.2], [new THREE.TorusGeometry(0.365, 0.014, 4, 12, 2.8).scale(1, 1, 3.5), '#ffffff', -HUB, WR, 0, 0.6], // mudguards
  [Box(0.56, 0.13, 0.025), BLK, -0.26, 0.338, 0.105], [Cyl(0.095, 0.095, 0.03, 10).rotateX(PI / 2), BLK, 0, 0.335, 0.105], // chain case
  [Box(0.6, 0.025, 0.16), BLK, -0.5, 0.75, 0], [Box(0.03, 0.06, 0.09), '#d6202a', -0.81, 0.75, 0], // rack and rear light
  [Box(0.27, 0.06, 0.17), '#5a3d2b', -0.24, 0.925, 0], // saddle
  [Box(0.045, 0.045, 0.7), SIL, 0.3, 1.12, 0], [Box(0.3, 0.04, 0.045), BLK, 0.13, 1.12, 0.33], [Box(0.3, 0.04, 0.045), BLK, 0.13, 1.12, -0.33], [Ico(0.03), SIL, 0.3, 1.16, 0.2], // bars swept back to the grips, and a bell
  tube(0.38, 0.84, 0.45, 0.84, BLK, 0.02), [Cyl(0.045, 0.035, 0.06, 8).rotateZ(PI / 2), '#fff1b8', 0.47, 0.84, 0], // headlight
];
const bikeCranks = () => [[Box(0.03, 0.17, 0.02), SIL, 0, 0.245, 0.13], [Box(0.03, 0.17, 0.02), SIL, 0, 0.415, -0.1], [Box(0.11, 0.025, 0.09), BLK, 0, 0.16, 0.185], [Box(0.11, 0.025, 0.09), BLK, 0, 0.5, -0.155]];
export const bikeGeo = { all: () => fuse(...bikeFrame(), ...bikeCranks(), ...bikeWheel(HUB, WR), ...bikeWheel(-HUB, WR)), frame: () => fuse(...bikeFrame()), wheel: () => fuse(...bikeWheel()), WR, HUB };

const WALLS = ['#c9573f', '#d97a43', '#e3a94c', '#f3e6c8', '#b9482f', '#8f4a36', '#e9c9a4', '#d86f5a', '#f0d9a0', '#a8c7d9', '#e8b4a0', '#c4d6a4', '#fff4dd'];
const ROOFS = ['#d55a30', '#c64a2a', '#3f4656', '#e06a38', '#5a4a4a', '#b9452b'];
const BRIGHT = ['#e9503a', '#2f6fc9', '#f2c230', '#3aa66a', '#f08a2c', '#ffffff'];

export function buildWorld(scene, map, drive) {
  const world = { update() {}, lights: [] };
  const { layout, m: mk } = drive, M = new THREE.Matrix4(), R = rnd(5);
  const waters = map.water.map((p) => ({ p, bb: bbox(p) }));
  const wet = (x, z) => waters.some((w) => x > w.bb[0] && x < w.bb[2] && z > w.bb[1] && z < w.bb[3] && inPoly(w.p, x, z));
  const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
  // many copies of one shape: [{ x, y, z, a (heading), rx (lean), s / sx sy sz, c (tint) }]
  const inst = (geo, material, list, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((o, i) => { im.setMatrixAt(i, M.compose(V.set(o.x, o.y ?? Y0, o.z), Q.setFromEuler(E.set(o.rx || 0, -(o.a || 0), 0, 'YXZ')), S.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1))); if (o.c) im.setColorAt(i, C(o.c)); });
    im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im;
  };
  const tinted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });

  // --- ground: one big paved slab with a subtle klinker pattern. `cut` leaves a hole wherever there is a canal ---
  const cut = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc };
  const grey = (v) => `rgb(${v | 0},${v | 0},${v | 0})`, hash = (i) => ((Math.imul(i + 7, 2654435761) >>> 9) % 1000) / 1000;
  const pavers = (g, bump) => { // pavement bricks in running bond; a brick that crosses the edge of the picture is the same brick on the other side
    g.fillStyle = bump ? '#444' : '#b7a183'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++) for (let x = -1; x < 8; x++) { const v = hash(((x + 8) % 8) * 16 + y); g.fillStyle = bump ? grey(185 + v * 60) : `hsl(${31 + v * 8},${34 + v * 9}%,${70 + v * 9}%)`; g.fillRect(x * 32 + (y % 2) * 16 + 1.5, y * 16 + 1.5, 29, 13); }
  };
  const paving = canvasTex(256, 256, (g) => pavers(g, false)), pavingN = reliefTex(256, 256, (g) => pavers(g, true), 1.6);
  const CITY = [-1090, -730, 860, 760]; // the paved slab stops here; beyond it lies the polder
  for (const t of [paving, pavingN]) t.repeat.set((CITY[2] - CITY[0]) / 3.2, (CITY[3] - CITY[1]) / 3.2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY[2] - CITY[0], CITY[3] - CITY[1]), mat('#ffffff', { map: paving, normalMap: pavingN, roughness: 0.86, ...cut }));
  ground.rotation.x = -PI / 2; ground.position.set((CITY[0] + CITY[2]) / 2, Y0, (CITY[1] + CITY[3]) / 2); ground.receiveShadow = true; ground.renderOrder = -20; scene.add(ground);
  world.city = CITY; world.cut = cut;

  // --- canals: the water lies 1.2 m below the street, between brick quay walls ---
  const swell = (g, bump) => { // long soft ripples; each is drawn nine times over, so the picture repeats across its edges
    g.fillStyle = bump ? '#808080' : '#eef5fa'; g.fillRect(0, 0, 128, 128); const r = rnd(3); g.lineCap = 'round';
    for (let i = 0; i < (bump ? 46 : 22); i++) {
      const x = r() * 128, y = r() * 128, l = 12 + r() * 30, up = r() < 0.5;
      for (const [w, a] of bump ? [[11, 0.22], [7, 0.3], [3.5, 0.45]] : [[1.5 + r() * 1.5, 1]]) { // in the height picture a ripple is three strokes, wide to narrow: a soft ridge or trough
        g.lineWidth = w; g.strokeStyle = bump ? `rgba(${up ? '255,255,255' : '0,0,0'},${a})` : i % 3 ? 'rgba(255,255,255,.9)' : 'rgba(30,70,130,.35)';
        for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + l / 2, y + dy - 5, x + dx + l, y + dy); g.stroke(); }
      }
    }
  };
  const ripple = canvasTex(128, 128, (g) => swell(g, false)), rippleN = reliefTex(128, 128, (g) => swell(g, true), 1.4); rippleN.repeat.set(1.7, 1.7);
  const skyEnv = canvasTex(256, 128, (g) => { // what the water mirrors: the same sky as the dome, with a few clouds in it
    const sg = g.createLinearGradient(0, 0, 0, 128); [[0, '#0a47b8'], [0.3, '#1670e0'], [0.42, '#3f9cf2'], [0.475, '#8ccafa'], [0.5, '#cfe8fb'], [1, '#6f8fae']].forEach(([t, c]) => sg.addColorStop(t, c)); g.fillStyle = sg; g.fillRect(0, 0, 256, 128);
    const r = rnd(9); g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 40; i++) { const x = r() * 256, y = 14 + r() * 40, w = 8 + r() * 16; for (const dx of [-256, 0, 256]) { g.beginPath(); g.ellipse(x + dx, y, w, w * 0.32, 0, 0, PI * 2); g.fill(); } }
  }, false); skyEnv.mapping = THREE.EquirectangularReflectionMapping;
  const sea = new Soup(1 / 9), hole = new Soup(), quay = new Soup(), coping = new Soup(), shade = new Soup(), dusk = C('#7f8da3'), clear = C('#ffffff');
  for (const { p } of waters) {
    try { sea.flat(p, -1.2, C('#2f9fd8')); hole.flat(p, Y0, C('#000000')); } catch { continue; }
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1], l = hypot(bx - ax, bz - az); if (l < 0.05) continue;
      let nx = -(bz - az) / l, nz = (bx - ax) / l; const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (!inPoly(p, mx + nx * 0.25, mz + nz * 0.25)) { nx = -nx; nz = -nz; } // n looks into the canal
      if (wet(mx - nx * 0.25, mz - nz * 0.25)) continue; // open water on both sides: no wall here
      quay.wall(ax, az, bx, bz, -0.42, Y0, [nx, 0, nz], C('#b9b2a6')); quay.wall(ax, az, bx, bz, -1.3, -0.42, [nx, 0, nz], C('#8a5a48'));
      shade.quad([ax, -1.2, az], [bx, -1.2, bz], [bx + nx * 1.8, -1.2, bz + nz * 1.8], [ax + nx * 1.8, -1.2, az + nz * 1.8], [0, 1, 0], [dusk, dusk, clear, clear]); // the water darkens towards the quay
    }
    coping.ribbon([...p, p[0], p[1]], 1.0, Y0, C('#c9c2b4'));
  }
  const seaMesh = sea.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, map: ripple, normalMap: rippleN, normalScale: new THREE.Vector2(0.55, 0.55), envMap: skyEnv, envMapIntensity: 1.25, roughness: 0.1, metalness: 0.5 }));
  // multiplied over the water (same plane, pulled forward by the polygon offset), drawn after everything solid so boats and bridges still cover it
  const shadeMesh = shade.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
  shadeMesh.renderOrder = 1; shadeMesh.receiveShadow = false; scene.add(shadeMesh);
  // the hole itself: marks every pixel of canal, so the ground and the street layers skip it
  const mask = hole.mesh(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
  mask.renderOrder = -30; mask.receiveShadow = false;
  scene.add(seaMesh, quay.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })), mask);

  // --- flat layers: parks, squares, streets. All on the street plane, painted one over the other in this order ---
  const herring = (g, bump) => { // street klinkers laid in herringbone (keperverband): 8 cells each way, the pattern repeats every 4
    g.fillStyle = bump ? '#3a3a3a' : '#a2a2a2'; g.fillRect(0, 0, 256, 256);
    for (let y = -2; y < 9; y++) for (let x = -2; x < 9; x++) {
      const k = (((x - y) % 4) + 4) % 4; if (k !== 0 && k !== 3) continue;
      const v = hash(((x + 8) % 8) * 13 + ((y + 8) % 8) * 57); g.fillStyle = bump ? grey(170 + v * 80) : grey(212 + v * 43);
      g.fillRect(x * 32 + 1.5, y * 32 + 1.5, (k ? 1 : 2) * 32 - 3, (k ? 2 : 1) * 32 - 3);
    }
  };
  const klinker = canvasTex(256, 256, (g) => herring(g, false)), klinkerN = reliefTex(256, 256, (g) => herring(g, true), 1.8);
  const K = 0.7, flats = { green: new Soup(), ped: new Soup(K), kerb: new Soup(), minor: new Soup(K), main: new Soup(K), cycle: new Soup(K), coping };
  const KIND = { pedestrian: '#e2cba6', cycleway: '#cf5a40', service: '#8b8d96', living_street: '#96897f' }, SKIP = /footway|path|steps/;
  for (const g of map.green) { try { flats.green.flat(g, Y0, C('#86cf5c')); } catch {} }
  for (const r of map.roads) {
    if (r.a) { try { flats.ped.flat(r.p, Y0, C(KIND.pedestrian)); } catch {} continue; }
    if (SKIP.test(r.k)) continue;
    const col = C(KIND[r.k] || '#6a6d7c');
    if (r.k === 'pedestrian') flats.ped.ribbon(r.p, r.w, Y0, col);
    else if (r.k === 'cycleway') flats.cycle.ribbon(r.p, r.w, Y0, col);
    else if (r.k === 'service' || r.k === 'living_street') flats.minor.ribbon(r.p, r.w, Y0, col);
    else { flats.kerb.ribbon(r.p, r.w + 0.8, Y0, C('#cfc6b6')); flats.main.ribbon(r.p, r.w, Y0, col); }
  }
  Object.entries(flats).forEach(([k, soup], i) => {
    const me = soup.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: soup.wuv ? 0.8 : 0.9, map: soup.wuv ? klinker : null, normalMap: soup.wuv ? klinkerN : null, depthTest: false, depthWrite: false, ...cut }));
    me.renderOrder = -19 + i; scene.add(me);
  });

  // --- bridges: real decks over the water. Humpbacked wherever the car has room, with a stone strip and a low parapet each side ---
  const decks = new Soup(), stone = C('#bdb6a8'), cap = C('#d6cfc0'), UP = [0, 1, 0];
  const span = (P, w, col, rail) => { // P: [x, top, z] down the middle; w: width of the roadway; rail: parapet height (0 = none)
    const W = w + 1.4, n = P.length;
    const X = (i, o, dy = 0) => { const a = P[max(0, i - 1)], b = P[min(n - 1, i + 1)], l = hypot(b[0] - a[0], b[2] - a[2]) || 1; return [P[i][0] - ((b[2] - a[2]) / l) * o, P[i][1] + dy, P[i][2] + ((b[0] - a[0]) / l) * o]; };
    for (let i = 0; i + 1 < n; i++) {
      const j = i + 1; decks.quad(X(i, -w / 2), X(j, -w / 2), X(j, w / 2), X(i, w / 2), UP, col);
      for (const sg of [-1, 1]) {
        const e = sg * W / 2, k = sg * (W / 2 - (rail ? 0.24 : 0)), o = X(i, e), out = [o[0] - P[i][0], 0, o[2] - P[i][2]], inn = [-out[0], 0, -out[2]];
        decks.quad(X(i, sg * w / 2), X(j, sg * w / 2), X(j, k), X(i, k), UP, stone);
        decks.quad(X(i, e, -0.5), X(j, e, -0.5), X(j, e, rail), X(i, e, rail), out, stone);
        if (rail) { decks.quad(X(i, k), X(j, k), X(j, k, rail), X(i, k, rail), inn, stone); decks.quad(X(i, k, rail), X(j, k, rail), X(j, e, rail), X(i, e, rail), UP, cap); }
        if (rail && (i === 0 || j === n - 1)) { const q = i === 0 ? 0 : j, d = i === 0 ? -1 : 1, along = [(P[j][0] - P[i][0]) * d, 0, (P[j][2] - P[i][2]) * d]; decks.quad(X(q, k), X(q, e), X(q, e, rail), X(q, k, rail), along, stone); }
      }
    }
  };
  for (const b of planBridges(map, drive)) {
    if (b.mode === 'own') continue;
    span(b.pts.map(([x, z, u]) => [x, Y0 + 0.01 + b.h * sin(PI * u) ** 2, z]), b.r.w, C(KIND[b.r.k] || '#6a6d7c'), b.mode === 'arch' ? 0.62 : 0);
  }
  for (const b of layout.humps) { // the bridges the exam car crosses follow the road height it actually drives on
    const P = []; for (let s = b.s0 - 1.6; s <= b.s1 + 1.61; s += 0.4) { const c = drive.centre(s); P.push([c.x, Y0 + 0.01 + layout.roadY(s), c.z]); }
    span(P, b.w - 1.4, C('#6a6d7c'), 0.62);
  }
  scene.add(decks.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'cast'));

  // --- buildings, split into tiles so only what is on screen is drawn ---
  const bricks = (g, bump, w, h) => { // brick courses, faint enough that the colour of the wall shows through
    g.fillStyle = bump ? '#b4b4b4' : '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = bump ? '#707070' : 'rgba(70,45,30,.15)';
    for (let y = 0; y < h; y += 16) { g.fillRect(0, y, w, 2); for (let x = ((y / 16) % 2) * 16; x < w; x += 32) g.fillRect(x, y, 2, 16); }
  };
  // Windows, shutters and doors keep their own colours whatever the wall is painted: they go on half see-through, and the wall material reads that as "do not tint"
  const own = (g, bump, x, y, w, h, draw) => {
    if (bump) return draw(g);
    const c = document.createElement('canvas'); c.width = g.canvas.width; c.height = g.canvas.height; draw(c.getContext('2d'));
    g.clearRect(x, y, w, h); g.globalAlpha = 0.5; g.drawImage(c, x, y, w, h, x, y, w, h); g.globalAlpha = 1;
  };
  const pane = (g, bump, x, y, w, h) => own(g, bump, x - 12, y - 12, w + 24, h + 24, (c) => { // a window: white frame, the glass set back in it with the sky in the top of it, glazing bars
    c.fillStyle = bump ? '#fff' : '#f7f4ec'; c.fillRect(x - 12, y - 12, w + 24, h + 24);
    if (bump) c.fillStyle = '#303030'; else { const sky = c.createLinearGradient(0, y, 0, y + h); sky.addColorStop(0, '#7fa6cf'); sky.addColorStop(0.45, '#33527a'); sky.addColorStop(1, '#22344f'); c.fillStyle = sky; }
    c.fillRect(x, y, w, h);
    if (!bump) { c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.6, y); c.lineTo(x, y + h * 0.58); c.fill(); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, y, w, 7); }
    c.fillStyle = bump ? '#d8d8d8' : '#f7f4ec'; c.fillRect(x + w / 2 - 4, y, 8, h); c.fillRect(x, y + h * 0.45, w, 8);
  });
  const slab = (g, bump, x, y, w, h, a) => { g.fillStyle = bump ? '#fff' : `rgba(0,0,0,${a})`; g.fillRect(x, y, w, h); }; // a sill, lintel or fascia: darker paint, standing proud of the wall
  const FACE = {
    a: [256, 256, (g, b) => { bricks(g, b, 256, 256); pane(g, b, 72, 52, 112, 152); slab(g, b, 52, 216, 152, 10, 0.18); }],
    b: [256, 256, (g, b) => { // narrower window with shutters and a lintel
      bricks(g, b, 256, 256);
      for (const x of [34, 188]) own(g, b, x, 56, 34, 152, (c) => { c.fillStyle = b ? '#e0e0e0' : '#2f5d46'; c.fillRect(x, 56, 34, 152); c.fillStyle = b ? '#9a9a9a' : 'rgba(0,0,0,.25)'; for (let y = 64; y < 204; y += 12) c.fillRect(x + 4, y, 26, 4); });
      pane(g, b, 86, 68, 84, 128); slab(g, b, 66, 28, 124, 14, 0.16); slab(g, b, 66, 216, 124, 10, 0.16);
    }],
    shop: [512, 256, (g, b) => { // two bays of ground floor: a shop window, then a door and a small window
      bricks(g, b, 512, 256); slab(g, b, 0, 10, 512, 38, 0.3); slab(g, b, 0, 224, 512, 32, 0.22);
      pane(g, b, 32, 80, 192, 120); pane(g, b, 404, 84, 76, 92);
      own(g, b, 284, 64, 92, 160, (c) => { c.fillStyle = b ? '#fff' : '#f7f4ec'; c.fillRect(284, 64, 92, 160); c.fillStyle = b ? '#555' : '#22503b'; c.fillRect(292, 72, 76, 152); c.fillStyle = b ? '#2a2a2a' : '#5f86b0'; c.fillRect(306, 88, 48, 52); if (!b) { c.fillStyle = '#f2c230'; c.fillRect(354, 152, 8, 8); } });
    }],
  };
  const pantiles = (g, bump) => { // rows of roof tiles: each row tucks under the one above it, each tile has a hollow down its middle
    for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
      if (bump) {
        const gy = g.createLinearGradient(0, y, 0, y + 32); gy.addColorStop(0, '#6a6a6a'); gy.addColorStop(1, '#f2f2f2'); g.fillStyle = gy; g.fillRect(x, y, 32, 32);
        const gx = g.createLinearGradient(x, 0, x + 32, 0); gx.addColorStop(0, 'rgba(0,0,0,.4)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,.4)'); g.fillStyle = gx; g.fillRect(x, y, 32, 32);
      } else { g.fillStyle = grey(224 + hash(x / 32 + y * 7) * 31); g.fillRect(x, y, 32, 32); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, y, 32, 3); g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(x, y, 2, 32); }
    }
  };
  const churchTex = canvasTex(128, 256, (g) => { // stone bay with a tall pointed window and a buttress
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 256); g.fillStyle = 'rgba(0,0,0,.07)'; for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 128, 1.5);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, 0, 13, 256); g.fillRect(0, 0, 128, 9); g.fillRect(0, 236, 128, 20);
    const lancet = (x, w, top, bot) => { g.beginPath(); g.moveTo(x, bot); g.lineTo(x, top + w * 0.7); g.quadraticCurveTo(x, top, x + w / 2, top - w * 0.2); g.quadraticCurveTo(x + w, top, x + w, top + w * 0.7); g.lineTo(x + w, bot); g.fill(); };
    g.fillStyle = '#efe8d8'; lancet(44, 52, 42, 200); g.fillStyle = '#27395c'; lancet(51, 38, 52, 193); g.fillStyle = '#efe8d8'; g.fillRect(68, 60, 4, 133); g.fillRect(51, 120, 38, 4);
  });
  const wallMats = { church: churchTex, trim: null }, wallN = {};
  for (const k in FACE) { const [w, h, draw] = FACE[k]; wallMats[k] = canvasTex(w, h, (g) => draw(g, false)); wallN[k] = reliefTex(w, h, (g) => draw(g, true), 2.2); }
  for (const k in wallMats) {
    wallMats[k] = new THREE.MeshStandardMaterial({ vertexColors: true, map: wallMats[k], normalMap: wallN[k] || null, roughness: 0.85 });
    if (FACE[k]) wallMats[k].onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, smoothstep( 0.6, 0.9, sampledDiffuseColor.a ) );'); }; // the wall colour, except on the parts painted half see-through
  }
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: canvasTex(128, 128, (g) => pantiles(g, false)), normalMap: reliefTex(128, 128, (g) => pantiles(g, true), 2.4), roughness: 0.7, side: THREE.DoubleSide }); // both sides: the eaves overhang
  // the ground goes darker towards the foot of every wall. Painted on by multiplying, straight after the streets, so it lies on whatever paving is there
  const aoMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, ...cut });
  const TILE = 200, tiles = new Map();
  const tileOf = (x, z) => { const k = floor(x / TILE) + ':' + floor(z / TILE); if (!tiles.has(k)) tiles.set(k, { a: new Soup(), b: new Soup(), shop: new Soup(), church: new Soup(), trim: new Soup(), roofs: new Soup(), ao: new Soup() }); return tiles.get(k); };
  const CELL = 60, cells = new Map(), extra = []; // lookup grid for "is this point inside a building"
  const B = map.buildings.map((b, i) => { let p = b.p; if (area(p) > 0) { const q = []; for (let k = p.length - 2; k >= 0; k -= 2) q.push(p[k], p[k + 1]); p = q; } return { ...b, p, i, bb: bbox(p), c: centroid(p), H: b.h }; });
  for (const b of B) for (let gx = floor(b.bb[0] / CELL); gx <= floor(b.bb[2] / CELL); gx++) for (let gz = floor(b.bb[1] / CELL); gz <= floor(b.bb[3] / CELL); gz++) { const k = gx + ':' + gz; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(b); }
  const hitB = (x, z, skip) => (cells.get(floor(x / CELL) + ':' + floor(z / CELL)) || []).find((s) => s !== skip && !s.gone && x > s.bb[0] && x < s.bb[2] && z > s.bb[1] && z < s.bb[3] && inPoly(s.p, x, z));
  for (const b of B) if (b.n === 'Molen van Piet' || hitB(b.c[0], b.c[1], b)) b.gone = true; // a footprint drawn inside another would fight with it
  const edgeGap = (q, x, z) => { let d = 1e9; for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) { const ax = q[j], az = q[j + 1], ux = q[i] - ax, uz = q[i + 1] - az, f = max(0, min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz || 1))); d = min(d, hypot(x - ax - ux * f, z - az - uz * f)); } return d; }; // how far a point is from the outline of a footprint
  const keep = (q) => q.k === 'church' || q.n === 'Waag' || q.n === 'Accijnstoren';
  for (const b of B) for (let i = 0; i < b.p.length && !b.gone; i += 2) { // two footprints that run well into each other: the smaller one goes, or their walls and roofs would cut through one another
    const o = hitB(b.p[i], b.p[i + 1], b); if (o && edgeGap(o.p, b.p[i], b.p[i + 1]) > 1.5) (keep(b) ? o : keep(o) || Math.abs(area(b.p)) < Math.abs(area(o.p)) ? b : o).gone = true;
  }
  // the outline of a footprint moved d metres inwards, or nothing if the building is too thin or too crooked for that
  const inset = (p, d) => {
    const q = []; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; if (hypot(p[j] - p[i], p[j + 1] - p[i + 1]) > 0.3) q.push(p[i], p[i + 1]); }
    const n = q.length / 2, I = []; if (n < 3) return null;
    const N = (i) => { const j = (i + 1) % n, dx = q[2 * j] - q[2 * i], dz = q[2 * j + 1] - q[2 * i + 1], l = hypot(dx, dz); return [dz / l, -dx / l]; }; // looks inwards
    for (let i = 0; i < n; i++) {
      const a = N((i + n - 1) % n), b = N(i); let mx = a[0] + b[0], mz = a[1] + b[1]; const l = hypot(mx, mz); if (l < 0.3) return null; // a hairpin
      mx /= l; mz /= l; const k = d / max(0.4, mx * b[0] + mz * b[1]), x = q[2 * i] + mx * k, z = q[2 * i + 1] + mz * k;
      if (!inPoly(q, x, z) || edgeGap(q, x, z) < d * 0.8) return null; I.push(x, z);
    }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; if ((I[2 * j] - I[2 * i]) * (q[2 * j] - q[2 * i]) + (I[2 * j + 1] - I[2 * i + 1]) * (q[2 * j + 1] - q[2 * i + 1]) < 0.05) return null; } // an edge turned round: two walls met
    return { q, I, d };
  };
  world.inside = (x, y, z) => { const b = hitB(x, z); return !!(b && y < b.H + 0.3) || extra.some((o) => y < o.h + 0.3 && hypot(o.x - x, o.z - z) < o.r); };
  world.solid = (x, z, r, h) => extra.push({ x, z, r, h }); // something else a camera must not sit inside
  for (const o of layout.solids) extra.push(o);

  const cream = C('#f4ecdb'), white = C('#ffffff'), chims = [], blocks = [], relief = [], crowns = [];
  const ledge = (soup, p, h) => { // a cornice round a flat roof: sticks out 22 cm, with a low parapet
    const q = []; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; if (hypot(p[j] - p[i], p[j + 1] - p[i + 1]) > 0.3) q.push(p[i], p[i + 1]); }
    const n = q.length / 2, O = []; if (n < 3) return;
    const N = (i) => { const j = (i + 1) % n, dx = q[2 * j] - q[2 * i], dz = q[2 * j + 1] - q[2 * i + 1], l = hypot(dx, dz); return [-dz / l, dx / l]; };
    for (let i = 0; i < n; i++) { // mitred corners
      const a = N((i + n - 1) % n), b = N(i); let mx = a[0] + b[0], mz = a[1] + b[1]; const l = hypot(mx, mz);
      if (l < 0.3) { mx = b[0]; mz = b[1]; } else { mx /= l; mz /= l; }
      const k = 0.22 / max(0.5, mx * b[0] + mz * b[1]); O.push(q[2 * i] + mx * k, q[2 * i + 1] + mz * k);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, [nx, nz] = N(i), y0 = h - 0.37, y1 = h + 0.23, ax = q[2 * i], az = q[2 * i + 1], bx = q[2 * j], bz = q[2 * j + 1], Ax = O[2 * i], Az = O[2 * i + 1], Bx = O[2 * j], Bz = O[2 * j + 1];
      soup.wall(Ax, Az, Bx, Bz, y0, y1, [nx, 0, nz], cream); soup.wall(ax, az, bx, bz, h, y1, [-nx, 0, -nz], cream);
      for (const [y, d] of [[y1, 1], [y0, -1]]) soup.quad([ax, y, az], [Ax, y, Az], [Bx, y, Bz], [bx, y, bz], [0, d, 0], cream);
    }
  };
  // The Grote Kerk as a proper basilica: a tall nave with pointed windows and buttresses standing up out of the low aisles, a transept across it,
  // a rounded choir, steep slate roofs and a slender spire where they cross. Local x runs west to east along the nave, which lies N metres off the middle.
  const kerk = (b, a) => {
    const [cx, cz] = b.c, g = new THREE.Group(), N = 5, stone = '#d8c7a4', trim = '#c4b089', glass = '#22365e', slate = '#566070', gold = '#f2c230';
    g.position.set(cx, 0, cz); g.rotation.y = -a;
    const P = [], add = (w, h, d, c, x, y, z) => P.push([Box(w, h, d), c, x, y, z]), tip = (r, h, c, x, y, z) => P.push([new THREE.ConeGeometry(r, h, 4).rotateY(PI / 4), c, x, y, z]);
    add(76, 23, 13, stone, -4, 11.5, N); P.push([prof(75.6, [[-7, 23], [7, 23], [0, 31.5]]), slate, -3.9, 0, N]); // nave and its roof
    P.push([Cyl(6.5, 6.5, 23, 8), stone, 34, 11.5, N], [new THREE.ConeGeometry(7, 8.5, 8), slate, 34, 27.25, N]); // the choir closes in a half round
    P.push([prof(0.8, [[-6.5, 23], [6.5, 23], [0, 31.9]]), stone, -41.6, 0, N]); // west front: gable, the great window, a turret on each corner
    add(0.2, 11, 5, glass, -42.05, 14.5, N); P.push([prof(0.2, [[-2.5, 20], [2.5, 20], [0, 23.4]]), glass, -42.05, 0, N]); for (const q of [-0.85, 0.85]) add(0.26, 11, 0.22, stone, -42.06, 14.5, N + q);
    for (const q of [-6.9, 6.9]) { add(1.4, 26, 1.4, trim, -42, 13, N + q); tip(1.1, 3.6, slate, -42, 27.8, N + q); }
    add(11, 23, 54.3, stone, 2, 11.5, 3.15); P.push([prof(54.3, [[-5.9, 23], [5.9, 23], [0, 30.2]]).rotateY(PI / 2), slate, 2, 0, 3.15]); // transept
    for (const [z, o] of [[-24, -1], [30.3, 1]]) {
      P.push([prof(0.8, [[-5.5, 23], [5.5, 23], [0, 30.6]]).rotateY(PI / 2), stone, 2, 0, z - o * 0.4]);
      add(4.4, 11, 0.2, glass, 2, 14.5, z + o * 0.05); P.push([prof(0.2, [[-2.2, 20], [2.2, 20], [0, 23]]).rotateY(PI / 2), glass, 2, 0, z + o * 0.05]); for (const q of [-0.75, 0.75]) add(0.22, 11, 0.26, stone, 2 + q, 14.5, z + o * 0.06);
      for (const q of [-5.4, 5.4]) { add(1.3, 25.5, 1.3, trim, 2 + q, 12.75, z); tip(1, 3.2, slate, 2 + q, 27.1, z); }
    }
    for (const [x, len] of [[-23.25, 37.5], [20.75, 24.5]]) for (const o of [-1, 1]) P.push([prof(len, [[o * 6.5, 16.5], [o * 6.5, 12.2], [o * 16.5, 12.2]]), slate, x, 0, N]); // lean-to roofs over the aisles
    for (let x = -38.8; x < 33; x += 5.4) for (const o of [-1, 1]) { // along the clerestory: a pointed window in every bay, a buttress with a pinnacle between
      if (x > -7 && x < 11) continue;
      add(2.2, 4.6, 0.2, glass, x, 19.3, N + o * 6.55); P.push([prof(0.2, [[-1.1, 21.6], [1.1, 21.6], [0, 22.8]]).rotateY(PI / 2), glass, x, 0, N + o * 6.55]); add(0.2, 4.6, 0.26, stone, x, 19.3, N + o * 6.56);
      add(0.8, 12, 1.2, trim, x + 2.7, 17.5, N + o * 7); tip(0.6, 2.4, slate, x + 2.7, 24.7, N + o * 7);
    }
    P.push([Cyl(1.7, 1.9, 3.5, 8), slate, 2, 32.5, N], [Cyl(1.5, 1.5, 2.8, 8), stone, 2, 35.6, N], [Cyl(1.9, 1.9, 0.25, 8), trim, 2, 37.1, N]); // the spire on the crossing
    for (let k = 0; k < 4; k++) P.push([Box(2.82, 1.9, 0.6).rotateY(PI / 8 + (k * PI) / 4), glass, 2, 35.6, N]);
    P.push([new THREE.ConeGeometry(1.7, 13, 8), '#3f4a5a', 2, 43.7, N], [new THREE.SphereGeometry(0.45, 10, 8), gold, 2, 50.4, N]); add(0.14, 1.7, 0.14, gold, 2, 51.5, N); add(0.9, 0.14, 0.14, gold, 2, 51.7, N);
    const me = new THREE.Mesh(fuse(...P), tinted); me.castShadow = me.receiveShadow = true; g.add(me); scene.add(g);
    b.H = 32; world.solid(cx + 2 * cos(a) - N * sin(a), cz + 2 * sin(a) + N * cos(a), 3, 53); // cameras keep out of the nave and the spire
  };
  // a church roof: finds the long axis of the footprint and lays a steep roof down it, with a transept and a ridge turret on the big one
  const steeple = (b, h, t, big) => {
    const p = b.p, n = p.length / 2, [cx, cz] = b.c; let sxx = 0, sxz = 0, szz = 0;
    for (let i = 0; i < n; i++) { const dx = p[2 * i] - cx, dz = p[2 * i + 1] - cz; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
    const a = 0.5 * atan2(2 * sxz, sxx - szz), ux = cos(a), uz = sin(a), T = [], W = [];
    for (let i = 0; i < n; i++) { const dx = p[2 * i] - cx, dz = p[2 * i + 1] - cz; T.push(dx * ux + dz * uz); W.push(-dx * uz + dz * ux); }
    const across = (A, Bv, t0) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < n; i++) { const j = (i + 1) % n; if ((A[i] > t0) !== (A[j] > t0)) { const v = Bv[i] + ((Bv[j] - Bv[i]) * (t0 - A[i])) / (A[j] - A[i]); lo = min(lo, v); hi = max(hi, v); } } return [lo, hi]; };
    if (big) return kerk(b, a);
    const t0 = min(...T) + (big ? 3 : 0.4), t1 = max(...T) - (big ? 3 : 0.4), secs = []; for (let s = t0; s <= t1; s += 2) { const [lo, hi] = across(T, W, s); if (hi > lo) secs.push({ s, lo, hi }); }
    if (secs.length < 2) return;
    const med = (A) => [...A].sort((x, y) => x - y)[A.length >> 1], hw = med(secs.map((s) => s.hi - s.lo)) * (big ? 0.3 : 0.44), v0 = med(secs.map((s) => (s.hi + s.lo) / 2)), rh = hw * (big ? 1.35 : 1.1), col = C('#566070');
    const at = (s, v, y) => [cx + ux * s - uz * v, y, cz + uz * s + ux * v];
    const prism = (a0, a1, mid, half, lengthways) => { // a ridged roof from a0 to a1; the far end is hipped on the big church (its rounded choir)
      const pt = lengthways ? (s, v, y) => at(s, mid + v, y) : (s, v, y) => at(mid + v, s, y), hip = lengthways && big ? half : 0;
      const e = [pt(a0, -half, h), pt(a0, half, h), pt(a1, half, h), pt(a1, -half, h)], r0 = pt(a0, 0, h + rh), r1 = pt(a1 - hip, 0, h + rh);
      const out = (q0, q1) => [(q0[0] + q1[0]) / 2 - (r0[0] + r1[0]) / 2, half * 0.8, (q0[2] + q1[2]) / 2 - (r0[2] + r1[2]) / 2];
      t.roofs.quad(e[1], e[2], r1, r0, out(e[1], e[2]), col); t.roofs.quad(e[3], e[0], r0, r1, out(e[3], e[0]), col);
      t.roofs.tri(e[0], e[1], r0, [e[0][0] - e[3][0], 0, e[0][2] - e[3][2]], hip ? col : C('#d8c7a4')); t.roofs.tri(e[2], e[3], r1, [e[3][0] - e[0][0], hip, e[3][2] - e[0][2]], hip ? col : C('#d8c7a4'));
    };
    prism(t0, t1, v0, hw, true);
    if (!big) return;
    const wide = secs.reduce((x, y) => (y.hi - y.lo > x.hi - x.lo ? y : x));
    prism(wide.lo + 1.5, wide.hi - 1.5, wide.s, hw * 0.9, false);
    const [x, , z] = at(wide.s, v0, 0), g = new THREE.Group(); g.position.set(x, h + rh, z); // the turret where nave and transept cross
    const drum = new THREE.Mesh(Cyl(1.5, 1.7, 4.4, 8), mat('#566070')); drum.position.y = 1.2;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2, 11, 8), mat('#3f4a5a')); spire.position.y = 8.8;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat('#f2c230', { metalness: 0.6, roughness: 0.3 })); ball.position.y = 14.6;
    g.add(drum, spire, ball); g.traverse((o) => { o.castShadow = true; }); scene.add(g);
  };

  const dim = (c, k) => c.clone().multiplyScalar(k), aoDark = C('#8a8a8a'), AO = 1.7, SK = 1.2, pitched = [], tops = []; // AO: width of the shading at the foot of a wall; SK: metres of roof to one repeat of the tile picture
  for (const b of B) {
    if (b.gone) continue;
    const p = b.p, n = p.length / 2, Rb = rnd(b.i * 7919 + 13), [cx, cz] = b.c, t = tileOf(cx, cz), church = b.k === 'church', big = church && /^Grote/.test(b.n || ''), special = church || b.n === 'Waag' || b.n === 'Accijnstoren';
    let h = b.h + (Rb() - 0.5) * 0.36, wall = C(WALLS[floor(Rb() * WALLS.length)]), roof = C(ROOFS[floor(Rb() * ROOFS.length)]); // no two roofs at exactly the same height
    const soup = Rb() < 0.42 ? t.b : t.a;
    if (church) { h = big ? 12 : max(b.h, 11); wall = C('#d8c7a4'); roof = C('#7a8492'); } // on the big one this is only the aisles: kerk() stands the nave up inside them
    if (b.n === 'Waag') { h = 13; wall = C('#c9573f'); roof = C('#3f4656'); }
    if (b.n === 'Accijnstoren') { h = 12; wall = C('#f6f1e4'); roof = C('#3f4656'); }
    b.H = b.W = h; // W: top of the wall, H: top of the roof
    const gf = !church && h >= 5.5 ? 3.3 : 0, plinth = wall.clone().lerp(white, 0.4), foot = dim(wall, 0.72), low = dim(wall, 0.9), pfoot = dim(plinth, 0.72); let inWater = false;
    for (let i = 0; i < n && !inWater; i++) inWater = wet(p[2 * i], p[2 * i + 1]);
    const crown = [], hex = '#' + wall.getHexString(), side = []; // side: which way each wall faces, if it stands free
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j], bz = p[2 * j + 1], len = hypot(bx - ax, bz - az); if (len < 0.05) { side.push(null); continue; }
      const want = [-(bz - az), 0, bx - ax], plain = len < 1.6 || h < 4, bays = max(1, round(len / 3.2));
      const ux = (bx - ax) / len, uz = (bz - az) / len, mx = (ax + bx) / 2, mz = (az + bz) / 2; let nx = -uz, nz = ux; if (inPoly(p, mx + nx * 0.3, mz + nz * 0.3)) { nx = -nx; nz = -nz; }
      const free = !hitB(mx + nx * 0.45, mz + nz * 0.45, b); side.push(free ? [nx, nz] : null); // free: nothing is built against this wall
      if (free) t.ao.quad([ax, Y0, az], [bx, Y0, bz], [bx + nx * AO, Y0, bz + nz * AO], [ax + nx * AO, Y0, az + nz * AO], UP, [aoDark, aoDark, white, white]);
      if (inWater) t.a.wall(ax, az, bx, bz, -1.6, 0, want, C('#8a5a48')); // standing in a canal: the wall goes on down to the water
      if (church) { const cb = max(1, round(len / 5)); t.church.wall(ax, az, bx, bz, 0, h, want, wall, plain ? undefined : [[0, 0], [cb, 0], [cb, 1], [0, 1]]); continue; }
      const y0 = plain ? 0 : gf, floors = max(1, round((h - y0) / 3.1));
      if (y0) t.shop.wall(ax, az, bx, bz, 0, gf, want, pfoot, [[0, 0], [bays / 2, 0], [bays / 2, 1], [0, 1]], plinth);
      soup.wall(ax, az, bx, bz, y0, h, want, y0 ? low : foot, plain ? undefined : [[0, 0], [bays, 0], [bays, floors], [0, floors]], wall); // every wall a shade darker towards the street
      // Along the route the painted windows get real stone: a sill and a lintel each, flower boxes, a drainpipe, and a stepped gable up on the roof edge.
      // Everything further off stays flat paint, which nobody is close enough to tell.
      if (plain || !free || layout.clear(mx + nx * 3, mz + nz * 3, 12)) continue;
      const ang = atan2(uz, ux), bw = len / bays, fh = (h - y0) / floors, sw = bw * (soup === t.a ? 0.6 : 0.5), put = (list, d, y, out, sx, sy, sz, c) => list.push({ x: ax + ux * d + nx * out, y, z: az + uz * d + nz * out, a: ang, sx, sy, sz, c });
      for (let u = 0; u < bays; u++) for (let f = 0; f < floors; f++) {
        const d = (u + 0.5) * bw, yb = y0 + f * fh, k = Math.imul(b.i * 31 + i * 7 + u * 3 + f, 2654435761) >>> 8;
        put(relief, d, yb + fh * 0.137, 0.06, sw, 0.1, 0.2, '#f4ecdb'); put(relief, d, yb + fh * (soup === t.a ? 0.83 : 0.863), 0.03, sw, 0.12, 0.12, '#f4ecdb');
        if (f === 0 && y0 && k % 4 === 0) { put(relief, d, yb + fh * 0.137 + 0.15, 0.19, sw * 0.9, 0.2, 0.24, '#a8573a'); put(relief, d, yb + fh * 0.137 + 0.32, 0.19, sw * 0.82, 0.14, 0.18, ['#e0202a', '#f7c400', '#ff5fa8', '#ffffff'][k % 4 ^ (k >> 4) % 4]); } // geraniums
      }
      if (len > 5) put(relief, 0.2, (h - 0.4) / 2, 0.07, 0.1, h - 0.4, 0.1, '#7d858c');
      if (len >= 3.5 && h > 6 && h < 16) for (let m = max(1, round(len / 5.2)), cw = len / m, k = 0; k < m; k++) {
        const d = (k + 0.5) * cw, neck = (b.i + i + k) % 3 === 0, W = neck ? [0.78, 0.36] : [0.8, 0.54, 0.28], Hs = neck ? [1.0, 1.5] : [1.0, 0.8, 0.8]; let y = h;
        W.forEach((w, q) => { const cwk = min(cw * w, cw - 1); put(crown, d, y + Hs[q] / 2, -0.13, cwk, Hs[q], 0.5, hex); y += Hs[q]; put(crown, d, y, -0.13, cwk + 0.1, 0.1, 0.6, '#f4ecdb'); }); // stops half a metre short of each corner, clear of the gable on the next wall
        put(crown, d, y + 0.2, -0.13, 0.32, 0.4, 0.32, '#f4ecdb');
      }
    }
    for (let i = 0; i < n; i++) { // the shading also runs round the outside of a corner, where two of those bands would leave a gap
      const j = (i + 1) % n, a = side[i], c = side[j]; if (!a || !c || a[0] * c[1] - a[1] * c[0] > -0.02) continue;
      t.ao.tri([p[2 * j], Y0, p[2 * j + 1]], [p[2 * j] + a[0] * AO, Y0, p[2 * j + 1] + a[1] * AO], [p[2 * j] + c[0] * AO, Y0, p[2 * j + 1] + c[1] * AO], UP, [aoDark, white, white]);
    }
    const P3 = (i, y) => [p[2 * i], y, p[2 * i + 1]], mid = (a, c, y) => [(a[0] + c[0]) / 2, y, (a[2] + c[2]) / 2];
    const e = (i) => hypot(p[2 * ((i + 1) % 4)] - p[2 * i], p[2 * ((i + 1) % 4) + 1] - p[2 * i + 1]);
    const tiled = !special && h > 4;
    if (n === 4 && tiled && min(e(0), e(1)) < 11) { // pitched Dutch roof on simple houses, with eaves, a chimney and a stone on each gable
      const s = e(0) + e(2) < e(1) + e(3) ? 0 : 1, q = [0, 1, 2, 3].map((i) => P3((i + s) % 4, h));
      const gw = (e(s) + e(s + 2)) / 2, rh = min(5.5, max(1.6, gw / 2)), r0 = mid(q[0], q[1], h + rh), r1 = mid(q[2], q[3], h + rh), rl = hypot(r1[0] - r0[0], r1[2] - r0[2]) || 1, dx = (r1[0] - r0[0]) / rl, dz = (r1[2] - r0[2]) / rl;
      // the roof sticks out over a wall only where nothing is built against that wall, so it can never poke into the house next door
      const clearOf = (u, v) => { const ox = (u[0] + v[0]) / 2 - cx, oz = (u[2] + v[2]) / 2 - cz, l = hypot(ox, oz) || 1; return [0.12, 0.5, 0.88].every((f) => !hitB(lerp(u[0], v[0], f) + (ox / l) * 0.7, lerp(u[2], v[2], f) + (oz / l) * 0.7, b)); };
      const g0 = clearOf(q[0], q[1]) ? 0.27 : 0, g1 = clearOf(q[2], q[3]) ? 0.27 : 0, eA = clearOf(q[1], q[2]) ? 0.3 : 0, eB = clearOf(q[3], q[0]) ? 0.3 : 0;
      const eave = (v, r, ov, g) => { const ex = v[0] - r[0], ez = v[2] - r[2], l = hypot(ex, ez) || 1; return [v[0] + (ex / l) * ov + dx * g, h - (ov * rh) / l, v[2] + (ez / l) * ov + dz * g]; };
      const o = [eave(q[0], r0, eB, -g0), eave(q[1], r0, eA, -g0), eave(q[2], r1, eA, g1), eave(q[3], r1, eB, g1)], sl = hypot(gw / 2, rh) / SK, uv = [[0, 0], [rl / SK, 0], [rl / SK, sl], [0, sl]];
      const a0 = [r0[0] - dx * g0, r0[1], r0[2] - dz * g0], a1 = [r1[0] + dx * g1, r1[1], r1[2] + dz * g1], out = (u, v) => [(u[0] + v[0]) / 2 - cx, 0.6, (u[2] + v[2]) / 2 - cz];
      t.roofs.quad(o[1], o[2], a1, a0, out(q[1], q[2]), roof, uv); t.roofs.quad(o[3], o[0], a0, a1, out(q[3], q[0]), roof, uv);
      t.a.tri(q[0], q[1], r0, out(q[0], q[1]), wall); t.a.tri(q[2], q[3], r1, out(q[2], q[3]), wall);
      const ang = atan2(dz, dx), f = 0.25 + Rb() * 0.5;
      if (Rb() < 0.6) chims.push({ x: lerp(r0[0], r1[0], f), y: h + rh - 0.1, z: lerp(r0[2], r1[2], f), a: ang });
      blocks.push({ x: r0[0] + dx * 0.16, y: h + rh + 0.13, z: r0[2] + dz * 0.16, a: ang }, { x: r1[0] - dx * 0.16, y: h + rh + 0.13, z: r1[2] - dz * 0.16, a: ang });
      b.H = h + rh; pitched.push({ b, q, r0, r1, rh, gw, rl, h, roof });
    } else {
      let m = null; if (tiled) for (const d of [2.2, 1.3, 0.7]) if ((m = inset(p, d))) break;
      if (m) { // every other roof: tiled slopes at 45 degrees, rising from the top of the walls to a flat middle
        const { q, I, d } = m, k = q.length / 2, top = h + d, sl = (d * Math.SQRT2) / SK;
        for (let i = 0; i < k; i++) {
          const j = (i + 1) % k, ex = q[2 * j] - q[2 * i], ez = q[2 * j + 1] - q[2 * i + 1], len = hypot(ex, ez), u = (x, z) => ((x - q[2 * i]) * ex + (z - q[2 * i + 1]) * ez) / len / SK;
          t.roofs.quad([q[2 * i], h, q[2 * i + 1]], [q[2 * j], h, q[2 * j + 1]], [I[2 * j], top, I[2 * j + 1]], [I[2 * i], top, I[2 * i + 1]], [-ez, len, ex], roof, [[0, 0], [len / SK, 0], [u(I[2 * j], I[2 * j + 1]), sl], [u(I[2 * i], I[2 * i + 1]), sl]]);
        }
        try { t.trim.flat(I, top, roof.clone().lerp(C('#545862'), 0.6)); } catch {}
        b.H = top; tops.push({ b, p: I, y: top, d });
      } else { try { t.trim.flat(p, h, special ? roof : roof.clone().lerp(C('#545862'), 0.45)); } catch {} if (tiled) tops.push({ b, p, y: h, d: 0 }); }
      if (church) steeple(b, h, t, big); else if (h > 4 && !layout.clear(cx, cz, 55)) { ledge(t.trim, p, h); crowns.push(...crown); }
    }
  }
  for (const t of tiles.values()) { for (const k in wallMats) if (t[k].p.length) scene.add(t[k].mesh(wallMats[k], 'cast')); scene.add(t.roofs.mesh(roofMat, 'cast')); if (t.ao.p.length) { const me = t.ao.mesh(aoMat); me.renderOrder = -10; me.receiveShadow = false; scene.add(me); } }
  inst(Box(1, 1, 1), mat('#ffffff'), relief, false); inst(Box(1, 1, 1), mat('#ffffff'), crowns);
  inst(Box(0.62, 1.3, 0.62), mat('#8f4a36'), chims); inst(Box(0.3, 0.46, 0.52), mat('#f4ecdb'), blocks);

  // --- clouds: flat-bottomed cumulus heaped up in the middle and lit from the sun's side; far banks of them stand along the horizon ---
  const puff = [], heap = [], cumulus = (x, y, z, w, tall) => {
    const n = 5 + Math.floor(R() * 3), r0 = (w / n) * 0.95, turn = R() * Math.PI, cs = Math.cos(turn), sn = Math.sin(turn);
    const put = (to, u, v, h, r) => to.push({ x: x + u * cs - v * sn, y: y + h, z: z + u * sn + v * cs, sx: r, sy: r * 0.72, sz: r * 0.9, a: R() * 6 });
    for (let k = 0; k < n; k++) { // the base: undersides cut off near one level (never exactly the same one), which is what makes it read as a cumulus
      const f = k / (n - 1) - 0.5, r = r0 * (1.15 - f * f * 1.9) * (0.85 + R() * 0.3);
      put(puff, f * w, (R() - 0.5) * r0 * 0.8, r * (0.2 + R() * 0.06), r); put(puff, f * w + (R() - 0.5) * r0, (R() < 0.5 ? -1 : 1) * r0 * (0.55 + R() * 0.3), r * (0.14 + R() * 0.04), r * 0.7);
    }
    for (let k = 0, m = 4 + Math.floor(R() * 3) + (tall ? 4 : 0); k < m; k++) { // the heap on top, narrowing as it climbs
      const g = k / m, r = r0 * (1.1 - g * 0.5) * (0.85 + R() * 0.3);
      put(heap, (R() - 0.5) * w * 0.55 * (1 - g * 0.7), (R() - 0.5) * r0 * 0.7, r0 * (0.85 + g * (tall ? 2.7 : 1.5)), r);
    }
  };
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + R() * 0.3, d = 400 + R() * 320; cumulus(Math.cos(a) * d, 80 + R() * 45, Math.sin(a) * d, 170 + R() * 130, i % 2 === 0); } // a ring of them, low enough to stand over the rooftops at the end of every street
  for (let i = 0; i < 12; i++) cumulus(-800 + R() * 1600, 190 + R() * 60, -800 + R() * 1600, 60 + R() * 50, false);
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + R() * 0.2, d = 1500 + R() * 2300; cumulus(Math.cos(a) * d, 240 + R() * 260 + d * 0.04, Math.sin(a) * d, 380 + R() * 420, i % 3 === 0); } // the far banks over the polder
  const ball = (flat) => { // one puff; `flat` cuts its underside off level
    const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, nn = g.attributes.normal;
    if (flat) for (let k = 0; k < p.count; k++) if (p.getY(k) < -0.3) { p.setY(k, -0.3); nn.setXYZ(k, 0, -1, 0); }
    return g;
  };
  world.sun = [-105, 118, 96]; // where the sun stands: a morning sun, low enough for long shadows down the streets
  const cloudMat = new THREE.ShaderMaterial({ // three painted tones by how much a face looks at the sun, a shaded underside, and haze with distance
    uniforms: { sun: { value: new THREE.Vector3(...world.sun).normalize() }, lit: { value: C('#fffaf0') }, mid: { value: C('#e6ecf8') }, dark: { value: C('#a4b7dc') }, haze: { value: C('#cfe8fb') } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main() { mat3 m = mat3( instanceMatrix ); vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 ); vP = w.xyz; vN = m * ( normal / vec3( dot( m[0], m[0] ), dot( m[1], m[1] ), dot( m[2], m[2] ) ) ); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 sun, lit, mid, dark, haze; varying vec3 vN; varying vec3 vP;
      void main() {
        vec3 n = normalize( vN ); float d = dot( n, sun ) * 0.5 + 0.5;
        vec3 c = mix( dark, mid, smoothstep( 0.2, 0.55, d ) ); c = mix( c, lit, smoothstep( 0.55, 0.95, d ) );
        c = mix( dark * 0.93, c, smoothstep( 0.02, 0.4, n.y * 0.5 + 0.5 ) );
        c = mix( c, haze, 0.8 * smoothstep( 1100.0, 5200.0, distance( vP, cameraPosition ) ) );
        gl_FragColor = vec4( c, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const clouds = new THREE.Group(); scene.add(clouds);
  for (const [geo, list] of [[ball(true), puff], [ball(false), heap]]) { const im = inst(geo, cloudMat, list, false); im.receiveShadow = false; im.frustumCulled = false; clouds.add(im); }

  // --- boats on the canals ---
  const boats = [], inWater = (x, z) => wet(x, z) && !hitB(x, z);
  let bc = 0;
  for (const w of map.waterways) for (let i = 4; i + 3 < w.p.length && boats.length < 20; i += 6) {
    const x = (w.p[i] + w.p[i + 2]) / 2, z = (w.p[i + 1] + w.p[i + 3]) / 2, a = atan2(w.p[i + 3] - w.p[i + 1], w.p[i + 2] - w.p[i]);
    if (![[0, 0], [3.4, 0], [-3.4, 0], [3.2, 1.5], [3.2, -1.5], [-3.2, 1.5], [-3.2, -1.5]].every(([f, s]) => inWater(x + cos(a) * f - sin(a) * s, z + sin(a) * f + cos(a) * s))) continue;
    if (hypot(x - layout.ramp.x, z - layout.ramp.z) < 45 || boats.some((o) => hypot(o.position.x - x, o.position.z - z) < 16)) continue; // keep the jump clear
    const g = new THREE.Group(), hull = new THREE.Mesh(Box(6, 0.8, 2.2), mat(BRIGHT[bc++ % 4]));
    hull.position.y = 0.3; const cabin = new THREE.Mesh(Box(2.4, 0.9, 1.7), mat('#fff6e6')); cabin.position.set(-0.6, 1.1, 0);
    const rail = new THREE.Mesh(Box(6.16, 0.12, 2.36), mat('#fff6e6')); rail.position.y = 0.68;
    g.add(hull, cabin, rail); g.position.set(x, -1.27, z); g.rotation.y = -a; g.traverse((o) => { o.castShadow = true; }); scene.add(g); boats.push(g);
  }

  // --- landmarks ---
  const box = (w, h, d, color, x = 0, y = 0, z = 0, o) => { const me = new THREE.Mesh(Box(w, h, d), mat(color, o)); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; return me; };
  const beam = (a, b, th, color) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), me = box(A.distanceTo(Bv), th, th, color); me.position.copy(A).lerp(Bv, 0.5); me.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), Bv.clone().sub(A).normalize()); return me; };
  world.box = box; world.beam = beam;

  { // the Waag: stepped gables, a steep slate roof with dormers, the porters' canopy on the market side, and the clock tower with its carillon
    const [x, z] = map.pois.Waag, A = 0.55, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -A; // local x runs along the hall, -z faces the cheese market
    const brick = '#c9573f', stone = '#efe2c4', slate = '#3f4656', green = '#1f5a3c', dark = '#1d2a44', red = '#c8102e', gold = '#f2c230', copper = '#2f7f78';
    const P = [], add = (w, h, d, c, px, py, pz) => P.push([Box(w, h, d), c, px, py, pz]), oct = (r, h, c, py) => P.push([Cyl(r, r, h, 8), c, 0, py, 0]);
    const ridge = (len, h, half) => { const q = new THREE.CylinderGeometry(1, 1, len, 3, 1, false, PI / 2).rotateZ(PI / 2).scale(1, h / 1.5, half / 0.866).translate(0, h / 3, 0).toNonIndexed(); q.computeVertexNormals(); return q; };
    const onion = (py, k, c) => { let y = py; for (const [rb, rt, h] of [[2.4, 2.9, 0.9], [2.9, 2.6, 1.1], [2.6, 1.6, 1], [1.6, 0.8, 0.8], [0.8, 0.5, 0.8]]) { P.push([Cyl(rt * k, rb * k, h * k, 12), c, 0, y + (h * k) / 2, 0]); y += h * k; } };
    P.push([ridge(31.9, 7.5, 6.5), slate, 4.05, 13.3, -1.2]);
    for (const ex of [-12.25, 20.35]) { // both end walls: a slab just proud of the old wall, stepping up to a pinnacle. Every trim piece sticks out a few cm further than the one behind it
      add(0.7, 13.1, 15.5, brick, ex, 6.55, -1.15); add(0.86, 0.14, 15.66, stone, ex, 13.08, -1.15);
      for (let k = 1; k <= 6; k++) { add(0.7, 1.3, 16 - k * 2.3, brick, ex, 13 + (k - 0.5) * 1.3, -1.15); add(0.86, 0.14, 16.16 - k * 2.3, stone, ex, 12.95 + k * 1.3, -1.15); }
      add(0.5, 1.5, 0.5, stone, ex, 21.5, -1.15); P.push([new THREE.SphereGeometry(0.34, 10, 8), gold, ex, 22.5, -1.15]);
      for (const y of [3.95, 7.3, 10.6]) add(0.74, 0.24, 15.54, stone, ex, y, -1.15); // bands of pale stone through the brick
      for (const y of [5.6, 8.95]) for (const wz of [-5.95, -2.75, 0.45, 3.65]) { add(0.74, 2.3, 1.3, stone, ex, y, wz); add(0.78, 2, 1, dark, ex, y, wz); for (const q of [-0.95, 0.95]) add(0.76, 2, 0.42, red, ex, y, wz + q); }
      add(0.74, 3.5, 3.2, stone, ex, 1.75, -1.15); add(0.78, 3.2, 2.7, green, ex, 1.6, -1.15); add(0.74, 1.6, 1.1, stone, ex, 15, -1.15); add(0.78, 1.3, 0.8, dark, ex, 15, -1.15);
    }
    for (const dx of [-8.5, 6.5, 11.5, 16.5]) { add(1.5, 3, 2.4, brick, dx, 15.7, -5.6); add(1.8, 0.16, 2.7, stone, dx, 17.28, -5.6); add(1, 1.3, 0.1, dark, dx, 16.3, -6.82); } // dormers
    add(27, 0.16, 4.9, slate, 4, 4.1, -9.45); add(27, 0.45, 0.1, green, 4, 3.95, -11.92); // the canopy the cheese is carried under
    for (const px of [-9, -4.5, 0, 4.5, 9, 13.5, 17]) { add(0.22, 4.05, 0.22, green, px, 2.02, -11.6); world.solid(x + px * cos(A) + 11.6 * sin(A), z + px * sin(A) - 11.6 * cos(A), 0.35, 4.3); }
    add(6.6, 27, 6.6, brick, 0, 13.5, 0); for (const y of [14.2, 17.6, 21, 26.6]) add(6.72, 0.3, 6.72, stone, 0, y, 0); // the tower
    add(7.7, 0.5, 7.7, stone, 0, 27.25, 0); for (const q of [-3.77, 3.77]) { add(7.7, 0.9, 0.16, stone, 0, 27.95, q); add(0.16, 0.9, 7.7, stone, q, 27.95, 0); }
    oct(2.7, 4.4, stone, 29.7); for (let k = 0; k < 4; k++) P.push([Box(5.03, 2.6, 1).rotateY(PI / 8 + (k * PI) / 4), dark, 0, 29.9, 0]); // eight tall openings
    oct(3.1, 0.3, stone, 32.05); for (let k = 0; k < 8; k++) P.push([Cyl(0.17, 0.17, 3, 6), stone, sin((k * PI) / 4) * 2.3, 33.7, cos((k * PI) / 4) * 2.3]); // the open lantern
    P.push([Cyl(0.45, 0.85, 1.1, 10), gold, 0, 34.2, 0], [Cyl(0.07, 0.07, 0.6, 6), dark, 0, 35, 0]); oct(3, 0.3, stone, 35.35); // the bell
    onion(35.5, 1, copper); oct(0.75, 1.5, stone, 40.85); onion(41.6, 0.42, copper);
    P.push([new THREE.ConeGeometry(0.36, 3.6, 8), slate, 0, 45.2, 0], [new THREE.SphereGeometry(0.42, 12, 8), gold, 0, 47.2, 0]);
    g.add(new THREE.Mesh(fuse(...P), tinted));
    const clock = canvasTex(128, 128, (c) => { c.fillStyle = '#1d2a44'; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill(); c.strokeStyle = '#f2c230'; c.lineWidth = 6; c.stroke(); for (let k = 0; k < 12; k++) { const q = (k * PI) / 6; c.lineWidth = 4; c.beginPath(); c.moveTo(64 + sin(q) * 46, 64 - cos(q) * 46); c.lineTo(64 + sin(q) * 54, 64 - cos(q) * 54); c.stroke(); } c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 24); c.moveTo(64, 64); c.lineTo(92, 72); c.stroke(); }, false);
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.CircleGeometry(2.3, 24), new THREE.MeshStandardMaterial({ map: clock, alphaTest: 0.5 })); f.position.set(sin(k * PI / 2) * 3.33, 23.8, cos(k * PI / 2) * 3.33); f.rotation.y = k * PI / 2; g.add(f); }
    g.add(box(11, 1.3, 0.12, '#ffffff', 4, 4.8, -11.95, { map: canvasTex(512, 64, (c) => { c.fillStyle = '#f6efdc'; c.fillRect(0, 0, 512, 64); c.strokeStyle = '#1f5a3c'; c.lineWidth = 5; c.strokeRect(4, 4, 504, 56); c.fillStyle = '#1f5a3c'; c.font = '900 42px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('KAASMARKT  ALKMAAR', 256, 34); }, false) })); // so nobody has to guess what the yellow wheels are
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; }); scene.add(g);
    B.find((b) => b.n === 'Waag').H = 21; world.solid(x, z, 5, 48); // cameras keep out of the roof and the tower
  }
  { // Accijnstoren: little white tower at the finish
    const [x, z] = map.pois.Accijnstoren, g = new THREE.Group(); g.position.set(x, 12, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 5, 4), mat('#3f4656')); roof.position.y = 2.5; roof.rotation.y = PI / 4;
    const lant = new THREE.Mesh(Cyl(1, 1.2, 2.4, 8), mat('#f6f1e4')); lant.position.y = 5.8;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.4, 8), mat('#2f7f78')); tip.position.y = 8.6;
    g.add(roof, lant, tip); g.traverse((o) => { o.castShadow = true; }); scene.add(g);
  }
  { // Molen van Piet, up on the old rampart
    const [x, z] = map.pois['Molen van Piet'], g = new THREE.Group(), MOUND = 2.1; g.position.set(x, MOUND, z);
    const hill = new THREE.Mesh(Cyl(8.6, 13, MOUND + 0.4, 20), mat('#79c455')); hill.position.set(x, MOUND / 2 - 0.2, z); hill.receiveShadow = true; scene.add(hill);
    const base = new THREE.Mesh(Cyl(4.6, 5.8, 7, 8), mat('#c9573f')); base.position.y = 3.5;
    const deck = new THREE.Mesh(Cyl(7, 7, 0.4, 8), mat('#f6f1e4')); deck.position.y = 7.2;
    const body = new THREE.Mesh(Cyl(2.7, 4.4, 11, 8), mat('#4a3f3a')); body.position.y = 12.8;
    const top = new THREE.Mesh(new THREE.SphereGeometry(3.1, 10, 6, 0, PI * 2, 0, PI / 2), mat('#3f6f4a')); top.position.y = 18.2;
    const sails = new THREE.Group(); sails.position.set(0, 18.6, 3.4);
    for (let k = 0; k < 4; k++) { const a = new THREE.Group(); a.rotation.z = k * PI / 2; a.add(box(0.35, 12, 0.3, '#3a2c24', 0, 6, 0), box(2, 9.6, 0.1, '#f3e6c8', 1.1, 7, 0)); sails.add(a); }
    g.add(base, deck, body, top, sails); g.rotation.y = 0.9; g.traverse((o) => { o.castShadow = true; }); scene.add(g);
    world.windmill = { x, z, sails };
  }

  // --- the Eenhoornbrug as an open drawbridge (the ramp) ---
  {
    const r = layout.ramp, g = new THREE.Group(); g.position.set(r.x, GROUND, r.z); g.rotation.y = -r.h;
    const len = (r.s1 - r.s0) / cos(r.angle), lf = new THREE.Group(); lf.rotation.z = r.angle;
    lf.add(box(len - 3, 0.3, 5.8, '#8a5a3a', (len - 3) / 2, -0.15, 0));
    for (let k = 0; k < 6; k++) lf.add(box(0.5, 0.3, 5.8, k % 2 ? '#e9503a' : '#f6f1e4', len - 0.25 - k * 0.5, -0.15, 0)); // warning stripes: their own planks, end to end
    for (const z of [-2.7, 2.7]) { lf.add(box(len, 0.17, 0.3, '#f6f1e4', len / 2, 0.045, z), box(len, 0.1, 0.1, '#f6f1e4', len / 2, 0.95, z)); for (let k = 0; k <= 4; k++) lf.add(box(0.1, 0.84, 0.1, '#f6f1e4', 0.05 + ((len - 0.1) * k) / 4, 0.5, z)); }
    g.add(lf);
    const top = 7.2, arm = 0.62, tip = [cos(r.angle) * len, sin(r.angle) * len];
    for (const z of [-3.3, 3.3]) {
      g.add(box(0.45, top, 0.45, '#f6f1e4', -0.8, top / 2, z));
      const front = [-0.8 + cos(arm) * 8.2, top + sin(arm) * 8.2], back = [-0.8 - cos(arm) * 4, top - sin(arm) * 4];
      g.add(beam([back[0], back[1], z], [front[0], front[1], z], 0.34, '#f6f1e4'), beam([front[0], front[1], z], [tip[0], tip[1], z * 0.84], 0.09, '#30343c'));
      g.add(box(1.6, 1.1, 0.9, '#3f4656', back[0], back[1], z));
    }
    g.add(box(0.4, 0.4, 6.15, '#f6f1e4', -0.8, top - 0.03, 0));
    // fixed far half of the bridge
    const far = mk.bridgeS - mk.bridgeN - 1.5, fx0 = r.s1 - r.s0 + 2.2;
    g.add(box(far - fx0 + 1.5, 0.5, 5.8, '#8b8f9c', (fx0 + far + 1.5) / 2, -0.26, 0));
    for (const z of [-2.78, 2.78]) g.add(box(far - fx0 + 1.5, 0.9, 0.14, '#f6f1e4', (fx0 + far + 1.5) / 2, 0.44, z));
    scene.add(g);
    // half barriers with flashing lights
    const lamps = [];
    const barrier = (s, side) => {
      const b = new THREE.Group(), p = drive.place(s, 0); b.position.set(p.x, GROUND, p.z); b.rotation.y = -p.h;
      b.add(box(0.35, 1.3, 0.35, '#f6f1e4', 0, 0.65, side * 3.15));
      for (let k = 0; k < 6; k++) b.add(box(0.14, 0.14, 0.44, k % 2 ? '#f6f1e4' : '#e9503a', 0, 1.05, side * (2.9 - 0.22 - k * 0.44)));
      b.add(box(0.2, 2.6, 0.2, '#30343c', 0.5, 1.3, side * 3.5), box(0.25, 0.9, 1.5, '#30343c', 0.5, 2.6, side * 3.5));
      for (const dz of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff2010', emissiveIntensity: 0 })); l.position.set(0.36, 2.6, side * 3.5 + dz); b.add(l); lamps.push(l); }
      scene.add(b);
    };
    barrier(mk.bridgeN - 9, 1); barrier(mk.bridgeS + 6, -1);
    world.lamps = lamps;
  }

  // --- the Waagplein: terraces along the house fronts, flags, and the cheese market in the middle ---
  const flags = [];
  {
    const sq = map.roads.find((r) => r.a && r.n === 'Waagplein')?.p, shade = [], d = layout.donut, ring = (x, z, r) => [0, 1, 2, 3, 4, 5, 6, 7].some((k) => hitB(x + cos(k * PI / 4) * r, z + sin(k * PI / 4) * r));
    if (sq) for (let x = 78; x < 134; x += 4.6) for (let z = 58; z < 126; z += 4.6) {
      if (inPoly(sq, x, z) && !hitB(x, z) && hypot(x - d.x, z - d.z) > d.r + 8.5 && layout.clear(x, z, 9) && !ring(x, z, 2.3) && ring(x, z, 6.5)) shade.push({ x, z, c: BRIGHT[shade.length % 5] });
    }
    for (const o of shade.length > 5 ? [shade.shift(), shade.pop()] : []) { // two of the spots carry a flag instead
      const g = new THREE.Group(); g.position.set(o.x, Y0, o.z); g.add(new THREE.Mesh(Cyl(0.07, 0.1, 8, 6), mat('#eeeeee')));
      g.children[0].position.y = 4; const cloth = new THREE.Group(); cloth.position.y = 7.2;
      ['#c8102e', '#ffffff', '#21468b'].forEach((c, k) => cloth.add(box(1.9, 0.4, 0.05, c, 1.02, 0.4 - k * 0.4, 0)));
      g.add(cloth); g.traverse((q) => { q.castShadow = true; }); scene.add(g); flags.push(cloth); world.solid(o.x, o.z, 0.4, 8);
    }
    inst(fuse([Cyl(0.04, 0.04, 2.3, 6), '#e8e8e8', 0, 1.15, 0], [Cyl(0.46, 0.46, 0.05, 10), '#f6f1e4', 0, 0.74, 0], [Cyl(0.05, 0.07, 0.72, 6), '#3a3f47', 0, 0.37, 0], [Box(0.4, 0.46, 0.4), '#3a3f47', 0.9, 0.23, 0], [Box(0.4, 0.46, 0.4), '#3a3f47', -0.9, 0.23, 0]), tinted, shade.map((o, i) => ({ x: o.x, z: o.z, a: i * 1.3 })));
    inst(new THREE.ConeGeometry(1.6, 0.6, 8), mat('#ffffff', { flatShading: true }), shade.map((o, i) => ({ x: o.x, y: Y0 + 2.5, z: o.z, a: i * 1.3, c: o.c })));
    for (const o of shade) world.solid(o.x, o.z, 1.7, 2.9);
    // the cheese market: pallets of Gouda wheels in rows square to the Waag, and now and then one of red Edam balls
    const [wx, wz] = map.pois.Waag, ca = cos(0.55), sa = sin(0.55), at = (u, v) => [wx + u * ca - v * sa, wz + u * sa + v * ca], pallets = [], wheels = [], balls = [];
    const free = ([x, z]) => inPoly(sq, x, z) && !hitB(x, z) && hypot(x - d.x, z - d.z) > d.r + 4.2 && layout.clear(x, z, 4) && !shade.some((o) => hypot(o.x - x, o.z - z) < 3.2) && !extra.some((o) => hypot(o.x - x, o.z - z) < o.r + 0.8);
    if (sq) for (let u = -24; u < 54; u += 4.4) for (let v = -72.5; v < -14; v += 3.4) {
      if (![[0, 0], [1.8, 1.25], [1.8, -1.25], [-1.8, 1.25], [-1.8, -1.25]].every(([a, b]) => free(at(u + a, v + b)))) continue;
      const [x, z] = at(u, v), edam = pallets.length % 5 === 3; pallets.push({ x, y: Y0 + 0.06, z, a: 0.55 });
      for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { const [px, pz] = at(u + (i - 1) * 1.05, v + (k - 0.5) * 1.05); (edam ? balls : wheels).push({ x: px, y: Y0 + (edam ? 0.41 : 0.31), z: pz, c: edam ? '#cf2a2f' : (i + k) % 3 ? '#f6b21f' : '#f9c846' }); }
      if (!edam) for (let i = 0; i < 2; i++) { const [px, pz] = at(u + (i - 0.5) * 1.05, v); wheels.push({ x: px, y: Y0 + 0.67, z: pz, c: '#f6b21f' }); }
    }
    for (const o of pallets) world.solid(o.x, o.z, 2.2, 1);
    inst(Box(3.5, 0.12, 2.5), mat('#a9794a'), pallets); inst(new THREE.SphereGeometry(0.48, 12, 6).scale(1, 0.4, 1), mat('#ffffff', { roughness: 0.35 }), wheels); inst(new THREE.SphereGeometry(0.3, 12, 8), mat('#ffffff', { roughness: 0.3 }), balls);
  }

  // --- street furniture along the route (placed by props.js, which the clipping check shares) ---
  const props = placeProps(map, drive); world.people = props.filter((o) => o.kind === 'person' && ![[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([i, j]) => world.inside(o.x + i, 0.5, o.z + j))); // not the ones who would stand in a market stall
  const of = (kind) => props.filter((o) => o.kind === kind).map((o, i) => ({ x: o.x, z: o.z, a: o.a + (o.side < 0 ? PI : 0), i }));
  inst(fuse([Cyl(0.06, 0.09, 4, 6), '#26352f', 0, 2, 0], [Cyl(0.14, 0.16, 0.5, 6), '#26352f', 0, 0.25, 0], [Box(0.36, 0.46, 0.36), '#fff1b8', 0, 4.2, 0], [Cyl(0.05, 0.31, 0.24, 6), '#26352f', 0, 4.55, 0]), tinted, of('lamp'));
  inst(fuse([Cyl(0.1, 0.13, 0.8, 8), '#8c2f2a', 0, 0.4, 0], [Cyl(0.127, 0.127, 0.1, 8), '#f6f1e4', 0, 0.6, 0], [Ico(0.125, 1), '#8c2f2a', 0, 0.83, 0]), tinted, of('bollard'));
  inst(bikeGeo.all(),
    tinted, of('bike').map((o) => ({ ...o, rx: 0.16, a: o.a + (o.i % 2) * PI, c: BRIGHT[o.i % 6] })));
  inst(fuse([Box(1.6, 0.08, 0.44), '#a8743f', 0, 0.46, 0], [Box(1.6, 0.4, 0.07), '#a8743f', 0, 0.8, 0.2], [Box(0.08, 0.42, 0.4), '#3a3f47', 0.62, 0.21, 0], [Box(0.08, 0.42, 0.4), '#3a3f47', -0.62, 0.21, 0]), tinted, of('bench'));
  inst(fuse([Box(1.05, 0.52, 1.05), '#b5653f', 0, 0.26, 0], [Box(1.17, 0.09, 1.17), '#c97a50', 0, 0.5, 0], [Ico(0.5, 1), '#4ca649', 0, 0.9, 0], [Ico(0.17, 0), '#ff6fa3', 0.3, 1.12, 0.2], [Ico(0.17, 0), '#ffd23f', -0.26, 1.16, -0.2], [Ico(0.15, 0), '#ff6fa3', -0.08, 1.24, 0.3], [Ico(0.15, 0), '#ffffff', 0.12, 1.3, -0.24]), tinted, of('planter'));
  inst(fuse([Cyl(0.24, 0.2, 0.8, 10), '#2f5d46', 0, 0.45, 0], [Cyl(0.262, 0.262, 0.09, 10), '#f2c230', 0, 0.66, 0], [Cyl(0.27, 0.27, 0.08, 10), '#26352f', 0, 0.89, 0]), tinted, of('bin'));

  // --- trees (real positions, minus any that would stand in the car's line). One that would grow into a wall, a lamppost or a parasol is a smaller tree, or no tree ---
  {
    const trees = [], tall = [...extra, ...props].filter((o) => o.h > 2.4), BASE = 2.5; // BASE: the leaves start above head height, arms in the air included
    for (let i = 0; i < map.trees.length; i += 2) {
      const x = map.trees[i], z = map.trees[i + 1]; if (!layout.clear(x, z) || hitB(x, z)) continue;
      const fits = (sc) => { const r = 2.5 * sc; for (let k = 0; k < 12; k++) if (hitB(x + cos((k * PI) / 6) * r, z + sin((k * PI) / 6) * r)) return false; return !tall.some((o) => hypot(o.x - x, o.z - z) < r + o.r); };
      const sc = [0.8 + R() * 0.6, 0.62, 0.44].find(fits); if (sc) trees.push({ x, z, s: sc, k: R(), c: ['#58b84a', '#6cc74f', '#3fa348', '#84cf52'][i % 4] });
    }
    inst(Cyl(0.22, 0.3, 3.2, 6), mat('#7a5236'), trees.map((t) => ({ x: t.x, y: 1.6, z: t.z, sx: t.s, sy: 1, sz: t.s })));
    const leaf = mat('#ffffff', { flatShading: true }), blob = (r, off, turn, up) => inst(Ico(r, 1), leaf, trees.map((t) => ({ x: t.x + cos(t.k * 9 + turn) * off * t.s, y: BASE + up(t) * t.s, z: t.z + sin(t.k * 9 + turn) * off * t.s, sx: t.s, sy: t.s * (off ? 1 : 0.9 + t.k * 0.3), sz: t.s, c: t.c })));
    blob(1.9, 0, 0, (t) => 1.9 * (0.9 + t.k * 0.3)); blob(1.25, 1.1, 0, (t) => 2.6 + t.k * 0.5); blob(1.05, 1.2, 2.6, (t) => 1.7 + t.k * 0.4);
  }

  // --- shop awnings and bunting, hung from the houses along the route ---
  {
    const trim = new Soup(), line = [], J = [layout.hop, layout.ramp];
    const wallAt = (s, side) => { for (let o = 1.6; o < 11; o += 0.15) { const q = drive.place(s, side * o); if (wet(q.x, q.z)) return null; const b = hitB(q.x, q.z); if (b) return { x: q.x, z: q.z, o, H: b.W ?? b.H, h: q.h }; } return null; };
    for (let i = 0, s = 32; s < drive.L - 44; i++, s += 8.5) for (const side of [-1, 1]) {
      const hsh = Math.imul(i * 2 + (side > 0) + 5, 2654435761) >>> 0; if (hsh % 100 > 52 || J.some((j) => s > j.s0 - 12 && s < j.land + 8)) continue;
      const a = wallAt(s - 1.7, side), b = wallAt(s + 1.7, side), c = wallAt(s, side);
      if (!a || !b || !c || min(a.o, b.o) < 3.6 || Math.abs(a.o - b.o) > 0.7 || Math.abs(c.o - (a.o + b.o) / 2) > 0.5 || min(a.H, b.H, c.H) < 4.8) continue;
      if (props.some((o) => o.h > 2.5 && hypot(o.x - c.x, o.z - c.z) < 2.6)) continue; // a lamppost stands there
      const ox = sin(c.h) * side * 1.05, oz = -cos(c.h) * side * 1.05, col = C(BRIGHT[(hsh >>> 8) % 5]), N = 8; // (ox, oz): from the wall out over the pavement
      for (let k = 0; k < N; k++) {
        const p0 = [lerp(a.x, b.x, k / N), 3.22, lerp(a.z, b.z, k / N)], p1 = [lerp(a.x, b.x, (k + 1) / N), 3.22, lerp(a.z, b.z, (k + 1) / N)], q0 = [p0[0] + ox, 2.74, p0[2] + oz], q1 = [p1[0] + ox, 2.74, p1[2] + oz], cl = k % 2 ? cream : col;
        trim.quad(p0, p1, q1, q0, UP, cl); trim.quad(q0, q1, [q1[0], 2.52, q1[2]], [q0[0], 2.52, q0[2]], [ox, 0, oz], cl);
      }
    }
    for (let i = 0, s = mk.lange + 24; s < mk.mient - 12; i++, s += 21) { // bunting across the Langestraat, well above the roofs of the cars
      const a = wallAt(s, -1), b = wallAt(s, 1); if (!a || !b || min(a.H, b.H) < 7.6 || J.some((j) => s > j.s0 - 16 && s < j.land + 10)) continue;
      const N = 15, at = (u) => [lerp(a.x, b.x, u), 6.9 - 1.1 * sin(PI * u), lerp(a.z, b.z, u)], dx = cos(a.h) * 0.01, dz = sin(a.h) * 0.01;
      for (let k = 0; k < N; k++) {
        const p0 = at(k / N), p1 = at((k + 1) / N), u0 = at((k + 0.2) / N), u1 = at((k + 0.8) / N), tip = at((k + 0.5) / N); tip[1] -= 0.62; line.push(...p0, ...p1);
        trim.tri(u0, u1, tip, [dx, 0, dz], C(BRIGHT[(i + k) % 5]));
      }
    }
    scene.add(trim.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), 'cast'));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(line, 3)); scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#3a3f47' })));
  }

  world.update = (t) => {
    world.windmill.sails.rotation.z = t * 0.9;
    clouds.position.x = t * 1.6; ripple.offset.set(t * 0.012, t * 0.007); rippleN.offset.set(-t * 0.021, t * 0.016);
    boats.forEach((b, i) => { b.position.y = -1.27 + sin(t * 1.3 + i) * 0.05; b.rotation.z = sin(t * 0.9 + i * 2) * 0.03; });
    flags.forEach((f, i) => { f.rotation.y = sin(t * 2.2 + i) * 0.35; });
    const on = floor(t * 2.5) % 2; world.lamps.forEach((l, i) => { l.material.emissiveIntensity = (i % 2 === on) ? 3 : 0; });
  };
  return world;
}
