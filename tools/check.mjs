// The "no clipping" test. Replays the whole drive at 60 fps and asserts the car's
// footprint never overlaps a building, open water, a bridge railing, street furniture, the roadworks, the fireworks stall,
// a parked car, a cyclist, a duck, a tree or the barrier.
// Run: node tools/check.mjs      (exit code 1 on any overlap)
import { readFile } from 'node:fs/promises';
import { makeDrive, footprint, inPoly } from '../src/drive.js';
import { placeProps, planBridges } from '../src/props.js';
const load = async (f) => JSON.parse(await readFile(new URL('../data/' + f, import.meta.url), 'utf8'));
const map = await load('alkmaar.json'), drive = makeDrive(await load('route.json'), map.water);
const { layout } = drive;

const distSeg = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const distPoly = (p, x, z) => { let d = 1e9; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) d = Math.min(d, distSeg(x, z, p[j], p[j + 1], p[i], p[i + 1])); return d; };
const bbox = (p) => { let a = 1e9, b = 1e9, c = -1e9, e = -1e9; for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); c = Math.max(c, p[i]); b = Math.min(b, p[i + 1]); e = Math.max(e, p[i + 1]); } return [a, b, c, e]; };
const buildings = map.buildings.map((b) => ({ p: b.p, bb: bbox(b.p), n: b.n }));
const water = map.water.map((p) => ({ p, bb: bbox(p) }));
// distance to a line of points; Infinity when the nearest spot is past either end
const dLine = (P, x, z) => { let d = Infinity; for (let i = 0; i + 1 < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1); if ((t < 0 && i === 0) || (t > 1 && i === P.length - 2)) continue; const u = Math.max(0, Math.min(1, t)); d = Math.min(d, Math.hypot(x - ax - dx * u, z - az - dz * u)); } return d; };
const plan = planBridges(map, drive), flatDecks = plan.filter((b) => b.mode === 'flat'), arches = plan.filter((b) => b.mode === 'arch');
const humps = layout.humps.map((b) => { const P = []; for (let s = b.s0 - 1.6; s <= b.s1 + 1.6; s += 0.5) { const c = drive.centre(s); P.push([c.x, c.z]); } return { b, P }; });
const onBridge = (x, z) => humps.some(({ b, P }) => dLine(P, x, z) < b.w / 2 - 0.35) || flatDecks.some((d) => dLine(d.pts, x, z) < d.W / 2); // inside the parapets of a hump, or on a level slab
const things = [...placeProps(map, drive), ...layout.solids]; // lampposts, benches, fences, cones, the stall: each a circle r wide and h tall
const near = (o, x, z, pad) => x > o.bb[0] - pad && x < o.bb[2] + pad && z > o.bb[1] - pad && z < o.bb[3] + pad;

// points around the edge of a footprint, every ~0.3 m
const outline = (c) => { const o = []; for (let i = 0; i < 4; i++) { const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3); for (let k = 0; k < n; k++) o.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]); } return o; };
const boxPoly = (c) => c.flat();

const hits = new Map(); let tight = { d: 1e9 }; const clearance = [];
const hit = (what, st) => { if (!hits.has(what)) hits.set(what, []); hits.get(what).push(Math.round(st.s)); };
for (let t = 0; t <= drive.duration; t += 1 / 60) {
  const st = drive.state(t), fp = footprint(st.x, st.z, st.yaw), pts = outline(fp), poly = boxPoly(fp);
  let dmin = 1e9;
  for (const b of buildings) {
    if (!near(b, st.x, st.z, 8)) continue;
    for (const [x, z] of pts) { if (st.y < 6 && inPoly(b.p, x, z)) hit('building ' + (b.n || ''), st); dmin = Math.min(dmin, distPoly(b.p, x, z)); }
  }
  if (dmin < tight.d) tight = { d: dmin, s: st.s };
  clearance[Math.round(st.s / 20)] = Math.min(clearance[Math.round(st.s / 20)] ?? 99, dmin);
  if (!st.air && st.y < 0.3) for (const w of water) { if (!near(w, st.x, st.z, 4)) continue; for (const [x, z] of pts) if (inPoly(w.p, x, z) && !onBridge(x, z)) hit('water', st); }
  for (const a of arches) if (pts.some(([x, z]) => dLine(a.pts, x, z) < a.W / 2 + 0.3)) hit('arched bridge ' + (a.r.n || ''), st);
  for (const o of things) if (st.y < o.h + 0.15 && Math.hypot(o.x - st.x, o.z - st.z) < 3.5 + o.r && (inPoly(poly, o.x, o.z) || pts.some(([x, z]) => Math.hypot(o.x - x, o.z - z) < o.r))) hit(o.kind, st);
  for (const pc of layout.parked) { const q = footprint(pc.x, pc.z, pc.h); if (pts.some(([x, z]) => inPoly(q.flat(), x, z)) || q.some(([x, z]) => inPoly(poly, x, z))) hit('parked car ' + pc.i, st); }
  for (const c of layout.cyclists) { const p = layout.cyclistAt(c, t), q = footprint(p.x, p.z, p.h, 1.9, 0.7); if (q.some(([x, z]) => inPoly(poly, x, z)) || pts.some(([x, z]) => inPoly(q.flat(), x, z))) hit('cyclist', st); }
  for (let i = 0; i < map.trees.length; i += 2) if (layout.clear(map.trees[i], map.trees[i + 1]) && Math.hypot(map.trees[i] - st.x, map.trees[i + 1] - st.z) < 5 && pts.some(([x, z]) => Math.hypot(map.trees[i] - x, map.trees[i + 1] - z) < 0.45)) hit('tree', st);
  { const b = layout.barrier, c0 = drive.place(drive.m.bridgeN - 9, b.from), c1 = drive.place(drive.m.bridgeN - 9, b.to);
    if (st.y < 1.2 && pts.some(([x, z]) => distSeg(x, z, c0.x, c0.z, c1.x, c1.z) < 0.12)) hit('barrier', st); }
  for (const p of layout.crowd) if (inPoly(poly, p.x, p.z)) hit('crowd', st);
  for (let i = 0; i < layout.ducks.n; i++) { const d = layout.ducks.at(i, t); if (!d.wet && (inPoly(poly, d.x, d.z) || pts.some(([x, z]) => Math.hypot(d.x - x, d.z - z) < 0.3))) hit('duck', st); }
  const dn = layout.donut; if (Math.hypot(st.x - dn.x, st.z - dn.z) < 5.2) hit('cheese carriers', st);
}
// the ducks walk on the street and swim in the canal, never the other way round, and never through a house
for (let i = 0; i < layout.ducks.n; i++) for (let t = 0; t <= drive.duration; t += 0.1) {
  const d = layout.ducks.at(i, t), inWater = water.some((w) => inPoly(w.p, d.x, d.z));
  const deck = Math.min(...flatDecks.map((b) => dLine(b.pts, d.x, d.z) - b.W / 2)); // < 0: on (or under) a level bridge
  if (buildings.some((b) => near(b, d.x, d.z, 1) && distPoly(b.p, d.x, d.z) < 0.4) || (d.land && inWater && deck > -0.15)) hits.set('a duck walking through something', [0]);
  if (d.wet && (!inWater || deck < 0.4)) hits.set('a duck swimming on dry land or under a bridge deck', [0]);
}
// the stage props must also stand clear of buildings
for (const pc of layout.parked) for (const [x, z] of footprint(pc.x, pc.z, pc.h)) for (const b of buildings) if (near(b, x, z, 1) && inPoly(b.p, x, z)) hits.set('parked car ' + pc.i + ' inside a building', [0]);
for (const p of layout.crowd) for (const b of buildings) if (near(b, p.x, p.z, 1) && inPoly(b.p, p.x, p.z)) hits.set('crowd inside a building', [0]);
for (const o of things) for (const [dx, dz] of layout.solids.includes(o) ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]]) { /* benches and bikes stand along the wall, so only their middle is tested */ const x = o.x + dx * o.r, z = o.z + dz * o.r;
  if (buildings.some((b) => near(b, x, z, 1) && inPoly(b.p, x, z))) hits.set(`${o.kind} inside a building at ${Math.round(o.x)},${Math.round(o.z)}`, [0]);
  if (water.some((w) => near(w, x, z, 1) && inPoly(w.p, x, z))) hits.set(`${o.kind} in the water at ${Math.round(o.x)},${Math.round(o.z)}`, [0]); }

console.log(`drive ${drive.duration.toFixed(1)} s over ${Math.round(drive.L)} m, top speed ${Math.round(3.6 * Math.max(...Array.from({ length: 300 }, (_, i) => drive.speed((i / 300) * drive.L))))} km/h`);
console.log(`tightest squeeze past a building: ${tight.d.toFixed(2)} m at s=${Math.round(tight.s)}`);
console.log('clearance per 20 m:', clearance.map((c) => (c ?? 99) > 9 ? '-' : c.toFixed(1)).join(' '));
if (hits.size) { for (const [k, v] of hits) console.log('CLIP', k, 'at s =', [...new Set(v)].join(',').slice(0, 300)); process.exit(1); }
console.log(`OK: no clipping anywhere on the route (${things.length} street objects, ${plan.length} bridges checked)`);
