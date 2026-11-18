// Builds every export of src/landmarks.js without a browser and checks it: no NaN, size limits, triangle budgets, the attributes fuse() gives,
// and the church against its real footprint. `node tools/check-landmarks.mjs` (add --table for sizes). Exits 1 on any problem.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url);
registerHooks({ resolve: (spec, ctx, next) => (spec === 'three' ? { url: new URL('vendor/three.module.js', root).href, shortCircuit: true } : next(spec, ctx)) });
const THREE = await import('three'), L = await import('../src/landmarks.js');

const problems = [], rows = [], bad = (m) => problems.push(m);
// Express the tracked OSM outline in the church model's local frame.
function churchOutline() {
  const map = JSON.parse(readFileSync(new URL('data/alkmaar.json', root)));
  const { p } = map.buildings.find((b) => b.k === 'church' && /^Grote/.test(b.n));
  const n = p.length / 2;
  let cx = 0, cz = 0;
  for (let i = 0; i < p.length; i += 2) { cx += p[i]; cz += p[i + 1]; }
  cx /= n; cz /= n;
  const points = Array.from({ length: n }, (_, i) => [p[2 * i] - cx, p[2 * i + 1] - cz]);
  let xx = 0, xz = 0, zz = 0;
  for (const [x, z] of points) { xx += x * x; xz += x * z; zz += z * z; }
  const a = 0.5 * Math.atan2(2 * xz, xx - zz), c = Math.cos(a), s = Math.sin(a);
  return points.flatMap(([x, z]) => [x * c + z * s, z * c - x * s]);
}
// [min x, min y, min z, max x, max y, max z] the model has to stay inside (null = no limit), and its triangle budget
const B = (x, y0, y1, z) => [-x, y0, -z, x, y1, z];
const GROUPS = {
  groteKerk: { tris: [6000, 14000], box: [-48, -0.05, -30, 48, 53, 33] },
  molen: { tris: [0, 5000], box: B(13, -0.01, 31, 13) },
  rondvaartboot: { tris: [0, 2500], box: B(4.6, -0.35, 1.0, 1.3) },
  sloep: { tris: [0, 1500], box: B(3.0, -0.35, 1.5, 1.05) },
  roeiboot: { tris: [0, 1500], box: B(2.3, -0.35, 0.6, 1.25) },
  tjalk: { tris: [0, 1500], box: [-6.4, -0.35, -1.8, 5.6, 10.5, 1.8] },
  woonboot: { tris: [0, 1800], box: B(6.1, -0.35, 4.1, 2.1) },
};
const GEOS = { // props are under 400 triangles unless a bigger budget is stated here
  duckGeo: { box: B(0.25, -0.06, 0.25, 0.13) }, swanGeo: { box: B(0.62, -0.11, 0.9, 0.3) }, lilyGeo: { box: B(0.62, 0, 0.0601, 0.62) }, reedGeo: { box: B(0.5, -0.31, 1.65, 0.5) },
  mooringPostGeo: { box: B(0.21, -0.31, 1.55, 0.21) }, gullGeo: { box: B(0.32, -0.08, 0.15, 0.6) },
  cheeseWheelGeo: { box: B(0.361, 0, 0.1101, 0.361) }, cheeseStackGeo: { tris: 900, box: B(0.651, 0, 0.75, 0.501) }, edamGeo: { box: B(0.161, 0, 0.29, 0.161) },
  berrieGeo: { box: B(1.13, 0.4, 0.92, 0.36) }, scaleGeo: { tris: 450, box: B(1.3, 0, 2.5, 0.45) },
  benchGeo: { tris: 432, box: B(0.9, 0, 0.95, 0.325) }, bridgeLampGeo: { tris: 450, box: B(0.3, 0, 3.3, 0.3) }, railingGeo: { box: B(0.5001, 0, 1.0001, 0.05) },
  haringkarGeo: { tris: 1200, box: B(1.3, 0, 3.01, 0.801) }, bloemenkraamGeo: { tris: 1800, box: B(1.3, 0, 2.5, 0.801) }, fietsenrekGeo: { tris: 4000, box: B(1.3, 0, 1.3, 2.2) },
  dormerGeo: { box: [-0.81, -0.21, -1.9, 0.81, 1.85, 0.18] }, chimneyGeo: { box: B(0.37, -0.61, 1.83, 0.37) }, skylightGeo: { box: B(0.7, 0, 0.16, 0.6) }, ventGeo: { box: B(0.56, 0, 0.95, 0.46) },
  roofTerraceGeo: { tris: 700, box: B(1.51, 0, 2.4, 1.26) },
};

const measure = (name, geos) => {
  const box = new THREE.Box3(), v = new THREE.Vector3(); let tris = 0, nan = 0;
  for (const [g, m] of geos) {
    const p = g.attributes.position; tris += (g.index ? g.index.count : p.count) / 3;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (m) v.applyMatrix4(m); if (!(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))) nan++; else box.expandByPoint(v); }
    for (const k of ['position', 'normal', 'color']) if (!g.attributes[k]) bad(`${name}: a geometry has no ${k}`); else if (g.attributes[k].count !== p.count) bad(`${name}: ${k} count differs from position`);
    const n = g.attributes.normal; if (n) for (let i = 0; i < n.count; i++) if (!Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i))) { bad(`${name}: NaN normal`); break; }
  }
  if (nan) bad(`${name}: ${nan} NaN positions`);
  return { box, tris };
};
const judge = (name, { box, tris }, lim, lo = 0, hi = 400) => {
  if (tris < lo || tris > hi) bad(`${name}: ${tris} triangles, budget ${lo ? lo + ' to ' : ''}${hi}`);
  const a = [...box.min.toArray(), ...box.max.toArray()];
  a.forEach((q, i) => { if (i < 3 ? q < lim[i] - 1e-4 : q > lim[i] + 1e-4) bad(`${name}: ${'xyz'[i % 3]} ${i < 3 ? 'min' : 'max'} ${q.toFixed(3)} is outside the limit ${lim[i]}`); });
  rows.push([name, ...box.getSize(new THREE.Vector3()).toArray().map((q) => q.toFixed(2)), a.map((q) => q.toFixed(2)).join(' '), tris]);
};
const meshes = (group) => { const out = []; group.updateMatrixWorld(true); group.traverse((o) => { if (o.isMesh) out.push([o.geometry, o.matrixWorld]); }); return out; };
const tryBuild = (name, f) => { try { return f(); } catch (e) { bad(`${name}: threw ${e.stack.split('\n').slice(0, 3).join(' | ')}`); return null; } };

for (const [name, lim] of Object.entries(GROUPS)) {
  const made = tryBuild(name, () => L[name]()); if (!made) continue;
  const group = made.group || made, list = meshes(group);
  if (list.length > 4) bad(`${name}: ${list.length} meshes, more than 4`);
  if (name === 'molen' && !(made.sails && made.sails.isObject3D)) bad('molen: no sails object');
  judge(name, measure(name, list), lim.box, ...lim.tris);
  if (name === 'groteKerk') { // every vertex inside the real outline, or at most 0.3 m outside it
    const P = churchOutline(), n = P.length / 2, v = new THREE.Vector3(); let worst = 0, at = null, out = 0;
    const inside = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = P[2 * i], zi = P[2 * i + 1], xj = P[2 * j], zj = P[2 * j + 1]; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    const dist = (x, z) => { let d = Infinity; for (let i = 0, j = n - 1; i < n; j = i++) { const ax = P[2 * j], az = P[2 * j + 1], bx = P[2 * i] - ax, bz = P[2 * i + 1] - az, t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1))); d = Math.min(d, Math.hypot(x - ax - t * bx, z - az - t * bz)); } return d; };
    for (const [g, m] of list) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); if (!inside(v.x, v.z)) { const d = dist(v.x, v.z); if (d > 0.3) out++; if (d > worst) { worst = d; at = v.toArray().map((q) => q.toFixed(1)).join(', '); } } } }
    if (worst > 0.3) bad(`groteKerk: ${out} vertices more than 0.3 m outside the footprint, worst ${worst.toFixed(2)} m at (${at})`);
    rows.push(['  church outline', '', '', '', `furthest outside the footprint: ${worst.toFixed(2)} m`, '']);
    if (!Array.isArray(L.groteKerkSolids) || !L.groteKerkSolids.length) bad('groteKerkSolids missing');
    else for (const s of L.groteKerkSolids) if (!inside(s.x, s.z) && dist(s.x, s.z) > 0.3) bad(`groteKerkSolids: centre (${s.x}, ${s.z}) is outside the footprint`);
  }
}
for (const [name, lim] of Object.entries(GEOS)) {
  const g = tryBuild(name, () => L[name]()); if (!g) continue;
  if (!g.isBufferGeometry) { bad(`${name}: did not return a BufferGeometry`); continue; }
  judge(name, measure(name, [[g]]), lim.box, 0, lim.tris || 400);
  for (const w of ['tint', 'rest']) if (['berrieGeo', 'dormerGeo', 'chimneyGeo'].includes(name)) { const q = tryBuild(`${name}('${w}')`, () => L[name](w)); if (q) rows.push([`  ${name}('${w}')`, '', '', '', '', q.attributes.position.count / 3]); }
}
for (const k of Object.keys(L)) if (!(k in GROUPS) && !(k in GEOS) && !['groteKerkSolids', 'SWAY'].includes(k)) bad(`${k}: exported but not checked`);

if (process.argv.includes('--table')) { console.log('name | x | y | z | min xyz, max xyz | tris'); for (const r of rows) console.log(r.join(' | ')); }
if (problems.length) { console.log(`PROBLEMS (${problems.length}):`); for (const p of problems) console.log(' - ' + p); process.exit(1); }
console.log(`OK: landmarks are clean (${rows.filter((r) => r[1] !== '').length} models built)`);
