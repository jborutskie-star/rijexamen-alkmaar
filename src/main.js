// The director: loads the city, runs the exam on a clock, points the camera, shows the captions.
import * as THREE from 'three';
import { makeDrive, clamp, lerp, smooth } from './drive.js';
import { buildWorld, canvasTex, inPoly, GROUND } from './world.js';
import { buildCast } from './actors.js';
import { buildStunts } from './stunts.js';
import { makeAudio } from './audio.js';

const { PI, sin, cos, atan, tan } = Math, $ = (id) => document.getElementById(id);
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const audio = makeAudio();
const [map, route] = await Promise.all(['data/alkmaar.json', 'data/route.json'].map((f) => fetch(f).then((r) => r.json())));
await Promise.race([Promise.all(['400 40px "Lilita One"', '600 16px Rubik', '700 16px Caveat'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 3000))]);
const drive = makeDrive(route, map.water), { m, L, layout } = drive, R = layout.ramp, H = layout.hop, RV = layout.rev, BS = layout.boom.s, D = layout.donut, W0 = layout.cyclists[0].c?.sm ?? layout.cyclists[0].sm - 13, DK = layout.ducks;

// ---- renderer, sky, light ----
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, stencil: true }); // stencil: the canals are cut out of the ground with it
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
// the sky is a dome round the camera, so it turns with the view: deep blue overhead, pale only right at the horizon
const sky = new THREE.Mesh(new THREE.SphereGeometry(6200, 24, 24), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, map: canvasTex(4, 512, (g) => {
  const s = g.createLinearGradient(0, 0, 0, 512); [[0, '#0a47b8'], [0.3, '#1670e0'], [0.42, '#3f9cf2'], [0.475, '#8ccafa'], [0.5, '#cfe8fb'], [1, '#cfe8fb']].forEach(([t, c]) => s.addColorStop(t, c)); g.fillStyle = s; g.fillRect(0, 0, 4, 512);
}, false) }));
sky.renderOrder = -1; sky.frustumCulled = false; sky.onBeforeRender = (r, sc, c) => { sky.position.copy(c.position); sky.updateMatrixWorld(); }; scene.add(sky);
scene.fog = new THREE.Fog('#cfe8fb', 260, 5600); // thin haze: the polder and the horizon stay in view from the rooftops
scene.add(new THREE.HemisphereLight('#dcecff', '#b98f66', 1.25)); // less fill than sun, so shapes keep a lit and a shaded side
const sun = new THREE.DirectionalLight('#ffedc4', 3.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 460 }); scene.add(sun, sun.target);
const cam = new THREE.PerspectiveCamera(55, 1, 0.45, 7000);
const world = buildWorld(scene, map, drive), cast = buildCast(scene, world, drive), stunts = buildStunts(scene, world, drive);

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
const parkShot = fixed(spot(L + 2, -4.2, 3.2, L), 60);
// The emergency stop in four takes: from duck height as the car comes at them, side on as it stands on its nose, the examiner's face, then from the canal as the last ducklings file past and the car leaves.
const duckCam = P(DK.s + 2.4, -1.1, 0.34), noseCam = P(DK.s + 3.4, -3.6, 0.45), canalCam = P(DK.s + 2.2, 10.8, 2.6); // the last one stands on the Kuipersbrug
const duckStop = (st) => {
  const t = simT - DK.tHalt;
  if (t < -0.2) return { key: 'duck', eye: duckCam, look: P(DK.halt + 0.4, 0, 0.85), fov: 60, rate: 0, lock: true };
  if (t < 1.2) return { key: 'nose', eye: noseCam, look: P(DK.halt + 1, -0.2, 1), fov: 52, rate: 0, lock: true };
  if (t < 1.95) return { key: 'duckface', ...closeup(42)(st) };
  return { key: 'canal', eye: canalCam, look: P(DK.s - 3.2, 5.2, 0.2), fov: 50, rate: 0, lock: true };
};
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
  [H.s1 - 2, fixed(pick(grid(H.s0 + 2, H.land - 2, [3.8, 4.4, 5, 6], [0.7, 1.3, 2.2]).filter((p) => layout.solids.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 3.2)), H.s1 - 2, H.land), 52)] /* the hop over the roadworks, side on */,
  [H.s1 + 6, closeup(48)],
  [H.land - 6, fixed(pick(grid(H.land + 4, H.land + 11, [0.8, 1.6, 2.4], [0.6, 1.2, 2]), H.land - 6, H.land + 4), 50)],
  [H.land + 5, closeup()],
  [m.mient - 40, corner(m.mient, m.mient - 40, m.mient + 12)],
  [m.mient + 12, chase(8, 2.8, 1.2)],
  [m.waagIn - 12, chase(11, 5)],
  [m.donut - 10, fixed(V(D.x + 6, 36, D.z + 22), 52, V(D.x, 0, D.z))],
  [m.donut + 48, fixed(V(D.x, 3.6, D.z), 62)],
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
  [m.annabrug + 9, chase(8, 2.8)],
  [m.anna + 34, hood()],
  [m.bridgeN - 38, chase(9, 2.3, 0, 60, 10)],
  [R.s1 - 3, fixed(pick(grid(R.s0 - 4, R.s1 + 12, [10, 14, 18, 22, 26], [1.2, 2.5, 4]), R.s1 - 3, R.s1 + 14), 44)] /* from the canal, side on */,
  [R.s1 + 14, fixed(pick(grid(R.land + 6, R.land + 16, [1.4, 2.2, 3], [0.7, 1.4, 2.4]), R.s1 + 14, R.land + 2), 48)],
  [R.land + 2, corner(m.zout, R.land + 2, m.zout + 10)],
  [m.zout + 10, chase(8, 2.6)],
  [BS - 6, front(12, 1.5, -1.2, 50)] /* looking back: the stall goes up behind the car */,
  [BS + 18, closeup()],
  [BS + 36, corner(m.limmer, BS + 36, m.limmer + 10)],
  [m.limmer + 10, chase(8, 2.8)],
  [m.willems - 4, chase(11, 5)],
  [L - 52, closeup()] /* eyes shut, hands together */,
  [L - 32, parkShot],
];
const INTRO = 17, mill = world.windmill, waag = map.pois.Waag, kerk = map.pois['Grote of Sint-Laurenskerk'];
function introShot(T, st) {
  if (T < 3.5) { const a = 0.5 + T * 0.06; return ['mill', { eye: clearView(V(mill.x + cos(a) * 36, 8 + T * 0.4, mill.z + sin(a) * 36), V(mill.x, 16, mill.z)), look: V(mill.x, 13.5, mill.z), fov: 50, lock: true }]; }
  if (T < 7) { const a = 4.42 + (T - 3.5) * 0.04; return ['kerk', { eye: V(kerk[0] + cos(a) * 62, 2.5, kerk[1] + sin(a) * 62), look: V(kerk[0], 17, kerk[1]), fov: 58, lock: true }]; } // from the open square north of the church
  if (T < 10.5) { const u = (T - 7) / 3.5; return ['waag', { eye: clearView(V(D.x + 8 - u * 5, 2.2 + u * 1.5, D.z - 12), V((D.x + waag[0]) / 2, 10, (D.z + waag[1]) / 2)), look: V(waag[0], 17, waag[1]), fov: 55, lock: true }]; } // sight line checked to a point in front of the Waag: its own middle is solid
  if (T >= 13) return ['exam', closeup(46)(st)];
  const u = (T - 10.5) / 2.5;
  return ['car', { eye: clearView(carPt(st, 5.2 - u * 1.2, 1.25, -3.4 + u * 0.5), carPt(st, 0, 1, 0)), look: carPt(st, -0.2, 1.15, 0), fov: 45, lock: true }];
}
function outroShot(T, st) {
  const C = cast.CUE;
  if (T < 1) return ['park', parkShot(st)];
  if (T < C.nDoor - 0.3) { const u = ramp(T, 1, C.nDoor); return ['road', { eye: clearView(carPt(st, -0.3 - u * 0.3, 1.25, 6.4 - u * 1.2), carPt(st, -0.2, 1, 1.9)), look: carPt(st, -0.2, lerp(0.7, 1.1, ramp(T, C.exUp, C.exUp + 1)), 1.9), fov: 48, rate: 4 }]; }
  if (T < C.wide) return ['kerb', { eye: carPt(st, 0.1, 1.45, -4.05 + 0.25 * ramp(T, C.nDoor, C.reveal + 1)), look: carPt(st, -0.2, lerp(1.2, 1.45, ramp(T, C.nOut, C.nStand)), -1.6), fov: lerp(54, 44, ramp(T, C.hands, C.reveal + 0.6)), rate: 5 }];
  return ['wide', { eye: clearView(carPt(st, -2.5 - (T - C.wide) * 0.12, 1 + (T - C.wide) * 0.04, -13.5), carPt(st, 0, 1.3, -1.2)), look: carPt(st, -0.2, 4.4, -1.4), fov: 58, rate: 2 }]; // from the ground, looking up: the crowd, the houses and the fireworks over the roofs
}

const eye = V(0, 60, 0), look = V(0, 0, 0); let shotKey = null, fovNow = 55, shake = 0; world.eye = eye; // bystanders step out of the lens
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
  [m.lange + 30, '"This is a 30 zone!"', 2.2],
  [W0 - 5, '"FIETSERS! Mind the cyclists!"', 3],
  [W0 + 104, '"...you missed all of them. How?"', 2.4],
  [H.s0 - 56, '"Wegwerkzaamheden. That means SLOWER."', 2.4],
  [H.s1 - 1, '"WHAT THE HECK ARE YOU DOING?!"', 2.6],
  [H.land + 12, '"We do not jump over the gemeente!"', 2.4],
  [m.mient - 16, `"${way(m.mient)[0].toUpperCase() + way(m.mient).slice(1)}. ${way(m.mient).toUpperCase()}!"`, 2.2],
  [m.waagIn - 10, '"Bij de rotonde rechtdoor..."', 2.4],
  [m.donut + 6, '"That is not a roundabout. That is the kaasmarkt!"', 3.4],
  [m.donut + 80, '"Why are we going round AGAIN?"', 2.8],
  [m.voordam + 4, '"Mirror, signal... never mind."', 2.6],
  [m.zijdam + 12, '"Lovely canal. Please stay out of it."', 2.2],
  [DK.halt - 30, '"EENDJES! Ducks! REMMEN!"', 1.5],
  [RV.a1 + 2, '"Keren, zei ik. In drie keer. That was ONE."', 2.6],
  [RV.a1 + 40, '"Why can I see where we have BEEN?!"', 2.6],
  [RV.b1 + 4, '"Thank you. Forwards. Like a car."', 2.6],
  [m.anna + 30, '"De brug staat open. Hallo? HALLO?! DE BRUG!"', 3.6],
  [R.s1 + 2, '"aaaaaaaaaaaaaaaaaaaaaaaa"', 3.8],
  [R.land + 4, '"All four wheels. Technically correct."', 2.8],
  [BS + 6, '"...that was not us. Keep driving. KEEP DRIVING."', 3.2],
  [m.limmer + 14, '"Almost there. Just park like a normal person."', 2.8],
  [L - 64, '"Fileparkeren. Gewoon. Fileparkeren. Alsjeblieft."', 2.8],
  [L - 24, '"NOT LIKE THAT!"', 2],
];
const CHECKS = [ // [Dutch, English, ticked at metres, the examiner's note]
  ['Wegrijden', 'pulling away', 30, 'met rook'],
  ['Bocht nemen', 'cornering', m.lange + 25, 'zijwaarts'],
  ['Fietsers', 'cyclists', W0 + 190, 'allemaal gemist'],
  ['Wegwerk', 'roadworks', H.land + 6, 'eroverheen'],
  ['Rotonde', 'roundabout', m.schapen - 20, 'twee keer?!'],
  ['Achteruitrijden', 'reversing', RV.b1 + 4, 'met 50 km/u'],
  ['Brug oversteken', 'bridge', R.land + 8, 'hij stond open'],
  ['Fileparkeren', 'parking', L - 0.3, 'in één keer'],
];
$('checks').innerHTML = CHECKS.map(([nl, en, , note]) => `<li><i></i><span>${nl} <small>(${en})</small></span><em>${note}</em></li>`).join('');
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
  for (const li of $('checks').children) li.classList.remove('done');
  cast.reset(); stunts.reset(+q.get('at') || 0); $('who').textContent = '???'; document.title = 'Het Rijexamen'; audio.stop('calm', 0.3); audio.stop('chase', 0.3); audio.stop('win', 0.3); T = prevT = 0; lastS = -1; shotKey = null; st = drive.stateAt(0);
  if (q.has('at')) { phase = 'drive'; simT = drive.tOf(+q.get('at')); lastS = +q.get('at') - 0.01; hud(true); audio.music('chase', 0.46, 0.05); CHECKS.forEach((c, i) => c[2] < lastS && $('checks').children[i].classList.add('done')); }
  else { phase = 'intro'; simT = 0; hud(false); audio.music('calm', 0.4, 0.8); }
}

function step(dt) {
  now += dt; prevT = T; T += dt; world.update(now); type();
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
    if (crossed(13.2)) say('Examinator: "Goedemorgen. Ik ben meneer De Vries. Rustig wegrijden, graag."', 3.6);
    if (T >= INTRO) { phase = 'drive'; simT = 0; hud(true); audio.stop('calm', 0.25); audio.music('chase', 0.46, 0.05); }
  } else if (phase === 'drive') {
    const ts = st.timeScale, was = simT, at = (t) => was < t && simT >= t; simT += dt * ts; st = drive.state(simT);
    cast.frame(st, simT, dt * ts, now, events); stunts.frame(st, dt * ts, now, events);
    for (const [s, text, secs] of LINES) if (lastS < s && st.s >= s) say(text, secs);
    CHECKS.forEach((c, i) => { if (lastS < c[2] && st.s >= c[2]) $('checks').children[i].classList.add('done'); });
    if (lastS < R.s1 && st.s >= R.s1) audio.fx.scream(3.6);
    if (lastS < R.land && st.s >= R.land) { audio.fx.thud(); shake = 1; }
    if (st.s > m.bridgeN - 110 && st.s < R.s1 && now > nextDing) { audio.fx.ding(); nextDing = now + 0.45; }
    if (lastS < H.s1 && st.s >= H.s1) audio.fx.whoosh();
    if (lastS < H.land && st.s >= H.land) { audio.fx.thud(); shake = 0.8; }
    if (at(DK.t0 + 1.5) || at(DK.tHalt + 1.9)) audio.fx.quack(3);
    if (at(DK.tHalt + 0.9)) { audio.fx.thud(); shake = 0.6; } // the tail comes back down
    if (at(DK.tHalt + 1.2)) say('"...Een noodstop. Voor eendjes. Dat was eigenlijk perfect."', 2.8);
    audio.engine(st.v, st.slide, st.air, ts); audio.rate('chase', Math.max(0.5, ts));
    let i = 0; while (i + 1 < SHOTS.length && SHOTS[i + 1][0] <= st.s) i++;
    const shot = SHOTS[i][1](st); film(shot.key ?? i, shot, dt);
    const kmh = Math.round(st.v * 3.6); $('speed').firstElementChild.textContent = kmh; $('speed').classList.toggle('over', kmh > 30);
    const name = streetAt(st.s); if (name !== shownStreet) { shownStreet = name; $('street').textContent = name; $('street').hidden = !name; }
    lastS = st.s;
    if (simT >= drive.duration) { phase = 'outro'; T = prevT = 0; st = drive.stateAt(L); cast.frame(still(st), simT, 0, now); audio.quiet(); audio.stop('chase', 1.4); $('speed').firstElementChild.textContent = 0; $('speed').classList.remove('over'); }
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
let last = performance.now();
renderer.setAnimationLoop((t) => { const dt = clamp((t - last) / 1000, 0, 0.1); last = t; if (!window.exam.hold) step(dt); renderer.render(scene, cam); });

const go = async () => { $('go').disabled = true; try { await audio.start(); } catch (e) { console.warn('continuing without sound', e); } begin(); };
$('go').textContent = 'Start het examen'; $('go').disabled = false; $('go').onclick = go; $('again').onclick = begin;

// Camera check, the partner of tools/check.mjs: plays the whole film without drawing it and counts the frames where
// the camera is inside a building or cannot see the car. Run exam.audit() in the browser console; {} means clean.
window.exam = { hold: false, dbg: { world, drive, cam, SHOTS, tooClose, hidden, P, cast, stunts, carPt, get st() { return st; } }, ff(secs) { for (let i = 0; i < secs * 30; i++) step(1 / 30); renderer.render(scene, cam); return `${phase} T=${T.toFixed(1)} s=${st.s.toFixed(0)} shot=${shotKey}`; }, audit() { begin(); const bad = {}; for (let i = 0; i < 9000 && $('end').hidden; i++) { step(1 / 30); const k = `${phase} ${shotKey}`; if (tooClose(cam.position)) bad[k + ' inside'] = (bad[k + ' inside'] || 0) + 1; else if (phase !== 'intro' && hidden(cam.position, carPt(st, 0, 1, 0))) bad[k + ' blocked'] = (bad[k + ' blocked'] || 0) + 1; for (const h of cast.poke()) bad[`${phase} clipboard in ${h}`] = (bad[`${phase} clipboard in ${h}`] || 0) + 1; } return bad; } };
