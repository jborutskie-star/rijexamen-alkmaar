// De polder: North Holland all round the town, out to the dunes and the sea. Flat fields, ditches, tulips, cows, mills.
// The ground is one patchwork of rectangles that never overlap (so nothing can flicker); the town and the motorway each keep their own hole.
import * as THREE from 'three';
import { loft } from './fauna.js';
import { GROUND, mat, canvasTex, fuse } from './world.js';
import { CORRIDOR, Z0, countryWater, getPlan } from './snelweg.js';

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
  const land = new Map(), wet = new Map(), bulbs = new Map(), K = new THREE.Color(), cells = [];
  const quad = (o, x0, z0, x1, z1, col, uv) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / 120)), nz = Math.max(1, Math.ceil((z1 - z0) / 120));
    K.set(col);
    for (let row = 0; row < nz; row++) for (let column = 0; column < nx; column++) {
      const a = x0 + (x1 - x0) * column / nx, b = x0 + (x1 - x0) * (column + 1) / nx;
      const l = z0 + (z1 - z0) * row / nz, r = z0 + (z1 - z0) * (row + 1) / nz;
      const tile = floor((a + b) / 4400) + ',' + floor((l + r) / 4400);
      if (!o.has(tile)) o.set(tile, { p: [], c: [], u: [] });
      const out = o.get(tile);
      for (const [x, z] of [[a, l], [a, r], [b, r], [a, l], [b, r], [b, l]]) {
        out.p.push(x, GROUND, z); out.c.push(K.r, K.g, K.b);
        if (o === wet) out.u.push(x / 12, z / 12); else out.u.push(...uv(x, z));
      }
    }
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
    if (ditch) { // a ditch stops at the edge of the town and runs under the polder roads, never across them
      const holes = (inTown ? [[RX0, RX1]] : []).concat(roads.filter(([, a, b]) => z0 >= a && z1 <= b).map(([x]) => [x - 4, x + 4])).sort((p, q) => p[0] - q[0]);
      let x = DUNE; for (const [h0, h1] of [...holes, [EXT, EXT]]) { if (h0 > x) quad(wet, x, z1 - ditch, h0, z1, '#4f93d6', () => [0, 0]); x = Math.max(x, h1); }
    }
  }
  quad(land, SEA, -EXT, DUNE, EXT, '#ecdcab', (px, pz) => [px / 64, pz / 64]); quad(wet, -EXT, -EXT, SEA, EXT, '#3f7fc4', () => [0, 0]);
  const fieldTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h); const r = rnd(5); for (let y = 0; y < h; y += 16) { g.fillStyle = `rgba(0,40,0,${(y / 16) % 2 ? 0.07 : 0.02})`; g.fillRect(0, y, w, 16); g.fillStyle = 'rgba(0,30,0,.1)'; g.fillRect(0, y, w, 1.5); g.fillStyle = 'rgba(255,250,208,.16)'; g.fillRect(0, y + 2, w, 1.7); } for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? `rgba(0,50,0,${0.03 + r() * 0.08})` : `rgba(255,255,210,${0.04 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 1 + r() * 3); } });
  const tulipTex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#3f8f3a'; g.fillRect(0, 0, w, h); const r = rnd(8), cols = ['#e8222e', '#ffd21f', '#ff6fae', '#8d3fc4', '#fbfbf2', '#ff8a1e'], bw = w / cols.length;
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * bw + 3, 0, bw - 6, h); for (let x = 5; x < bw - 6; x += 5) { g.fillStyle = 'rgba(0,60,0,.22)'; g.fillRect(i * bw + 3 + x, 0, 1.2, h);
        for (let y = (x % 3) * 3; y < h; y += 9) {
          g.fillStyle = 'rgba(255,247,204,.48)'; g.fillRect(i * bw + 1 + x, y, 2, 2.5);
          g.fillStyle = 'rgba(35,65,23,.32)'; g.fillRect(i * bw + 3 + x, y + 2, 1.5, 2.8);
        } } }); for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(0,70,0,.14)'; g.fillRect(r() * w, r() * h, 2, 2 + r() * 3); } });
  const flat = (tiles, material) => { for (const o of tiles.values()) { const g = new THREE.BufferGeometry(), n = new Float32Array(o.p.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; group.add(m); } };
  flat(land, mat('#ffffff', { map: fieldTex, bumpMap: fieldTex, bumpScale: 0.15, vertexColors: true, roughness: 0.95 })); flat(bulbs, mat('#ffffff', { map: tulipTex, bumpMap: tulipTex, bumpScale: 0.12, roughness: 0.87 })); flat(wet, countryWater());

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
  // Keep distant herds and tree belts outside the camera frustum out of the draw entirely.
  const regional = (geo, list, width = 2100) => {
    const cells = new Map();
    for (const o of list) {
      const id = floor(o.x / width) + ',' + floor(o.z / width);
      if (!cells.has(id)) cells.set(id, []);
      cells.get(id).push(o);
    }
    for (const batch of cells.values()) inst(geo, batch);
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

  // A five-sided crown with staggered rings gives both the low orchard trees and stretched poplars a stepped canopy.
  const rings = [[0, 1.05], [0.7, 1.26], [0.98, 1.82], [0.79, 2.38], [0, 3.0]];
  const hull = new THREE.LatheGeometry(rings.map(([r, y]) => new THREE.Vector2(r, y)), 5);
  // The ends of a lathe collapse to a point: omit their zero-area triangles across all 3,000 instances.
  const ix = hull.index.array, faces = [];
  for (let i = 0; i < ix.length; i += 3) {
    const ids = [ix[i], ix[i + 1], ix[i + 2]], tips = ids.filter(j => rings[j % rings.length][0] === 0);
    if (tips.length < 2) faces.push(...ids);
  }
  hull.setIndex(faces); const crown = hull.toNonIndexed();
  const cp = crown.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), twist = y > 2.2 ? 0.47 : y < 1.5 ? -0.32 : 0;
    cp.setXYZ(i, x * cos(twist) - z * sin(twist), y, x * sin(twist) + z * cos(twist));
  }
  crown.computeVertexNormals();
  const treeGeo = fuse([new THREE.CylinderGeometry(0.13, 0.18, 1.1, 4, 1, true), '#7a5a3c', 0, 0.55, 0], [crown, '#ffffff']);
  const tp = treeGeo.attributes.position, tc = treeGeo.attributes.color;
  for (let i = 0; i < tc.count; i++) if (tc.getX(i) === 1) {
    const light = (tp.getY(i) - 1) * 0.12;
    tc.setXYZ(i, 0.68 + light, 0.73 + light, 0.59 + light);
  }
  // On the approaches and in farmyards the camera resolves individual clusters and the forks of the trunk.
  const groves = [], distantTrees = [];
  for (const t of trees) {
    const closeToFlight = abs(t.x-XV)<95 && t.z>RZ1 && t.z<CORRIDOR.z0+100;
    const byRoad = abs(t.x)<1500 && min(abs(t.z-CORRIDOR.z0),abs(t.z-CORRIDOR.z1))<34;
    (closeToFlight || byRoad || yard.some(([x,z])=>abs(t.x-x)<.01&&abs(t.z-z)<.01) ? groves : distantTrees).push(t);
  }
  regional(treeGeo, distantTrees, 850);
  const canopy = [[treeGeo,'#ffffff']];
  for(const [x,y,z,s,col] of [[-.39,1.74,.27,.54,'#dae2bd'],[.36,1.79,-.28,.55,'#f1efc9'],[.22,2.12,.31,.51,'#edf1d8'],[-.23,2.40,-.12,.39,'#faf5dc']])
    canopy.push([new THREE.IcosahedronGeometry(1,0).scale(s,.52,s),col,x,y,z]);
  for (const side of [-1,1]) canopy.push([Cyl(.057,.086,.75,5).rotateZ(side*.58),'#846948',-side*.19,1.13,.02]);
  const groveGeo=fuse(...canopy); groveGeo.attributes.color.array.set(treeGeo.attributes.color.array);
  regional(groveGeo,groves,850);
  // Build the cream and black coat on one continuous skin. The other parts sample a white texel.
  const coat = canvasTex(512,256,(ctx,w,h)=>{
    ctx.fillStyle='#fffdf4'; ctx.fillRect(0,0,w,h);
    const spots=[[-.04,.25,.12,.15],[.29,.36,.11,.20],[.58,.17,.095,.12],[.89,.43,.12,.16],[.18,.76,.095,.13],[.54,.69,.135,.19],[.94,.84,.11,.14]];
    for(const [u,v,rx,ry] of spots) {
      ctx.fillStyle='#252b2c'; ctx.beginPath();
      for(let k=0;k<=50;k++) {
        const a=k*2*PI/50, wobble=1+.19*sin(3*a+u*8)+.13*cos(5*a+v*4);
        const x=w*(u+rx*cos(a)*wobble), y=h*(v+ry*sin(a)*wobble);
        if(k)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,12,12);
  },false);
  const oval=(x,y,z,radial=8,vertical=5)=>new THREE.SphereGeometry(1,radial,vertical).scale(x,y,z);
  const stem=(a,b,r0,r1,sides=6)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),dir=end.clone().sub(start);
    const g=Cyl(r1,r0,dir.length(),sides).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));
    return g.translate(...start.lerp(end,.5).toArray());
  };
  const hoofLeg=(parts,x,z,top,hip,knee,hoof,cream,hoofColour)=>{
    const bend=x<0 ? .08 : -.055;
    parts.push([stem([x,top,z],[x+bend,top*.47,z],hip,knee),cream],
      [stem([x+bend,top*.47,z],[x,.12,z],knee,hoof*.65),cream],
      [loft([[-.1,.055,0,0],[-.077,.065,.065,.061],[0,.058,.058,.077],[.094,.046,.046,.06],[.12,.044,0,0]],6).scale(hoof/.077,1,hoof/.077),hoofColour,x,0,z]);
  };
  const cowBody=loft([[-1,1.26,0,0],[-.90,1.28,.38,.32],[-.64,1.27,.47,.425],[-.23,1.24,.49,.443],[.26,1.24,.485,.43],[.65,1.27,.44,.40],[.93,1.31,.34,.31],[1.04,1.37,.20,.19],[1.07,1.40,0,0]],10);
  const cowParts=[[cowBody,'#fffdf4'],[loft([[.76,1.38,.26,.23],[.99,1.44,.28,.22],[1.20,1.51,.22,.20],[1.27,1.52,0,0]],8),'#ebe4d6'],
    [loft([[1.03,1.51,0,0],[1.11,1.55,.20,.19],[1.27,1.53,.23,.217],[1.44,1.45,.162,.175],[1.57,1.38,.10,.16],[1.59,1.37,0,0]],10),'#2f3030'],
    [oval(.132,.105,.18),'#e6a69f',1.57,1.37,0],[oval(.164,.136,.154),'#e3b4a4',-.52,.83,0]];
  for(const side of [-1,1]) {
    hoofLeg(cowParts,-.74,side*.27,.98,.114,.061,.083,side<0?'#322e2a':'#eee9dc','#534945');
    hoofLeg(cowParts,.72,side*.25,1.02,.098,.058,.084,'#eee9dc','#4d4744');
    cowParts.push([oval(.16,.065,.071).rotateZ(side*.20),'#292d2d',1.126,1.657,side*.269],
      [oval(.085,.036,.025),'#b37b76',1.151,1.655,side*.32],
      [oval(.047,.049,.018),'#b1a888',1.336,1.574,side*.196],
      [oval(.035,.038,.017),'#171b1b',1.344,1.574,side*.208],
      [oval(.031,.023,.016),'#80574f',1.659,1.39,side*.109]);
  }
  cowParts.push([stem([-.934,1.43,.10],[-.973,.66,.144],.04,.022),'#eee9dc'],
    [oval(.059,.109,.051),'#393a35',-.936,.60,.153], [oval(.074,.12,.15),'#e6e1d7',1.256,1.626,0]);
  const cattle = fuse(...cowParts), bodyUV=cowBody.attributes.uv.array;
  const coatUV = new Float32Array(cattle.attributes.position.count*2).fill(.012);
  for(let i=1;i<coatUV.length;i+=2) coatUV[i]=.988;
  coatUV.set(bodyUV); cattle.setAttribute('uv',new THREE.BufferAttribute(coatUV,2));

  const sheepBody=loft([[-.57,.79,0,0],[-.50,.78,.225,.24],[-.34,.77,.328,.34],[-.06,.765,.354,.363],[.22,.76,.34,.34],[.43,.77,.275,.25],[.54,.84,.14,.15],[.57,.85,0,0]],9);
  const lambParts=[[sheepBody,'#eee9d8'],[loft([[.40,.89,0,0],[.51,.935,.15,.135],[.66,.96,.154,.153],[.80,.92,.113,.124],[.885,.888,.063,.079],[.896,.88,0,0]],8),'#514639']];
  for(const s of [-1,1]) {
    for(const x of [-.37,.36]) hoofLeg(lambParts,x,s*.19,.58,.067,.047,.052,'#534c42','#383531');
    lambParts.push([oval(.10,.045,.050),'#52483f',.58,1.014,s*.144],[oval(.022,.024,.009),'#1c211f',.732,.983,s*.139]);
    for(const [x,y,z,r] of [[-.39,.83,.21,.125],[-.22,.93,.230,.17],[-.035,.845,.258,.14],[.16,.945,.248,.124],[.32,.875,.21,.124]])
      lambParts.push([oval(r*1.22,r,r*.79,7,5),s<0?'#e7e1d2':'#f3efdd',x,y,s*z]);
  }
  for(const [x,z,r] of [[-.30,.05,.11],[-.13,-.105,.095],[.05,.072,.12],[.25,-.045,.10]])
    lambParts.push([oval(r*1.24,r*.69,r,7,4),'#f0ebda',x,1.046,z]);
  lambParts.push([oval(.103,.163,.095,6,4),'#dfd8c5',-.473,.672,0],[oval(.121,.068,.133,8,4),'#f1eddc',.603,1.06,0]);
  const sheepGeo=fuse(...lambParts);

  // The pasture cells share one draw per herd, and trade the tiny eye/hoof details for a simpler
  // figure beyond the distance at which they occupy a pixel. Both levels share instance transforms.
  const herd=(detailed, low, animals, skin)=>{
    const batches=new Map();
    for(const o of animals) {
      const key=floor(o.x/320)+','+floor(o.z/320);
      if(!batches.has(key))batches.set(key,[]);
      batches.get(key).push(o);
    }
    for(const batch of batches.values()) {
      const origin=batch[0], local=batch.map(o=>({...o,x:o.x-origin.x,z:o.z-origin.z})), lod=new THREE.LOD();
      const near=inst(detailed,local),far=inst(low,local);
      if(skin) near.material=skin;
      lod.position.set(origin.x,0,origin.z); lod.addLevel(near,0);
      const radius=Math.max(...local.map(o=>Math.hypot(o.x,o.z)));
      lod.addLevel(far,145+radius,.12); group.add(lod);
    }
  };
  const distantCow=fuse([loft([[-1,1.25,0,0],[-.8,1.25,.48,.40],[.6,1.25,.48,.40],[.99,1.3,.31,.30],[1.17,1.44,0,0]],6),'#f5f1e3'],[oval(.30,.22,.205,5,3),'#373630',1.25,1.49,0],
    [oval(.13,.10,.167,5,3),'#dda69a',1.58,1.37,0],...[-.68,.68].flatMap(x=>[-.25,.25].map(z=>[Cyl(.105,.072,.86,4),'#d9d2c3',x,.43,z])));
  const farCowPos=distantCow.attributes.position,farCowCol=distantCow.attributes.color;
  for(let i=0;i<farCowPos.count;i++) if(farCowPos.getY(i)>.81&&farCowPos.getX(i)<.72&&sin(farCowPos.getX(i)*7+farCowPos.getY(i)*3)>0) farCowCol.setXYZ(i,.034,.036,.032);
  const distantSheep=fuse([oval(.575,.36,.37,7,4),'#eee8d8',0,.78,0],[oval(.18,.15,.15,6,4),'#554638',.70,.95,0],...[-.38,.38].flatMap(x=>[-.19,.19].map(z=>[Cyl(.056,.044,.48,4),'#584e40',x,.24,z])));
  herd(cattle,distantCow,cows,mat('#ffffff',{vertexColors:true,map:coat,roughness:.8}));
  herd(sheepGeo,distantSheep,sheep);
  // the stolp: a square farm under one big pyramid roof
  const farm = [
    [Box(15, 3.6, 15), '#f3ead8', 0, 1.8, 0], [new THREE.ConeGeometry(11.6, 8.5, 4).rotateY(PI / 4), '#b5532e', 0, 7.85, 0],
    [Box(0.12, 3, 3.4), '#2f7f4a', 7.53, 1.5, 0], [Box(0.9, 1.6, 0.9), '#8a4a34', 2.4, 9.3, 0],
    [Box(0.99, 0.25, 0.99), '#744635', 2.4, 10.13, 0], [Box(9, 3.2, 5), '#3d342c', -3, 1.6, -11],
    [gable(5.4, 2.6, 9.6).rotateY(PI / 2), '#b5532e', -3, 3.2, -11],
    [Box(15.5, 0.22, 15.5), '#eadbbf', 0, 3.51, 0], [Box(1.3, 2.3, 0.15), '#285e47', 0, 1.15, 7.54]
  ];
  for (const sign of [-1, 1]) for (const offset of [-4.6, 4.6]) {
    const z = sign * 7.54;
    farm.push([Box(1.42, 1.54, 0.16), '#fbfaf2', offset, 2, z], [Box(1.14, 1.22, 0.11), '#587782', offset, 2, z + sign * 0.09],
      [Box(1.55, 0.16, 0.28), '#c4b6a2', offset, 1.18, z], [Box(0.12, 1.42, 0.05), '#e9e6cd', offset, 2, z + sign * 0.15]);
    for (const dx of [-1, 1]) farm.push([Box(0.39, 1.5, 0.1), '#38724f', offset + dx * 0.93, 2, z]);
  }
  for (const z of [-4.6, 4.6]) farm.push([Box(0.16, 1.42, 1.25), '#fbfaf2', 7.55, 2, z], [Box(0.08, 1.13, 0.94), '#577783', 7.63, 2, z]);
  for (const z of [-0.7, 0.7]) farm.push([Box(0.07, 0.12, 1.25), '#8eac85', 7.6, 2.2, z]);
  for(const side of [-1,1]) {
    // Fascia boards, alternating brick quoins and the shutters' painted iron straps.
    farm.push([Box(15.5,.20,.15),'#744737',0,3.34,side*7.65]);
    for (const x of [-7.18,7.18]) for(let row=0;row<4;row++) farm.push([Box(.64,.21,.18),'#c6977a',x,.46+row*.78,side*7.53]);
    for (const x of [-4.6,4.6]) for (const offset of [-.93,.93]) for(const h of [1.53,2.45])
      farm.push([Box(.35,.08,.065),'#273f39',x+offset,h,side*7.615]);
    farm.push([Box(5.8,.15,.22),'#ddb688',-3,2.87,-11+side*2.56],
      [Box(9.3,.16,.22),'#9e684d',-3,3.14,-11+side*2.55]);
    for(const x of [-6.55,-3,.55]) farm.push([Box(.17,2.88,.16),'#8a7159',x,1.47,-11+side*2.54]);
  }
  for (const sign of [-1,1]) {
    const z=sign*.85;
    farm.push([Box(.095,2.75,.12),'#aec3a7',7.641,1.4,z*1.75],
      [Box(.074,.12,1.45),'#a8bc9a',7.67,.38,z],
      [Box(.075,.12,1.45),'#a8bc9a',7.67,2.56,z],
      [Box(.065,2.42,.13).rotateX(sign*.51),'#a8bc9a',7.702,1.44,z]);
  }
  inst(fuse(...farm), farms);
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
