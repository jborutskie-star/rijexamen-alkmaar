// The set pieces: the roadworks and plank ramp on the Langestraat, the fireworks stall on the Zoutstraat,
// and everything that goes bang. Where things stand comes from drive.js, so tools/check.mjs tests the same layout.
import * as THREE from 'three';
import { mat, canvasTex, GROUND } from './world.js';
import { clamp, smooth } from './drive.js';
import { person, puffs, FONT } from './actors.js';

const { PI, sin, cos, random, hypot, sqrt, exp, atan2 } = Math;
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const tex = (w, h, draw) => canvasTex(w, h, draw, false);
const COLS = ['#ff4d6d', '#ffd23f', '#4dd6ff', '#7dff7a', '#ff8a3d', '#d58bff', '#ffffff'];
const glow = (color, o = {}) => new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false, ...o });

// bright dots: rocket trails, bursts, sparks. One draw call for all of them.
function sparks(scene, n) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), glow('#ffffff'), n);
  const P = Array.from({ length: n }, () => ({ life: 0 })), M = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), C = new THREE.Color(); let next = 0;
  for (let i = 0; i < n; i++) { mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, C.set('#ffffff')); }
  mesh.frustumCulled = false; scene.add(mesh);
  return {
    emit(x, y, z, vx, vy, vz, life, size, col, g = 6) { Object.assign(P[next], { x, y, z, vx, vy, vz, age: 0, life, size, g }); mesh.setColorAt(next, C.set(col)); mesh.instanceColor.needsUpdate = true; next = (next + 1) % n; },
    update(dt) {
      P.forEach((p, i) => {
        if (p.life <= 0) return;
        p.age += dt; if (p.age >= p.life) { p.life = 0; mesh.setMatrixAt(i, ZERO); return; }
        const drag = 1 - 1.3 * dt; p.vy -= p.g * dt; p.vx *= drag; p.vy *= drag; p.vz *= drag; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const s = p.size * (1 - (p.age / p.life) ** 2); mesh.setMatrixAt(i, M.makeScale(s, s, s).setPosition(p.x, p.y, p.z));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { P.forEach((p, i) => { p.life = 0; mesh.setMatrixAt(i, ZERO); }); mesh.instanceMatrix.needsUpdate = true; },
  };
}

// planks and crates thrown out of the stall; they bounce off walls and the street and stay where they land
function debris(scene, world, n) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { roughness: 0.85 }), n), D = new THREE.Object3D(), C = new THREE.Color();
  const P = Array.from({ length: n }, () => ({ on: false })), WOOD = ['#b5834f', '#8a5a3a', '#2a2522', '#e0202a', '#f4f1e6', '#3a3330'];
  const hide = () => { D.scale.setScalar(0); D.updateMatrix(); P.forEach((p, i) => { p.on = false; mesh.setMatrixAt(i, D.matrix); }); mesh.instanceMatrix.needsUpdate = true; };
  P.forEach((_, i) => mesh.setColorAt(i, C.set(WOOD[i % WOOD.length]))); hide(); mesh.castShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  return {
    clear: hide,
    burst(x, z, ax, az) { // ax, az: the way to the open street; most of it flies that way
      P.forEach((p, i) => {
        const a = random() * 2 * PI, v = 2 + random() * 6, plank = i % 3;
        Object.assign(p, { on: true, x: x + cos(a) * 0.5, y: GROUND + 0.6 + random() * 1.2, z: z + sin(a) * 0.5, vx: cos(a) * v + ax * 3, vy: 5 + random() * 8, vz: sin(a) * v + az * 3,
          sx: plank ? 0.5 + random() * 0.8 : 0.3, sy: plank ? 0.05 : 0.25, sz: plank ? 0.14 : 0.3, rx: random() * 6, ry: random() * 6, rz: random() * 6, w: 4 + random() * 9 });
      });
    },
    update(dt) {
      P.forEach((p, i) => {
        if (!p.on) return; const floor = GROUND + p.sy / 2 + 0.005;
        if (p.vy !== 0 || p.y > floor) {
          p.vy -= 12 * dt; const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
          if (world.inside(nx, p.y, nz)) { p.vx *= -0.35; p.vz *= -0.35; } else { p.x = nx; p.z = nz; }
          p.y += p.vy * dt; p.rx += p.w * dt; p.rz += p.w * 0.7 * dt;
          if (p.y < floor) { p.y = floor; if (p.vy < -2.5) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; p.w *= 0.4; } else { p.vy = p.vx = p.vz = 0; p.rx = p.rz = 0; } } // comes to rest lying flat
        }
        D.position.set(p.x, p.y, p.z); D.rotation.set(p.rx, p.ry, p.rz); D.scale.set(p.sx, p.sy, p.sz); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function buildStunts(scene, world, drive) {
  const { layout } = drive, b = world.box, bm = world.beam, H = layout.hop, B = layout.boom;
  const put = (o, hd) => { const g = new THREE.Group(); g.position.set(o.x, GROUND, o.z); g.rotation.y = -hd; scene.add(g); return g; };
  const stripes = (a, c) => tex(64, 64, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = c; g.fillRect(0, 0, 16, 64); g.fillRect(32, 0, 16, 64); });
  const redWhite = stripes('#f4f1e6', '#e0202a');

  // ---- roadworks on the Langestraat: a builder's plank makes a fine ramp ----
  const hd = H.h, len = H.s1 - H.s0, run = len / cos(H.angle), tan = Math.tan(H.angle);
  const rampG = put(H, hd), tilt = (me) => { me.rotation.z = H.angle; return me; };
  rampG.add(tilt(b(run, 0.08, 2.7, '#c9a26b', len / 2, H.tipY / 2 - 0.085, 0)), b(1.0, 0.92, 2.4, '#8a6a45', len - 0.55, 0.46, 0), b(0.8, 0.4, 2.4, '#8a6a45', 2.9, 0.2, 0));
  for (let i = 0; i < 8; i++) for (const z of [-1.34, 1.34]) { const x = ((i + 0.5) / 8) * len; rampG.add(tilt(b(run / 8, 0.16, 0.07, i % 2 ? '#22242a' : '#f7c400', x, x * tan - 0.02, z))); }
  const workers = [];
  for (const o of layout.works) {
    const g = put(o, hd);
    if (o.kind === 'fence') g.add(b(0.05, 0.2, 0.86, '#ffffff', 0, 0.9, 0, { map: redWhite }), b(0.05, 0.2, 0.86, '#ffffff', 0, 0.52, 0, { map: redWhite }), b(0.07, 1.0, 0.07, '#8f949e', 0.02, 0.5, -0.36), b(0.07, 1.0, 0.07, '#8f949e', 0.02, 0.5, 0.36), b(0.5, 0.07, 0.14, '#f7c400', 0.02, 0.035, -0.36), b(0.5, 0.07, 0.14, '#f7c400', 0.02, 0.035, 0.36));
    else if (o.kind === 'cone') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.56, 12), mat('#ff6a13')), band = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.135, 0.1, 12), mat('#ffffff'));
      cone.position.y = 0.32; band.position.y = 0.33; cone.castShadow = true; g.add(cone, band, b(0.44, 0.04, 0.44, '#ff6a13', 0, 0.02, 0));
    } else if (o.kind === 'pit') {
      const sand = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat('#d9b877', { flatShading: true, roughness: 1 })); sand.scale.set(1.0, 0.45, 0.9); sand.position.set(0.5, 0, 0.1); sand.castShadow = true;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 20), mat('#17181b')), lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 20), mat('#5c6068', { metalness: 0.4 }));
      hole.position.set(-0.95, 0.02, 0); lid.position.set(-0.8, 0.2, 0.75); lid.rotation.x = 1.15; g.add(sand, hole, lid, bm([0.5, 0.3, 0.1], [0.2, 1.25, -0.2], 0.05, '#8a5a3a'), b(0.2, 0.26, 0.04, '#8f949e', 0.53, 0.26, 0.13));
    } else if (o.kind === 'worker') {
      const p = person(b, { shirt: '#ff7a1a', pants: '#2d3142', skin: workers.length ? '#8d5a3c' : '#f1c9a5', hair: null, face: 'o' }), side = Math.sign((o.x - H.x) * -sin(hd) + (o.z - H.z) * cos(hd)); // which side of the street
      const hat = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 8, 0, PI * 2, 0, PI / 2), mat('#f7c400', { roughness: 0.4 })); hat.position.y = 0.05; p.head.add(hat, b(0.12, 0.03, 0.3, '#f7c400', 0.2, 0.06, 0));
      p.g.add(b(0.275, 0.07, 0.515, '#e9edf2', 0, 0.3, 0), b(0.275, 0.07, 0.515, '#e9edf2', 0, 0.15, 0)); p.armR.add(b(0.08, 0.11, 0.08, '#ffffff', 0.05, -0.47, 0));
      p.g.position.y = 0.55; g.rotation.y = -(hd - side * PI / 2); g.add(p.g); workers.push({ p, o, face: hd - side * PI / 2 }); // facing the street
    } else if (o.kind === 'digger') {
      const arm = new THREE.Group(); arm.position.set(0.3, 0.95, 0.28); arm.add(bm([0, 0, 0], [0.4, 1.1, 0], 0.14, '#f7c400'), bm([0.4, 1.1, 0], [0.75, 0.5, 0], 0.11, '#f7c400'), b(0.3, 0.3, 0.42, '#2b2e36', 0.78, 0.36, 0));
      g.add(b(1.9, 0.4, 0.34, '#2b2e36', 0, 0.2, -0.44), b(1.9, 0.4, 0.34, '#2b2e36', 0, 0.2, 0.44), b(1.3, 0.5, 1.0, '#f7c400', -0.1, 0.66, 0), b(0.7, 0.8, 0.66, '#f7c400', -0.35, 1.31, -0.12), b(0.74, 0.42, 0.5, '#22344a', -0.35, 1.4, -0.12, { roughness: 0.2 }), b(0.14, 0.1, 0.14, '#ff9a1a', -0.35, 1.76, -0.12, { emissive: '#ff8a00', emissiveIntensity: 1 }), arm);
      g.userData.arm = arm; workers.digger = g;
    } else if (o.kind === 'sign') {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), new THREE.MeshStandardMaterial({ map: tex(256, 256, (c) => { c.fillStyle = '#f7c400'; c.fillRect(0, 0, 256, 256); c.strokeStyle = '#14161c'; c.lineWidth = 12; c.strokeRect(10, 10, 236, 236); c.fillStyle = '#14161c'; c.textAlign = 'center'; c.font = `400 44px ${FONT}`; c.fillText('WERK IN', 128, 96); c.font = `400 34px ${FONT}`; c.fillText('UITVOERING', 128, 146); c.font = `400 30px ${FONT}`; c.fillText('langzaam!', 128, 206); }) }));
      board.rotation.y = -PI / 2; board.position.set(-0.012, 1.55, 0); g.add(board, b(0.04, 0.88, 0.88, '#b99300', 0.02, 1.55, 0), b(0.06, 1.15, 0.06, '#8f949e', 0.03, 0.575, -0.3), b(0.06, 1.15, 0.06, '#8f949e', 0.03, 0.575, 0.3));
    }
  }

  // ---- the fireworks stall on the Zoutstraat ----
  const B_S = B.s, bh = drive.centre(B_S).h, ax = sin(bh), az = -cos(bh), E = { x: B.x + ax * 0.8, z: B.z + az * 0.8 }; // (ax, az): from the stall towards the middle of the street
  const stall = put(B, bh), wreck = put(B, bh);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 0.38), new THREE.MeshStandardMaterial({ map: tex(512, 104, (c) => { c.fillStyle = '#14213d'; c.fillRect(0, 0, 512, 104); c.fillStyle = '#ffd23f'; c.textAlign = 'center'; c.font = `400 78px ${FONT}`; c.fillText('VUURWERK', 256, 80); }) }));
  banner.rotation.y = PI; banner.position.set(0, 1.95, -0.645);
  const roof = b(2.2, 0.07, 1.22, '#ffffff', 0, 2.3, 0, { map: redWhite }); roof.rotation.x = 0.1;
  stall.add(b(2.0, 0.85, 0.8, '#b5834f', 0, 0.425, 0.1), b(2.06, 0.3, 0.86, '#ffffff', 0, 0.62, 0.1, { map: redWhite }), roof, b(1.9, 0.42, 0.04, '#14213d', 0, 1.95, -0.62), banner, b(0.9, 0.2, 0.5, '#8a5a3a', -0.4, 0.95, 0.1));
  for (const x of [-0.95, 0.95]) for (const z of [-0.5, 0.5]) stall.add(b(0.07, 2.25, 0.07, '#e8e2d0', x, 1.125, z));
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8), mat(COLS[i % 6])), tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.14, 8), mat('#e0202a'));
    body.position.y = 0.18; tip.position.y = 0.43; r.add(body, tip, b(0.012, 0.3, 0.012, '#8a5a3a', 0.05, -0.1, 0));
    if (i === 6) { r.scale.setScalar(2.4); r.position.set(0.55, 1.05, 0.05); r.rotation.z = -0.3; } else { r.position.set(-0.72 + i * 0.13, 1.1, 0.02 + (i % 2) * 0.14); r.rotation.z = (i - 2.5) * 0.06; }
    stall.add(r);
  }
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: tex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 6, 64, 64, 64); g.addColorStop(0, 'rgba(12,10,9,.85)'); g.addColorStop(0.6, 'rgba(12,10,9,.5)'); g.addColorStop(1, 'rgba(12,10,9,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }) }));
  scorch.rotation.x = -PI / 2; scorch.position.set(0, 0.03, -0.5);
  const black = '#1b1918'; wreck.add(scorch, b(1.7, 0.22, 0.7, black, 0.1, 0.11, 0.1), b(0.6, 0.4, 0.5, black, -0.6, 0.2, 0.2), bm([-0.95, 0, 0.5], [-0.6, 1.5, 0.3], 0.07, black), bm([0.95, 0, 0.5], [1.1, 1.1, 0.4], 0.07, black), bm([0.95, 0, -0.5], [0.2, 0.5, -0.3], 0.07, black));
  for (let i = 0; i < 5; i++) wreck.add(b(0.1, 0.06, 0.1, '#ff7a1a', -0.6 + i * 0.3, 0.26, 0.1 + (i % 2) * 0.2, { emissive: '#ff5a00', emissiveIntensity: 2 }));
  const flames = [[-0.6, 0.4, 0.2, 0.2], [0.1, 0.22, 0.1, 0.26], [0.6, 0.22, 0.25, 0.18], [-0.15, 0.22, -0.1, 0.15]].map(([x, y, z, r], i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, 0.9, 7), glow(i % 2 ? '#ffd23f' : '#ff7a1a')); f.userData.at = [x, y, z]; wreck.add(f); return f; }); // what is left of the stall burns for a while
  wreck.visible = false;

  // ---- what an explosion is made of ----
  const fx = sparks(scene, 1100), bits = debris(scene, world, 54), soot = puffs(scene, 150, '#3a3836');
  const balls = [['#fff6c8', 1.5], ['#ffb11f', 2.5], ['#ff5a10', 3.3]].map(([c, r], i) => { const me = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), glow(c, { transparent: true, depthWrite: false })); me.userData.r = r; me.renderOrder = 3 - i; me.visible = false; me.position.set(E.x, GROUND + 1.3, E.z); scene.add(me); return me; }); // the white-hot core is drawn last, so it shows through the orange
  // a fireball is not a ball: lobes bulge out of it, mostly towards the open street, then cool to dark smoke that hangs and climbs
  const lobes = Array.from({ length: 8 }, (_, i) => {
    const a = i * 2.4, u = 0.1 + (i % 4) * 0.24, q = sqrt(1 - u * u), me = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), mat('#6a645e', { roughness: 1, emissive: '#ff6410', flatShading: true }));
    Object.assign(me.userData, { dx: cos(a) * q + ax * 0.7, dy: u, dz: sin(a) * q + az * 0.7, r: 0.8 + (i % 3) * 0.3, up: 0.9 + (i % 4) * 0.45 }); me.visible = false; scene.add(me); return me;
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), glow('#fff1cc', { transparent: true, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -PI / 2; ring.position.set(E.x, GROUND + 0.08, E.z); ring.visible = false; scene.add(ring);
  const flash = new THREE.PointLight('#ffb060', 0, 70, 1.7); flash.position.set(E.x, GROUND + 3, E.z); scene.add(flash); // made now, switched on later: adding a light mid-film would stall a frame

  const rockets = []; let age = -1, fuse = 0, left = 0, show = 0, showAt = null, lastS = 0;
  const launch = (x, y, z, vx, vz, col) => rockets.push({ x, y, z, vx, vy: 16 + random() * 9, vz, fuse: 0.75 + random() * 0.55, col });

  // s: where the film starts, so jumping in past the stall does not set it off
  function reset(s = 0) { age = -1; show = 0; lastS = s; rockets.length = 0; fx.clear(); bits.clear(); soot.clear(); stall.visible = true; wreck.visible = false; flash.intensity = 0; ring.visible = false; [...balls, ...lobes].forEach((o) => { o.visible = false; }); }

  // dt is film time: slow motion slows the bang too
  function frame(st, dt, now, events) {
    if (st) {
      if (lastS < B_S - 2 && st.s >= B_S - 2) for (let i = 0; i < 16; i++) { const c = cos(st.yaw), s = sin(st.yaw), k = 4 + random() * 5; fx.emit(st.x - c * 1.9, GROUND + 0.4, st.z - s * 1.9, -ax * k + (random() - 0.5) * 2, 1.5 + random() * 2, -az * k + (random() - 0.5) * 2, 0.7, 0.7, '#ffd27a', 5); } // a backfire: sparks skip across to the stall
      if (lastS < B_S + 3 && st.s >= B_S + 3) { age = 0; fuse = 0.05; left = 15; stall.visible = false; wreck.visible = true; bits.burst(E.x, E.z, ax, az); events?.boom?.(); for (let i = 0; i < 70; i++) { const a = random() * 2 * PI, v = 4 + random() * 9; fx.emit(E.x, GROUND + 1.2, E.z, cos(a) * v, 2 + random() * 9, sin(a) * v, 0.6 + random() * 0.8, 0.9, i % 3 ? '#ffd27a' : '#ffffff', 9); } }
      lastS = st.s;
      for (const w of workers) { // they watch the car come, then throw their arms up as it goes over their heads
        const over = ramp(st.s, H.s1 - 3, H.s1 + 2) * (1 - ramp(st.s, H.land + 14, H.land + 30)), a = atan2(st.z - w.o.z, st.x - w.o.x), turn = atan2(sin(a - w.face), cos(a - w.face));
        w.p.head.rotation.y = -clamp(turn, -1.4, 1.4); w.p.head.rotation.z = over * 0.5; w.p.armR.rotation.z = 1.15 + over * 1.7 + sin(now * 9) * 0.08 * over; w.p.armL.rotation.z = over * 2.85;
      }
      if (workers.digger) workers.digger.userData.arm.rotation.z = sin(now * 0.9) * 0.1;
    }
    if (age >= 0) {
      age += dt; const k = 1 - (1 - Math.min(1, age / 0.45)) ** 3, fade = 1 - ramp(age, 0.2, 1.0);
      balls.forEach((o) => { o.visible = fade > 0; o.scale.setScalar(0.3 + o.userData.r * k); o.material.opacity = fade; o.position.y = GROUND + 1.3 + age * 1.6; });
      ring.visible = age < 0.9; ring.scale.setScalar(1 + age * 14); ring.material.opacity = 0.8 * (1 - age / 0.9);
      flash.intensity = 900 * exp(-age * 5);
      const cool = ramp(age, 0.2, 0.9), gone = 1 - ramp(age, 1.8, 3.6);
      lobes.forEach((o) => { const u = o.userData, d = 0.5 + 2.2 * k + age * 0.45; o.visible = gone > 0; o.position.set(E.x + u.dx * d, GROUND + 1.3 + u.dy * d + age * u.up, E.z + u.dz * d); o.scale.setScalar(u.r * (0.35 + k) * (1 + age * 0.15) * gone); o.material.emissiveIntensity = 1 - cool; }); // solid toon puffs: they shrink away instead of fading
      for (const [t, c] of [[0.3, 1], [0.55, 2], [0.85, 0], [1.2, 3]]) if (age - dt < t && age >= t) { // the crates of fireworks go off one after another
        const x = E.x + (random() - 0.5) * 3 + ax * 1.5, y = GROUND + 2 + random() * 2.5, z = E.z + (random() - 0.5) * 3 + az * 1.5; events?.pop?.();
        for (let j = 0; j < 45; j++) { const a = random() * 2 * PI, u = random() * 2 - 1, q = sqrt(1 - u * u), v = 4.5 + random() * 3; fx.emit(x, y, z, cos(a) * q * v, u * v, sin(a) * q * v, 0.8 + random() * 0.6, 2.2, j % 6 ? COLS[c] : '#ffffff', 4.5); }
      }
      flames.forEach((f, i) => { const h = (0.65 + 0.35 * sin(now * (9 + i * 2.3) + i)) * (1 - ramp(age, 5, 11)); f.visible = h > 0.03; f.scale.set(1, h, 1); f.position.set(f.userData.at[0], f.userData.at[1] + 0.45 * h, f.userData.at[2]); });
      if (age < 4.5 && random() < dt * 34) soot.emit(E.x + (random() - 0.5), GROUND + 0.6, E.z + (random() - 0.5), 1.6 + random(), ax * 0.6, az * 0.6);
      fuse -= dt; while (fuse <= 0 && left > 0) { left--; fuse += 0.1 + random() * 0.28; launch(E.x, GROUND + 1, E.z, ax * 2.2 + (random() - 0.5) * 3, az * 2.2 + (random() - 0.5) * 3, COLS[left % COLS.length]); events?.rocket?.(); }
    }
    if (show > 0 && showAt) { // the finale: rockets from behind the rooftops
      fuse -= dt; while (fuse <= 0 && show > 0) { show--; fuse += 0.25 + random() * 0.4; const a = showAt.a + (random() - 0.5) * 2.4, d = 16 + random() * 14; launch(showAt.x + cos(a) * d, GROUND + 9, showAt.z + sin(a) * d, (random() - 0.5) * 3, (random() - 0.5) * 3, COLS[show % COLS.length]); if (show % 3 === 0) events?.rocket?.(); }
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.fuse -= dt; r.vy -= 5 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      fx.emit(r.x, r.y, r.z, (random() - 0.5) * 1.5, -2, (random() - 0.5) * 1.5, 0.4, 0.75, '#ffd9a0', 2);
      if (r.fuse > 0) continue;
      rockets.splice(i, 1); events?.pop?.();
      for (let j = 0; j < 60; j++) { const a = random() * 2 * PI, u = random() * 2 - 1, q = sqrt(1 - u * u), v = 6.5 + random() * 3; fx.emit(r.x, r.y, r.z, cos(a) * q * v, u * v, sin(a) * q * v, 1.1 + random() * 0.8, 2.6, j % 7 ? r.col : '#ffffff', 4.5); }
    }
    fx.update(dt); bits.update(dt); soot.update(dt);
  }
  return { frame, reset, fireworks(x, z, a, n = 18) { showAt = { x, z, a }; show = n; fuse = 0; } }; // a: the side of (x, z) the rockets go up on, so they are in the picture
}
