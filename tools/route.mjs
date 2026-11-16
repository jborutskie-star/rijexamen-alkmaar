// Builds the exam route along real street centre-lines (Dijkstra between via points),
// rounds the corners, and writes data/route.json. Run: node tools/route.mjs
import { readFile, writeFile } from 'node:fs/promises';
const d = JSON.parse(await readFile(new URL('../data/alkmaar.json', import.meta.url), 'utf8'));
const DRIVE = /primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|service/;

export const DONUT = { x: 106, z: 88, r: 11 };
// [x,z] = route on streets to here; {donut} = circle on the Waagplein; {hop:[x,z]} = straight hand-drawn hop
const VIA = [
  [-320.5, 60.3], [-276.7, 7.4], [30.5, 197.1], [72, 222.6], [110.4, 157.7],
  { hop: [119, 118] }, { donut: 2 }, { hop: [129.9, 71.9] },
  [152.1, 78.1], [137.7, 142], [199.7, 166.9], [358.9, 228.1], [350.5, 245.3], [334.2, 279.5],
  [289.3, 386.9], [262, 453.3], [360.6, 515.3], [403.5, 443.1],
  { hop: [409.5, 433.7] }, { hop: [423.5, 409.3] },
];
// landmarks along the path, found in order
const MARKS = { lange: [-276.7, 7.4], mient: [72, 222.6], waagIn: [110.4, 157.7], donut: [DONUT.x + DONUT.r, DONUT.z],
  schapen: [136.1, 75.9], voordam: [152.1, 78.1], zijdam: [137.7, 142], dam: [206.2, 169.2], annabrug: [358.9, 228.1], anna: [334.2, 279.5],
  bridgeN: [289.3, 386.9], bridgeS: [282.5, 405.6], zout: [262, 453.3], limmer: [360.6, 515.3], willems: [392.7, 461.8], bier: [403.5, 443.1] };

const nodes = new Map();
const node = (x, z) => { const k = x + ',' + z; if (!nodes.has(k)) nodes.set(k, { x, z, k, e: [] }); return nodes.get(k); };
for (const r of d.roads) {
  if (!DRIVE.test(r.k)) continue;
  for (let i = 0; i + 3 < r.p.length; i += 2) {
    const a = node(r.p[i], r.p[i + 1]), b = node(r.p[i + 2], r.p[i + 3]);
    const len = Math.hypot(a.x - b.x, a.z - b.z);
    a.e.push({ to: b, len, n: r.n || r.k }); b.e.push({ to: a, len, n: r.n || r.k });
  }
}
const nearest = ([x, z]) => { let best, bd = 1e9; for (const n of nodes.values()) { const q = Math.hypot(n.x - x, n.z - z); if (q < bd) { bd = q; best = n; } } return best; };
function dijkstra(a, b) {
  const dist = new Map([[a.k, 0]]), prev = new Map(), open = new Set([a]);
  while (open.size) {
    let u, ud = 1e9; for (const n of open) if (dist.get(n.k) < ud) { ud = dist.get(n.k); u = n; }
    open.delete(u); if (u === b) break;
    for (const e of u.e) { const nd = ud + e.len; if (nd < (dist.get(e.to.k) ?? 1e9)) { dist.set(e.to.k, nd); prev.set(e.to.k, { u, n: e.n }); open.add(e.to); } }
  }
  if (!prev.has(b.k) && a !== b) throw new Error('no path');
  const out = []; let c = b;
  while (c !== a) { const p = prev.get(c.k); out.push([c.x, c.z, p.n]); c = p.u; }
  out.push([a.x, a.z]); return out.reverse();
}

let raw = [], streets = [], last = null;
const push = (x, z) => { if (raw.length && Math.hypot(raw.at(-1)[0] - x, raw.at(-1)[1] - z) < 0.3) return; raw.push([x, z]); };
for (const v of VIA) {
  if (v.donut) {
    // join at the east side heading north, circle anticlockwise, peel off north-east towards the Schapenbrug
    const a0 = 0.5, a1 = 0.62 - Math.PI * 2 * v.donut;
    for (let i = 0; i <= 80; i++) { const a = a0 + ((a1 - a0) * i) / 80; push(DONUT.x + Math.cos(a) * DONUT.r, DONUT.z + Math.sin(a) * DONUT.r); }
  } else if (v.hop) { push(...v.hop); last = v.hop; }
  else {
    if (last) for (const [x, z, n] of dijkstra(nearest(last), nearest(v))) { push(x, z); if (n && streets.at(-1) !== n) streets.push(n); }
    else push(...v);
    last = v;
  }
}

// resample every STEP metres, then round corners with a moving average
const STEP = 1, WIN = 7;
const resample = (pts) => {
  const out = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    let t = STEP - carry;
    while (t <= L) { out.push([ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L]); t += STEP; }
    carry = L - (t - STEP);
  }
  out.push(pts.at(-1)); return out;
};
let pts = resample(raw);
for (let pass = 0; pass < 3; pass++) {
  pts = pts.map((p, i) => {
    // keep the donut round: no smoothing on the circle, tapering in around it
    const dd = Math.hypot(p[0] - DONUT.x, p[1] - DONUT.z) - DONUT.r - 1;
    const w = Math.max(0, Math.min(WIN, i, pts.length - 1 - i, Math.floor(dd))); let x = 0, z = 0;
    for (let j = i - w; j <= i + w; j++) { x += pts[j][0]; z += pts[j][1]; }
    return [x / (2 * w + 1), z / (2 * w + 1)];
  });
  pts = resample(pts);
}

// centre the line between the real walls (and canal edges) wherever the street is tight
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
const bb = (p) => { let a = 1e9, b = 1e9, c = -1e9, e = -1e9; for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); c = Math.max(c, p[i]); b = Math.min(b, p[i + 1]); e = Math.max(e, p[i + 1]); } return [a, b, c, e]; };
const solids = [...d.buildings.map((q) => q.p), ...d.water].map((p) => ({ p, bb: bb(p) }));
const bridges = d.roads.filter((r) => r.b);
const dSeg = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const onBridge = (x, z) => bridges.some((r) => { for (let i = 0; i + 3 < r.p.length; i += 2) if (dSeg(x, z, r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3]) < r.w / 2 + 1.5) return true; return false; });
const blocked = (x, z) => !onBridge(x, z) && solids.some((o) => x > o.bb[0] && x < o.bb[2] && z > o.bb[1] && z < o.bb[3] && inPoly(o.p, x, z));
for (let pass = 0; pass < 6; pass++) {
  const shift = pts.map((p, i) => {
    if (Math.hypot(p[0] - DONUT.x, p[1] - DONUT.z) < DONUT.r + 6) return 0;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; // right-hand normal
    const free = (sgn) => { for (let q = 0.25; q <= 8; q += 0.25) if (blocked(p[0] + nx * q * sgn, p[1] + nz * q * sgn)) return q; return 8; };
    const r = free(1), l = free(-1);
    return Math.min(r, l) > 4 ? 0 : Math.max(-1.5, Math.min(1.5, (r - l) / 4)); // damped, so it settles instead of wobbling
  });
  pts = pts.map((p, i) => {
    let sh = 0, c = 0; for (let j = Math.max(0, i - 6); j <= Math.min(pts.length - 1, i + 6); j++) { sh += shift[j]; c++; }
    sh /= c;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [p[0] - ((b[1] - a[1]) / L) * sh, p[1] + ((b[0] - a[0]) / L) * sh];
  });
  pts = resample(pts);
}
// iron out any wiggle the centring introduced
pts = resample(pts.map((p, i) => {
  if (Math.hypot(p[0] - DONUT.x, p[1] - DONUT.z) < DONUT.r + 4) return p;
  const w = Math.min(4, i, pts.length - 1 - i); let x = 0, z = 0;
  for (let j = i - w; j <= i + w; j++) { x += pts[j][0]; z += pts[j][1]; }
  return [x / (2 * w + 1), z / (2 * w + 1)];
}));
// how much room there is beside the line at each metre (the car drifts less where it is tight)
const room = pts.map((p, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
  for (let q = 0.5; q <= 6; q += 0.25) if (blocked(p[0] + nx * q, p[1] + nz * q) || blocked(p[0] - nx * q, p[1] - nz * q)) return q;
  return 6;
});

const marks = {}; let from = 0;
for (const [name, [x, z]] of Object.entries(MARKS)) {
  let best = from, bd = 1e9;
  // first local closest approach after `from` (the path revisits the Waagplein entry)
  for (let i = from; i < pts.length; i++) { const q = Math.hypot(pts[i][0] - x, pts[i][1] - z); if (q < bd) { bd = q; best = i; } else if (bd < 6 && q > bd + 8) break; }
  marks[name] = best; from = best + 5;
}
marks.end = pts.length - 1;
await writeFile(new URL('../data/route.json', import.meta.url),
  JSON.stringify({ step: STEP, path: pts.flat().map((v) => Math.round(v * 100) / 100), marks, donut: DONUT, streets, room }));
console.log('metres', pts.length, JSON.stringify(marks), '\n' + streets.join(' > '));
