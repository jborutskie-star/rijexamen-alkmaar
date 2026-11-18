// The director: loads the city, runs the exam on a clock, points the camera, shows the captions.
import * as THREE from 'three';
import { makeDrive, clamp, lerp, smooth } from './drive.js';
import { buildWorld, canvasTex, inPoly, GROUND } from './world.js';
import { buildCast } from './actors.js';
import { buildStunts } from './stunts.js';
import { makeAudio } from './audio.js';
import { buildSnelweg } from './snelweg.js';
import { buildPolder } from './polder.js';
import { tyreMarks } from './tyre-marks.js';
import { daylight } from './atmosphere.js';

const { PI, sin, cos, atan, tan } = Math, $ = (id) => document.getElementById(id);
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const audio = makeAudio();
const [map, route] = await Promise.all(['data/alkmaar.json', 'data/route.json'].map((f) => fetch(f).then((r) => r.json())));
await Promise.race([Promise.all(['400 40px "Lilita One"', '600 16px Rubik', '700 16px Caveat'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 3000))]);
const drive = makeDrive(route, map.water), { m, L, layout } = drive, R = layout.ramp, H = layout.hop, RV = layout.rev, BS = layout.boom.s, D = layout.donut, W0 = layout.cyclists[0].c?.sm ?? layout.cyclists[0].sm - 13, DK = layout.ducks;
const A9 = { s: m.annabrug + 32, t: 0 }, hw = {}; // the film cuts away to the motorway at A9.s; hw is the car's pose out there

// ---- renderer, sky, light ----
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, stencil: true }); // stencil: the canals are cut out of the ground with it
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
const morning = daylight();
scene.background = morning.sky;
scene.fog = new THREE.Fog('#cfe8fb', 260, 5600); // thin haze: the polder and the horizon stay in view from the rooftops
scene.add(new THREE.HemisphereLight('#e2efff', '#bf9776', 1.36)); // less fill than sun, so shapes keep a lit and a shaded side
const sun = new THREE.DirectionalLight('#fff1d7', 3.05); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 2.1; sun.shadow.bias = -0.00045; sun.shadow.normalBias = 0.06;
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 460 }); scene.add(sun, sun.target);
const cam = new THREE.PerspectiveCamera(55, 1, 0.45, 7000);
const rubber = tyreMarks();
const world = buildWorld(scene, map, drive, renderer.extensions.has('WEBGL_multi_draw'), rubber), cast = buildCast(scene, world, drive, rubber), stunts = buildStunts(scene, world, drive), snel = buildSnelweg(scene, rubber), polder = buildPolder(scene, { rect: world.city });
{ // the signpost at the fork after the Sint Annabrug. She reads it her own way
  const w = layout.wegwijzer, arrow = (g, x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); for (const [px, py] of [[28, 0], [-2, -26], [-2, -11], [-28, -11], [-28, 11], [-2, 11], [-2, 26]]) g.lineTo(px, py); g.fill(); g.restore(); };
  const face = canvasTex(600, 300, (g) => {
    g.fillStyle = '#0a4f9e'; g.fillRect(0, 0, 600, 300); g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(12, 12, 576, 276); g.fillRect(12, 148, 576, 5);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.font = '600 66px Rubik'; arrow(g, 66, 82, PI); g.lineWidth = 8; g.beginPath(); g.arc(150, 82, 24, 0, 7); g.stroke(); g.beginPath(); g.arc(150, 82, 8, 0, 7); g.fill(); g.fillText('Centrum', 196, 84);
    g.fillStyle = '#d42a26'; g.fillRect(34, 186, 118, 76); g.fillStyle = '#ffffff'; g.font = '600 58px Rubik'; g.fillText('A9', 52, 226); g.fillText('Amsterdam', 172, 226); arrow(g, 548, 224, -PI / 2);
  }, false), edge = new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.6 }), board = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.05), [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: face, roughness: 0.5 }), edge]);
  const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.2, 10), edge); board.position.y = 2.6; pole.position.set(0, 1.6, -0.09);
  g.add(board, pole); g.position.set(w.x, GROUND, w.z); const hd = drive.place(w.s, 0).h; g.rotation.y = Math.atan2(-cos(hd), -sin(hd)); board.castShadow = pole.castShadow = true; scene.add(g); // it faces the traffic coming off the bridge
}

// Only glossy finishes need the extra sky lookup. Three shares one prefiltered probe between them.
scene.traverse((object) => {
  if (!object.isMesh) return;
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
    if (material.isMeshStandardMaterial && (material.roughness <= 0.5 || material.metalness > 0.1)) {
      material.envMap = morning.reflection;
      material.envMapIntensity = material === world.canalMaterial ? 1.0 : 0.58;
    }
  }
});

// ---- camera work ----
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const P = (s, off = 0, y = 2) => { const p = drive.place(s, off); return V(p.x, y, p.z); };
const carPt = (st, lx, ly, lz) => V(st.x + cos(st.yaw) * lx - sin(st.yaw) * lz, st.y + GROUND + ly, st.z + sin(st.yaw) * lx + cos(st.yaw) * lz);
const tooClose = (p) => [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].some(([dx, dz]) => world.inside(p.x + dx, p.y, p.z + dz));
const hidden = (a, b) => { const n = Math.max(4, Math.ceil(a.distanceTo(b) / 1.5)); for (let i = 1; i < n; i++) if (world.inside(lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n), lerp(a.z, b.z, i / n))) return true; return false; };
// a camera must be outside every building and able to see its subject; if not, it creeps towards the subject and up
function clearView(eye, subject) { for (let i = 0; i < 16 && (tooClose(eye) || hidden(eye, subject)); i++) { eye.lerp(subject, 0.12); eye.y += 0.45; } return eye; }
const spot = (s, off, y, anchor = s) => clearView(P(s, off, y), P(anchor, 0, 1));
const freeSide = (s0, s1, d, y = 1.5) => { const bad = (sg) => { let n = 0; for (let s = s0; s <= s1; s += 4) n += tooClose(P(s, sg * d, y)); return n; }; return bad(1) <= bad(-1) ? d : -d; };

const chase = (back = 9, up = 3.2, side = 0, fov = 58, ahead = 3) => (st) => ({ eye: P(st.s - back, side, up + st.y * 0.7), look: carPt(st, ahead, 0.9, 0), fov, rate: 7 });
const front = (dist = 11, up = 1.3, side = 0.6, fov = 50) => (st) => ({ eye: P(st.s + dist, side, up), look: carPt(st, 0, 0.9, 0), fov, rate: 9 });
const closeup = (fov = 44) => (st) => ({ eye: carPt(st, 1.3, 1.4, 0.55), look: carPt(st, -0.2, 1.34, 0.36), fov, rate: 0 }); // just inside the windscreen, looking the examiner in the eye
const hood = (fov = 52) => (st) => ({ eye: carPt(st, 2.75, 1.45, 0), look: carPt(st, -0.3, 1.3, 0), fov, rate: 0 });
// a camera on a tripod: it pans with the car and zooms in while the car is far away
const fixed = (eye, fov = 50, aim) => (st) => { const look = aim || carPt(st, 0, 0.8, 0); return { eye, look, fov: aim ? fov : clamp((2 * atan(6.5 / eye.distanceTo(look)) * 180) / PI, 14, fov), rate: 0, lock: true }; };
// a fixed camera is tried in many spots; the one that sees the car for most of its shot, from low and close, wins
function pick(cands, s0, s1) {
  let best = cands[0], top = -1e9;
  for (const c of cands) {
    if (tooClose(c)) continue;
    let n = 0, all = 0, near = 1e9; for (let s = s0; s <= s1; s += 2, all++) { const p = P(s, 0, 1); n += !hidden(c, p); near = Math.min(near, Math.hypot(c.x - p.x, c.z - p.z)); }
    const score = (n / all) * 100 - c.y * 2 - Math.abs(near - 7) * 1.5 - (near < 3.6 ? 1000 : 0); // never in the car's way
    if (score > top) { top = score; best = c; }
  }
  return best;
}
function corner(mark, s0, s1, fov = 52) {
  const c = [], a = drive.centre(mark - 12);
  for (const y of [1.1, 2.4, 4.5, 8, 13]) {
    for (let d = 16; d <= 34; d += 3) c.push(V(a.x + cos(a.h) * d, y, a.z + sin(a.h) * d)); // straight on past the bend, where the car would go if it did not turn
    for (let s = mark - 8; s <= mark + 30; s += 3) for (const off of [3.2, -3.2, 4.5, -4.5]) c.push(P(s, off, y));
  }
  return fixed(pick(c, s0, s1), fov);
}
const grid = (sA, sB, offs, ys) => { const c = []; for (const y of ys) for (let s = sA; s <= sB; s += 2) for (const o of offs) c.push(P(s, o, y), P(s, -o, y)); return c; };
const canalSide = freeSide(m.dam + 36, m.annabrug - 52, 8);
const parkShot = fixed(spot(L + 2, -4.2, 1.8, L), 60); // only once the car is near: from down the street this was a long lens on a speck
const parkTrack = (st) => ({ eye: P(st.s + 6, -3.6, 1 + st.y), look: carPt(st, 0, 0.8, 0), fov: 52, rate: 6 }); // alongside on the houses' side as it swings round, the quay and the crowd behind it
// The emergency stop in four takes: from duck height as the car comes at them, side on as it stands on its nose, the examiner's face, then from the canal as the last ducklings file past and the car leaves.
const duckCam = P(DK.s + 2.4, -1.1, 0.34), noseCam = P(DK.s + 3.4, -3.1, 0.45), canalCam = P(DK.s + 2.2, 10.8, 2.6); // the last one stands on the Kuipersbrug
const duckStop = (st) => {
  const t = simT - DK.tHalt;
  if (t < -0.2) return { key: 'duck', eye: duckCam, look: P(DK.halt + 0.4, 0, 0.85), fov: 60, rate: 0, lock: true };
  if (t < 1.2) return { key: 'nose', eye: noseCam, look: P(DK.halt + 1, -0.2, 1), fov: 52, rate: 0, lock: true };
  if (t < 1.95) return { key: 'duckface', ...closeup(42)(st) };
  return { key: 'canal', eye: canalCam, look: P(DK.s - 3.2, 5.2, 0.2), fov: 50, rate: 0, lock: true };
};
// The frozen cheese carriers in front, the car whirling round behind them. The camera stands still too, so it is plain that they do not move
const carriersEye = V(D.x - 6.8, 1.45, D.z), carriersShot = (st) => ({ eye: carriersEye, look: V(lerp(D.x, st.x, 0.2), 1.15, lerp(D.z, st.z, 0.2)), fov: 62, rate: 0, lock: true });
// The drawbridge, from over the canal: the tour boat below, the car above
const canalCam2 = P(R.s1 + 9, -23, 0.9);
const SHOTS = [ // [from this many metres along the route, camera]
  [0, fixed(spot(17, 2.4, 0.8, 8), 55)],
  [12, chase(8, 2.8)],
  [m.lange - 24, corner(m.lange, m.lange - 24, m.lange + 10)],
  [m.lange + 10, chase(7, 2.2, 0, 68)],
  [W0 - 18, chase(13, 7, 0, 55, 8)],
  [W0 + 78, hood()],
  [W0 + 128, chase(8, 2.4, 0, 64)],
  [H.s0 - 66, closeup()],
  [H.s0 - 40, chase(9, 2.4, 0, 60, 10)],
  [H.s1 - 2, fixed(pick(grid(H.s0 + 2, H.land - 2, [3.8, 4.4, 5, 6], [0.7, 1.3, 2.2]).filter((p) => layout.solids.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 3.2)), H.s1 - 2, H.land - 6), 52)] /* the flat spin over the roadworks, side on and in one take */,
  [H.land - 7, fixed(pick(grid(H.land + 4, H.land + 11, [0.8, 1.6, 2.4], [0.6, 1.2, 2]), H.land - 7, H.land + 4), 50)],
  [H.land + 5, closeup()],
  [m.mient - 40, corner(m.mient, m.mient - 40, m.mient + 12)],
  [m.mient + 12, chase(8, 2.8, 1.2)],
  [m.waagIn - 12, chase(11, 5)],
  [m.donut - 10, fixed(V(D.x + 6, 36, D.z + 22), 52, V(D.x, 0, D.z))],
  [m.donut + 48, carriersShot],
  [m.donut + 96, hood(58)],
  [m.donut + 128, chase(8, 3)],
  [m.voordam + 8, front()],
  [m.zijdam - 16, corner(m.zijdam, m.zijdam - 16, m.zijdam + 10)],
  [m.zijdam + 10, chase(7, 2.2, 0, 66)],
  [DK.halt - 22, duckStop],
  [RV.a0 - 5, chase(11, 5, 0, 56, 0)],
  [RV.a1 + 2, chase(6.5, 1.7, 0, 46, 0)] /* driving backwards: the camera follows the nose, so both faces show */,
  [RV.a1 + 28, closeup()],
  [RV.a1 + 54, (st) => ({ eye: P(st.s + 3, canalSide, 1.5), look: carPt(st, 0, 0.8, 0), fov: 50, rate: 6 })],
  [m.annabrug - 52, corner(m.annabrug, m.annabrug - 52, m.annabrug + 9)],
  [m.annabrug + 9, fixed(P(layout.wegwijzer.s - 7, 4.6, 2), 50, P(layout.wegwijzer.s + 4, 1.2, 1.6))] /* on the quay by the signpost: she shoots past it, straight on to the A9 */,
  [A9.s, hood()] /* the flight back dives down in front of the car and ends on his face, just as he sees the bridge is open */,
  [m.bridgeN - 38, chase(9, 2.3, 0, 60, 10)],
  [R.s1 - 3, (st) => ({ eye: canalCam2, look: carPt(st, 0, 0.1, 0), fov: 42, rate: 0, lock: true })] /* from over the canal: the tour boat below, the car above */,
  [R.s1 + 12, chase(5, 15, 0, 62, 2)], // from above the rooftops: the car rolling over the street
  [R.s1 + 21, fixed(pick(grid(R.land + 6, R.land + 16, [1.4, 2.2, 3], [0.7, 1.4, 2.4]), R.s1 + 14, R.land + 2), 48)],
  [R.land + 2, corner(m.zout, R.land + 2, m.zout + 10)],
  [m.zout + 10, chase(8, 2.6)],
  [BS - 6, front(12, 1.5, -1.2, 50)] /* looking back: the stall goes up behind the car */,
  [BS + 18, closeup()],
  [BS + 36, corner(m.limmer, BS + 36, m.limmer + 10)],
  [m.limmer + 10, chase(8, 2.8)],
  [m.willems - 4, chase(11, 5)],
  [L - 52, closeup()] /* eyes shut, hands together */,
  [L - 32, parkTrack], [L - 11.5, parkShot],
];
const INTRO = 21.6, mill = world.windmill, waag = map.pois.Waag, kerk = map.pois['Grote of Sint-Laurenskerk'];
function introShot(T, st) {
  if (T < 3.5) { const A = mill.face, d = 34 - T * 0.8, sd = -10 + T * 0.9; return ['mill', { eye: V(mill.x + sin(A) * d - cos(A) * sd, 1.9 + T * 0.15, mill.z + cos(A) * d + sin(A) * sd), look: V(mill.x, 14, mill.z), fov: 58, lock: true }]; } // low on the lawn in front, where the sails face
  if (T < 7) { const a = 4.42 + (T - 3.5) * 0.04; return ['kerk', { eye: V(kerk[0] + cos(a) * 62, 2.5, kerk[1] + sin(a) * 62), look: V(kerk[0], 17, kerk[1]), fov: 58, lock: true }]; } // from the open square north of the church
  if (T < 10.5) { const u = (T - 7) / 3.5; return ['waag', { eye: clearView(V(D.x + 8 - u * 5, 2.2 + u * 1.5, D.z - 12), V((D.x + waag[0]) / 2, 10, (D.z + waag[1]) / 2)), look: V(waag[0], 17, waag[1]), fov: 55, lock: true }]; } // sight line checked to a point in front of the Waag: its own middle is solid
  if (T >= 13) return T >= 16.6 && T < 19.1 ? ['far', { eye: clearView(carPt(st, -6.5, 2.4, 0.7), carPt(st, 0, 1, 0)), look: carPt(st, 70, 1.5, 0), fov: 30, lock: true }] : ['exam', closeup(46)(st)]; // the eye test: a long look down the street
  const u = (T - 10.5) / 2.5;
  return ['car', { eye: clearView(carPt(st, 5.2 - u * 1.2, 1.25, -3.4 + u * 0.5), carPt(st, 0, 1, 0)), look: carPt(st, -0.2, 1.15, 0), fov: 45, lock: true }];
}
function outroShot(T, st) {
  const C = cast.CUE;
  if (T < 1) return ['park', parkShot(st)];
  if (T < C.nDoor - 0.3) { const u = ramp(T, 1, C.nDoor); return ['road', { eye: clearView(carPt(st, 3.2 - u * 0.6, 1.35, 5.2 - u * 0.6), carPt(st, -0.2, 1, 1.9)), /* on the diagonal: he falls out flat towards the road, and head-on he was just a head */ look: carPt(st, -0.2, lerp(0.7, 1.1, ramp(T, C.exUp, C.exUp + 1)), 1.9), fov: 48, rate: 4 }]; }
  if (T < C.wide) return ['kerb', { eye: carPt(st, 0.1, 1.45, -4.05 + 0.25 * ramp(T, C.nDoor, C.reveal + 1)), look: carPt(st, lerp(-0.2, -1.5, ramp(T, C.side, C.side + 0.35)), lerp(1.2, 1.45, ramp(T, C.nOut, C.nStand)) + 0.9 * ramp(T, C.hop, C.wide), -1.6), fov: lerp(54, 44, ramp(T, C.hands, C.reveal + 0.6)), rate: 5 }];
  const u = ramp(T, C.wide, C.card + 2);
  return ['hero', { eye: clearView(carPt(st, -0.9, 1.5 + u * 0.2, 5.4 + u * 1.2), carPt(st, -1.5, 2.2, 0)), look: carPt(st, -0.9, 1.9 + u * 0.5, 0), fov: 50, rate: 2 }]; // the photo from the houses' side: the examiner and his stamp, her on the boot, the crowd and the banners behind
}

const eye = V(0, 60, 0), look = V(0, 0, 0); let shotKey = null, fovNow = 55, shake = 0; world.eye = eye; // bystanders step out of the lens
// The flight between the town and the A9, which really are 2 km apart in this world: up over the roofs, across the polder, down onto the next shot.
// Halfway, high up where the car is a speck, the story switches over to the other place
const FLY = 5.4, MID = 2.7; let fly = null;
const BAR = 4 * 60 / 139.5; // the chase track's bar: jumps inside it keep the beat, so the crossfade never stumbles
const cue = (at, late) => { const d = ((audio.pos('chase') - at) % BAR + BAR) % BAR; audio.music('chase', 0.46, 0.8, Math.max(0, at + d - (late && d > 0 ? BAR : 0))); }; // late: never start after `at`, so the track cannot run out before the moment it is aimed at
const takeOff = (out) => { fly = { t: 0, out, e0: eye.clone(), l0: look.clone(), f0: fovNow }; if (!out) A9.simT = simT; audio.fx.whoosh(); };
function flyShot(dt, to, watch) { // to: the shot to land on; watch: what to keep looking at until halfway
  fly.t += dt; const u = Math.min(1, fly.t / FLY), v = Math.min(1, u / 0.92), h = v * v * v * (v * (6 * v - 15) + 10), k = sin(PI * u) ** 2; if (watch && fly.t < MID) fly.l0.lerp(watch, Math.min(1, fly.t / 0.4));
  const e = fly.e0.clone().lerp(to.eye, h), back = V(to.eye.x - to.look.x, 0, to.eye.z - to.look.z).normalize();
  e.y += Math.min(250, Math.hypot(to.eye.x - fly.e0.x, to.eye.z - fly.e0.z) * 0.15) * smooth(u / 0.22) * smooth((1 - u) / 0.3) ** 2; // a steep climb out of the street, 250 m up between the low clouds over town and the high ones, a dive at the end
  e.addScaledVector(back, 40 * smooth(u / 0.3) * smooth((1 - u) / 0.35)); // the dive levels out and comes in along the landing shot's own line of sight, so the last tilt is gentle
  return { eye: e, look: fly.l0.clone().lerp(to.look, smooth((u - 0.06) * 1.35)), fov: lerp(fly.f0, to.fov, smooth(u)) + 6 * k, lock: true }; // the look runs ahead of the eye, so it never points straight down
}
const a9Gate = (() => { const s = snel.shot(0); return { eye: s.eye.clone(), look: s.look.clone(), fov: s.fov }; })(); // where the flight lands on the A9: the first motorway shot
const townShot = (s) => { let i = 0; while (i + 1 < SHOTS.length && SHOTS[i + 1][0] <= s.s) i++; const o = SHOTS[i][1](s); o.key ??= i; if (!o.lock) { o.eye = clearView(o.eye.clone(), o.look); o.lock = true; } return o; }; // cleared here, so film() need not do it again
// The speed camera's photo: the motorway stands still for a moment, in black and white, with the evidence burnt in
const PIC = 1.9; let pic = 0, flashed = false;
const flitsEnd = (() => { const s = snel.timeline.find((x) => x.key === 'flits'); return s ? s.until : snel.T.flash + 0.3; })(); // the photo comes once the flash shot has played out
const photo = (on) => { $('view').classList.toggle('flits', on); $('flits').hidden = !on; hud(!on); if (on) { capUntil = now; cast.smoke.clear(); /* frozen tyre smoke reads as white rocks round the bonnet */ $('flitsV').textContent = Math.round(st.v * 3.6); $('flitsD').textContent = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }); } };
const photoShot = () => ({ eye: carPt(st, 5.2, 1.55, 1.1), look: carPt(st, 0, 1.3, 0.2), fov: lerp(31, 25, smooth(1 - pic / PIC)), lock: true }); // through the windscreen, slowly closer: his face, her helmet. From the side his arms hid his face
function film(key, shot, dt) {
  const want = shot.lock ? shot.eye : clearView(shot.eye.clone(), shot.look);
  if (key !== shotKey || !shot.rate) { eye.copy(want); look.copy(shot.look); fovNow = shot.fov; shotKey = key; }
  else { const k = 1 - Math.exp(-shot.rate * dt); eye.lerp(want, k); look.lerp(shot.look, 1 - Math.exp(-14 * dt)); fovNow = lerp(fovNow, shot.fov, k); if (tooClose(eye)) eye.copy(want); }
  shake = Math.max(0, shake - dt * 2.2);
  cam.position.copy(eye); if (shake > 0) { cam.position.x += sin(now * 53) * shake * 0.16; cam.position.y += sin(now * 67 + 1.3) * shake * 0.16; } // a rumble, not a rattle
  cam.lookAt(look);
  const aspect = innerWidth / innerHeight; // on a tall phone, widen the view so the action still fits
  cam.fov = aspect >= 1.4 ? fovNow : clamp((2 * atan((tan((fovNow * PI) / 360) * 1.4) / aspect) * 180) / PI, fovNow, 100);
  cam.updateProjectionMatrix();
  sun.target.position.copy(look); sun.position.copy(look).add(V(...world.sun));
}

// ---- words on screen ----
const way = (mark) => (drive.centre(mark).k > 0 ? 'rechts' : 'links');
const LINES = [ // [metres along the route, caption, seconds]
  [1, 'The candidate says nothing. The candidate floors it.', 2.8],
  [m.lange - 26, `Examinator: "Bocht naar ${way(m.lange)}. Rustig. RUSTIG!"`, 3],
  [m.lange + 30, '"Dit is een 30-zone. Thirty! Not ninety!"', 2.4],
  [W0 - 5, '"FIETSERS! Mind the cyclists!"', 3],
  [W0 + 104, '"...you missed all of them. How?"', 2.4],
  [H.s0 - 56, '"Wegwerkzaamheden. That means SLOWER."', 2.4],
  [H.s1 - 1, '"WHAT THE HECK ARE YOU DOING?!"', 2.6],
  [H.land + 12, '"We do not jump over the gemeente!"', 2.4],
  [m.mient - 16, `"${way(m.mient)[0].toUpperCase() + way(m.mient).slice(1)}. ${way(m.mient).toUpperCase()}!"`, 2.2],
  [m.waagIn - 10, '"Bij de rotonde rechtdoor..."', 2.4],
  [m.donut + 6, '"That is not a roundabout. That is the kaasmarkt!"', 3.4],
  [m.donut + 46, 'Kaasdrager: "Niet bewegen, Henk. Think of the cheese."', 2.6],
  [m.donut + 84, '"Why are we going round AGAIN?"', 2.6],
  [m.voordam + 4, '"Mirror, signal... never mind."', 2.6],
  [m.zijdam + 12, '"Lovely canal. Please stay out of it."', 2.2],
  [DK.halt - 30, '"EENDJES! Ducks! REMMEN!"', 1.5],
  [RV.a1 + 2, '"Keren, zei ik. In drie keer. That was ONE."', 2.6],
  [RV.a1 + 40, '"Why can I see where we have BEEN?!"', 2.6],
  [RV.b1 + 4, '"Achteruitrijden: voldoende. Now FORWARDS. Like a car."', 2.4],
  [A9.s - 54, '"Zelfstandig rijden. Volg de borden naar het centrum."', 2.4],
  [A9.s - 22, '"Centrum is LINKS. Links! Dat bord zegt A9!"', 2.6],
  [m.anna + 42, '"De brug staat open. Hallo? HALLO?! DE BRUG!"', 3.4],
  [R.s1 - 2, 'Gids: "And on your left, a typical Dutch... oh."', 2.4],
  [R.s1 + 12, '"aaaaaaaaaaaaaaaaaaaaaaaa"', 2.6],
  [R.land + 4, '"Hellingproef... all four wheels landed. Technically a pass."', 2.8],
  [BS + 6, '"...that was not us. Keep driving. KEEP DRIVING."', 3.2],
  [m.limmer + 14, '"Almost there. Just park like a normal person."', 2.8],
  [L - 64, '"Fileparkeren. Gewoon. Fileparkeren. Alsjeblieft."', 2.8],
  [L - 24, '"NOT LIKE THAT!"', 2],
];
const CHECKS = [ // [Dutch, English, ticked at metres, the examiner's note, ticked by hand (at a moment, not at a place)]
  ['Ogentest', 'eye test', 1, 'drie straten ver?!'],
  ['Wegrijden', 'pulling away', 30, 'met rook. Mag.'],
  ['Bocht nemen', 'cornering', m.lange + 25, 'zijwaarts. Telt.'],
  ['Fietsers', 'cyclists', W0 + 190, 'allemaal gemist'],
  ['Wegwerk', 'roadworks', H.land + 6, 'eroverheen. Tja.'],
  ['Rotonde', 'roundabout', m.schapen - 20, 'twee keer rond?!'],
  ['Noodstop', 'emergency stop', DK.halt, 'voor eendjes. Perfect.', true],
  ['Keren', 'turning round', RV.a1 + 3, 'in één keer. Mag dat?'],
  ['Achteruitrijden', 'reversing', RV.b1 + 4, 'kaarsrecht, 50 km/u'],
  ...snel.checks.map(([, nl, en, note]) => [nl, en, A9.s, note, true]),
  ['Zelfstandig rijden', 'solo', A9.s, 'via de A9. Tja.', true],
  ['Hellingproef', 'hill start', R.land + 8, 'vliegend geslaagd'],
  ['Fileparkeren', 'parking', L - 0.3, 'strak. Té strak.'],
];
$('checks').innerHTML = CHECKS.map(([nl, en, , note]) => `<li><i></i><span>${nl} <small>(${en})</small></span><em>${note}</em></li>`).join('');
const fresh = []; // the form is long, so only the two newest notes stay written out
const tick = (i) => { const li = $('checks').children[typeof i === 'number' ? i : CHECKS.findIndex((c) => c[0] === i)]; if (!li || li.classList.contains('done')) return; li.classList.add('done', 'fresh'); fresh.push(li); if (fresh.length > 2) fresh.shift().classList.remove('fresh'); };
const cap = $('cap'), [capA, capB] = cap.children, CPS = 30; let now = 0, capUntil = 0, capText = '', capN = 0, capT0 = 0, capVoice = false;
// captions are typed out; the examiner's own words (in quotes) come with a blip per syllable, like talking in an old game
const say = (text, secs = 2.6) => { capText = text; capN = 0; capT0 = now; capVoice = /^(Examinator: )?"(?!a+"$)/.test(text); capA.textContent = ''; capB.textContent = text; cap.classList.add('on'); capUntil = now + Math.max(secs, text.length / CPS + 1.2); };
function type() {
  const n = Math.min(capText.length, Math.floor((now - capT0) * CPS)); cast.talk(capVoice && n < capText.length);
  if (n === capN) return;
  const ch = capText[n - 1]; if (capVoice && n % 2 === 0 && /[a-zé]/i.test(ch)) audio.fx.blip((/[A-Z]/.test(ch) ? 300 : 215) + (ch.charCodeAt(0) % 6) * 12); // capitals are shouted
  capN = n; capA.textContent = capText.slice(0, n); capB.textContent = capText.slice(n); // the rest is there but invisible, so the box does not jump about
}
const dSeg = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const STREETS = []; // the real street name under the car, every 4 metres
for (let s = 0; s <= L; s += 4) {
  const p = drive.place(s, 0); let best = '', bd = 10;
  for (const r of map.roads) { if (!r.n) continue; if (r.a) { if (inPoly(r.p, p.x, p.z)) { best = r.n; bd = 0; } continue; } for (let i = 0; i + 3 < r.p.length && bd > 0; i += 2) { const d = dSeg(p.x, p.z, r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3]); if (d < bd) { bd = d; best = r.n; } } }
  STREETS.push(best || STREETS.at(-1) || '');
}
const streetAt = (s) => { const i = clamp(Math.round(s / 4), 1, STREETS.length - 2); return STREETS[i - 1] === STREETS[i + 1] ? STREETS[i - 1] : STREETS[i]; };

// ---- the show ----
let phase = 'title', T = 0, prevT = 0, simT = 0, lastS = -1, st = drive.stateAt(0), nextDing = 0, shownStreet = '';
const still = (s) => ({ ...s, v: 0, slide: 0, beta: 0 });
const crossed = (t) => prevT < t && T >= t;
const hud = (on) => { for (const id of ['street', 'speed', 'form']) $(id).hidden = !on; };
const speedo = (v, limit) => { const kmh = Math.round(v * 3.6), el = $('speed'); el.firstElementChild.textContent = kmh; el.lastElementChild.textContent = limit; el.classList.toggle('over', kmh > limit); };
const events = {
  bell: audio.fx.bell, whoosh: audio.fx.whoosh, drumroll: audio.fx.drumroll,
  thud: () => { audio.fx.thud(); shake = 0.5; say('Examinator: "Grond. Lieve, stilstaande grond."', 3); },
  stamp: () => { audio.fx.stamp(); shake = 0.4; $('stamp').classList.add('on'); say('"Ge... geslaagd. But never again."', 3); },
  boom: () => { audio.fx.boom(); shake = 1.3; }, rocket: audio.fx.rocket, pop: audio.fx.pop, plop: audio.fx.plop,
  reveal: () => { audio.fx.fanfare(); audio.fx.cheer(); say('GESLAAGD! Gefeliciteerd, Nikki!', 4.5); $('who').textContent = 'Nikki'; document.title = "Nikki's rijexamen"; stunts.fireworks(st.x, st.z, st.yaw + PI / 2, 26); }, // the first time her name appears anywhere
};

function begin() {
  const q = new URLSearchParams(location.search); // ?at=600 jumps to that many metres, for trying things out
  $('title').hidden = true; $('end').hidden = true; $('end').classList.remove('on'); $('stamp').classList.remove('on');
  for (const li of $('checks').children) li.classList.remove('done', 'fresh'); fresh.length = 0; A9.t = 0; fly = null; pic = 0; flashed = false; photo(false);
  cast.reset(); stunts.reset(+q.get('at') || 0); $('who').textContent = '???'; document.title = 'Het Rijexamen'; audio.stop('calm', 0.3); audio.stop('chase', 0.3); audio.stop('win', 0.3); T = prevT = 0; lastS = -1; shotKey = null; st = drive.stateAt(0);
  if (q.has('at')) { phase = 'drive'; simT = drive.tOf(+q.get('at')); lastS = +q.get('at') - 0.01; hud(true); audio.music('chase', 0.46, 0.05); CHECKS.forEach((c, i) => c[2] < lastS && tick(i)); }
  else { phase = 'intro'; simT = 0; hud(false); audio.music('calm', 0.4, 0.8); }
}

function step(dt) {
  now += dt; prevT = T; T += dt; const wnow = pic ? A9.picNow : now; world.update(wnow); polder.update(wnow); type(); // in the photo the mills and the clouds hold still too
  if (now > capUntil) cap.classList.remove('on');
  if (phase === 'title') {
    cast.frame(still(st), 0, dt, now); const a = now * 0.04 + 2.4;
    film('title', { eye: V(D.x + cos(a) * 125, 78, D.z + sin(a) * 125), look: V(waag[0], 12, waag[1]), fov: 50, lock: true }, dt);
  } else if (phase === 'intro') {
    cast.frame(still(st), 0, dt, now); film(...introShot(T, st), dt);
    if (crossed(0.3)) say('Alkmaar. Nine in the morning.', 2.9);
    if (crossed(3.7)) say('The Grote Kerk. Five hundred years of calm.', 3);
    if (crossed(7.2)) say('Kaasmarkt. Bicycles. Peace and quiet.', 3);
    if (crossed(10.7)) say('And today: one driving exam.', 2.2);
    if (crossed(13.2)) say('Examinator: "Goedemorgen. Ik ben meneer De Vries. Eerst de ogentest."', 3.2);
    if (crossed(16.7)) say('The candidate reads a number plate. Three streets away.', 2.4);
    if (crossed(19.2)) say('"...Dat is ook goed. Rustig wegrijden, graag."', 2);
    if (T >= INTRO) { phase = 'drive'; simT = 0; hud(true); } // the calm music plays on through the talking, until the front wheels lift
  } else if (phase === 'drive') {
    const ts = st.timeScale, was = simT, at = (t) => was < t && simT >= t; simT += dt * ts; st = drive.state(simT);
    cast.frame(st, simT, dt * ts, now, events); stunts.frame(st, dt * ts, now, events);
    for (const [s, text, secs] of LINES) if (lastS < s && st.s >= s) say(text, secs);
    CHECKS.forEach((c, i) => { if (!c[4] && lastS < c[2] && st.s >= c[2]) tick(i); });
    if (lastS < R.s1 && st.s >= R.s1) audio.fx.scream(3.6);
    if (lastS < R.land && st.s >= R.land) { audio.fx.thud(); shake = 1; }
    if (st.s > m.bridgeN - 110 && st.s < R.s1 && now > nextDing && !(fly && !fly.out)) { /* not while we climb away to the A9: she drives this stretch again on the way back */ audio.fx.ding(); nextDing = now + 0.45; }
    if (lastS < H.s1 && st.s >= H.s1) audio.fx.whoosh();
    if (lastS < H.land && st.s >= H.land) { audio.fx.thud(); shake = 0.8; }
    if (at(DK.t0 + 1.5) || at(DK.tHalt + 1.9)) audio.fx.quack(3);
    if (at(DK.tHalt + 0.9)) { audio.fx.thud(); shake = 0.6; } // the tail comes back down
    if (at(DK.tHalt + 1.2)) { say('"...Een noodstop. Voor eendjes. Dat was eigenlijk perfect."', 2.8); tick('Noodstop'); }
    audio.engine(fly ? 0 : st.v, st.slide, st.air, ts); audio.level('chase', ts < 0.9 ? 0.6 : 1); // slow motion ducks the music; slowing the track itself put it out of tune and out of step
    if (lastS < 2.5 && st.s >= 2.5) { audio.stop('calm', 0.4); audio.music('chase', 0.46, 0.05); } // 2.5 m in, the nose comes up (drive.js wheelie): that is where the action music kicks in
    if (!fly && A9.t === 0 && lastS < A9.s && st.s >= A9.s) takeOff(false); // she goes straight on, past the sign: the camera goes up
    if (fly) { film('fly', flyShot(dt, fly.out ? townShot(st) : a9Gate, fly.out ? null : carPt(st, 0, 0.9, 0)), dt); if (fly.out && fly.t >= FLY) fly = null; }
    else { const shot = townShot(st); film(shot.key, shot, dt); }
    speedo(st.v, 30);
    const name = streetAt(st.s); if (name !== shownStreet) { shownStreet = name; $('street').textContent = name; $('street').hidden = !name; }
    if (fly && !fly.out && fly.t >= MID) { phase = 'snelweg'; A9.t = MID - FLY; cue(0); shownStreet = 'A9'; $('street').textContent = 'A9'; $('street').hidden = false; } // high over the polder: from here on it is the motorway's clock
    lastS = st.s;
    if (simT >= drive.duration) { phase = 'outro'; T = prevT = 0; st = drive.stateAt(L); cast.frame(still(st), simT, 0, now); audio.quiet(); audio.stop('chase', 1.4); $('speed').firstElementChild.textContent = 0; $('speed').classList.remove('over'); }
  } else if (phase === 'snelweg') { // the A9: the town's own clock (simT) stands still while this one runs
    let was = A9.t; const ts = snel.timeScale(Math.max(0, was)), hit = (t) => was < t && A9.t >= t;
    if (pic > 0) { pic -= dt; if (pic <= 0) { pic = 0; photo(false); A9.t = was = A9.hold; audio.fx.whoosh(); } } // back to where the film was, on to the next shot
    else { A9.t = Math.min(snel.duration, was + dt * ts); if (!flashed && A9.t >= flitsEnd) { flashed = true; A9.hold = A9.t; A9.t = was = snel.T.flash - 1e-4; pic = PIC; A9.picNow = now; photo(true); } } // the photo shows the instant of the flash, just before its glow
    st = snel.state(Math.max(0, A9.t), hw); st.s = A9.s;
    const fnow = pic ? A9.picNow : now, fdt = pic ? 0 : dt * ts; // a photo is a photo: his arms and the smoke stop too
    snel.frame(A9.t, fnow); cast.frame(st, simT, fdt, fnow); stunts.frame(null, fdt, fnow, events);
    for (const [t, name] of snel.events) if (hit(t)) { audio.fx[name](name === 'heli' ? 14 : undefined); if (name === 'thud' || name === 'boom') shake = name === 'boom' ? 1.2 : 0.6; }
    for (const [t, text, secs] of snel.lines) if (hit(t)) say(`"${text}"`, secs);
    for (const [t, nl] of snel.checks) if (hit(t)) tick(nl);
    audio.engine(fly || pic ? 0 : st.v, st.slide, st.air, ts); audio.level('chase', ts < 0.9 ? 0.6 : 1); speedo(st.v, 100);
    if (!fly && A9.t >= snel.duration - MID) takeOff(true); // off the slip road and up: back to town the way she came
    if (pic) film('a9 photo', photoShot(), dt);
    else if (fly) { film('fly', flyShot(dt, fly.out ? townShot(drive.state(A9.simT)) : a9Gate, fly.out ? carPt(st, 0, 0.9, 0) : null), dt); if (!fly.out && fly.t >= FLY) fly = null; }
    else { const shot = snel.shot(A9.t); film('a9 ' + shot.key, { eye: shot.eye, look: shot.look, fov: shot.fov, lock: true }, dt); }
    if (fly?.out && fly.t >= MID) { phase = 'drive'; simT = A9.simT; st = drive.state(simT); lastS = st.s; shownStreet = null; { let left = 0; for (let t = simT; t < drive.duration; t += 1 / 60) left += 1 / 60 / Math.max(0.05, drive.state(t).timeScale ?? 1); cue(audio.length('chase') - left, true); } /* the town's clock goes back to the take-off, so she drives the same street again while we come down and the run-up to the bridge stays as long as it was */ tick('Zelfstandig rijden'); say('"...We never speak of the A9 again. Nooit."', 2.8); } // high over the polder again: the town's clock runs on
  } else { // getting out, the stamp, the reveal, the card
    const C = cast.outro(T, dt, now, events, prevT); stunts.frame(null, dt, now, events);
    film(...outroShot(T, st), dt);
    if (crossed(C.nDoor)) say('En de kandidaat is...', 2.4);
    if (crossed(C.reveal + 2.4)) audio.fx.speak();
    if (crossed(C.reveal + 3.4)) audio.music('win', 0.5, 1.2);
    if (crossed(C.card)) { hud(false); cap.classList.remove('on'); $('end').hidden = false; requestAnimationFrame(() => $('end').classList.add('on')); }
  }
}

const resize = () => { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; };
addEventListener('resize', resize); resize();
let last = performance.now(), slow = 0, tier = 0;
document.addEventListener('visibilitychange', () => { slow = 0; });
renderer.setAnimationLoop((t) => {
  const raw = (t - last) / 1000, dt = clamp(raw, 0, 0.1); last = t;
  slow = !document.hidden && raw > 1 / 24 ? slow + 1 : 0;
  if (slow > 60 && tier < 3) {
    slow = 0; tier++;
    if (tier === 1) world.setBankReflections(false);
    else if (tier === 2) renderer.setPixelRatio(1);
    else sun.castShadow = false;
  }
  if (!window.exam.hold) step(dt);
  renderer.render(scene, cam);
});

const go = async () => { $('go').disabled = true; try { await audio.start(); } catch (e) { console.warn('continuing without sound', e); } begin(); };
$('go').textContent = 'Start het examen'; $('go').disabled = false; $('go').onclick = go; $('again').onclick = begin;

// Camera check, the partner of tools/check.mjs: plays the whole film without drawing it and counts the frames where
// the camera is inside a building or cannot see the car. Run exam.audit() in the browser console; {} means clean.
window.exam = { hold: false, dbg: { world, renderer, get qualityTier() { return tier; }, drive, cam, SHOTS, snel, polder, A9, audio, tooClose, hidden, P, cast, stunts, carPt, get st() { return st; } }, ff(secs) { for (let i = 0; i < secs * 30; i++) step(1 / 30); renderer.render(scene, cam); return `${phase} T=${T.toFixed(1)} s=${st.s.toFixed(0)} shot=${shotKey}`; }, audit() { begin(); const bad = {}; this.where = {}; /* exam.where: the first spot each problem was seen */ for (let i = 0; i < 9000 && $('end').hidden; i++) { const ph = phase; step(1 / 30); const k = `${phase} ${shotKey}`; if (tooClose(cam.position)) { bad[k + ' inside'] = (bad[k + ' inside'] || 0) + 1; this.where[k] ??= [cam.position.x, cam.position.y, cam.position.z, st.s, fly?.t].map((v) => +(v ?? -1).toFixed(2)); } else if (phase !== 'intro' && ph === phase /* on a cut the picture is still the old scene */ && shotKey !== 'fly' && hidden(cam.position, carPt(st, 0, 1, 0))) bad[k + ' blocked'] = (bad[k + ' blocked'] || 0) + 1; for (const h of cast.poke()) bad[`${phase} clipboard in ${h}`] = (bad[`${phase} clipboard in ${h}`] || 0) + 1; } return bad; } };
