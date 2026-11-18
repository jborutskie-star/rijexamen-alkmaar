// The city: real Alkmaar footprints, streets and canals (OpenStreetMap) built as a chunky toy town.
import * as THREE from 'three';
import { FACADES, pantiles, recessedBay, bricks } from './facade-detail.js';
import { inPoly, lerp } from './drive.js';
import { placeProps, planBridges } from './props.js';
import * as LM from './landmarks.js'; // (landmarks.js imports this file too: fine, as long as neither calls the other while loading)
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
const KERK_A = 0.2523990323078452; // the angle of the Grote Kerk's nave on the map (debug/kerk-footprint.json)
const MILL_FACE = -0.36, STAIR = 1.0; // which way the windmill's sails look (rotation.y), and the bearing of the steps up its bastion

export function buildWorld(scene, map, drive) {
  const world = { update() {}, lights: [] };
  const { layout, m: mk } = drive, M = new THREE.Matrix4(), R = rnd(5);
  const waters = map.water.map((p) => ({ p, bb: bbox(p) }));
  const wet = (x, z) => waters.some((w) => x > w.bb[0] && x < w.bb[2] && z > w.bb[1] && z < w.bb[3] && inPoly(w.p, x, z));
  const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
  // Where the car, the film's own ducks and every bridge deck are. Nothing new is placed without asking these first.
  const mix = (i, j) => { let v = Math.imul(i * 97 + j * 13 + 5, 2654435761); v ^= v >>> 15; v = Math.imul(v, 2246822519); return (v ^ (v >>> 13)) >>> 0; }; // a fixed "random" number for thing j of object i
  const gapTo = (A, step = 2) => (x, z) => { let d = 1e9; for (let i = 0; i < A.length; i += step) d = min(d, hypot(A[i] - x, A[i + 1] - z)); return d; };
  const carPts = [], duckPts = [], jumpPts = [], airPts = [], inAir = (s) => (s >= layout.hop.s0 && s <= layout.hop.land) || (s >= layout.ramp.s0 && s <= layout.ramp.land);
  for (let t = 0; t <= drive.duration; t += 0.05) { const s = drive.state(t); carPts.push(s.x, s.z); if (inAir(s.s)) airPts.push(s.x, s.z); }
  for (let i = 0; i < layout.ducks.n; i++) for (let t = 0; t <= drive.duration; t += 0.25) { const d = layout.ducks.at(i, t); duckPts.push(d.x, d.z); }
  for (let s = layout.ramp.s0; s <= layout.ramp.land; s += 2) { const c = drive.centre(s); jumpPts.push(c.x, c.z); }
  const groundGap = gapTo(carPts), airGap = gapTo(airPts), carGap = (x, z) => min(groundGap(x, z), airGap(x, z) - 1.3), routeGap = gapTo(carPts, 16), duckGap = gapTo(duckPts), jumpGap = gapTo(jumpPts); // carGap: metres to the car, counting its path through the air (the hop, the drawbridge) as 1.3 m wider. routeGap: quick and a metre rough
  const segGap = (P, x, z) => { let d = 1e9; for (let i = 0; i + 1 < P.length; i++) { const ax = P[i][0], az = P[i][1], ux = P[i + 1][0] - ax, uz = P[i + 1][1] - az, f = max(0, min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz || 1))); d = min(d, hypot(x - ax - ux * f, z - az - uz * f)); } return d; };
  const plan = planBridges(map, drive), lineOf = (s0, s1) => { const P = []; for (let s = s0; s <= s1 + 0.01; s += 1) { const c = drive.centre(s); P.push([c.x, c.z]); } return P; };
  const deckLines = [...plan.map((b) => ({ P: b.pts, w: b.W })), ...layout.humps.map((b) => ({ P: lineOf(b.s0 - 1.6, b.s1 + 1.6), w: b.w })), { P: lineOf(mk.bridgeN - 3, mk.bridgeS + 3), w: 7.2 }];
  for (const d of deckLines) d.bb = bbox(d.P.flatMap(([x, z]) => [x, z]));
  const bridgeGap = (x, z) => { let g = 1e9; for (const d of deckLines) if (x > d.bb[0] - 14 && x < d.bb[2] + 14 && z > d.bb[1] - 14 && z < d.bb[3] + 14) g = min(g, segGap(d.P, x, z) - d.w / 2); return g; }; // metres to the edge of the nearest deck (anything over 14 just counts as far)
  // many copies of one shape: [{ x, y, z, a (heading), rx (lean), s / sx sy sz, c (tint) }]
  const inst = (geo, material, list, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((o, i) => { im.setMatrixAt(i, M.compose(V.set(o.x, o.y ?? Y0, o.z), Q.setFromEuler(E.set(o.rx || 0, -(o.a || 0), 0, 'YXZ')), S.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1))); if (o.c) im.setColorAt(i, C(o.c)); });
    im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im;
  };
  const tinted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  // the round-3 models (landmarks.js) go in through this, so world.audit can say how many of each there are and what they cost
  const audit = world.audit = { count: {}, tris: {}, total: 0 }, trisOf = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const tally = (name, n, t) => { audit.count[name] = (audit.count[name] || 0) + n; audit.tris[name] = (audit.tris[name] || 0) + round(t); audit.total += round(t); };
  const tallyGroup = (name, g) => { let n = 0; g.traverse((o) => { if (o.geometry) n += trisOf(o.geometry) * (o.count ?? 1); }); tally(name, 1, n); };
  const mine = (name, geo, list, material = tinted, shadow = true) => { tally(name, list.length, trisOf(geo) * list.length); return inst(geo, material, list, shadow); };

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
    for (let i = 0; i < (bump ? 80 : 22); i++) {
      const x = r() * 128, y = r() * 128, l = 12 + r() * 30, up = r() < 0.5;
      for (const [w, a] of bump ? [[6, 0.14], [3.5, 0.2], [1.6, 0.28]] : [[1.5 + r() * 1.5, 1]]) { // in the height picture a ripple is three strokes, wide to narrow: a soft ridge or trough
        g.lineWidth = w; g.strokeStyle = bump ? `rgba(${up ? '255,255,255' : '0,0,0'},${a})` : i % 3 ? 'rgba(255,255,255,.5)' : 'rgba(30,70,130,.12)';
        for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + l / 2, y + dy - 5, x + dx + l, y + dy); g.stroke(); }
      }
    }
  };
  const ripple = canvasTex(128, 128, (g) => swell(g, false)), rippleN = reliefTex(128, 128, (g) => swell(g, true), 1.4); rippleN.repeat.set(2.3, 2.3);
  const skyEnv = canvasTex(256, 128, (g) => { // what the water mirrors: the same sky as the dome, with a few clouds in it
    const sg = g.createLinearGradient(0, 0, 0, 128); [[0, '#0a47b8'], [0.3, '#1670e0'], [0.42, '#3f9cf2'], [0.475, '#8ccafa'], [0.5, '#cfe8fb'], [1, '#6f8fae']].forEach(([t, c]) => sg.addColorStop(t, c)); g.fillStyle = sg; g.fillRect(0, 0, 256, 128);
    const r = rnd(9); g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 40; i++) { const x = r() * 256, y = 14 + r() * 40, w = 8 + r() * 16; for (const dx of [-256, 0, 256]) { g.beginPath(); g.ellipse(x + dx, y, w, w * 0.32, 0, 0, PI * 2); g.fill(); } }
  }, false); skyEnv.mapping = THREE.EquirectangularReflectionMapping;
  const quayWall = (g, bump) => { // 2.56 m of quay, street level at the top: a stone coping, brick courses, and the dark band the water leaves
    g.fillStyle = bump ? '#5a5a5a' : '#6d4a3c'; g.fillRect(0, 0, 256, 128);
    for (let y = 18, row = 0; y < 128; y += 7, row++) for (let x = -1; x < 9; x++) { const v = hash(row * 31 + ((x + 9) % 8)); g.fillStyle = bump ? grey(150 + v * 70) : `hsl(${13 + v * 9},${38 + v * 12}%,${40 + v * 11}%)`; g.fillRect(x * 32 + (row % 2) * 16 + 1, y + 1, 30, 5.5); }
    if (!bump) { const wg = g.createLinearGradient(0, 80, 0, 120); wg.addColorStop(0, 'rgba(30,38,28,0)'); wg.addColorStop(0.5, 'rgba(30,38,28,.6)'); wg.addColorStop(1, 'rgba(24,46,32,.9)'); g.fillStyle = wg; g.fillRect(0, 80, 256, 48); }
    for (let x = 0; x < 4; x++) { g.fillStyle = bump ? '#f4f4f4' : `hsl(42,15%,${77 + hash(x + 90) * 7}%)`; g.fillRect(x * 64 + 1, 0, 62, 15); } // the coping stones, standing proud of the brick
    g.fillStyle = bump ? '#383838' : 'rgba(0,0,0,.45)'; g.fillRect(0, 15, 256, 3);
  };
  const sea = new Soup(1 / 9), hole = new Soup(), quay = new Soup(), coping = new Soup(), shade = new Soup(), dusk = C('#7f8da3'), clear = C('#ffffff');
  for (const { p } of waters) {
    let run = 0;
    try { sea.flat(p, -1.2, C('#2f9fd8')); hole.flat(p, Y0, C('#000000')); } catch { continue; }
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1], l = hypot(bx - ax, bz - az); if (l < 0.05) continue;
      let nx = -(bz - az) / l, nz = (bx - ax) / l; const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (!inPoly(p, mx + nx * 0.25, mz + nz * 0.25)) { nx = -nx; nz = -nz; } // n looks into the canal
      if (wet(mx - nx * 0.25, mz - nz * 0.25)) continue; // open water on both sides: no wall here
      quay.wall(ax, az, bx, bz, -1.3, Y0, [nx, 0, nz], clear, [[run, 0], [run + l / 2.56, 0], [run + l / 2.56, 1], [run, 1]]); run = (run + l / 2.56) % 1; // the stones run on round the corner
      shade.quad([ax, -1.2, az], [bx, -1.2, bz], [bx + nx * 1.8, -1.2, bz + nz * 1.8], [ax + nx * 1.8, -1.2, az + nz * 1.8], [0, 1, 0], [dusk, dusk, clear, clear]); // the water darkens towards the quay
    }
    coping.ribbon([...p, p[0], p[1]], 1.0, Y0, C('#c9c2b4'));
  }
  const seaMesh = sea.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, map: ripple, normalMap: rippleN, normalScale: new THREE.Vector2(0.32, 0.32), envMap: skyEnv, envMapIntensity: 1.25, roughness: 0.1, metalness: 0.5 }));
  // multiplied over the water (same plane, pulled forward by the polygon offset); everything solid is drawn after it, so boats and bridges still cover it
  const shadeMesh = shade.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
  seaMesh.renderOrder = -29; shadeMesh.renderOrder = -28; shadeMesh.receiveShadow = false; scene.add(shadeMesh); // straight after the sea, before the ground and all that stands on the water: the offset that lifts the shade off the sea also lifted it onto hulls and posts, and far off onto whole facades
  // the hole itself: marks every pixel of canal, so the ground and the street layers skip it
  const mask = hole.mesh(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
  mask.renderOrder = -30; mask.receiveShadow = false;
  scene.add(seaMesh, quay.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: canvasTex(256, 128, (g) => quayWall(g, false)), normalMap: reliefTex(256, 128, (g) => quayWall(g, true), 2) })), mask);

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
  // --- paint and ironwork on the streets the car drives: one more flat layer over the others, cut out of one picture ---
  {
    const sheet = canvasTex(1024, 512, (g) => { // eight 256 px cells: manhole, drain, tarmac patch, 30, ZONE, bicycle, plain white, spare
      g.clearRect(0, 0, 1024, 512); const cell = (i, f) => { g.save(); g.translate((i % 4) * 256, floor(i / 4) * 256); f(); g.restore(); }, r = rnd(11);
      cell(0, () => { g.fillStyle = '#4b4e56'; g.beginPath(); g.arc(128, 128, 122, 0, 7); g.fill(); g.fillStyle = '#6b6f78'; g.beginPath(); g.arc(128, 128, 104, 0, 7); g.fill(); g.strokeStyle = '#484b53'; g.lineWidth = 9; for (let a = 0; a < 8; a++) { g.beginPath(); g.moveTo(128 + cos(a * PI / 4) * 30, 128 + sin(a * PI / 4) * 30); g.lineTo(128 + cos(a * PI / 4) * 96, 128 + sin(a * PI / 4) * 96); g.stroke(); } g.beginPath(); g.arc(128, 128, 62, 0, 7); g.stroke(); g.fillStyle = '#484b53'; g.beginPath(); g.arc(128, 128, 20, 0, 7); g.fill(); });
      cell(1, () => { g.fillStyle = '#4b4e56'; g.fillRect(4, 44, 248, 168); g.fillStyle = '#1c1e22'; for (let x = 22; x < 236; x += 30) g.fillRect(x, 62, 16, 132); });
      cell(2, () => { g.fillStyle = '#5c5f68'; g.beginPath(); g.roundRect(6, 10, 244, 236, 14); g.fill(); for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? '#666a73' : '#53565e'; g.fillRect(10 + r() * 232, 14 + r() * 224, 5, 5); } });
      cell(3, () => { g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.strokeStyle = '#d0352b'; g.lineWidth = 26; g.beginPath(); g.arc(128, 128, 100, 0, 7); g.stroke(); g.fillStyle = '#2a2d33'; g.font = 'bold 118px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('30', 128, 136); });
      cell(4, () => { g.fillStyle = '#f4f1e8'; g.font = 'bold 104px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ZONE', 128, 132, 244); });
      cell(5, () => { g.strokeStyle = g.fillStyle = '#f4f1e8'; g.lineWidth = 13; g.lineCap = g.lineJoin = 'round'; for (const x of [66, 190]) { g.beginPath(); g.arc(x, 160, 48, 0, 7); g.stroke(); } g.beginPath(); g.moveTo(66, 160); g.lineTo(104, 92); g.lineTo(168, 92); g.lineTo(190, 160); g.moveTo(104, 92); g.lineTo(128, 160); g.lineTo(168, 92); g.moveTo(128, 160); g.lineTo(66, 160); g.moveTo(96, 74); g.lineTo(116, 74); g.moveTo(104, 92); g.lineTo(100, 76); g.moveTo(168, 92); g.lineTo(160, 66); g.lineTo(182, 62); g.stroke(); });
      cell(6, () => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 256, 256); });
    });
    const paint = new Soup(), white = C('#ffffff'), y = Y0, UP = [0, 1, 0], uvOf = (i) => { const u = (i % 4) / 4, v = 1 - floor(i / 4) / 2; return [[u + 0.004, v - 0.496], [u + 0.246, v - 0.496], [u + 0.246, v - 0.004], [u + 0.004, v - 0.004]]; }, W6 = [0.82, 0.3];
    const dry = (x, z, r) => ring4(x, z, r).every(([i, j]) => !wet(i, j)) && bridgeGap(x, z) > r + 0.8;
    function ring4(x, z, r) { return [[x, z], [x + r, z], [x - r, z], [x, z + r], [x, z - r]]; }
    // a mark lying at (x, z), `len` long the way (fx, fz) points and `wid` across; its picture reads the right way up to someone going that way
    const stamp = (x, z, fx, fz, len, wid, i) => { const rx = -fz * wid / 2, rz = fx * wid / 2, ax = fx * len / 2, az = fz * len / 2; paint.quad([x - ax - rx, y, z - az - rz], [x - ax + rx, y, z - az + rz], [x + ax + rx, y, z + az + rz], [x + ax - rx, y, z + az - rz], UP, white, uvOf(i)); };
    const along = (s, off) => { const a = drive.place(s, off), b = drive.place(s + 0.6, off), l = hypot(b.x - a.x, b.z - a.z) || 1; return { x: a.x, z: a.z, fx: (b.x - a.x) / l, fz: (b.z - a.z) / l }; };
    const flatAt = (s, len) => { for (let q = s - len; q <= s + len; q += 0.5) if (Math.abs(layout.roadY(q)) > 0.004) return false; return true; }; // not on a hump, the hop or the bridge
    const count = { covers: 0, patches: 0, zones: 0, zebras: 0, teeth: 0, bikes: 0 };
    // manhole and drain covers and tarmac patches, every so often
    for (let s = 14, k = 0; s < drive.L - 10; s += 17 + (mix(k, 3) % 22), k++) {
      const h = mix(k, 4), kind = h % 5, off = kind < 2 ? ((h >>> 4) & 1 ? 0.95 : -0.85) : kind < 4 ? ((h >>> 4) & 1 ? 2.05 : -2.05) : ((h >>> 5) % 5 - 2) * 0.5, o = along(s, off);
      if (!flatAt(s, 2.5) || !dry(o.x, o.z, 1.6)) continue;
      if (kind < 2) { stamp(o.x, o.z, o.fx, o.fz, 0.74, 0.74, 0); count.covers++; } else if (kind < 4) { stamp(o.x, o.z, o.fx, o.fz, 0.5, 0.5, 1); count.covers++; } else { stamp(o.x, o.z, o.fx, o.fz, 1.6 + (h >>> 8) % 3 * 0.7, 1.1 + (h >>> 11) % 3 * 0.3, 2); count.patches++; }
    }
    // "ZONE 30" where a street begins
    for (const s0 of [16, mk.lange + 8, 250, mk.mient + 8, 700, 850, 1010, 1170, 1345, 1440]) for (let s = s0; s < s0 + 24; s += 3) {
      const a = along(s, 0), b = along(s + 3.1, 0); if (!flatAt(s + 1.5, 4) || !dry(a.x, a.z, 2) || !dry(b.x, b.z, 2) || hypot(a.x - layout.donut.x, a.z - layout.donut.z) < 30) continue;
      stamp(a.x, a.z, a.fx, a.fz, 1.5, 2.6, 4); stamp(b.x, b.z, b.fx, b.fz, 2.6, 1.9, 3); count.zones++; break;
    }
    // two zebra crossings
    for (const s0 of [300, 1140]) for (let s = s0; s < s0 + 40; s += 4) {
      if (!flatAt(s, 4) || ![-2.4, 0, 2.4].every((off) => { const o = along(s, off); return dry(o.x, o.z, 1.8); })) continue;
      for (let off = -2.25; off <= 2.26; off += 0.9) { const o = along(s, off); stamp(o.x, o.z, o.fx, o.fz, 3.2, 0.45, 6); } count.zebras++; break;
    }
    // shark's teeth across the mouth of each side street: the row lies 4.3 m from the car's line, points towards whoever is coming out
    const rows = [], rb = bbox(carPts);
    for (const r of map.roads) {
      if (r.a || !/residential|secondary|tertiary|unclassified|living_street/.test(r.k)) continue; const p = r.p, bb = bbox(p); if (bb[0] > rb[2] + 8 || bb[2] < rb[0] - 8 || bb[1] > rb[3] + 8 || bb[3] < rb[1] - 8) continue;
      const P = []; for (let i = 0; i + 3 < p.length; i += 2) { const l = hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]), n = max(1, round(l)); for (let k = 0; k < n; k++) P.push([lerp(p[i], p[i + 2], k / n), lerp(p[i + 1], p[i + 3], k / n)]); }
      const G = P.map(([x, z]) => (routeGap(x, z) > 16 ? 99 : groundGap(x, z)));
      for (let i = 1; i < P.length && rows.length < 16; i++) {
        const inn = G[i] <= 4.3 && G[i - 1] > 4.3, out = G[i] > 4.3 && G[i - 1] <= 4.3; if (!inn && !out) continue;
        const at = inn ? i - 1 : i, far = at + (inn ? -6 : 6); if (far < 0 || far >= P.length || G[far] < 8.5) continue; // it has to lead away from the route, not run beside it
        const [x, z] = P[at], l = hypot(P[far][0] - x, P[far][1] - z) || 1, fx = (P[far][0] - x) / l, fz = (P[far][1] - z) / l, w = r.w - 0.5;
        if (rows.some((q) => hypot(q[0] - x, q[1] - z) < 7) || !dry(x, z, w / 2) || carGap(x - fz * w / 2, z + fx * w / 2) < 3 || carGap(x + fz * w / 2, z - fx * w / 2) < 3) continue;
        rows.push([x, z]); count.teeth++; (audit.teeth ||= []).push([round(x), round(z)]);
        for (let o = -w / 2 + 0.3; o <= w / 2 - 0.29; o += 0.72) { const cx = x - fz * o, cz = z + fx * o; paint.tri([cx + fz * 0.26, y, cz - fx * 0.26], [cx - fz * 0.26, y, cz + fx * 0.26], [cx + fx * 0.68, y, cz + fz * 0.68], UP, white, W6, W6, W6); }
      }
    }
    // a bicycle painted on the red cycle paths near the route
    const bikesAt = [];
    for (const r of map.roads) {
      if (r.k !== 'cycleway' || r.a || bikesAt.length >= 10) continue; const p = r.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const l = hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]), x = (p[i] + p[i + 2]) / 2, z = (p[i + 1] + p[i + 3]) / 2; if (l < 4 || r.w < 1.2 || routeGap(x, z) > 110 || carGap(x, z) < 2 || !dry(x, z, 1.2) || bikesAt.some((q) => hypot(q[0] - x, q[1] - z) < 25)) continue;
        (audit.bikes ||= []).push([round(x), round(z)]); bikesAt.push([x, z]); stamp(x, z, (p[i + 2] - p[i]) / l, (p[i + 3] - p[i + 1]) / l, min(1.1, r.w * 0.6), min(1.1, r.w * 0.6), 5); count.bikes++; break;
      }
    }
    const me = paint.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: sheet, alphaTest: 0.5, depthTest: false, depthWrite: false, ...cut }));
    me.renderOrder = -12; scene.add(me); tally('street marks', paint.p.length / 9, paint.p.length / 9); audit.marks = count;
  }


  // --- bridges: real decks over the water. Humpbacked wherever the car has room ---
  // Dressed as Alkmaar's own canal bridges are: brick spandrels and parapets on a stone band course, a ring of dressed stone round each arch with a keystone,
  // a stone coping and stone end posts, klinkers between granite kerbs. The narrow ones (no lamps on them) have a dark green iron railing on a stone kerb instead.
  const brickPic = (g, bump) => { // eight courses of two bricks in half bond; the mortar is the low line
    g.fillStyle = bump ? '#3c3c3c' : '#b9ab9f'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) for (let x = -1; x < 2; x++) { const v = hash(y * 5 + ((x + 2) % 2) * 3 + 17); g.fillStyle = grey(bump ? 200 + v * 55 : 222 + v * 33); g.fillRect(x * 64 + (y % 2) * 32 + 2, y * 16 + 2, 60, 13); }
  };
  const railPic = (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 11); g.fillRect(0, 98, 256, 9); g.fillRect(0, 0, 10, 128); for (let x = 16; x < 256; x += 16) g.fillRect(x - 2, 0, 5, 107); }; // 2 m of railing: handrail, bottom rail, one post, a bar every 12.5 cm
  const decks = new Soup(), brickS = new Soup(), pave = new Soup(K), ironS = new Soup(), UP = [0, 1, 0], DOWN = [0, -1, 0], pillars = [[], []];
  const BC = { cap: C('#e6e0d2'), band: C('#d6cfc0'), kerb: C('#b3afa7'), walk: C('#cfc6b6'), brick: C('#a5513a'), ring: [C('#e3dccb'), C('#c4bba8')], key: C('#f4efe3'), iron: C('#1f5a3c') };
  const bq = (a, b, c, d, want, col) => { const l = hypot(want[0], want[2]) || 1, ux = want[2] / l, uz = -want[0] / l; brickS.quad(a, b, c, d, want, col, [a, b, c, d].map((p) => [(p[0] * ux + p[2] * uz) / 1.28, p[1] / 1.28])); }; // brick, courses level; the picture is 1.28 m square
  const span = (P, w, col, rail, fence) => { // P: [x, top, z] down the middle; w: width of the roadway; rail: height of the parapet (0 = none); fence: an iron railing on a kerb instead of a parapet
    const W = w + 1.4, n = P.length, KB = 0.16, CT = 0.1, dist = [0]; // KB: the kerb under a railing; CT: the coping
    for (let i = 1; i < n; i++) dist.push(dist[i - 1] + hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]));
    const X = (i, o, dy = 0) => { const a = P[max(0, i - 1)], b = P[min(n - 1, i + 1)], l = hypot(b[0] - a[0], b[2] - a[2]) || 1; return [P[i][0] - ((b[2] - a[2]) / l) * o, P[i][1] + dy, P[i][2] + ((b[0] - a[0]) / l) * o]; };
    for (let i = 0; i + 1 < n; i++) {
      const j = i + 1; pave.quad(X(i, -w / 2), X(j, -w / 2), X(j, w / 2), X(i, w / 2), UP, col);
      for (const sg of [-1, 1]) {
        const e = sg * W / 2, k = sg * (W / 2 - (rail ? 0.24 : 0)), kc = sg * (w / 2 + 0.16), cp = sg * (W / 2 + 0.04), bt = rail ? 0.1 : 0;
        const o = X(i, e), out = [o[0] - P[i][0], 0, o[2] - P[i][2]], inn = [-out[0], 0, -out[2]];
        const face = (o, y0, y1, want, col, br) => (br ? bq : (...q) => decks.quad(...q))(X(i, o, y0), X(j, o, y0), X(j, o, y1), X(i, o, y1), want, col); // upright, o off the middle
        const flat = (o0, o1, y, want, col) => decks.quad(X(i, o0, y), X(j, o0, y), X(j, o1, y), X(i, o1, y), want, col);
        flat(sg * w / 2, kc, 0, UP, BC.kerb); pave.quad(X(i, kc), X(j, kc), X(j, k), X(i, k), UP, BC.walk);
        face(e, -0.5, -0.12, out, BC.brick, true); flat(sg * (W / 2 - 0.07), e, -0.5, DOWN, BC.band); face(e, -0.12, bt, out, BC.band); // brick up to a stone band course along the deck
        if (rail && !fence) { face(e, bt, rail - CT, out, BC.brick, true); face(k, 0, rail - CT, inn, BC.brick, true); face(cp, rail - CT, rail, out, BC.band); face(k, rail - CT, rail, inn, BC.band); flat(e, cp, rail - CT, DOWN, BC.band); flat(k, cp, rail, UP, BC.cap); }
        if (rail && fence) { face(k, 0, KB, inn, BC.band); face(e, bt, KB, out, BC.band); flat(k, e, KB, UP, BC.cap); const m = (k + e) / 2; ironS.quad(X(i, m, KB), X(j, m, KB), X(j, m, rail), X(i, m, rail), out, BC.iron, [[dist[i] / 2, 0], [dist[j] / 2, 0], [dist[j] / 2, 1], [dist[i] / 2, 1]]); }
        if (rail && (i === 0 || j === n - 1)) { // the end, closed off, with a stone post on it: 2 cm past the end, 3 cm back from the inner face, so it comes no nearer the road
          const q = i === 0 ? 0 : j, d = i === 0 ? -1 : 1, along = [(P[j][0] - P[i][0]) * d, 0, (P[j][2] - P[i][2]) * d], l = hypot(along[0], along[2]) || 1, c = X(q, sg * (W / 2 - 0.08));
          decks.quad(X(q, k), X(q, e), X(q, e, fence ? KB : rail), X(q, k, fence ? KB : rail), along, BC.band);
          pillars[fence ? 1 : 0].push({ x: c[0] - (along[0] / l) * 0.19, y: c[1], z: c[2] - (along[2] / l) * 0.19, a: atan2(along[2], along[0]) });
        }
      }
    }
    // What holds it up. Wherever the deck is over water there is a brick wall under each edge with an arch through it (two or three on a long bridge),
    // a ring of stones round each arch with a keystone at the crown, a vault between the two sides, and a pier with a buttress where arches meet and at each bank.
    // All of it is below the deck and set back behind the deck's edge, so nothing lies in the plane of the deck side.
    const step = hypot(P[1][0] - P[0][0], P[1][2] - P[0][2]) || 1, last = n - 1 - 1e-6;
    const Pm = (f, o, y) => { f = max(0, min(last, f)); const i = floor(f), u = f - i, a = X(i, o), b = X(i + 1, o); return [lerp(a[0], b[0], u), y ?? lerp(a[1], b[1], u), lerp(a[2], b[2], u)]; }; // f samples along, o metres off the middle
    const runs = []; let from = null;
    for (let f = 0; f <= n - 1 + 0.2; f += 0.2) { const q = Pm(f, 0), w = f <= n - 1 && wet(q[0], q[2]); if (w && from === null) from = f; if (!w && from !== null) { runs.push([max(0, from - 0.1), min(n - 1, f - 0.1)]); from = null; } }
    const under = C('#6f6a60'), BOT = -1.32;
    const butt = (f, sg) => { // a buttress 0.7 m wide, proud of the wall, stopping short of the deck's edge
      const hw = 0.35 / step, top = Pm(f, 0)[1] - 0.6, o0 = sg * (W / 2 - 0.07), o1 = sg * (W / 2 + 0.16), c = Pm(f, 0), e = Pm(f, o1), out = [e[0] - c[0], 0, e[2] - c[2]], a = Pm(f - hw, 0), b = Pm(f + hw, 0), fwd = [b[0] - a[0], 0, b[2] - a[2]];
      bq(Pm(f - hw, o1, BOT), Pm(f + hw, o1, BOT), Pm(f + hw, o1, top), Pm(f - hw, o1, top), out, BC.brick); decks.quad(Pm(f - hw, o0, top), Pm(f + hw, o0, top), Pm(f + hw, o1, top), Pm(f - hw, o1, top), UP, BC.cap);
      for (const d of [-1, 1]) bq(Pm(f + d * hw, o0, BOT), Pm(f + d * hw, o1, BOT), Pm(f + d * hw, o1, top), Pm(f + d * hw, o0, top), fwd.map((v) => v * d), BC.brick);
    };
    for (const [f0, f1] of runs) {
      const len = (f1 - f0) * step; if (len < 2.2) continue;
      const m = max(1, round(len / 10)), pier = 0.4 / step, K = 10;
      for (let a = 0; a < m; a++) {
        const g0 = lerp(f0, f1, a / m) + (a ? pier : 0), g1 = lerp(f0, f1, (a + 1) / m) - (a < m - 1 ? pier : 0), crown = Pm((g0 + g1) / 2, 0)[1] - 0.68, mid = Pm((g0 + g1) / 2, 0, BOT);
        const at = (k) => { const u = k / K, f = lerp(g0, g1, u), top = Pm(f, 0)[1]; return { f, top: top - 0.46, y: min(top - 0.64, BOT + (crown - BOT) * Math.sqrt(max(0, 1 - (2 * u - 1) ** 2))) }; };
        for (let k = 0; k < K; k++) {
          const p = at(k), q = at(k + 1), o = W / 2 - 0.03, v0 = Pm(p.f, -o, p.y), v1 = Pm(p.f, o, p.y), v2 = Pm(q.f, o, q.y), v3 = Pm(q.f, -o, q.y);
          decks.quad(v0, v1, v2, v3, [mid[0] - (v0[0] + v2[0]) / 2, BOT - 0.5 - (p.y + q.y) / 2, mid[2] - (v0[2] + v2[2]) / 2], under); // the vault
          for (const sg of [-1, 1]) {
            const c = Pm(p.f, 0), e = Pm(p.f, sg), out = [e[0] - c[0], 0, e[2] - c[2]], o1 = sg * (W / 2 - 0.03), o2 = sg * (W / 2 - 0.07);
            bq(Pm(p.f, o2, p.y), Pm(q.f, o2, q.y), Pm(q.f, o2, q.top), Pm(p.f, o2, p.top), out, BC.brick);
            decks.quad(Pm(p.f, o1, p.y), Pm(q.f, o1, q.y), Pm(q.f, o1, min(q.y + 0.3, q.top)), Pm(p.f, o1, min(p.y + 0.3, p.top)), out, BC.ring[k % 2]); // the ring, its stones light and dark by turns
          }
        }
        for (const sg of [-1, 1]) { // the keystone: 3 cm proud of the ring, hanging a little below it, its top 2 cm under the band course
          const fm = (g0 + g1) / 2, hw = 0.13 / step, tw = 0.17 / step, y0 = crown - 0.06, y1 = Pm(fm, 0)[1] - 0.52, oi = sg * (W / 2 - 0.03), oo = sg * W / 2, c = Pm(fm, 0), e = Pm(fm, sg), a = Pm(fm - hw, 0), b = Pm(fm + hw, 0), fwd = [b[0] - a[0], 0, b[2] - a[2]];
          decks.quad(Pm(fm - hw, oo, y0), Pm(fm + hw, oo, y0), Pm(fm + tw, oo, y1), Pm(fm - tw, oo, y1), [e[0] - c[0], 0, e[2] - c[2]], BC.key); decks.quad(Pm(fm - hw, oi, y0), Pm(fm + hw, oi, y0), Pm(fm + hw, oo, y0), Pm(fm - hw, oo, y0), DOWN, BC.key); decks.quad(Pm(fm - tw, oi, y1), Pm(fm + tw, oi, y1), Pm(fm + tw, oo, y1), Pm(fm - tw, oo, y1), UP, BC.key);
          for (const d of [-1, 1]) decks.quad(Pm(fm + d * hw, oi, y0), Pm(fm + d * hw, oo, y0), Pm(fm + d * tw, oo, y1), Pm(fm + d * tw, oi, y1), fwd.map((v) => v * d), BC.key);
        }
        for (const sg of [-1, 1]) { // the solid wall of the pier between this arch and the next, and the buttresses
          if (a < m - 1) { const fa = g1, fb = g1 + 2 * pier, c = Pm(fa, 0), e = Pm(fa, sg), o2 = sg * (W / 2 - 0.07); bq(Pm(fa, o2, BOT), Pm(fb, o2, BOT), Pm(fb, o2, Pm(fb, 0)[1] - 0.46), Pm(fa, o2, Pm(fa, 0)[1] - 0.46), [e[0] - c[0], 0, e[2] - c[2]], BC.brick); butt(g1 + pier, sg); }
          if (a === 0 && f0 > 0.5) butt(f0 + 0.2 / step, sg); if (a === m - 1 && f1 < n - 1.5) butt(f1 - 0.2 / step, sg);
        }
      }
    }
  };
  const lampSpots = []; // where a lamp could stand on the end of an arch bridge's parapet; chosen further down, once everything else is in
  for (const b of plan) {
    if (b.mode === 'own') continue;
    if (b.mode === 'arch' && b.pts.length > 4 && b.r.w > 4.5) for (const [i, sg] of [[1, 1], [b.pts.length - 2, -1], [1, -1], [b.pts.length - 2, 1]]) {
      const p = b.pts[i], q = b.pts[i + (i === 1 ? 1 : -1)], l = hypot(q[0] - p[0], q[1] - p[1]) || 1, o = sg * ((b.r.w + 1.4) / 2 - 0.12);
      lampSpots.push({ x: p[0] - ((q[1] - p[1]) / l) * o, y: Y0 + 0.01 + b.h * sin(PI * p[2]) ** 2 + 0.62, z: p[1] + ((q[0] - p[0]) / l) * o, a: atan2(q[1] - p[1], q[0] - p[0]) + PI / 2, s: 0.85 });
    }
    span(b.pts.map(([x, z, u]) => [x, Y0 + 0.01 + b.h * sin(PI * u) ** 2, z]), b.r.w, C(KIND[b.r.k] || '#6a6d7c'), b.mode !== 'arch' ? 0 : b.r.w > 4.5 ? 0.62 : 1, b.mode === 'arch' && b.r.w <= 4.5);
  }
  for (const b of layout.humps) { // the bridges the exam car crosses follow the road height it actually drives on
    const P = []; for (let s = b.s0 - 1.6; s <= b.s1 + 1.61; s += 0.4) { const c = drive.centre(s); P.push([c.x, Y0 + 0.01 + layout.roadY(s), c.z]); }
    span(P, b.w - 1.4, C('#6a6d7c'), 0.62);
  }
  {
    const bm = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, ...o }), rp = canvasTex(256, 128, railPic);
    scene.add(decks.mesh(bm(), 'cast'), brickS.mesh(bm({ map: canvasTex(128, 128, (g) => brickPic(g, false)), normalMap: reliefTex(128, 128, (g) => brickPic(g, true), 1.6) }), 'cast'), pave.mesh(bm({ roughness: 0.8, map: klinker, normalMap: klinkerN }), 'cast'), ironS.mesh(bm({ roughness: 0.6, map: rp, alphaTest: 0.5, side: THREE.DoubleSide }), 'cast'));
    tally('bridges (all fixed ones)', 1, [decks, brickS, pave, ironS].reduce((t, s) => t + s.p.length / 9, 0));
    const post = (H) => fuse([Box(0.42, H + 0.06, 0.26), '#d6cfc0', 0, (H - 0.06) / 2, 0], [Box(0.48, 0.07, 0.32), '#e6e0d2', 0, H + 0.035, 0]); // H: from the deck to under the cap
    if (pillars[0].length) mine('bridge end posts', post(0.76), pillars[0]); if (pillars[1].length) mine('footbridge end posts', post(1.1), pillars[1]);
  }

  // --- buildings, split into tiles so only what is on screen is drawn ---
  const churchTex = canvasTex(128, 256, (g) => { // stone bay with a tall pointed window and a buttress
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 256); g.fillStyle = 'rgba(0,0,0,.07)'; for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 128, 1.5);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, 0, 13, 256); g.fillRect(0, 0, 128, 9); g.fillRect(0, 236, 128, 20);
    const lancet = (x, w, top, bot) => { g.beginPath(); g.moveTo(x, bot); g.lineTo(x, top + w * 0.7); g.quadraticCurveTo(x, top, x + w / 2, top - w * 0.2); g.quadraticCurveTo(x + w, top, x + w, top + w * 0.7); g.lineTo(x + w, bot); g.fill(); };
    g.fillStyle = '#efe8d8'; lancet(44, 52, 42, 200); g.fillStyle = '#27395c'; lancet(51, 38, 52, 193); g.fillStyle = '#efe8d8'; g.fillRect(68, 60, 4, 133); g.fillRect(51, 120, 38, 4);
  });
  const wallMats = { church: churchTex, trim: null }, wallN = {};
  for (const k in FACADES) { const [w, h, draw] = FACADES[k]; wallMats[k] = canvasTex(w, h, (g) => draw(g, false)); wallN[k] = reliefTex(w, h, (g) => draw(g, true), 2.2); }
  for (const k in wallMats) {
    wallMats[k] = new THREE.MeshStandardMaterial({ vertexColors: true, map: wallMats[k], normalMap: wallN[k] || null, roughness: 0.85 });
    if (FACADES[k]) wallMats[k].onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, smoothstep(0.6, 0.9, sampledDiffuseColor.a));')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float glass = (1.0 - smoothstep(0.55, 0.8, sampledDiffuseColor.a)) * smoothstep(0.025, 0.09, sampledDiffuseColor.b - sampledDiffuseColor.r);
          roughnessFactor *= mix(1.0, 0.32, glass);`);
    };
  }
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: canvasTex(128, 128, (g) => pantiles(g, false)), normalMap: reliefTex(128, 128, (g) => pantiles(g, true), 2.4), roughness: 0.7, side: THREE.DoubleSide }); // both sides: the eaves overhang
  const gravel = (g, bump) => { // a flat roof: ballast gravel over roofing felt, with a few fresh patches
    g.fillStyle = bump ? '#808080' : '#e9e9e9'; g.fillRect(0, 0, 256, 256); const r = rnd(21);
    if (!bump) for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.09)'; const x = r() * 256, y = r() * 256, w = 30 + r() * 60, h = 24 + r() * 40; for (const dx of [-256, 0]) for (const dy of [-256, 0]) g.fillRect(x + dx, y + dy, w, h); }
    for (let i = 0; i < 2600; i++) { const v = r(); g.fillStyle = bump ? grey(70 + v * 160) : `rgba(${v < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.1})`; g.fillRect(r() * 256, r() * 256, 2 + r() * 2, 2 + r() * 2); }
  };
  const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: canvasTex(256, 256, (g) => gravel(g, false)), normalMap: reliefTex(256, 256, (g) => gravel(g, true), 1.2), roughness: 0.95 });
  // the ground goes darker towards the foot of every wall. Painted on by multiplying, straight after the streets, so it lies on whatever paving is there
  const aoMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, ...cut });
  const TILE = 200, tiles = new Map();
  const tileOf = (x, z) => { const k = floor(x / TILE) + ':' + floor(z / TILE); if (!tiles.has(k)) tiles.set(k, { a: new Soup(), b: new Soup(), shop: new Soup(), church: new Soup(), trim: new Soup(), flat: new Soup(1 / 3), roofs: new Soup(), ao: new Soup() }); return tiles.get(k); };
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

  const cream = C('#f4ecdb'), white = C('#ffffff'), blocks = [], relief = [], crowns = [], downpipes = [];
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
      const at = (x, z, X, Z, d, y) => [lerp(x, X, d), y, lerp(z, Z, d)];
      const profile = [[0, y0], [0.42, y0], [0.42, h-0.25], [0.75, h-0.19], [0.75, h+0.06], [1, h+0.11], [1, y1], [0, y1], [0, h]];
      const colours = ['#afa693','#d5c8af','#ab9f87','#ebe0c7','#c3b59e','#f4ecdb','#f4ecdb','#ded3bd'];
      for (let k=1;k<profile.length;k++) {
        const [d0,lo]=profile[k-1], [d1,hi]=profile[k];
        const sign = k===profile.length-1 ? -1 : 1;
        soup.quad(at(ax,az,Ax,Az,d0,lo),at(bx,bz,Bx,Bz,d0,lo),at(bx,bz,Bx,Bz,d1,hi),at(ax,az,Ax,Az,d1,hi),
          [nx*sign, d0-d1, nz*sign], C(colours[k-1]));
      }
    }
  };
  // a church roof: finds the long axis of the footprint and lays a steep roof down it, with a transept and a ridge turret on the big one
  const steeple = (b, h, t, big) => {
    const p = b.p, n = p.length / 2, [cx, cz] = b.c; let sxx = 0, sxz = 0, szz = 0;
    for (let i = 0; i < n; i++) { const dx = p[2 * i] - cx, dz = p[2 * i + 1] - cz; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
    const a = 0.5 * atan2(2 * sxz, sxx - szz), ux = cos(a), uz = sin(a), T = [], W = [];
    for (let i = 0; i < n; i++) { const dx = p[2 * i] - cx, dz = p[2 * i + 1] - cz; T.push(dx * ux + dz * uz); W.push(-dx * uz + dz * ux); }
    const across = (A, Bv, t0) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < n; i++) { const j = (i + 1) % n; if ((A[i] > t0) !== (A[j] > t0)) { const v = Bv[i] + ((Bv[j] - Bv[i]) * (t0 - A[i])) / (A[j] - A[i]); lo = min(lo, v); hi = max(hi, v); } } return [lo, hi]; };
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

  function pitchedGable(t, a, b, ridge, wall, showVent) {
    const dx=b[0]-a[0], dz=b[2]-a[2], width=hypot(dx,dz), height=ridge[1]-a[1], normal=[-dz/width,0,dx/width];
    if (!showVent || width<3.6 || height<1.7) {
      t.a.tri(a,b,ridge,normal,wall);
      return;
    }
    const rx=min(.13,.57/width), ry=min(.2,.57/height);
    const octagon=(scale) => Array.from({length:8},(_,i) => {
      const angle=(i+.5)*PI/4;
      return new THREE.Vector2(.5+rx*scale*cos(angle),.36+ry*scale*sin(angle));
    });
    const outline=[new THREE.Vector2(0,0),new THREE.Vector2(1,0),new THREE.Vector2(.5,1)], ring=octagon(1), opening=octagon(.73);
    const pt=(uv,depth=0) => [a[0]+dx*uv.x-normal[0]*depth,a[1]+height*uv.y,a[2]+dz*uv.x-normal[2]*depth];
    const points=[...outline,...ring].map(uv=>pt(uv));
    for (const [i,j,k] of THREE.ShapeUtils.triangulateShape(outline,[ring])) t.trim.tri(points[i],points[j],points[k],normal,wall);
    const centre=pt(new THREE.Vector2(.5,.36),.13);
    for (let i=0;i<8;i++) {
      const j=(i+1)%8, p=pt(opening[i],.13), q=pt(opening[j],.13);
      t.trim.quad(pt(ring[i]),pt(ring[j]),q,p,normal,C(i%2?'#e3d5b9':'#f3e7d1'));
      t.trim.tri(p,q,centre,normal,C(i<4?'#526f7d':'#364d5a'));
    }
    tally('attic oculi',1,34);
  }

  const dim = (c, k) => c.clone().multiplyScalar(k), aoDark = C('#8a8a8a'), AO = 1.7, SK = 1.2, pitched = [], tops = []; // AO: width of the shading at the foot of a wall; SK: metres of roof to one repeat of the tile picture
  for (const b of B) {
    if (b.gone) continue;
    const p = b.p, n = p.length / 2, Rb = rnd(b.i * 7919 + 13), [cx, cz] = b.c, t = tileOf(cx, cz), church = b.k === 'church', big = church && /^Grote/.test(b.n || ''), special = church || b.n === 'Waag' || b.n === 'Accijnstoren';
    let h = b.h + (Rb() - 0.5) * 0.36, wall = C(WALLS[floor(Rb() * WALLS.length)]), roof = C(ROOFS[floor(Rb() * ROOFS.length)]); // no two roofs at exactly the same height
    const soup = Rb() < 0.42 ? t.b : t.a;
    if (church) { h = big ? 32 : max(b.h, 11); wall = C('#d8c7a4'); roof = C('#7a8492'); } // the big one is a model of its own (LM.groteKerk): only its footprint and the shading round its foot are made here
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
      if (big) continue;
      if (inWater) t.a.wall(ax, az, bx, bz, -1.6, 0, want, C('#8a5a48')); // standing in a canal: the wall goes on down to the water
      if (church) { const cb = max(1, round(len / 5)); t.church.wall(ax, az, bx, bz, 0, h, want, wall, plain ? undefined : [[0, 0], [cb, 0], [cb, 1], [0, 1]]); continue; }
      const y0 = plain ? 0 : gf, floors = max(1, round((h - y0) / 3.1));
      const bw = len / bays, fh = (h-y0) / floors;
      const detailed = !plain && free && !layout.clear(mx+nx*3, mz+nz*3, 12);
      const roomForRebate = detailed && [.08,.3,.5,.7,.92].every(f => inPoly(p,ax+ux*len*f-nx*.19,az+uz*len*f-nz*.19));
      if (roomForRebate && !special) {
        // The rebates go into the shell; the original street-side wall plane stays the outer edge.
        const startSize = soup.p.length + t.shop.p.length;
        let openings = 0;
        const skin = (geo, bottom, height, width, base, top) => (uv, depths) => {
          const points = uv.map(([u,v],k) => [ax+ux*u*width-nx*depths[k], bottom+v*height, az+uz*u*width-nz*depths[k]]);
          const colours = points.map((pt) => base.clone().lerp(top,(pt[1]-bottom)/(geo===t.shop ? gf : h-y0)));
          geo.quad(...points,want,colours,uv);
        };
        const upper = skin(soup,y0,fh,bw,y0 ? low : foot,wall);
        const [left,bottom,right,top] = soup===t.a ? [72,52,184,204] : [86,60,170,188];
        for (let bay=0;bay<bays;bay++) for(let f=0;f<floors;f++) {
          recessedBay(upper,[bay,f,bay+1,f+1],[bay+left/256,f+bottom/256,bay+right/256,f+top/256],0.14);
          openings++;
        }
        if (y0) {
          const ground = skin(t.shop,0,gf,2*bw,pfoot,plinth);
          for (let bay=0;bay<bays;bay+=2) {
            const u=bay/2;
            recessedBay(ground,[u,0,u+.5,1],[u+32/512,56/256,u+224/512,176/256],0.16);
            openings++;
            if (bay+1===bays) continue;
            recessedBay(ground,[u+.5,0,u+390/512,1],[u+292/512,8/256,u+368/512,184/256],0.16);
            recessedBay(ground,[u+390/512,0,u+1,1],[u+404/512,80/256,u+480/512,172/256],0.14);
            openings+=2;
          }
        }
        tally('recessed window and door detail',openings,(soup.p.length+t.shop.p.length-startSize)/9-2-(y0 ? 2 : 0));
      } else {
        if (y0) t.shop.wall(ax, az, bx, bz, 0, gf, want, pfoot, [[0, 0], [bays / 2, 0], [bays / 2, 1], [0, 1]], plinth);
        soup.wall(ax, az, bx, bz, y0, h, want, y0 ? low : foot, plain ? undefined : [[0, 0], [bays, 0], [bays, floors], [0, floors]], wall);
      }
      if (!detailed) continue;
      const ang = atan2(uz, ux), sw = bw * (soup === t.a ? 0.6 : 0.5), put = (list, d, y, out, sx, sy, sz, c) => list.push({ x: ax + ux * d + nx * out, y, z: az + uz * d + nz * out, a: ang, sx, sy, sz, c });
      for (let u = 0; u < bays; u++) for (let f = 0; f < floors; f++) {
        const d = (u + 0.5) * bw, yb = y0 + f * fh, k = Math.imul(b.i * 31 + i * 7 + u * 3 + f, 2654435761) >>> 8;
        put(relief, d, yb + fh * 0.137, 0.06, sw, 0.1, 0.2, '#f4ecdb'); put(relief, d, yb + fh * (soup === t.a ? 0.83 : 0.863), 0.03, sw, 0.12, 0.12, '#f4ecdb');
        if (f === 0 && y0 && k % 4 === 0) { put(relief, d, yb + fh * 0.137 + 0.15, 0.19, sw * 0.9, 0.2, 0.24, '#a8573a'); put(relief, d, yb + fh * 0.137 + 0.32, 0.19, sw * 0.82, 0.14, 0.18, ['#e0202a', '#f7c400', '#ff5fa8', '#ffffff'][k % 4 ^ (k >> 4) % 4]); } // geraniums
      }
      if (len>5 && !special) {
        put(downpipes,0.2,(h-0.50)/2,0.07,1,h-0.50,1,'#97a2a5');
        // Folded zinc gutter under the cornice. The full run sits within 14 cm of the wall.
        // Test the run so a shared wall partway along a crooked footprint cannot be dressed.
        const clearRun=[.03,.25,.5,.75,.97].every(f=>!hitB(ax+ux*len*f+nx*.14,az+uz*len*f+nz*.14,b));
        if (clearRun) {
          const pts=[[0,-.40],[.03,-.47],[.07,-.50],[.12,-.47],[.14,-.40]];
          const at=(d,[out,dy])=>[ax+ux*d+nx*out,h+dy,az+uz*d+nz*out];
          for (let k=1;k<pts.length;k++) {
            const u=pts[k-1],v=pts[k],w=[nx*(v[1]-u[1]),u[0]-v[0],nz*(v[1]-u[1])];
            t.trim.quad(at(.14,u),at(len-.14,u),at(len-.14,v),at(.14,v),w,C(k%2?'#879194':'#a6aca8'));
          }
          tally('zinc gutters',1,8);
        }
      }
      if (len>5 && special) put(relief,0.2,(h-0.4)/2,0.07,0.1,h-0.4,0.1,'#7d858c');
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
    if (big) continue;
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
      const nearStreet = !layout.clear(cx,cz,48);
      pitchedGable(t,q[0],q[1],r0,wall,nearStreet && g0>0);
      pitchedGable(t,q[2],q[3],r1,wall,nearStreet && g1>0);
      const ang = atan2(dz, dx), f = 0.25 + Rb() * 0.5;
      const chim = Rb() < 0.6 ? f : -1; // where along the ridge its chimney stands, if it has one
      blocks.push({ x: r0[0] + dx * 0.16, y: h + rh + 0.13, z: r0[2] + dz * 0.16, a: ang }, { x: r1[0] - dx * 0.16, y: h + rh + 0.13, z: r1[2] - dz * 0.16, a: ang });
      b.H = h + rh; pitched.push({ b, q, r0, r1, rh, gw, rl, h, roof, chim, ang });
    } else {
      let m = null; if (tiled) for (const d of [2.2, 1.3, 0.7]) if ((m = inset(p, d))) break;
      if (m) { // every other roof: tiled slopes at 45 degrees, rising from the top of the walls to a flat middle
        const { q, I, d } = m, k = q.length / 2, top = h + d, sl = (d * Math.SQRT2) / SK;
        for (let i = 0; i < k; i++) {
          const j = (i + 1) % k, ex = q[2 * j] - q[2 * i], ez = q[2 * j + 1] - q[2 * i + 1], len = hypot(ex, ez), u = (x, z) => ((x - q[2 * i]) * ex + (z - q[2 * i + 1]) * ez) / len / SK;
          t.roofs.quad([q[2 * i], h, q[2 * i + 1]], [q[2 * j], h, q[2 * j + 1]], [I[2 * j], top, I[2 * j + 1]], [I[2 * i], top, I[2 * i + 1]], [-ez, len, ex], roof, [[0, 0], [len / SK, 0], [u(I[2 * j], I[2 * j + 1]), sl], [u(I[2 * i], I[2 * i + 1]), sl]]);
        }
        try { t.flat.flat(I, top, roof.clone().lerp(C('#646872'), 0.6)); } catch {}
        b.H = top; tops.push({ b, p: I, y: top, d, q, roof });
      } else { try { (special ? t.trim : t.flat).flat(p, h, special ? roof : roof.clone().lerp(C('#646872'), 0.45)); } catch {} if (tiled) tops.push({ b, p, y: h, d: 0 }); }
      if (church) steeple(b, h, t, false); else if (h > 4 && !layout.clear(cx, cz, 55)) { ledge(t.trim, p, h); crowns.push(...crown); }
    }
  }
  for (const t of tiles.values()) { for (const k in wallMats) if (t[k].p.length) scene.add(t[k].mesh(wallMats[k], 'cast')); scene.add(t.roofs.mesh(roofMat, 'cast')); if (t.flat.p.length) scene.add(t.flat.mesh(flatMat, 'cast')); if (t.ao.p.length) { const me = t.ao.mesh(aoMat); me.renderOrder = -10; me.receiveShadow = false; scene.add(me); } }
  inst(Box(1, 1, 1), mat('#ffffff'), relief, false); inst(Box(1, 1, 1), mat('#ffffff'), crowns);
  // The flared sockets and straight zinc tube share one revolved skin.
  const pipeProfile = [[.05,0],[.05,.035],[.039,.053],[.039,.45],[.05,.45],[.05,.47],[.039,.49],[.039,.92],[.05,.92],[.05,1]];
  const pipe = new THREE.LatheGeometry(pipeProfile.map(([r,y]) => new THREE.Vector2(r,y-.5)),8);
  mine('zinc downpipes', pipe, downpipes, mat('#ffffff',{metalness:.44,roughness:.47}),false);
  inst(Box(0.3, 0.46, 0.52), mat('#f4ecdb'), blocks);

  // --- roof life, for the shots from above: brick chimneys, dormers and roof windows on the pitched roofs; vents, skylights and a roof terrace here and
  // there on the flat ones. Only where a camera comes (along the route and round the landmarks); everything further off keeps a plain chimney ---
  {
    const SPOTS = [[...map.pois.Waag, 100], [...map.pois['Grote of Sint-Laurenskerk'], 120], [...map.pois['Molen van Piet'], 90], [...map.pois.Accijnstoren, 80]];
    const nearby = (x, z) => !layout.clear(x, z, 55) || SPOTS.some(([px, pz, r]) => hypot(px - x, pz - z) < r);
    const plain = [], cT = [], cR = [], dT = [], dR = [], sky = [], vents = [], terr = [], caps = [], BRICK = ['#8f4a36', '#a8573a', '#7d4433', '#b0624a'];
    for (const { b, q, r0, r1, rh, rl, h, roof, chim, ang } of pitched) {
      const k = mix(b.i, 0), fine = nearby(b.c[0], b.c[1]), tile = '#' + dim(roof, 0.93).getHexString();
      if (chim >= 0) { const o = { x: lerp(r0[0], r1[0], chim), y: h + rh, z: lerp(r0[2], r1[2], chim), a: ang }; if (fine) { cT.push({ ...o, c: BRICK[k % 4] }); cR.push(o); } else plain.push({ ...o, y: o.y - 0.1 }); }
      if (!fine) continue;
      if (rl > 1.6) caps.push({ x: (r0[0] + r1[0]) / 2, y: h + rh + 0.03, z: (r0[2] + r1[2]) / 2, a: ang, sx: rl - 0.9, c: '#' + dim(roof, 0.74).getHexString() }); // ridge tiles, stopping short of the stone on each gable
      if (rl < 3.4) continue;
      [[q[1], q[2], r0, r1], [q[3], q[0], r1, r0]].forEach(([u, v, ru, rv], sd) => { // the two slopes: from the eave u-v up to the ridge ru-rv
        const ex = v[0] - u[0], ez = v[2] - u[2], el = hypot(ex, ez) || 1, tx = ex / el, tz = ez / el; let nx = -tz, nz = tx; if ((u[0] - ru[0]) * nx + (u[2] - ru[2]) * nz < 0) { nx = -nx; nz = -nz; } // n: downhill
        const runU = (u[0] - ru[0]) * nx + (u[2] - ru[2]) * nz, runV = (v[0] - rv[0]) * nx + (v[2] - rv[2]) * nz, run = min(runU, runV), a = atan2(-nx, nz);
        if (run < 1.5 || Math.abs(runU - runV) > 0.25) return; // a crooked footprint: leave that slope bare
        const clearOf = (x, z, hw, d0, d1) => [[-hw, d0], [hw, d0], [-hw, d1], [hw, d1]].every(([s, d]) => { const X = x + tx * s + nx * d, Z = z + tz * s + nz * d; return inPoly(b.p, X, Z) && !hitB(X, Z, b); });
        const offChimney = (f) => chim < 0 || Math.abs((sd ? 1 - f : f) - chim) * rl > 1.6;
        const sc = min(1, (rh - 0.55) / 1.84), free = (f) => !hitB(lerp(u[0], v[0], f) + nx * 1.1, lerp(u[2], v[2], f) + nz * 1.1, b); // sc: as big as the slope allows, its ridge staying below the roof's
        if ((k >> (4 + sd)) % 4 && sc >= 0.7 && rh / max(runU, runV) > 0.985 && rh / run < 1.1 && Math.abs(runU - runV) < 0.6) { // 45 degrees or a touch steeper (then the roof just swallows a little more of them): dormers, standing 0.3 m in from the wall
          for (let m = el > 8.6 ? 2 : 1, j = 0; j < m; j++) {
            const f = m === 1 ? 0.36 + ((k >> 8) % 28) / 100 : 0.27 + j * 0.46, x = lerp(u[0], v[0], f) - nx * 0.3, z = lerp(u[2], v[2], f) - nz * 0.3;
            if (f * el < 1.6 || (1 - f) * el < 1.6 || !offChimney(f) || !free(f) || !clearOf(x, z, 0.95 * sc, 0.2, -2.1 * sc)) continue;
            const y = h + (0.3 * rh) / lerp(runU, runV, f) - 0.01; dT.push({ x, y, z, a, s: sc, c: tile }); dR.push({ x, y, z, a, s: sc });
          }
        } else if ((k >> (6 + sd)) % 2 && run > 2.2) { // any other slope: a roof window lying in it, halfway up
          const f = 0.3 + ((k >> 12) % 40) / 100, d = run * 0.5, x = lerp(u[0], v[0], f) - nx * d, z = lerp(u[2], v[2], f) - nz * d, sl = rh / run;
          if (f * el < 1.3 || (1 - f) * el < 1.3 || !offChimney(f) || !clearOf(x, z, 0.75, 0.6, -0.6)) return;
          sky.push({ x: x - nx * 0.014, y: h + (run - d) * sl - 0.014, z: z - nz * 0.014, a, rx: Math.atan(sl) });
        }
      });
    }
    for (const { b, p, y, d, q, roof } of tops) {
      if (!nearby(b.c[0], b.c[1])) continue;
      if (d > 2) for (let n = q.length / 2, i = 0; i < n; i++) { // a mansard: dormers in its 45 degree skirt, well clear of the hips at the corners
        const j = (i + 1) % n, ax = q[2 * i], az = q[2 * i + 1], ex = q[2 * j] - ax, ez = q[2 * j + 1] - az, len = hypot(ex, ez), tx = ex / len, tz = ez / len, nx = -tz, nz = tx, m = floor((len - 6.4) / 4.4) + 1, a = atan2(-nx, nz);
        for (let e = 0; e < m && len >= 6.4; e++) {
          const u = 3.2 + ((len - 6.4) * (e + 0.5)) / m, x = ax + tx * u - nx * 0.25, z = az + tz * u - nz * 0.25, at = (sx, dn) => [ax + tx * (u + sx) - nx * dn, az + tz * (u + sx) - nz * dn];
          if (mix(b.i, 90 + i * 7 + e) % 4 === 0 || hitB(...at(0, -1.1), b) || !layout.clear(ax + ex / 2 + nx * 3, az + ez / 2 + nz * 3, 12.5)) continue; // (walls that close to the route carry stepped gables)
          if (![[-0.85, 0.12], [0.85, 0.12], [-0.85, 2.12], [0.85, 2.12], [0, 2.12]].every(([sx, dn]) => { const [X, Z] = at(sx, dn); return inPoly(q, X, Z) && Math.abs(edgeGap(q, X, Z) - dn) < 0.04 && !hitB(X, Z, b); })) continue; // the roof under it must be this one slope and nothing else
          const o = { x, y: y - d + 0.25, z, a }; dT.push({ ...o, c: '#' + dim(roof, 0.93).getHexString() }); dR.push(o);
        }
      }
      const k = mix(b.i, 1), [x0, z0, x1, z1] = bbox(p), A = Math.abs(area(p)), want = A > 400 ? 6 : A > 260 ? 5 : A > 110 ? 4 : A > 36 ? 2 : A > 9 ? 1 : 0, placed = []; let ang = 0, best = 0;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const l = hypot(p[i] - p[j], p[i + 1] - p[j + 1]); if (l > best) { best = l; ang = atan2(p[i + 1] - p[j + 1], p[i] - p[j]); } } // square to the longest wall
      for (let j = 0; j < 30 && placed.length < want; j++) {
        const x = lerp(x0, x1, (mix(b.i, 2 + j) % 1000) / 1000), z = lerp(z0, z1, (mix(b.i, 40 + j) % 1000) / 1000), kind = !placed.length && A > 70 && k % 6 === 0 ? 2 : mix(b.i, 70 + j) % 6 ? 1 : 0, r = [0.85, 1.0, 2.05][kind];
        if (!inPoly(p, x, z) || edgeGap(p, x, z) < r + 0.5 || placed.some((o) => hypot(o.x - x, o.z - z) < o.r + r + 0.5) || [0, 1, 2, 3, 4, 5].some((i) => hitB(x + cos(i * PI / 3) * (r + 0.3), z + sin(i * PI / 3) * (r + 0.3), b))) continue;
        placed.push({ x, z, r }); [vents, sky, terr][kind].push({ x, y: y - 0.012, z, a: ang + (kind === 1 && j % 2 ? PI / 2 : 0) });
      }
    }
    const stack = Box(0.62, 1.3, 0.62), stackUV = stack.attributes.uv;
    for (let i=0;i<stackUV.count;i++) {
      const end = i>=8 && i<16;
      stackUV.setX(i,(stackUV.getX(i)+(end ? 1 : 0))/2);
    }
    const stackTile = canvasTex(128,128,(g) => {
      bricks(g,false,64,128);
      g.fillStyle='#dacaba'; g.fillRect(0,0,64,10);
      g.fillStyle='#cfbda8'; g.fillRect(64,0,64,128);
      g.fillStyle='#332b29'; g.fillRect(73,16,46,96);
    },false);
    inst(stack,mat('#8f4a36',{map:stackTile}),plain);
    mine('ridge tiles',prof(1,[[-.17,-.08],[-.135,.006],[-.074,.065],[0,.08],[.074,.065],[.135,.006],[.17,-.08]]),caps,mat('#ffffff'));
    for (const [name, geo, list] of [['chimneys', LM.chimneyGeo('tint'), cT], ['chimneys', LM.chimneyGeo('rest'), cR], ['dormers', LM.dormerGeo('tint'), dT], ['dormers', LM.dormerGeo('rest'), dR], ['roof windows', LM.skylightGeo(), sky.filter((_, i) => i % 5 < 2)], ['roof vents', LM.ventGeo(), vents.filter((_, i) => i % 3 < 1)], ['roof terraces', LM.roofTerraceGeo(), terr]]) mine(name, geo, list);
  }

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

  // --- landmarks ---
  const box = (w, h, d, color, x = 0, y = 0, z = 0, o) => { const me = new THREE.Mesh(Box(w, h, d), mat(color, o)); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; return me; };
  const beam = (a, b, th, color) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), me = box(A.distanceTo(Bv), th, th, color); me.position.copy(A).lerp(Bv, 0.5); me.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), Bv.clone().sub(A).normalize()); return me; };
  world.box = box; world.beam = beam;

  { // the Grote Kerk: the model stands in the frame of its own map footprint, which stays in the hit grid (nothing is extruded from it any more)
    const b = B.find((q) => q.k === 'church' && /^Grote/.test(q.n || '')), [cx, cz] = b.c, a = KERK_A, g = LM.groteKerk(); g.position.set(cx, 0, cz); g.rotation.y = -a; scene.add(g); tallyGroup('Grote Kerk', g);
    for (const o of LM.groteKerkSolids) world.solid(cx + o.x * cos(a) - o.z * sin(a), cz + o.x * sin(a) + o.z * cos(a), o.r, o.h);
  }
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
  { // Molen van Piet. The real one stands on the old city rampart; here it is a round brick bastion with a stone terrace on top and steps up to it
    const [x, z] = map.pois['Molen van Piet'], MOUND = 2.2, A = MILL_FACE, { group: g, sails } = LM.molen(), sa = sin(STAIR), ca = cos(STAIR), P = [];
    P.push([Cyl(7.9, 8.3, MOUND + 0.3, 28), '#9a5a3c', 0, MOUND / 2 - 0.25, 0], [Cyl(8.12, 8.12, 0.2, 28), '#d6cfc0', 0, MOUND - 0.1, 0], [Cyl(8.4, 8.4, 0.5, 28), '#7a432c', 0, 0.05, 0]);
    for (let k = 0; k < 7; k++) { const h = (MOUND * (k + 1)) / 8, d = 11.2 - 0.42 * (k + 0.5); P.push([Box(k === 6 ? 1.0 : 0.42, h + 0.3, 1.9).rotateY(-STAIR), k % 2 ? '#cfc7b6' : '#c2b9a6', ca * (d - (k === 6 ? 0.29 : 0)), h / 2 - 0.15, sa * (d - (k === 6 ? 0.29 : 0))]); } // the last step runs on into the wall
    const base = new THREE.Mesh(fuse(...P), tinted); base.position.set(x, 0, z); base.castShadow = base.receiveShadow = true; scene.add(base);
    g.position.set(x, MOUND - 0.03, z); g.rotation.y = A; scene.add(g); tallyGroup('windmill', g); tallyGroup('windmill', base);
    world.solid(x, z, 8.6, MOUND + 0.4); world.solid(x, z, 7, MOUND + 31); world.solid(x + ca * 9.8, z + sa * 9.8, 1.6, MOUND);
    world.windmill = { x, z, sails, y: MOUND, face: A, hub: [x + 4.5 * sin(A), MOUND - 0.03 + 18.5, z + 4.5 * cos(A)] }; // hub: the middle of the sail cross; the sails look along (sin face, cos face)
  }

  // --- the Eenhoornbrug as an open drawbridge (the ramp) ---
  {
    const r = layout.ramp, g = new THREE.Group(); g.position.set(r.x, GROUND, r.z); g.rotation.y = -r.h;
    const len = (r.s1 - r.s0) / cos(r.angle), lf = new THREE.Group(); lf.rotation.z = r.angle;
    lf.add(box(len - 3, 0.3, 5.8, '#8a5a3a', (len - 3) / 2, -0.15, 0));
    for (let k = 0; k < 6; k++) lf.add(box(0.5, 0.3, 5.8, k % 2 ? '#e9503a' : '#f6f1e4', len - 0.25 - k * 0.5, -0.15, 0)); // warning stripes: their own planks, end to end
    for (const z of [-2.7, 2.7]) { lf.add(box(len, 0.17, 0.3, '#f6f1e4', len / 2, 0.045, z), box(len, 0.1, 0.1, '#f6f1e4', len / 2, 0.95, z)); for (let k = 0; k <= 4; k++) lf.add(box(0.1, 0.84, 0.1, '#f6f1e4', 0.05 + ((len - 0.1) * k) / 4, 0.5, z)); }
    // white wooden railings with a St Andrew's cross in every panel, as on the drawbridges over the Alkmaar canals; one bar of each cross 4 cm deeper, so no two faces share a plane
    const crosses = (x0, x1, n, y0, y1, z) => { const P = [], d = (x1 - x0) / n; for (let k = 0; k < n; k++) { const a = x0 + d * k + 0.05, b = a + d - 0.1, l = hypot(b - a, y1 - y0), t = atan2(y1 - y0, b - a); P.push([Box(l, 0.06, 0.05), '#f6f1e4', (a + b) / 2, (y0 + y1) / 2, z, t], [Box(l, 0.06, 0.09), '#f6f1e4', (a + b) / 2, (y0 + y1) / 2, z, -t]); } return P; };
    const solid = (geo) => { const me = new THREE.Mesh(geo, tinted); me.castShadow = me.receiveShadow = true; return me; };
    lf.add(solid(fuse(...crosses(0.05, len - 0.05, 4, 0.13, 0.9, -2.7), ...crosses(0.05, len - 0.05, 4, 0.13, 0.9, 2.7))));
    g.add(lf);
    const top = 7.2, arm = 0.62, tip = [cos(r.angle) * len, sin(r.angle) * len];
    for (const z of [-3.3, 3.3]) {
      g.add(box(0.45, top, 0.45, '#f6f1e4', -0.8, top / 2, z));
      const front = [-0.8 + cos(arm) * 8.2, top + sin(arm) * 8.2], back = [-0.8 - cos(arm) * 4, top - sin(arm) * 4];
      g.add(beam([back[0], back[1], z], [front[0], front[1], z], 0.34, '#f6f1e4'), beam([front[0], front[1], z], [tip[0], tip[1], z * 0.84], 0.09, '#30343c'));
      g.add(box(1.6, 1.1, 0.9, '#3f4656', back[0], back[1], z));
    }
    g.add(box(0.4, 0.4, 6.15, '#f6f1e4', -0.8, top - 0.03, 0));
    { // the balance: a cross beam and a pair of braces in each bay between the arms, all well above anything the car does; tarred feet on the portal posts
      const A = (t) => [-0.8 + cos(arm) * (12.2 * t - 4), top + sin(arm) * (12.2 * t - 4)], P = [], bar = (a, b, th) => { const u = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = u.length(); return [Box(l, th, th).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), u.normalize())), '#f6f1e4', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; };
      for (const [t0, t1] of [[4 / 12.2, 0.66], [0.66, 1]]) { P.push([Box(0.22, 0.22, 6.6), '#f6f1e4', ...A(t1), 0], bar([...A(t0), -3.3], [...A(t1), 3.3], 0.14), bar([...A(t0), 3.3], [...A(t1), -3.3], 0.1)); }
      for (const z of [-3.3, 3.3]) P.push([Box(0.62, 0.9, 0.62), '#26282d', -0.8, 0.45, z]);
      g.add(solid(fuse(...P)));
    }
    { // a brick abutment with a stone cap at each bank: the near one slid out until all of it stands in the water; the far one just under the fixed half,
      // no wider than its deck and short of where the tour boat sails (tools/check.mjs keeps the boat clear of the fixed half, and so of this)
      const ab = []; let was = null;
      for (let q = mk.bridgeN - 8; q <= mk.bridgeS + 10; q += 0.25) {
        const c = drive.centre(q), w = wet(c.x, c.z);
        if (was !== null && w !== was) for (let d = 0.2; d < 2.4; d += 0.1) {
          const o = drive.place(q + (w ? d : -0.25 - d), 0), ca = cos(o.h), sa = sin(o.h);
          if (!w) { const f = drive.place(r.s1 + 2.6, 0); ab.push({ x: f.x, y: GROUND - 0.49, z: f.z, a: f.h, sz: 0.87 }); break; }
          if ([[-0.5, -3.4], [-0.5, 3.4], [0.5, -3.4], [0.5, 3.4], [-0.5, 0], [0.5, 0]].every(([f, l]) => wet(o.x + ca * f - sa * l, o.z + sa * f + ca * l))) { ab.push({ x: o.x, y: GROUND - 0.35, z: o.z, a: o.h }); break; }
        }
        was = w;
      }
      mine('drawbridge abutments', fuse([Box(0.9, 1.0, 6.7), '#a5513a', 0, -0.6, 0], [Box(1.0, 0.14, 6.8), '#d6cfc0', 0, -0.07, 0]), ab); // origin on top of the cap
    }
    // fixed far half of the bridge
    const far = mk.bridgeS - mk.bridgeN - 1.5, fx0 = r.s1 - r.s0 + 2.2;
    g.add(box(far - fx0 + 1.5, 0.5, 5.8, '#8b8f9c', (fx0 + far + 1.5) / 2, -0.26, 0));
    for (const z of [-2.7, 2.7]) { const L = far - fx0 + 1.5, cx = (fx0 + far + 1.5) / 2, P = [[Box(L, 0.17, 0.3), '#f6f1e4', cx, 0.045, z], [Box(L, 0.1, 0.1), '#f6f1e4', cx, 0.84, z]]; for (let k = 0; k <= 5; k++) P.push([Box(0.1, 0.74, 0.1), '#f6f1e4', fx0 + 0.05 + ((L - 0.1) * k) / 5, 0.47, z]); g.add(solid(fuse(...P, ...crosses(fx0 + 0.05, fx0 + L - 0.05, 5, 0.13, 0.79, z)))); } // the same railing, no higher than the boards it replaces
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
  }

  // --- street furniture along the route (placed by props.js, which the clipping check shares) ---
  const props = placeProps(map, drive); world.people = props.filter((o) => o.kind === 'person' && ![[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([i, j]) => world.inside(o.x + i, 0.5, o.z + j))); // not the ones who would stand in a market stall
  const of = (kind) => props.filter((o) => o.kind === kind).map((o, i) => ({ x: o.x, z: o.z, a: o.a + (o.side < 0 ? PI : 0), i }));
  inst(fuse([Cyl(0.06, 0.09, 4, 6), '#26352f', 0, 2, 0], [Cyl(0.14, 0.16, 0.5, 6), '#26352f', 0, 0.25, 0], [Box(0.36, 0.46, 0.36), '#fff1b8', 0, 4.2, 0], [Cyl(0.05, 0.31, 0.24, 6), '#26352f', 0, 4.55, 0]), tinted, of('lamp'));
  inst(fuse([Cyl(0.1, 0.13, 0.8, 8), '#8c2f2a', 0, 0.4, 0], [Cyl(0.127, 0.127, 0.1, 8), '#f6f1e4', 0, 0.6, 0], [Ico(0.125, 1), '#8c2f2a', 0, 0.83, 0]), tinted, of('bollard'));
  inst(bikeGeo.all(),
    tinted, of('bike').map((o) => ({ ...o, rx: 0.16, a: o.a + (o.i % 2) * PI, c: BRIGHT[o.i % 6] })));
  mine('benches', LM.benchGeo(), of('bench'));
  inst(fuse([Box(1.05, 0.52, 1.05), '#b5653f', 0, 0.26, 0], [Box(1.17, 0.09, 1.17), '#c97a50', 0, 0.5, 0], [Ico(0.5, 1), '#4ca649', 0, 0.9, 0], [Ico(0.17, 0), '#ff6fa3', 0.3, 1.12, 0.2], [Ico(0.17, 0), '#ffd23f', -0.26, 1.16, -0.2], [Ico(0.15, 0), '#ff6fa3', -0.08, 1.24, 0.3], [Ico(0.15, 0), '#ffffff', 0.12, 1.3, -0.24]), tinted, of('planter'));
  inst(fuse([Cyl(0.24, 0.2, 0.8, 10), '#2f5d46', 0, 0.45, 0], [Cyl(0.262, 0.262, 0.09, 10), '#f2c230', 0, 0.66, 0], [Cyl(0.27, 0.27, 0.08, 10), '#26352f', 0, 0.89, 0]), tinted, of('bin'));

  // --- the cheese market on the Waagplein: stacks of Gouda in rows square to the Waag, the weighing scale at their head, a herring cart and a flower stall at the edge ---
  {
    const sq = map.roads.find((r) => r.a && r.n === 'Waagplein')?.p, d = layout.donut, [wx, wz] = map.pois.Waag, ca = cos(0.55), sa = sin(0.55), at = (u, v) => [wx + u * ca - v * sa, wz + u * sa + v * ca];
    const folk = [...props, ...layout.crowd], trees = map.trees, treeGap = (x, z) => { let g = 1e9; for (let i = 0; i < trees.length; i += 2) g = min(g, hypot(trees[i] - x, trees[i + 1] - z)); return g; };
    // a spot is free when a circle of radius r round it is on the square, off every building, parasol and flagpole, and more than 2.9 m from anywhere the car's centre goes
    const free = (x, z, r) => [[0, 0], ...Array.from({ length: 8 }, (_, k) => [cos(k * PI / 4) * r, sin(k * PI / 4) * r])].every(([i, j]) => inPoly(sq, x + i, z + j) && !hitB(x + i, z + j) && carGap(x + i, z + j) > 2.9)
      && hypot(x - d.x, z - d.z) > 9 + r && !extra.some((o) => hypot(o.x - x, o.z - z) < o.r + r + 0.5) && folk.every((o) => hypot(o.x - x, o.z - z) > r + 0.9) && treeGap(x, z) > r + 1.2;
    const spots = []; if (sq) for (let u = -24; u < 54; u += 2.1) for (let v = -72.5; v < -14; v += 3.3) { const [x, z] = at(u, v); spots.push({ x, z, g: hypot(x - d.x, z - d.z), w: hypot(x - wx, z - wz) }); }
    const used = [], take = (list, r, n, far = 0) => { const got = []; for (const o of list) if (got.length < n && used.every((q) => hypot(q.x - o.x, q.z - o.z) > max(far, q.r + r + 0.25)) && free(o.x, o.z, r)) { got.push(o); used.push({ ...o, r }); world.solid(o.x, o.z, r, r > 1.5 ? 2.6 : 1); } return got; };
    const [scale] = take(spots.filter((o) => o.w > 9).sort((a, b) => a.w - b.w), 0.8, 1);
    const edge = spots.filter((o) => o.g > d.r + 9 && edgeGap(sq, o.x, o.z) < 6).sort((a, b) => a.g - b.g), stalls = take(edge, 2.1, 2, 9), face = (o) => atan2(o.x - d.x, d.z - o.z); // the counter looks at the middle of the square
    // the stacks stand shoulder to shoulder in the four fullest rows, counted over the 17 m of each row nearest the middle of the square
    const du = (d.x - wx) * ca + (d.z - wz) * sa, dv = -(d.x - wx) * sa + (d.z - wz) * ca, rowsOf = [];
    if (sq) for (let k = -9; k <= 9; k++) { const row = []; for (let j = -5; j <= 5; j++) { const [x, z] = at(du + j * 1.56, dv + k * 3.3); if (free(x, z, 0.86) && used.every((q) => hypot(q.x - x, q.z - z) > q.r + 1.3)) row.push({ x, z, j }); } rowsOf.push({ row, k }); }
    const stacks = rowsOf.sort((a, b) => b.row.length - a.row.length || Math.abs(a.k) - Math.abs(b.k)).slice(0, 4).flatMap((r) => r.row.sort((a, b) => Math.abs(a.j) - Math.abs(b.j)).slice(0, 9));
    for (const o of stacks) { used.push({ ...o, r: 0.86 }); world.solid(o.x, o.z, 0.86, 1); }
    mine('cheese stacks', LM.cheeseStackGeo(), stacks.map((o) => ({ x: o.x, z: o.z, a: 0.55 })));
    if (scale) mine('cheese scale', LM.scaleGeo(), [{ x: scale.x, z: scale.z, a: 0.55 }]);
    if (stalls[0]) mine('herring cart', LM.haringkarGeo(), [{ x: stalls[0].x, z: stalls[0].z, a: face(stalls[0]) }]);
    if (stalls[1]) mine('flower stall', LM.bloemenkraamGeo(), [{ x: stalls[1].x, z: stalls[1].z, a: face(stalls[1]) }]);
    audit.market = { scale: scale && [round(scale.x), round(scale.z)], stalls: stalls.map((o) => [round(o.x), round(o.z)]) };
    // a full bicycle rack against a house front on a quiet stretch of the route
    const racks = [];
    for (let s = 150; s < drive.L - 60 && racks.length < 1; s += 6) for (const side of [1, -1]) for (let off = 4.4; off < 7.5 && !racks.length; off += 0.3) {
      const o = drive.place(s, side * off), b = drive.place(s + 0.6, side * off), wall = drive.place(s, side * (off + 1.7)), a = atan2(b.z - o.z, b.x - o.x);
      if (hitB(wall.x, wall.z) && [[0, 0], ...Array.from({ length: 8 }, (_, k) => [cos(k * PI / 4) * 1.45, sin(k * PI / 4) * 1.45])].every(([i, j]) => !hitB(o.x + i, o.z + j) && !wet(o.x + i, o.z + j) && carGap(o.x + i, o.z + j) > 2.9)
        && bridgeGap(o.x, o.z) > 3 && folk.every((q) => hypot(q.x - o.x, q.z - o.z) > 2.2) && !extra.some((q) => hypot(q.x - o.x, q.z - o.z) < q.r + 1.8) && treeGap(o.x, o.z) > 2.6 && !map.roads.some((r) => !r.a && !SKIP.test(r.k) && segGap(Array.from({ length: r.p.length / 2 }, (_, k) => [r.p[2 * k], r.p[2 * k + 1]]), o.x, o.z) < r.w / 2 + 1.5)) { racks.push({ x: o.x, z: o.z, a: a + (side > 0 ? 0 : PI) }); world.solid(o.x, o.z, 1.5, 1.2); }
    }
    mine('bicycle racks', LM.fietsenrekGeo(), racks); audit.market.rack = racks.map((o) => [round(o.x), round(o.z)]);
  }

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

  // --- boats and life on the water ---
  // Everything here is asked the same questions before it goes in: is all of it over open water, clear of every bridge deck, of the car, of the film's own ducks,
  // of the drawbridge jump, of the lanes the two tour boats sail, and of whatever was placed before it.
  const afloat = [], cruisers = [], paddlers = [], gulls = [];
  {
    const WATER = -1.2, inWater = (x, z) => wet(x, z) && !hitB(x, z), frac = (i, j) => (mix(i, j) % 1000) / 1000;
    const greens = map.green.map((p) => ({ p, bb: bbox(p) })), onGreen = (x, z) => greens.some((g) => x > g.bb[0] && x < g.bb[2] && z > g.bb[1] && z < g.bb[3] && inPoly(g.p, x, z));
    const rect = (o, L, B) => { const P = [], ca = cos(o.a), sa = sin(o.a), nL = max(2, Math.ceil(L / 1.3)); for (let i = 0; i <= nL; i++) for (const s of [-0.5, 0, 0.5]) { const f = (i / nL - 0.5) * L; P.push([o.x + ca * f - sa * s * B, o.z + sa * f + ca * s * B]); } return P; };
    const ring = (x, z, r, n = 10) => Array.from({ length: n }, (_, i) => [x + cos(i * 2 * PI / n) * r, z + sin(i * 2 * PI / n) * r]);

    // the tour boats' lanes: the two longest clear straight stretches of canal near the route. A boat sails to the end, swings round and comes back.
    const lanes = [];
    {
      const found = [];
      for (const w of map.waterways) for (let i = 0; i + 3 < w.p.length; i += 2) {
        const ax = w.p[i], az = w.p[i + 1], l = hypot(w.p[i + 2] - ax, w.p[i + 3] - az), ux = (w.p[i + 2] - ax) / l, uz = (w.p[i + 3] - az) / l; if (l < 34) continue;
        const good = (f) => { const x = ax + ux * f, z = az + uz * f; return [-1.8, 0, 1.8].every((s) => inWater(x - uz * s, z + ux * s)) && bridgeGap(x, z) > 7.5 && jumpGap(x, z) > 52 && duckGap(x, z) > 9 && (routeGap(x, z) > 14 || carGap(x, z) > 8); };
        const turn = (f) => ring(ax + ux * f, az + uz * f, 5.2, 12).every(([x, z]) => inWater(x, z) && bridgeGap(x, z) > 2.5);
        let f0 = null, best = null; for (let f = 0; f <= l + 1; f += 1) { const g = f <= l && good(f); if (g && f0 === null) f0 = f; if (!g && f0 !== null) { if (!best || f - 1 - f0 > best[1] - best[0]) best = [f0, f - 1]; f0 = null; } }
        if (!best) continue; let [a, b] = best; a += 5; b -= 5; while (b - a > 20 && !turn(a)) a += 2; while (b - a > 20 && !turn(b)) b -= 2;
        if (b - a < 22 || !turn(a) || !turn(b)) continue;
        found.push({ ax: ax + ux * a, az: az + uz * a, ux, uz, len: b - a, a: atan2(uz, ux), g: routeGap(ax + ux * (a + b) / 2, az + uz * (a + b) / 2) });
      }
      found.sort((p, q) => p.g - q.g);
      for (const l of found) if (lanes.length < 2 && l.g < 160 && lanes.every((o) => hypot(o.ax - l.ax, o.az - l.az) > 90)) { l.P = [[l.ax, l.az], [l.ax + l.ux * l.len, l.az + l.uz * l.len]]; lanes.push(l); }
      if (lanes.length) { const g = LM.rondvaartboot().children[0]; cruisers.im = mine('tour boats', g.geometry, lanes.map((l) => ({ x: l.ax, y: WATER, z: l.az, a: l.a })), g.material); cruisers.im.frustumCulled = false; cruisers.push(...lanes); }
    }
    const offLanes = (x, z, d) => lanes.every((l) => segGap(l.P, x, z) > d && hypot(l.P[0][0] - x, l.P[0][1] - z) > d + 3.4 && hypot(l.P[1][0] - x, l.P[1][1] - z) > d + 3.4);

    // every stretch of bank long enough to lie along, with the boat that might lie there
    const TYPES = [['sloepen', LM.sloep, 5.74, 2.0, 16], ['rowing boats', LM.roeiboot, 4.07, 2.41, 10], ['tjalken', LM.tjalk, 11.78, 3.48, 3], ['houseboats', LM.woonboot, 12.04, 4.08, 6]], cand = [];
    waters.forEach(({ p }, wi) => {
      for (let i = 0, j = p.length - 2, e = 0; i < p.length; j = i, i += 2, e++) {
        const ax = p[j], az = p[j + 1], l = hypot(p[i] - ax, p[i + 1] - az); if (l < 5.6) continue;
        const ux = (p[i] - ax) / l, uz = (p[i + 1] - az) / l; let nx = -uz, nz = ux; if (!wet(ax + ux * l / 2 + nx * 0.6, az + uz * l / 2 + nz * 0.6)) { nx = -nx; nz = -nz; }
        for (let u = 0.8 + frac(wi * 131 + e, 1) * 3, k = 0; u < l - 4.8; k++) {
          const h = mix(wi * 131 + e, 10 + k), pick = h % 20; let ty = pick < 1 ? 2 : pick < 3 ? 3 : pick < 9 ? 1 : 0;
          while (ty !== 1 && TYPES[ty][2] + 0.8 > l - u) ty = ty > 1 ? 0 : 1;
          const L = TYPES[ty][2], B = TYPES[ty][3]; if (u + L + 0.8 > l) break;
          const c = u + L / 2, off = B / 2 + 0.35, qx = ax + ux * c, qz = az + uz * c;
          cand.push({ ty, L, B, h, ux, uz, nx, nz, qx, qz, x: qx + nx * off, z: qz + nz * off, a: atan2(uz, ux) + ((h >>> 6) & 1 ? PI : 0), g: routeGap(qx, qz) });
          u += L + 1.4 + ((h >>> 8) % 9);
        }
      }
    });
    const bank = (o) => wet(o.qx + o.nx * 0.5, o.qz + o.nz * 0.5) && !wet(o.qx - o.nx * 0.5, o.qz - o.nz * 0.5); // water on one side, land on the other
    const moored = [], lists = TYPES.map(() => []), trees = map.trees;
    const fits = (o, space) => bank(o) && jumpGap(o.x, o.z) > 45 + o.L / 2 && moored.every((m) => hypot(m.x - o.x, m.z - o.z) > max(space, (m.L + o.L) / 2 + 1.2))
      && rect(o, o.L + 0.4, o.B + 0.5).every(([x, z]) => inWater(x, z) && bridgeGap(x, z) > 2 && duckGap(x, z) > 2.6 && offLanes(x, z, 2.3) && (o.g > 22 || carGap(x, z) > 2.9))
      && (o.ty !== 2 || (() => { for (let i = 0; i < trees.length; i += 2) if (hypot(trees[i] - o.x, trees[i + 1] - o.z) < 5.5) return false; return true; })()); // a mast does not go up through a tree
    const TINT = ['#ffffff', '#ffe6d2', '#e4eeff', '#fff4c4', '#e0f7e6', '#ffffff'];
    const moor = (o) => { (audit.boats ||= []).push([TYPES[o.ty][0][0], round(o.x), round(o.z), round(o.g)].join(' ')); moored.push(o); lists[o.ty].push({ x: o.x, y: WATER, z: o.z, a: o.a, c: TINT[o.h % 6] }); };
    for (const o of cand.filter((o) => o.g < 75).sort((a, b) => a.g - b.g)) if ((o.h >>> 12) % 10 > 2 && lists[o.ty].length < TYPES[o.ty][4] && fits(o, 0)) moor(o);
    let far = 0; for (const o of cand.filter((o) => o.g >= 75 && o.g < 520).sort((a, b) => (a.h >>> 3) - (b.h >>> 3))) if (far < 16 && fits(o, 38)) { moor(o); far++; }
    TYPES.forEach(([name, make], i) => { if (!lists[i].length) return; const g = make().children[0]; afloat.push({ im: mine(name, g.geometry, lists[i], g.material), list: lists[i] }); });
    const offBoats = (x, z, d) => moored.every((m) => hypot(m.x - x, m.z - z) > m.L / 2 + d);

    // a mooring post beyond each end of the boats a camera can get near
    const posts = [];
    for (const o of moored) if (o.g < 75 && posts.length < 32) for (const d of [-1, 1]) {
      const f = d * (o.L / 2 + 0.55), x = o.qx + o.ux * f + o.nx * 0.34, z = o.qz + o.uz * f + o.nz * 0.34;
      if (ring(x, z, 0.26, 6).every(([i, j]) => inWater(i, j)) && !wet(x - o.nx * 0.7, z - o.nz * 0.7) && bridgeGap(x, z) > 2 && carGap(x, z) > 2.9 && duckGap(x, z) > 2.7 && moored.every((m) => m === o || hypot(m.x - x, m.z - z) > m.L / 2 + 0.5) && props.every((p) => hypot(p.x - x, p.z - z) > 0.8) && offLanes(x, z, 2)) posts.push({ x, y: WATER, z, a: frac(posts.length, 3) * 6 });
    }
    mine('mooring posts', LM.mooringPostGeo(), posts);
    const lit = lampSpots.filter((o, i) => routeGap(o.x, o.z) < (i % 4 < 2 ? 120 : 45) && carGap(o.x, o.z) > 3 && !hitB(o.x, o.z) && props.every((p) => hypot(p.x - o.x, p.z - o.z) > 1) && (() => { for (let j = 0; j < trees.length; j += 2) if (hypot(trees[j] - o.x, trees[j + 1] - o.z) < 3.6) return false; return true; })());
    mine('bridge lamps', LM.bridgeLampGeo(), lit.sort((a, b) => routeGap(a.x, a.z) - routeGap(b.x, b.z)).filter((o, i, A) => A.slice(0, i).every((q) => hypot(q.x - o.x, q.z - o.z) > 4.5)).slice(0, 18));

    // ducks and swans paddle slow circles; lilies lie by the quay (pads just awash, tops 2 cm up); reeds stand along the green banks
    const spare = cand.filter((o) => o.g < 70 && bank(o)).sort((a, b) => (a.h >>> 5) - (b.h >>> 5)), ducks = [], swans = [], lilies = [], reeds = [];
    const still = (x, z, r) => ring(x, z, r + 0.5).every(([i, j]) => inWater(i, j)) && bridgeGap(x, z) > r + 2.2 && duckGap(x, z) > r + 3.2 && jumpGap(x, z) > 45 && offBoats(x, z, r + 0.8) && offLanes(x, z, r + 2.2);
    for (const o of spare) {
      const swan = (o.h >>> 9) % 3 === 0, r = swan ? 2.1 : 1.1 + frac(o.h, 2) * 0.8, x = o.qx + o.nx * (r + 1.2 + frac(o.h, 3) * 2), z = o.qz + o.nz * (r + 1.2 + frac(o.h, 3) * 2), set = swan ? swans : ducks;
      if (paddlers.length >= 12 || paddlers.filter((p) => p.set === set).length >= (swan ? 4 : 8) || paddlers.some((p) => hypot(p.x - x, p.z - z) < p.r + r + 4) || !still(x, z, r)) continue;
      const n = swan ? 2 : 2 + (o.h >>> 11) % 2, first = set.length; for (let i = 0; i < n; i++) set.push({ x, y: WATER, z, c: swan ? '#ffffff' : undefined });
      paddlers.push({ x, z, r, set, first, n, dir: (o.h >>> 13) & 1 ? 1 : -1, ph: frac(o.h, 5) * 6 });
    }
    const offPaddlers = (x, z, d) => paddlers.every((p) => hypot(p.x - x, p.z - z) > p.r + d);
    for (const o of spare) for (let k = 0; k < 2 && lilies.length < 22; k++) {
      const x = o.qx + o.ux * k * 1.25 + o.nx * (0.85 + k * 0.35), z = o.qz + o.uz * k * 1.25 + o.nz * (0.85 + k * 0.35);
      if ((o.h >>> 15) % 4 === 0 && ring(x, z, 0.7, 6).every(([i, j]) => inWater(i, j)) && bridgeGap(x, z) > 1.2 && duckGap(x, z) > 3.2 && offBoats(x, z, 1) && offLanes(x, z, 2.2) && offPaddlers(x, z, 1) && posts.every((p) => hypot(p.x - x, p.z - z) > 0.9)) lilies.push({ x, y: WATER - 0.016, z, a: frac(o.h, 7 + k) * 6, s: 0.85 + frac(o.h, 9 + k) * 0.4 });
    }
    waters.forEach(({ p }, wi) => {
      for (let i = 0, j = p.length - 2, e = 0; i < p.length && reeds.length < 56; j = i, i += 2, e++) {
        const ax = p[j], az = p[j + 1], l = hypot(p[i] - ax, p[i + 1] - az), ux = (p[i] - ax) / l, uz = (p[i + 1] - az) / l; if (l < 3 || routeGap(ax, az) > 170) continue;
        let nx = -uz, nz = ux; if (!wet(ax + ux * l / 2 + nx * 0.6, az + uz * l / 2 + nz * 0.6)) { nx = -nx; nz = -nz; }
        for (let u = 0.6 + frac(wi * 71 + e, 4), k = 0; u < l - 0.6 && reeds.length < 56; u += 0.5 + frac(wi * 71 + e, 20 + k) * 1.1, k++) {
          if (floor(u / 7) % 2) continue; // in beds, not a hedge; 0.55 m out at least, as far as a clump's leaves reach at the height of the quay, so none go into the wall
          const x = ax + ux * u + nx * (0.55 + frac(wi + e, 60 + k) * 0.35), z = az + uz * u + nz * (0.55 + frac(wi + e, 60 + k) * 0.35);
          if (onGreen(ax + ux * u - nx * 0.8, az + uz * u - nz * 0.8) && ring(x, z, 0.22, 5).every(([i, j]) => inWater(i, j)) && bridgeGap(x, z) > 1.5 && duckGap(x, z) > 2.8 && carGap(x, z) > 2.9 && offBoats(x, z, 0.7) && offLanes(x, z, 2) && offPaddlers(x, z, 0.8) && posts.every((q) => hypot(q.x - x, q.z - z) > 0.7) && lilies.every((q) => hypot(q.x - x, q.z - z) > 0.9)) reeds.push({ x, y: WATER, z, a: frac(wi + e, 90 + k) * 6, s: 0.8 + frac(wi + e, 120 + k) * 0.35 });
        }
      }
    });
    if (ducks.length) ducks.im = mine('ducks', LM.duckGeo(), ducks); if (swans.length) swans.im = mine('swans', LM.swanGeo(), swans);
    mine('lily patches', LM.lilyGeo(), lilies, tinted, false); mine('reed clumps', LM.reedGeo(), reeds);

    // gulls wheel over the wider water, above the roofs round them
    const air = [];
    for (const o of spare) {
      const R = 7 + frac(o.h, 30) * 6, y = 15 + frac(o.h, 31) * 8, x = o.qx + o.nx * 7, z = o.qz + o.nz * 7;
      if (gulls.length >= 8 || !inWater(x, z) || routeGap(x, z) < R + 8 || gulls.some((q) => hypot(q.x - x, q.z - z) < 30) || hypot(x - map.pois['Molen van Piet'][0], z - map.pois['Molen van Piet'][1]) < 45 || !ring(x, z, R, 14).every(([i, j]) => { const b = hitB(i, j); return !b || (b.H ?? 40) < y - 4; })) continue;
      gulls.push({ x, z, R, y, dir: (o.h >>> 4) & 1 ? 1 : -1, ph: frac(o.h, 33) * 6, w: 4.2 / R }); air.push({ x, y, z });
    }
    if (air.length) { gulls.im = mine('gulls', LM.gullGeo(), air, tinted, false); gulls.im.frustumCulled = false; }

    // on the quay walls near the route: here and there an iron ladder down to the water, and mooring rings
    const iron = '#30343a', ladders = [], rings = [];
    for (const o of spare) {
      const x = o.qx - o.ux * (o.L / 2 + 0.2), z = o.qz - o.uz * (o.L / 2 + 0.2), a = atan2(-o.nx, o.nz);
      if (!wet(x + o.nx * 0.5, z + o.nz * 0.5) || wet(x - o.nx * 0.4, z - o.nz * 0.4) || bridgeGap(x, z) < 1.2 || posts.some((p) => hypot(p.x - x, p.z - z) < 0.9)) continue;
      if ((o.h >>> 17) % 5 === 0 && ladders.length < 16) ladders.push({ x, y: 0, z, a }); else if ((o.h >>> 17) % 5 < 3 && rings.length < 36) rings.push({ x, y: 0, z, a });
    }
    mine('quay ladders', fuse([Box(0.05, 1.26, 0.05), iron, -0.19, -0.69, 0.07], [Box(0.05, 1.26, 0.05), iron, 0.19, -0.69, 0.07], ...[-1.12, -0.86, -0.6, -0.34].map((y) => [Box(0.38, 0.04, 0.04), iron, 0, y, 0.07]), [Box(0.05, 0.05, 0.07), iron, -0.19, -0.14, 0.035], [Box(0.05, 0.05, 0.07), iron, 0.19, -0.14, 0.035]), ladders, tinted, false);
    mine('mooring rings', fuse([new THREE.TorusGeometry(0.1, 0.022, 5, 10), iron, 0, -0.5, 0.028], [Box(0.07, 0.08, 0.05), iron, 0, -0.38, 0.025]), rings, tinted, false);
  }
  audit.where = { lanes: cruisers.map((l) => [l.ax, l.az, l.ax + l.ux * l.len, l.az + l.uz * l.len].map(round)), paddlers: paddlers.map((p) => [round(p.x), round(p.z), p.set.im === undefined ? '' : p.n]), gulls: gulls.map((g) => [round(g.x), round(g.y), round(g.z)]) };
  const setAt = (im, i, x, y, z, a, rx, s = 1) => im.setMatrixAt(i, M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, -a, 0, 'YXZ')), S.set(s, s, s)));
  const life = (t) => {
    for (const { im, list } of afloat) { list.forEach((o, i) => setAt(im, i, o.x, o.y + sin(t * 1.3 + i * 1.7) * LM.SWAY.bob, o.z, o.a, sin(t * 0.9 + i * 2) * LM.SWAY.roll)); im.instanceMatrix.needsUpdate = true; }
    cruisers.forEach((l, i) => { // out along the lane, round at the end while it has all but stopped, and back
      const q = t * 0.62 / l.len / (PI / 2) + i * 0.7 + 0.2, k = floor(q + 0.5), f = min(1, max(0, (q - k) / 0.24 + 0.5)), u = 0.5 - 0.5 * cos(q * PI);
      setAt(cruisers.im, i, l.ax + l.ux * l.len * u, -1.2 + sin(t * 1.1 + i) * LM.SWAY.bob, l.az + l.uz * l.len * u, l.a + PI * (k - 1 + f * f * (3 - 2 * f)), sin(t * 0.8 + i) * LM.SWAY.roll);
    });
    if (cruisers.im) cruisers.im.instanceMatrix.needsUpdate = true;
    for (const p of paddlers) for (let i = 0; i < p.n; i++) { const w = p.ph + p.dir * (t * 0.3 / p.r) - p.dir * i * 0.9 / p.r, x = p.x + cos(w) * p.r, z = p.z + sin(w) * p.r; setAt(p.set.im, p.first + i, x, -1.2 + sin(t * 2 + i) * 0.012, z, atan2(cos(w) * p.dir, -sin(w) * p.dir), 0); }
    for (const s of [paddlers[0]?.set, paddlers.find((p) => p.set !== paddlers[0].set)?.set]) if (s?.im) s.im.instanceMatrix.needsUpdate = true;
    gulls.forEach((g, i) => { const w = g.ph + g.dir * t * g.w, x = g.x + cos(w) * g.R, z = g.z + sin(w) * g.R; setAt(gulls.im, i, x, g.y + sin(t * 0.5 + i) * 0.8, z, atan2(cos(w) * g.dir, -sin(w) * g.dir), g.dir * 0.4, 1.5); });
    if (gulls.im) gulls.im.instanceMatrix.needsUpdate = true;
  };

  world.update = (t) => {
    world.windmill.sails.rotation.z = t * 0.9;
    clouds.position.x = t * 1.6; ripple.offset.set(t * 0.012, t * 0.007); rippleN.offset.set(-t * 0.021, t * 0.016);
    life(t);
    flags.forEach((f, i) => { f.rotation.y = sin(t * 2.2 + i) * 0.35; });
    const on = floor(t * 2.5) % 2; world.lamps.forEach((l, i) => { l.material.emissiveIntensity = (i % 2 === on) ? 3 : 0; });
  };
  return world;
}
