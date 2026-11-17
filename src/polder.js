// De polder: North Holland all round the town, out to the dunes and the sea. Flat fields, ditches, tulips, cows, mills.
// The ground is one patchwork of rectangles that never overlap (so nothing can flicker); the town and the motorway each keep their own hole.
import * as THREE from 'three';
import { GROUND, mat, canvasTex, fuse } from './world.js';
import { CORRIDOR, Z0, getPlan } from './snelweg.js';

const { PI, sin, cos, min, max, abs, floor } = Math;
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d), Cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
// a gable roof: w wide, h high, len long (along z), standing on y = 0
const gable = (w, h, len) => { const a = w / 2, l = len / 2, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-a, 0, l, a, 0, l, 0, h, l, a, 0, -l, -a, 0, -l, 0, h, -l, a, 0, l, a, 0, -l, 0, h, -l, a, 0, l, 0, h, -l, 0, h, l, -a, 0, -l, -a, 0, l, 0, h, l, -a, 0, -l, 0, h, l, 0, h, -l], 3)); g.computeVertexNormals(); return g; };

export function buildPolder(scene, { rect = [-1090, -730, 860, 760] } = {}) {
  const [RX0, RZ0, RX1, RZ1] = rect, R = rnd(21), EXT = 6600, DUNE = -4250, SEA = -4780;
  const { XW, XV, XE } = getPlan().layout;
  const roads = [[XW, CORRIDOR.z1, EXT], [XV, RZ1, CORRIDOR.z0], [XV, CORRIDOR.z1, EXT], [XE, CORRIDOR.z1, EXT]]; // straight polder roads: x, from z, to z
  const group = new THREE.Group(); scene.add(group);

  // ---- the patchwork: bands running east-west, each cut into parcels ----
  const land = { p: [], c: [], u: [] }, wet = { p: [], c: [], u: [] }, bulbs = { p: [], c: [], u: [] }, K = new THREE.Color(), cells = [];
  const quad = (o, x0, z0, x1, z1, col, uv) => {
    o.p.push(x0, GROUND, z0, x0, GROUND, z1, x1, GROUND, z1, x0, GROUND, z0, x1, GROUND, z1, x1, GROUND, z0); K.set(col); for (let i = 0; i < 6; i++) o.c.push(K.r, K.g, K.b);
    const q = uv(x0, z0), r = uv(x0, z1), s = uv(x1, z1), t = uv(x1, z0); o.u.push(...q, ...r, ...s, ...q, ...s, ...t);
  };
  const greens = ['#7cc152', '#6db247', '#8acb5a', '#62a640', '#93cf66', '#74b84e', '#58a23f'];
  const fixedZ = [RZ0, RZ1, CORRIDOR.z0, CORRIDOR.z1, EXT];
  for (let z = -EXT; z < EXT - 1;) {
    const nearZ = z > -2700 && z < 4300; let z1 = z + (nearZ ? 230 + R() * 190 : 600 + R() * 500), hard = false;
    for (const f of fixedZ) if (f > z + 1 && f < z1 + (nearZ ? 130 : 320)) { z1 = f; hard = true; break; }
    const z0 = z; z = z1; if (z0 === CORRIDOR.z0) continue; // the motorway lays its own ground
    const ditch = hard ? 0 : 5, inTown = z0 >= RZ0 && z1 <= RZ1, zm = (z0 + z1) / 2;
    const fixedX = [EXT]; if (inTown) fixedX.push(RX0, RX1); for (const [x, a, b] of roads) if (z0 >= a && z1 <= b) fixedX.push(x - 4, x + 4);
    fixedX.sort((a, b) => a - b);
    for (let x = DUNE; x < EXT - 1;) {
      const nearX = nearZ && x > -3300 && x < 3100; let x1 = x + (nearX ? 55 + R() * 120 : 380 + R() * 420), cut = false;
      for (const f of fixedX) if (f > x + 0.5 && f < x1 + (nearX ? 45 : 250)) { x1 = f; cut = true; break; }
      const x0 = x; x = x1;
      if (inTown && x0 >= RX0 && x1 <= RX1) continue;
      if (roads.some(([rx, a, b]) => x0 === rx - 4 && z0 >= a && z1 <= b)) { quad(land, x0, z0, x1, z1, '#6c7078', (px, pz) => [px / 9, pz / 9]); cells.push({ x0, z0, x1, z1, kind: 'road' }); continue; }
      const slot = !cut && nearX && R() < 0.32 ? 3 : 0, a = x1 - slot, b = z1 - ditch, k = R(), far = abs(zm - Z0) > 1300 || abs(x0) > 2800;
      const kind = k < (far ? (nearX ? 0.1 : 0.05) : 0.3) ? 'tulip' : k < 0.42 ? 'crop' : k < 0.47 ? 'soil' : 'grass';
      if (kind === 'tulip') { const along = a - x0 > b - z0, o = R(); quad(bulbs, x0, z0, a, b, '#ffffff', along ? (px, pz) => [pz / 96 + o, px / 40] : (px, pz) => [px / 96 + o, pz / 40]); }
      else { const t = R() < 0.5; quad(land, x0, z0, a, b, kind === 'crop' ? (R() < 0.5 ? '#e4d84c' : '#cfe27c') : kind === 'soil' ? '#a08058' : greens[floor(R() * greens.length)], t ? (px, pz) => [px / 64, pz / 64] : (px, pz) => [pz / 64, px / 64]); }
      cells.push({ x0, z0, x1: a, z1: b, kind, near: nearX });
      if (slot) quad(wet, a, z0, x1, b, '#4f93d6', (px, pz) => [0, 0]);
    }
    if (ditch) quad(wet, DUNE, z1 - ditch, EXT, z1, '#4f93d6', () => [0, 0]);
  }
  quad(land, SEA, -EXT, DUNE, EXT, '#ecdcab', (px, pz) => [px / 64, pz / 64]); quad(wet, -EXT, -EXT, SEA, EXT, '#3f7fc4', () => [0, 0]);
  const fieldTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h); const r = rnd(5); for (let y = 0; y < h; y += 16) { g.fillStyle = `rgba(0,40,0,${(y / 16) % 2 ? 0.07 : 0.02})`; g.fillRect(0, y, w, 16); g.fillStyle = 'rgba(0,30,0,.1)'; g.fillRect(0, y, w, 1.5); } for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? `rgba(0,50,0,${0.03 + r() * 0.08})` : `rgba(255,255,210,${0.04 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 1 + r() * 3); } });
  const tulipTex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#3f8f3a'; g.fillRect(0, 0, w, h); const r = rnd(8), cols = ['#e8222e', '#ffd21f', '#ff6fae', '#8d3fc4', '#fbfbf2', '#ff8a1e'], bw = w / cols.length;
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * bw + 3, 0, bw - 6, h); for (let x = 5; x < bw - 6; x += 5) { g.fillStyle = 'rgba(0,60,0,.22)'; g.fillRect(i * bw + 3 + x, 0, 1.2, h); } }); for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(0,70,0,.14)'; g.fillRect(r() * w, r() * h, 2, 2 + r() * 3); } });
  const flat = (o, material, order) => { const g = new THREE.BufferGeometry(), n = new Float32Array(o.p.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; group.add(m); return m; };
  flat(land, mat('#ffffff', { map: fieldTex, vertexColors: true, roughness: 0.95 })); flat(bulbs, mat('#ffffff', { map: tulipTex, roughness: 0.9 })); flat(wet, mat('#ffffff', { vertexColors: true, roughness: 0.25 }));

  // ---- the dunes along the coast: one lumpy ridge, its feet below the ground so the join is a clean line ----
  { const nx = 8, nz = 132, g = new THREE.PlaneGeometry(1, 1, nx, nz).rotateX(-PI / 2), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const u = P.getX(i) + 0.5, z = P.getZ(i) * 2 * EXT, n = 0.55 + 0.25 * sin(z / 310) + 0.2 * sin(z / 127 + 1.3) + 0.16 * sin(z / 53 + u * 5);
      P.setXYZ(i, SEA + 60 + u * (DUNE - SEA - 60), -1.5 + 26 * Math.pow(sin(PI * u), 1.2) * n, z); }
    const d = g.toNonIndexed(); d.computeVertexNormals(); const Q = d.attributes.position, c = [];
    for (let i = 0; i < Q.count; i += 3) { const h = (Q.getY(i) + Q.getY(i + 1) + Q.getY(i + 2)) / 3; K.set(h > 9 + 5 * sin(Q.getZ(i) / 90) ? '#9fb86c' : h > 4 ? '#e9d9a4' : '#f2e6bd'); for (let k = 0; k < 3; k++) c.push(K.r, K.g, K.b); }
    d.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); group.add(new THREE.Mesh(d, mat('#ffffff', { vertexColors: true, roughness: 0.95 }))); }

  // ---- things standing in the fields ----
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), tinted = mat('#ffffff', { vertexColors: true, roughness: 0.8 });
  const inst = (geo, list) => { // [{ x, y, z, a, sx, sy, sz, c }]
    const im = new THREE.InstancedMesh(geo, tinted, list.length);
    list.forEach((o, i) => { im.setMatrixAt(i, M.compose(V.set(o.x, o.y ?? GROUND, o.z), Q.setFromEuler(E.set(0, -(o.a || 0), 0)), S.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.sx ?? o.s ?? 1))); if (o.c) im.setColorAt(i, K.set(o.c)); });
    group.add(im); return im;
  };
  const free = (x, z, m = 8) => !(x > RX0 - m && x < RX1 + m && z > RZ0 - m && z < RZ1 + m) && !(z > CORRIDOR.z0 - m && z < CORRIDOR.z1 + m) && x > DUNE + 30 && abs(x) < EXT - 50 && abs(z) < EXT - 50
    && roads.every(([rx, a, b]) => abs(x - rx) > m + 4 || z < a - m || z > b + m) && !(abs(x - XV) < 26 && abs(z - Z0) < 260);
  const cellAt = (x, z) => cells.find((c) => x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1);
  const dry = (x, z, m) => { if (!free(x, z, m)) return false; const c = cellAt(x, z); return c && c.kind !== 'road' && x > c.x0 + 1.5 && x < c.x1 - 1.5 && z > c.z0 + 1.5 && z < c.z1 - 1.5; };
  const pick = (test, n, seed) => { const r = rnd(seed), list = cells.filter(test), out = []; for (let i = 0; i < n && list.length; i++) out.push(list.splice(floor(r() * list.length), 1)[0]); return out; };
  const grassy = (c) => c.kind === 'grass' && c.x1 - c.x0 > 40 && c.z1 - c.z0 > 60, close = (c) => c.near && (abs((c.z0 + c.z1) / 2 - Z0) < 1100 && abs(c.x0) < 2300 || (c.x0 > RX0 - 700 && c.x1 < RX1 + 700 && c.z0 > RZ0 - 700 && c.z1 < RZ1 + 700));

  // trees: one shape, stretched tall for poplars and squat for the belt round the town
  const trees = [], leaf = ['#5fae45', '#4f9c3b', '#6fbb4f', '#458f35', '#7cc45a'];
  const tree = (x, z, poplar, m = 3) => { if (!dry(x, z, m)) return; const s = 0.85 + R() * 0.4; trees.push(poplar ? { x, z, sx: 1.5 * s, sy: 4.6 * s, c: leaf[floor(R() * 3)] } : { x, z, sx: (2.7 + R()) * s, sy: (2.2 + R() * 0.6) * s, c: leaf[floor(R() * 5)] }); };
  const belt = (x, z) => { const s = 0.85 + R() * 0.4; trees.push({ x, z, sx: (2.9 + R()) * s, sy: (2.3 + R() * 0.6) * s, c: leaf[floor(R() * 5)] }); };
  for (const [off, start] of [[7, 0], [15.5, 5.5]]) { // two staggered rows hugging the town, so its edge never shows
    for (let x = RX0 - off + start; x <= RX1 + off; x += 11) { belt(x + R() * 3, RZ0 - off - R() * 2); if (abs(x - XV) > 9) belt(x + R() * 3, RZ1 + off + R() * 2); }
    for (let z = RZ0 - off + start; z <= RZ1 + off; z += 11) { belt(RX0 - off - R() * 2, z + R() * 3); belt(RX1 + off + R() * 2, z + R() * 3); }
  }
  for (const [rx, a, b] of roads) for (let z = max(a, Z0 - 1500) + 12; z < min(b, Z0 + 1700); z += 17) for (const s of [-1, 1]) tree(rx + s * 8.5, z, true, 0); // avenues of poplars along the polder roads
  for (const c of cells) if (c.near && c.kind !== 'road' && R() < 0.07) { const n = 6 + floor(R() * 16); for (let i = 0; i < n; i++) tree(c.x0 + 4 + i * 13, c.z1 - 4, true); } // tree rows along the ditches
  for (let x = -2900; x < 2900; x += 24 + R() * 30) { if (R() < 0.75) tree(x, CORRIDOR.z1 + 7 + R() * 5, R() < 0.6, 2); if (R() < 0.5) tree(x + 9, CORRIDOR.z0 - 7 - R() * 5, R() < 0.6, 2); } // and along the motorway
  const villages = [[-2950, 520], [2650, -640], [2350, 2950], [-2450, 3400], [450, -2700], [-3350, -2250], [3900, 1500], [-3500, 1700], [1500, 4700]];
  for (const [vx, vz] of villages) for (let i = 0; i < 16; i++) { const a = R() * 6.3, d = 50 + R() * 130; tree(vx + cos(a) * d, vz + sin(a) * d, false, 6); }
  const yard = []; // farms first, so their trees are counted
  const farms = pick((c) => grassy(c) && close(c), 20, 3).map((c, i) => { const x = c.x0 + 16, z = c.z0 + 18; for (const [dx, dz] of [[17, -13], [-12, 15], [17, 14]]) yard.push([x + dx, z + dz]); return { x, z, a: floor(R() * 4) * PI / 2 }; });
  for (const [x, z] of yard) tree(x, z, false, 2);

  const cows = [], sheep = [];
  for (const c of pick((c) => grassy(c) && close(c) && !farms.some((f) => f.x > c.x0 && f.x < c.x1 && f.z > c.z0 && f.z < c.z1), 30, 6)) { const n = 5 + floor(R() * 5), cx = c.x0 + 12 + R() * (c.x1 - c.x0 - 24), cz = c.z0 + 12 + R() * (c.z1 - c.z0 - 24);
    for (let i = 0; i < n; i++) { const x = cx + (R() - 0.5) * 34, z = cz + (R() - 0.5) * 40; if (x > c.x0 + 4 && x < c.x1 - 4 && z > c.z0 + 4 && z < c.z1 - 4 && free(x, z, 5)) cows.push({ x, z, a: R() * 6.3, s: 1.25 + R() * 0.2 }); } }
  for (const c of pick((c) => grassy(c) && c.near, 16, 9)) { const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2; for (let i = 0; i < 9; i++) { const x = cx + (R() - 0.5) * (c.x1 - c.x0 - 12), z = cz + (R() - 0.5) * min(60, c.z1 - c.z0 - 12); if (free(x, z, 5)) sheep.push({ x, z, a: R() * 6.3, s: 1.2 + R() * 0.3 }); } }

  const treeGeo = fuse([new THREE.CylinderGeometry(0.13, 0.18, 1.1, 4, 1, true), '#7a5a3c', 0, 0.55, 0], [new THREE.IcosahedronGeometry(1, 0), '#ffffff', 0, 2, 0]);
  inst(treeGeo, trees);
  const leg = (x, z, h, c) => [Box(0.2, h, 0.2), c, x, h / 2, z];
  inst(fuse([Box(2.0, 1.0, 0.84), '#fbfaf2', 0, 1.25, 0], [Box(0.7, 0.75, 0.9), '#22232a', -0.35, 1.32, 0], [Box(0.5, 0.5, 0.9), '#22232a', 0.5, 1.2, 0], [Box(0.6, 0.55, 0.5), '#22232a', 1.25, 1.5, 0], [Box(0.22, 0.26, 0.4), '#f3a6a0', 1.6, 1.36, 0],
    leg(0.78, 0.26, 0.8, '#fbfaf2'), leg(0.78, -0.26, 0.8, '#fbfaf2'), leg(-0.78, 0.26, 0.8, '#fbfaf2'), leg(-0.78, -0.26, 0.8, '#22232a')), cows);
  inst(fuse([Box(1.15, 0.72, 0.74), '#f4efe0', 0, 0.78, 0], [Box(0.34, 0.32, 0.34), '#3a3530', 0.72, 0.95, 0], leg(0.4, 0.2, 0.45, '#3a3530'), leg(0.4, -0.2, 0.45, '#3a3530'), leg(-0.4, 0.2, 0.45, '#3a3530'), leg(-0.4, -0.2, 0.45, '#3a3530')), sheep);
  // the stolp: a square farm under one big pyramid roof
  inst(fuse([Box(15, 3.6, 15), '#f3ead8', 0, 1.8, 0], [new THREE.ConeGeometry(11.6, 8.5, 4).rotateY(PI / 4), '#b5532e', 0, 7.85, 0], [Box(0.12, 3.0, 3.4), '#2f7f4a', 7.53, 1.5, 0], [Box(0.12, 1.2, 1.0), '#fbfbf6', 7.53, 2.0, 4.6], [Box(0.12, 1.2, 1.0), '#fbfbf6', 7.53, 2.0, -4.6],
    [Box(1.0, 1.2, 0.12), '#fbfbf6', -3.5, 2.0, 7.53], [Box(1.0, 1.2, 0.12), '#fbfbf6', 3.5, 2.0, 7.53], [Box(1.0, 2.2, 0.12), '#2f7f4a', 0, 1.1, 7.53], [Box(0.9, 1.6, 0.9), '#8a4a34', 2.4, 9.3, 0], [Box(9, 3.2, 5), '#3d342c', -3, 1.6, -11], [gable(9.6, 2.6, 5.4).rotateY(PI / 2), '#b5532e', -3, 3.2, -11]), farms);
  // glasshouses, in two clusters
  { const list = []; for (const c of cells) { if (c.kind === 'road' || c.kind === 'tulip' || !c.near) continue; const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2; if (!((cx > 1250 && cx < 2100 && cz > 950 && cz < 1650) || (cx > -2500 && cx < -1750 && cz > 2350 && cz < 2950))) continue;
      for (let x = c.x0 + 20; x + 16 < c.x1; x += 34) for (let z = c.z0 + 36; z + 34 < c.z1; z += 66) if (free(x, z, 30) && !farms.some((f) => abs(f.x - x) < 40 && abs(f.z - z) < 50)) list.push({ x, z }); }
    const parts = [[Box(28, 3.2, 58), '#dff3f2', 0, 1.6, 0]]; for (let i = 0; i < 4; i++) parts.push([gable(7, 1.7, 58), '#f2fcfc', -10.5 + i * 7, 3.2, 0], [Box(0.24, 0.16, 58.2), '#8fb9bf', -10.5 + i * 7, 4.9, 0]); for (let i = 0; i < 5; i++) parts.push([Box(0.2, 3.3, 58.2), '#8fb9bf', -14 + i * 7, 1.65, 0]);
    inst(fuse(...parts), list); }
  // wind turbines in a line south of the motorway and a few to the north-east; the rotors turn
  const mills = []; for (let x = -2850; x <= 2900; x += 520) mills.push({ x: x + 10, z: Z0 + 640 + 40 * sin(x) }); for (let i = 0; i < 5; i++) mills.push({ x: 1700 + i * 540, z: -2300 - i * 150 });
  inst(fuse([Cyl(1.25, 2.4, 90, 10), '#f6f6f2', 0, 45, 0], [Box(3.6, 3.6, 10), '#f6f6f2', 0, 91.5, 0.6], [Cyl(2.5, 2.9, 5, 10), '#d3202c', 0, 2.5, 0], [Cyl(3.6, 3.6, 0.6, 10), '#b9b6ad', 0, 0.3, 0]), mills);
  const blade = () => new THREE.CylinderGeometry(0.3, 1.5, 40, 4).scale(1, 1, 0.35).translate(0, 21.5, 0);
  const rotors = inst(fuse([blade(), '#f6f6f2'], [blade(), '#f6f6f2', 0, 0, 0, 2 * PI / 3], [blade(), '#f6f6f2', 0, 0, 0, -2 * PI / 3], [new THREE.IcosahedronGeometry(1.9, 1), '#e9e9e4']), mills.map((m) => ({ x: m.x, y: 91.5, z: m.z - 6.4 })));
  rotors.frustumCulled = false;
  // a few old windmills
  const old = [[-1680, 1480], [1260, 2420], [-420, -1560], [2350, 300]].filter(([x, z]) => free(x, z, 20)).map(([x, z]) => ({ x, z }));
  inst(fuse([Cyl(6.4, 7, 2.4, 8), '#e9e2d0', 0, 1.2, 0], [Cyl(3.0, 5.4, 12.5, 8), '#6b4a36', 0, 8.6, 0], [Cyl(6.3, 6.3, 0.3, 8), '#e9e2d0', 0, 4.4, 0], [Cyl(0.4, 3.4, 3.2, 8), '#3d342c', 0, 16.4, 0], [Box(1.2, 2.2, 0.2), '#2f7f4a', 0, 3.5, 5.5], [Cyl(0.3, 0.3, 2.4, 6).rotateZ(PI / 2), '#3d342c', 3.4, 15.6, 0]), old);
  const sail = (a) => [[Box(0.3, 12, 0.3).translate(0, 6, 0).rotateX(a), '#f6f1e0'], [Box(0.1, 9.6, 2.0).translate(0, 6.9, 1.1).rotateX(a), '#e9dfc0']];
  const sails = inst(fuse(...[0, 1, 2, 3].flatMap((i) => sail(i * PI / 2))), old.map((o) => ({ x: o.x + 4.4, y: 15.6, z: o.z }))); sails.frustumCulled = false;
  // villages far off: a clutch of roofs round a church spire
  { const houses = [], churches = [], walls = ['#ffffff', '#ffe9d2', '#f3d9c4', '#e9f0f4', '#ffd9c2'];
    for (const [vx, vz] of villages) {
      churches.push({ x: vx, z: vz, a: R() * 0.4 }); for (let i = 0; i < 16; i++) { const a = R() * 6.3, d = 42 + R() * 110, x = vx + cos(a) * d, z = vz + sin(a) * d; const c = cellAt(x, z); if (free(x, z, 14) && c && c.kind !== 'road' && x > c.x0 + 9 && x < c.x1 - 9 && z > c.z0 + 9 && z < c.z1 - 9 && !trees.some((t) => abs(t.x - x) < 12 && abs(t.z - z) < 12) && !houses.some((h) => abs(h.x - x) < 17 && abs(h.z - z) < 17)) houses.push({ x, z, a: floor(R() * 4) * PI / 2 + R() * 0.2, s: 0.9 + R() * 0.4, c: walls[floor(R() * 5)] }); }
    }
    inst(fuse([Box(8, 5, 11), '#f2e4d0', 0, 2.5, 0], [gable(8.8, 4.2, 11.6), '#c4552f', 0, 5, 0], [Box(0.9, 1.6, 0.9), '#8a4a34', 2, 8, 2.5]), houses);
    inst(fuse([Box(11, 9, 24), '#c0704a', 0, 4.5, 0], [gable(11.8, 6, 24.6), '#4a4f58', 0, 9, 0], [Box(7, 24, 7), '#c0704a', 0, 12, 14], [new THREE.ConeGeometry(5.4, 17, 4).rotateY(PI / 4), '#4a4f58', 0, 32.5, 14]), churches); }

  const AXZ = new THREE.Vector3(0, 0, 1), AXX = new THREE.Vector3(1, 0, 0), ONE = new THREE.Vector3(1, 1, 1);
  function update(now) {
    mills.forEach((m, i) => rotors.setMatrixAt(i, M.compose(V.set(m.x, 91.5, m.z - 6.4), Q.setFromAxisAngle(AXZ, now * 0.9 + i * 1.7), ONE))); rotors.instanceMatrix.needsUpdate = true;
    old.forEach((o, i) => sails.setMatrixAt(i, M.compose(V.set(o.x + 4.4, 15.6, o.z), Q.setFromAxisAngle(AXX, now * 0.5 + i), ONE))); sails.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { update, group, count: { trees: trees.length, cows: cows.length, sheep: sheep.length, farms: farms.length, parcels: cells.length } };
}
