// Street furniture along the route: lampposts, bollards, parked bikes, benches, planters and bins, and the people who stop to watch.
// Pure maths (no three.js), so tools/check.mjs places exactly the same things and proves the car never touches one.
import { inPoly } from './drive.js';

export const PROP = { // r = how much room it takes (m), h = height (m), inset = how far it stands off the wall or quay
  lamp: { r: 0.2, h: 4.4, inset: 0.75 }, bollard: { r: 0.16, h: 0.9, inset: 1.0 }, bike: { r: 0.95, h: 1.2, inset: 0.8 },
  bench: { r: 0.9, h: 0.9, inset: 0.8 }, planter: { r: 0.65, h: 1.3, inset: 0.95 }, bin: { r: 0.32, h: 1.0, inset: 0.65 },
  person: { r: 0.35, h: 2.2, inset: 0.85 }, // h: with both arms in the air, mid-hop
};
const OTHERS = ['bike', 'planter', 'bollard', 'bench', 'bin', 'bike'];

// points every `step` metres (or a little less) along a polyline, carried on `ext` metres past each end: [x, z, 0..1]
export function along(line, step, ext = 0) {
  const n = line.length / 2, acc = [0], { hypot } = Math; for (let i = 1; i < n; i++) acc.push(acc[i - 1] + hypot(line[2 * i] - line[2 * i - 2], line[2 * i + 1] - line[2 * i - 1]));
  const len = acc[n - 1] + 2 * ext, N = Math.max(2, Math.ceil(len / step)), out = [];
  for (let k = 0; k <= N; k++) {
    const d = (k / N) * len - ext; let i = 0; while (i < n - 2 && acc[i + 1] < d) i++;
    const f = (d - acc[i]) / (acc[i + 1] - acc[i] || 1); out.push([line[2 * i] + (line[2 * i + 2] - line[2 * i]) * f, line[2 * i + 1] + (line[2 * i + 3] - line[2 * i + 1]) * f, k / N]);
  }
  return out;
}

// What each bridge on the map becomes: 'own' (the route builds its own deck there), 'flat' (the car drives over or right past it,
// so it is a level slab with no railings) or 'arch' (a humpback with parapets, well clear of the car).
export function planBridges(map, drive) {
  const { layout, m } = drive, { hypot, min, max } = Math;
  const box = map.water.map((p) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < p.length; i += 2) { a = min(a, p[i]); c = max(c, p[i]); b = min(b, p[i + 1]); d = max(d, p[i + 1]); } return [a, b, c, d]; });
  const wet = (x, z) => map.water.some((w, i) => x > box[i][0] && x < box[i][2] && z > box[i][1] && z < box[i][3] && inPoly(w, x, z));
  const own = []; for (const b of [...layout.humps, { s0: m.bridgeN - 3, s1: m.bridgeS + 3 }]) for (let s = b.s0; s <= b.s1; s += 1) { const c = drive.centre(s); own.push(c.x, c.z); }
  const car = []; for (let t = 0; t <= drive.duration; t += 0.05) { const s = drive.state(t); car.push(s.x, s.z); }
  const gap = (A, x, z) => { let d = 1e9; for (let i = 0; i < A.length; i += 2) d = min(d, hypot(A[i] - x, A[i + 1] - z)); return d; };
  const out = [];
  for (const r of map.roads) {
    if (r.a) continue;
    let bridge = r.b; if (!bridge && !/footway|path|steps/.test(r.k)) for (let i = 0; i < r.p.length && !bridge; i += 2) bridge = wet(r.p[i], r.p[i + 1]);
    if (!bridge) continue;
    const pts = along(r.p, 1.5, 1.5), W = r.w + 1.4; let len = 0, dOwn = 1e9, dCar = 1e9;
    for (let i = 2; i < r.p.length; i += 2) len += hypot(r.p[i] - r.p[i - 2], r.p[i + 1] - r.p[i - 1]);
    for (const [x, z] of pts) { dOwn = min(dOwn, gap(own, x, z)); dCar = min(dCar, gap(car, x, z)); }
    const mode = r.n === 'Eenhoornbrug' || dOwn < 7 ? 'own' : dCar < W / 2 + 2.7 ? 'flat' : 'arch';
    out.push({ r, pts, W, mode, h: mode === 'arch' ? max(0.3, min(1.1, 0.045 * len)) : 0 });
  }
  return out;
}

export function placeProps(map, drive) {
  const { layout, L } = drive, CELL = 40, grid = new Map(), { floor, hypot, sin, cos } = Math;
  const add = (p, wet) => {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
    for (let gx = floor(x0 / CELL); gx <= floor(x1 / CELL); gx++) for (let gz = floor(z0 / CELL); gz <= floor(z1 / CELL); gz++) { const k = gx + ':' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push({ p, wet }); }
  };
  map.buildings.forEach((b) => add(b.p, false)); map.water.forEach((w) => add(w, true));
  const hit = (x, z) => { for (const o of grid.get(floor(x / CELL) + ':' + floor(z / CELL)) || []) if (inPoly(o.p, x, z)) return o.wet ? 'water' : 'wall'; return null; };

  const car = []; for (let t = 0; t <= drive.duration; t += 0.05) { const s = drive.state(t); car.push(s.x, s.z); }
  const carGap = (x, z) => { let d = 1e9; for (let i = 0; i < car.length; i += 2) d = Math.min(d, hypot(car[i] - x, car[i + 1] - z)); return d; };
  const stage = [layout.hop, layout.ramp].map((j) => [j.s0 - 12, j.land + 8]).concat(layout.humps.map((b) => [b.s0 - 4, b.s1 + 4]), [[layout.ducks.s - 2, layout.ducks.s + 2]]); // and the ducks' crossing
  const out = [];
  const put = (s, side, kind) => {
    if (stage.some(([a, b]) => s > a && s < b)) return;
    let wall = null, off = 1.6;
    for (; off < 12 && !wall; off += 0.2) { const p = drive.place(s, side * off); wall = hit(p.x, p.z); }
    if (!wall) return;
    if (wall === 'water' && kind !== 'lamp' && kind !== 'person') kind = 'bollard'; // nothing you could trip over next to a canal
    const k = PROP[kind], d = off - k.inset; if (d < 2.9) return;
    const { x, z, h: a } = drive.place(s, side * d);
    if ([[0, 0], [k.r, 0], [-k.r, 0], [0, side * 0.35]].some(([f, g]) => hit(x + cos(a) * f - sin(a) * g, z + sin(a) * f + cos(a) * g))) return;
    if (carGap(x, z) < 2.45 + k.r) return; // the car's corners sweep 2.2 m from its middle
    const room = (o) => kind !== 'person' ? 1.7 : o.kind === 'person' ? 0.8 : o.r + k.r + 0.3; // people stand in little groups
    if (out.some((o) => hypot(o.x - x, o.z - z) < room(o)) || layout.solids.some((o) => hypot(o.x - x, o.z - z) < o.r + k.r + 0.7)) return;
    if (layout.parked.some((o) => hypot(o.x - x, o.z - z) < 3.4) || layout.crowd.some((o) => hypot(o.x - x, o.z - z) < 1.8) || hypot(layout.donut.x - x, layout.donut.z - z) < 7.5) return;
    let tree = false; for (let j = 0; j < map.trees.length && !tree; j += 2) tree = hypot(map.trees[j] - x, map.trees[j + 1] - z) < 1.3; if (tree) return;
    out.push({ x, z, a, side, kind, r: k.r, h: k.h });
  };
  for (let i = 0, s = 28; s < L - 36; i++, s += 6.5) { const h = Math.imul(i + 11, 2654435761) >>> 0; put(s, h & 8 ? 1 : -1, i % 4 === 0 ? 'lamp' : OTHERS[(h >>> 5) % OTHERS.length]); }
  // bystanders come after the furniture, so they fit in around it. They stop short of the finish: that pavement belongs to the crowd and the cameras.
  for (let i = 0, s = 30.5; s < L - 48; i++, s += 1.9) { const h = Math.imul(i + 77, 2246822519) >>> 0; if ((h >>> 9) % 5 < 2) put(s, h & 16 ? 1 : -1, 'person'); }
  return out;
}
