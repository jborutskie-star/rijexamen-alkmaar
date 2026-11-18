// De snelweg: the A9 south of town. First half of this file is the plan (plain numbers and pure functions of time, runs under node
// for tools/check-snelweg.mjs); the second half builds the meshes from that plan.
import * as THREE from 'three';
import { asphaltGrain } from './street-finish.js';
import { GROUND, mat, canvasTex } from './world.js';

const { PI, sin, cos, tan, atan2, hypot, min, max, abs, floor, sqrt } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, u) => a + (b - a) * u;
const sm = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const ramp = (t, a, b) => sm((t - a) / (b - a));
const bump = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
const keyed = (K, col = 1) => (t) => { // [[t, value...], ...] eased from key to key
  if (t <= K[0][0]) return K[0][col];
  for (let i = 1; i < K.length; i++) if (t < K[i][0]) return K[i - 1][col] + (K[i][col] - K[i - 1][col]) * sm((t - K[i - 1][0]) / (K[i][0] - K[i - 1][0]));
  return K[K.length - 1][col];
};
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

// ---------------------------------------------------------------- the road, in plan ----------------------------------------------------------------
export const Z0 = 1900, X0 = -3200, X1 = 3200; // centre line of the motorway, and where its furniture starts and stops
export const CORRIDOR = { z0: Z0 - 45, z1: Z0 + 90, x0: -6600, x1: 6600 }; // the polder leaves this strip to the motorway
export const CAR = { len: 4, wid: 1.8, hgt: 1.55 };
// metres south of the centre line: fast lane, middle lane, slow lane, hard shoulder (or the extra lane where a ramp joins)
const L1 = 3.85, L2 = 7.35, L3 = 10.85, SH = 14.35, RAMPZ = 30, EDGE = 16.1, WIDE = 19.6, RW = 3.5;
const TOP = 0.775; // the car's box sits on its wheels: centre this high

// vehicle kinds: boxes [x0, y0, z0, x1, y1, z1] around the middle of the footprint (x forward, z to the right), wheels [x, r, width, track]
export const KINDS = {
  car: { len: 4.2, box: [[-2.1, 0, -0.9, 2.1, 1.5, 0.9]], wheels: [[1.3, 0.36, 0.28, 0.8], [-1.3, 0.36, 0.28, 0.8]] },
  truck: { len: 16.5, box: [[5.7, 0, -1.25, 8.25, 3.6, 1.25], [-8.25, 0, -1.28, 5.5, 4.0, 1.28]], wheels: [[7.0, 0.55, 0.36, 1.06], [4.0, 0.55, 0.36, 1.06], [-4.9, 0.55, 0.36, 1.06], [-6.2, 0.55, 0.36, 1.06], [-7.5, 0.55, 0.36, 1.06]] },
  caravan: { len: 12.4, box: [[1.5, 0, -0.9, 5.8, 1.55, 0.9], [-5.7, 0, -1.12, 1.5, 2.8, 1.12], [-6.6, 0.5, -0.95, -5.7, 2.3, 0.95]], wheels: [[4.9, 0.36, 0.28, 0.8], [2.5, 0.36, 0.28, 0.8], [-3.0, 0.36, 0.28, 1.0]] },
  bus: { len: 12.6, box: [[-6.3, 0, -1.28, 6.3, 3.55, 1.28]], wheels: [[4.3, 0.52, 0.34, 1.06], [-3.3, 0.52, 0.34, 1.06], [-4.6, 0.52, 0.34, 1.06]] },
  tractor: { len: 4.6, box: [[-2.3, 0, -1.1, 2.3, 3.0, 1.1]], wheels: [[1.45, 0.5, 0.34, 0.8], [-0.95, 0.9, 0.5, 0.82]] },
  // the wind turbine blade on its way to the polder: a tractor unit, a long blade, a dolly, and nothing but air in between
  blade: { len: 38, box: [[-17, 0, -1.25, -12.5, 2.45, 1.25], [12, 0, -1.25, 18.5, 1.5, 1.25], [15.2, 0, -1.25, 18.5, 3.5, 1.25], [12.2, 1.5, -1.0, 14.6, 2.45, 1.0], [-19, 2.45, -1.25, 15, 4.5, 1.25]], wheels: [[17.3, 0.55, 0.36, 1.06], [13.9, 0.55, 0.36, 1.06], [12.7, 0.55, 0.36, 1.06], [-13.4, 0.5, 0.36, 1.06], [-14.8, 0.5, 0.36, 1.06], [-16.2, 0.5, 0.36, 1.06]] },
  // the car transporter: an empty deck that runs from the road at the back up over the cab. u = x + 10 is metres along the deck
  transporter: { len: 26, box: [[11, 0, -1.25, 16, 3.3, 1.25], [0.5, 0, -1.25, 16, 0.95, 1.25], [-5.1, 0, -1.2, -2.9, 0.45, 1.2]], wheels: [[-4, 0.24, 0.3, 0.95], [14.6, 0.55, 0.36, 1.06], [11.6, 0.55, 0.36, 1.06], [3.2, 0.5, 0.36, 1.06], [4.5, 0.5, 0.36, 1.06], [5.8, 0.5, 0.36, 1.06]] },
};
export const DECK = { len: 20, foot: -10, half: 1.32, y: (u) => (u <= 0 ? 0 : 0.12 * u + 0.0045 * u * u) }; // the launch deck: height u metres from its foot
for (let i = 0; i < 10; i++) for (const s of [-1, 1]) { // its kerbs, as boxes for the audit
  const a = DECK.y(2 * i), b = DECK.y(2 * i + 2);
  KINDS.transporter.box.push([DECK.foot + 2 * i, max(0.03, a - 0.2), s > 0 ? DECK.half : -DECK.half - 0.14, DECK.foot + 2 * i + 2, b + 0.16, s > 0 ? DECK.half + 0.14 : -DECK.half]);
}
export const HELI = { rotor: 4.4, ladder: 5.5, swing: 0.3, lamp: [2.1, -1.35, 0], hook: [-0.4, -1.5, 1.05] }; // the helicopters, sizes in metres
export const COP = { len: 4.2, wid: 1.8, hgt: 1.75 }; // a police car, light bar included
export const CHEESE = { r: 0.45, h: 0.32 }; // a Gouda wheel: toy sized, so it reads at 64 m/s

export function makePlan() {
  // ---- the car: speed along the road (piecewise linear), so the distance is exact and time can be scrubbed ----
  const dT = 2; // seconds added after the speed camera: room for the cheese and a slower helicopter arrival. Everything before t = 9 is untouched
  const tD = 4.5; // the middle of the dart through the convoy
  const tBl = 15.2 + dT, tR0 = 18.3 + dT; // under the blade; front of the car's middle reaches the foot of the deck
  const vTr = 26, vCar = 66, rel = vCar - vTr;
  const tT = tR0 + (DECK.len - 1.25) / rel; // front wheels reach the lip: take-off
  const G = 11, y0 = (DECK.y(20) + DECK.y(17.5)) / 2, vy0 = rel * (DECK.y(20) - DECK.y(17.5)) / 2.5, p0 = atan2(DECK.y(20) - DECK.y(17.5), 2.5);
  const air = (vy0 + sqrt(vy0 * vy0 + 2 * G * y0)) / G, tL = tT + air, tApex = tT + vy0 / G;
  const SPEED = [[0, 54], [2, 58], [4.2, 60], [6, 64], [13.6 + dT, 64], [14.5 + dT, 50], [15.7 + dT, 50], [17.6 + dT, vCar], [tL, vCar], [tL + 0.5, 60], [tL + 6, 44]];
  const XS = [-1230]; for (let i = 1; i < SPEED.length; i++) XS.push(XS[i - 1] + (SPEED[i][0] - SPEED[i - 1][0]) * (SPEED[i][1] + SPEED[i - 1][1]) / 2);
  const seg = (t) => { let i = 1; while (i < SPEED.length - 1 && t > SPEED[i][0]) i++; return i; };
  const V = (t) => { const i = seg(t), a = SPEED[i - 1], b = SPEED[i]; return a[1] + (b[1] - a[1]) * clamp((t - a[0]) / (b[0] - a[0]), 0, 1); };
  const X = (t) => { const i = seg(t), a = SPEED[i - 1], b = SPEED[i], d = clamp(t - a[0], 0, b[0] - a[0]); return XS[i - 1] + a[1] * d + (b[1] - a[1]) * d * d / (2 * (b[0] - a[0])) + (t > b[0] ? (t - b[0]) * b[1] : 0); };
  const tOfX = (x) => { let a = 0, b = 40; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (X(m) < x) a = m; else b = m; } return a; };
  const xL = X(tL);

  // ---- the ramps: the on-ramp and the off-ramp follow the line the car drives ----
  const RA0 = -1190, RA1 = -1030, RB0 = xL + 25, RB1 = RB0 + 190;
  const zA = (x) => RAMPZ - (RAMPZ - SH) * ramp(x, RA0, RA1), zB = (x) => SH + (RAMPZ - SH) * ramp(x, RB0, RB1);
  const XV = Math.round(RB1 + 55), XE = XV + 150; // the viaduct, and where the off-ramp ends at a polder road
  const XW = -1290; // where the on-ramp starts at a polder road
  const tEnd = tOfX(XV + 3), D = Math.round(tEnd * 10) / 10;
  const M0 = RA0 - 20, M1 = -800, E0 = Math.round(X(17.2 + dT)), E1 = Math.round(RB0 + 105); // the two stretches with an extra lane
  const GX1 = -1040, GX2 = Math.round(X(tR0) - 80); // the two sign gantries
  const tA1 = tOfX(RA1);

  // ---- sideways: which lane when ----
  const LAT = [[tA1, SH], [tD - 0.2, SH], [tD + 0.2, L2], // the dart through the convoy
    [5.0, L2], [5.35, L1], // round the caravan
    [6.05, L1], [6.55, L3], // tulip truck ahead: right, across everything
    [7.2, L3], [7.6, SH], // cheese truck and bus side by side: the hard shoulder
    [8.3, SH], [8.75, L2], // a tractor on the shoulder: back left in front of the cheese
    [9.4 + dT, L2], [9.75 + dT, L1], // another caravan
    [tBl - 0.65, L1], [tBl + 0.65, SH], // under the blade
    [16.35 + dT, SH], [16.95 + dT, L3], // line up with the transporter
    [tT + 0.25, L3], [tL - 0.25, SH], [40, SH]]; // drift over to the exit lane in the air
  const lat = keyed(LAT);
  const zOff = (t) => { const x = X(t); return t < tA1 ? zA(x) : x > RB0 ? zB(x) : lat(t); };
  const SLOW = [[tD - 0.32, tD + 0.3, 0.25], [tBl - 0.2, tBl + 0.5, 0.35], [tApex - 0.3, tApex + 0.36, 0.22]];
  const timeScale = (t) => { let k = 1; for (const [a, b, s] of SLOW) k -= (1 - s) * bump(t, a - 0.12, a, b, b + 0.12); return k; };

  // ---- traffic: everything drives dead straight at a steady speed, placed by the moment the car is alongside ----
  const traffic = [];
  const meet = (kind, lane, v, t, name = kind, dx = 0) => { const o = { kind, z: Z0 + lane, dir: 1, v, x0: X(t) + dx - v * t, name }; traffic.push(o); return o; };
  const GAP = 8.6, convoyV = 25;
  [-2, -1, 1, 2, 3].forEach((k, i) => meet('truck', L3, convoyV, tD, 'convoy' + i, k < 0 ? -GAP / 2 - 8.25 + (k + 1) * 20 : GAP / 2 + 8.25 + (k - 1) * 20));
  const caravanA = meet('caravan', L2, 26, 5.62, 'caravan A');
  const tulip = meet('truck', L1, 24, 6.95, 'tulip truck');
  const bus = meet('bus', L2, 27, 7.4, 'tour bus');
  const kaas = meet('truck', L3, 24, 8.0, 'cheese truck');
  const tractor = meet('tractor', SH, 9, 10.0, 'tractor'); // far enough ahead that the police can pass the cheese truck on the shoulder
  const caravanE = meet('caravan', L2, 25, 10.05 + dT, 'caravan E');
  const blade = meet('blade', L3, 22, tBl + 0.12, 'blade transport');
  const transporter = meet('transporter', L3, vTr, tR0, 'transporter', -DECK.foot);
  [[L3, 24, 10.9], [L3, 24, 12.0], [L3, 24, 13.1], [L2, 31, 17.0], [L1, 35, 17.9], [L1, 34, 20.2], [L2, 30, 20.9]].forEach(([l, v, t], i) => meet('car', l, v, t + dT, 'car ' + i));
  { const r = rnd(11); // westbound: the other carriageway, north of the middle. One speed per lane, so nobody catches anybody
    for (const [lane, v] of [[L1, 35], [L2, 30], [L3, 24]]) for (let x = -1500 + r() * 80; x < 3300;) { const big = lane === L3 && r() < 0.55; traffic.push({ kind: big ? 'truck' : 'car', z: Z0 - lane, dir: -1, v, x0: x, name: 'westbound' }); x += (big ? 60 : 40) + r() * 220; } }
  traffic.forEach((o, i) => { o.i = i; o.tint = i; });
  const vx = (o, t) => o.x0 + o.dir * o.v * t;

  // ---- the car's pose ----
  const ST = {};
  function state(t, o = ST) {
    t = clamp(t, 0, D);
    const x = X(t), v = V(t), z = zOff(t), dz = (zOff(t + 0.01) - zOff(t - 0.01)) / 0.02;
    let y = 0, pitch = 0, roll = 0, squash = 0, flying = false;
    const u = x - (vx(transporter, t) + DECK.foot);
    if (t >= tT && t < tL) {
      const q = t - tT; flying = true;
      y = y0 + vy0 * q - G * q * q / 2; pitch = lerp(p0, -0.1, sm(q / air)); roll = 2 * PI * sm(sm((q - 0.12) / (air - 0.3)));
    } else if (t < tT && u > -1.3) { const f = DECK.y(u + 1.25), r = DECK.y(u - 1.25); y = (f + r) / 2; pitch = atan2(f - r, 2.5); }
    else if (t >= tL) { pitch = -0.1 * (1 - ramp(t, tL, tL + 0.12)); squash = 0.12 * bump(t, tL, tL + 0.07, tL + 0.12, tL + 0.55); }
    const travel = atan2(dz, v), beta = flying || y > 0 ? 0 : 0.25 * travel;
    o.x = x; o.y = max(0, y); o.z = Z0 + z; o.yaw = travel + beta; o.pitch = pitch; o.roll = roll; o.v = hypot(v, dz); o.travel = travel; o.beta = beta;
    o.slide = flying ? 0 : min(1, abs(dz) / 16 + 0.9 * bump(t, tL, tL + 0.05, tL + 0.3, tL + 0.9)); o.air = flying; o.squash = squash; o.lean = 0; o.k = 0; o.rev = 0; o.timeScale = timeScale(t); o.t = t;
    return o;
  }

  // ---- the helicopters: [0] police, [1] news. They fly in formation with the car: metres ahead of it, height, metres south of the centre line ----
  const tH = 9.6, tLight = 11.5 + dT, tLost = tBl - 0.05, tFound = tBl + 1.15; // they show up far behind and high at tH and take a good three seconds to settle in
  const HK = [
    [[tH, -230, 48, -38], [12.9, -6, 15.5, 6.6], [18.0, -6, 15.5, 6.6], [17.4 + dT, -7, 17.5, 7], [18.5 + dT, 9, 12, 6.8], [tT + 0.3, 9, 14.5, 6.8], [tL - 0.1, -11, 14.5, 6.8], [tL + 2, -16, 23, 6.8], [40, -16, 23, 6.8]], // police: lower and nearer once settled, up again for the second gantry, higher still over the jump so 'sprong' shows the car pass under it, past the ladder
    [[tH + 0.3, -215, 40, 70], [13.3, 9, 14.5, 23.5], [17.4 + dT, 9, 14.5, 23.5], [18.5 + dT, 11, 11.5, 21.5], [tT + 0.3, 11, 17, 21.5], [tL - 0.1, -9, 17, 21.5], [tL + 2, -12, 23, 23], [40, -12, 23, 23]], // news: up out of the way of the jump, which 'sprong' sees from behind it
  ].map((K) => [keyed(K, 1), keyed(K, 2), keyed(K, 3)]);
  const heli = (i, t, o) => { o.x = X(t) + HK[i][0](t); o.y = GROUND + HK[i][1](t); o.z = Z0 + HK[i][2](t) + 0.25 * sin(t * 2.1 + i * 2); o.on = t >= tH + i * 0.3; return o; };
  const C1 = {}, H1 = {};
  // where the searchlight points: the car, a touch late; while she is under the blade it carries straight on down the fast lane
  const light = (t, o) => {
    const c = state(t - 0.015, C1), lost = bump(t, tLost, tLost + 0.25, tFound, tFound + 0.3);
    o.x = c.x + lost * (5 + 4 * sin(t * 6)); o.z = lerp(c.z, Z0 + L1 + 1.5 * sin(t * 4.3), lost); o.y = GROUND + (c.y > 0.3 ? c.y + 0.8 : 0); o.on = t >= tLight && t < tL + 0.95; o.lost = lost; return o; // it lets go at the exit: on the off-ramp the helicopters are out of shot
  };
  const cop = (t, o) => { heli(0, t, H1); const l = HELI.ladder - 1.2; o.x = H1.x + HELI.hook[0] - sin(HELI.swing) * l; o.y = H1.y + HELI.hook[1] - cos(HELI.swing) * l; o.z = H1.z + HELI.hook[2]; return o; };

  // ---- the police: two cars come down the on-ramp after her and hang on her tail. G: metres behind the car, keys [t, gap]; Z: their own line, keys [t, metres south of
  // the centre line]. At the transporter they stand on the brakes from tb at a m/s², and one of them spins round (spin: [from, to, turn])
  const POL = [
    { name: 'police car 1', G: [[0, 60], [3.0, 13], [7.15, 9.5], [17.4, 9.5], [17.9, 11], [18.9, 11], [19.5, 4]], Z: [[8.5, SH], [8.95, L2], [11.55, L2], [11.9, L1], [16.74, L1], [18.04, SH], [tR0 + 0.4, SH], [tR0 + 1.6, 15.6]], tb: tR0 - 0.25, a: 22 }, // on her tail: through the speed camera, under the blade, then alongside on the shoulder
    { name: 'police car 2', G: [[1.6, 160], [8.3, 78], [10.6, 78], [13.4, 6], [16.2, 6], [16.9, 18], [18.6, 12]], Z: [[9.1, SH], [9.3, 16.2], [9.45, 15.9], [9.8, SH], [10.25, SH], [10.65, L3], [12.75, L3], [13.1, L2], [18.5, L2], [19.0, L3], [tR0 + 0.1, L3], [tR0 + 1.7, 14.8]], tb: tR0 - 0.55, a: 30, spin: [tR0 + 0.25, tR0 + 1.7, PI] }, // held up by the cheese, then right behind her for the jump
  ].map((p) => ({ ...p, gap: keyed(p.G), lat: keyed(p.Z) }));
  for (const p of POL) { p.xb = X(p.tb) - p.gap(p.tb); p.vb = V(p.tb) - (p.gap(p.tb + 0.01) - p.gap(p.tb - 0.01)) / 0.02; }
  const polX = (p, t) => { if (t < p.tb) return X(t) - p.gap(t); const q = min(t - p.tb, p.vb / p.a); return p.xb + p.vb * q - p.a * q * q / 2; };
  const polZ = (p, t) => { const x = polX(p, t); return x < RA1 ? zA(x) : p.lat(t); };
  function police(i, t, o) {
    const p = POL[i], x = polX(p, t), v = (polX(p, t + 0.01) - polX(p, t - 0.01)) / 0.02, dz = (polZ(p, t + 0.01) - polZ(p, t - 0.01)) / 0.02;
    o.x = x; o.z = Z0 + polZ(p, t); o.v = v; o.yaw = atan2(dz, max(v, 2)) + (p.spin ? p.spin[2] * sm((t - p.spin[0]) / (p.spin[1] - p.spin[0])) : 0); o.on = x > XW + 3; o.name = p.name; return o;
  }

  // ---- the cheese truck's load: her doors swing open as the car squeezes past, and Gouda wheels bounce out, roll off across the lanes behind her and topple flat ----
  const tDoor = 7.38, door = (t, s) => (1.66 + 0.1 * sin(9 * (t - tDoor) + 2 * s)) * ramp(t, tDoor, tDoor + 0.25); // how far the left (s = -1) and right door stand open, radians
  const doorBoxes = (t, out) => { const cx = vx(kaas, t) - 8.245; for (const s of [-1, 1]) { const a = door(t, s), hz = kaas.z + s * 1.28, tx = cx - 1.26 * sin(a), tz = hz - s * 1.26 * cos(a); out.push([min(cx, tx) - 0.04, 1.4, min(hz, tz) - 0.04, max(cx, tx) + 0.04, 3.9, max(hz, tz) + 0.04, 'cheese truck door']); } };
  // [out at, metres off her middle, speed, slowing down, comes to rest this far south of the centre line, how early it swings out]. Each drops out straight and turns off where it first lands
  const KAAS = [[7.58, 0.45, 17, 4.0, 16.2, 3], [7.77, -0.45, 16, 4.0, 14.2, 2], [8.02, 0.4, 18, 4.4, 16.5, 3], [8.27, -0.4, 16.5, 4.0, 15.1, 2.5], [8.52, 0.45, 17.5, 4.2, 13.7, 2], [8.77, -0.3, 16, 4.0, 16.4, 3]].map(([te, dz, v0, a, zr, k], i) => {
    const hops = []; for (let y = 1.4, vy = 1.2, s = 0; vy > 0.5; y = 0) { const d = (vy + sqrt(vy * vy + 22 * y)) / 11; hops.push([s, d, y, vy]); s += d; vy = 0.45 * (11 * d - vy); } // off the trailer floor, then smaller and smaller hops
    return { te, xr: vx(kaas, te) - 8.25 - 0.62, z0: kaas.z - Z0 + dz, v0, a, zr, k, T: v0 / a, q0: hops[0][1], hops, name: 'Gouda ' + (i + 1) };
  });
  function cheese(i, t, o) {
    const c = KAAS[i], q = t - c.te, u = clamp(q / c.T, 0, 1), w = clamp((q - c.q0) / (c.T - c.q0), 0, 1), { r, h } = CHEESE; // u: how far it has rolled, w: how far it has swung out
    let hop = 0; for (const [s, d, y, vy] of c.hops) if (q >= s && q < s + d) hop = y + vy * (q - s) - 5.5 * (q - s) ** 2;
    const lean = (PI / 2) * sm((q - c.T + 0.85) / 0.75) + 0.3 * sin(q * 15 + i) * (1 - ramp(q, 0.3, 1.4)), yaw = q < c.q0 ? 0 : atan2((c.zr - c.z0) * c.k * (1 - w) ** (c.k - 2) / (c.T - c.q0), c.v0 * (c.T - c.q0) / c.T);
    o.x = c.xr + c.v0 * c.T * (u - u * u / 2); o.z = Z0 + c.z0 + (c.zr - c.z0) * (1 - (1 - w) ** c.k); o.y = hop + r * cos(lean) + (h / 2) * abs(sin(lean)); o.yaw = yaw; o.lean = lean; o.roll = (o.x - c.xr) / r; o.on = q >= 0;
    const e = [-sin(yaw) * cos(lean), -sin(lean), cos(yaw) * cos(lean)].map((a) => r * sqrt(1 - a * a) + (h / 2) * abs(a)); // half sizes of its box, from the axle's direction
    o.box = [o.x - e[0], o.y - e[1], o.z - e[2], o.x + e[0], o.y + e[1], o.z + e[2], c.name]; return o;
  }

  // ---- everything solid that stands still, as boxes [x0, y0, z0, x1, y1, z1, name] (z relative to the centre line) ----
  const fixedBoxes = [], lamps = [], hecto = [];
  const B = (name, x0, y0, z0, x1, y1, z1) => fixedBoxes.push([x0, y0, Z0 + z0, x1, y1, Z0 + z1, name]);
  const railS = [[X0, XW - 20], [M1 + 12, E0 - 12], [XE + 20, X1]]; // outer guardrail, south side
  B('guardrail', X0, 0, -1.25, X1, 0.85, -0.95); B('guardrail', X0, 0, 0.95, X1, 0.85, 1.25); B('guardrail', X0, 0, -18.55, X1, 0.85, -18.25);
  for (const [a, b] of railS) B('guardrail', a, 0, 18.25, b, 0.85, 18.55);
  for (let x = X0 + 25; x < X1; x += 50) if ([GX1, GX2, XV].every((g) => abs(x - g) > 20)) { lamps.push(x); B('lamp post', x - 0.16, 0, -0.16, x + 0.16, 12.2, 0.16); B('lamp', x - 0.35, 11.7, -2.8, x + 0.35, 12.3, 2.8); }
  const wiekX = [vx(blade, 14.6 + dT) + 21.5, vx(blade, 16.1 + dT) + 21.5]; // the 'wiek' camera rides the verge here, looking back: no post in its face
  for (let x = X0 + 50; x < X1; x += 100) for (const s of [-1, 1]) if (s < 0 || (railS.some(([a, b]) => x > a + 5 && x < b - 5) && !(x > wiekX[0] - 30 && x < wiekX[1] + 3))) { hecto.push([x, s * 17.6]); B('hectometre post', x - 0.08, 0, s * 17.6 - 0.3, x + 0.08, 1.3, s * 17.6 + 0.3); }
  const gantries = [{ x: GX1, z0: 0, z1: 20.7, signs: ['amsterdam', 'denhelder'] }, { x: GX2, z0: 0, z1: 20.7, signs: ['amsterdam2', 'afrit'] }];
  for (const g of gantries) { B('gantry post', g.x - 0.3, 0, g.z0 - 0.3, g.x + 0.3, 5.2, g.z0 + 0.3); B('gantry post', g.x - 0.3, 0, g.z1 - 0.3, g.x + 0.3, 5.2, g.z1 + 0.3); B('gantry', g.x - 0.75, 5.2, g.z0 - 0.6, g.x + 0.5, 9.6, g.z1 + 0.6); }
  const tFlash = 8.3, flits = { x: Math.round(X(tFlash) + 4), z: 17.25 }; B('flitspaal', flits.x - 0.3, 0, flits.z - 0.3, flits.x + 0.3, 2.3, flits.z + 0.3);
  const barriers = [[-700, -280, 21.2], [1300, 2300, -21.2]]; for (const [a, b, z] of barriers) B('noise barrier', a, 0, z - 0.25, b, 3.8, z + 0.25);
  // a little scenery close to the road: two stolp farms [x, z, barn dx, barn dz], a distance sign, ditches with reed and poplars where the south guardrail runs (no ramps there)
  const farms = [[-850, 58, 12, 2], [-480, -33, -12, 1]]; for (const [x, z, bx, bz] of farms) { B('farm', x - 7, 0, z - 7, x + 7, 13, z + 7); B('barn', x + bx - 5, 0, z + bz - 3, x + bx + 5, 6.6, z + bz + 3); }
  const sign = { x: -772, z: 20.1 }; B('distance sign', sign.x - 0.3, 0, sign.z - 1.3, sign.x + 0.3, 3.4, sign.z + 1.3);
  const ditches = [[[M1 + 22, E0 - 22], 25.5], [[XE + 30, 1200], 25.5], [[-1400, XV - 30], -25.5], [[XV + 30, 1200], -25.5]]; // [[x0, x1], z]
  const rows = [[M1 + 30, E0 - 30, 42], [-1400, XV - 40, -36]]; // poplars [x0, x1, z]
  const viaduct = { x: XV, half: 6, clear: 5.3, top: 6.5, z0: -24, z1: 42, piers: [0, 23], down: 150 };
  B('viaduct deck', XV - 6, 5.3, -24, XV + 6, 7.7, 42); for (const z of viaduct.piers) B('viaduct pier', XV - 0.6, 0, z - 0.6, XV + 0.6, 5.3, z + 0.6);
  B('viaduct bank', XV - 9, 0, -24 - 150, XV + 9, 7.7, -24); B('viaduct bank', XV - 9, 0, 42, XV + 9, 7.7, 42 + 150);

  const HB = {}, LB = {}, PB = {}, KB = {};
  // every box at time t: the fixed ones near x, the traffic (the cheese truck's doors too), the police cars, the cheese, the helicopters and the rope ladder
  function solids(t, x, reach = 400) {
    const out = fixedBoxes.filter((b) => b[3] > x - reach && b[0] < x + reach);
    for (const o of traffic) { const cx = vx(o, t); if (abs(cx - x) > reach) continue; for (const b of KINDS[o.kind].box) out.push(o.dir > 0 ? [cx + b[0], b[1], o.z + b[2], cx + b[3], b[4], o.z + b[5], o.name] : [cx - b[3], b[1], o.z - b[5], cx - b[0], b[4], o.z - b[2], o.name]); }
    if (t > tDoor && abs(vx(kaas, t) - x) < reach) doorBoxes(t, out);
    for (let i = 0; i < 2; i++) { const p = police(i, t, PB); if (!p.on || abs(p.x - x) > reach) continue; const c = abs(cos(p.yaw)), s = abs(sin(p.yaw)), hx = (c * COP.len + s * COP.wid) / 2, hz = (s * COP.len + c * COP.wid) / 2; out.push([p.x - hx, 0, p.z - hz, p.x + hx, COP.hgt, p.z + hz, p.name]); }
    for (let i = 0; i < KAAS.length; i++) { const k = cheese(i, t, KB); if (k.on && abs(k.x - x) < reach) out.push(k.box); }
    for (let i = 0; i < 2; i++) { const h = heli(i, t, HB); if (!h.on) continue; const n = i ? 'news helicopter' : 'police helicopter';
      out.push([h.x - 2.4, h.y - 1.85, h.z - 1.2, h.x + 3.2, h.y + 1.3, h.z + 1.2, n], [h.x - 7.6, h.y - 0.3, h.z - 0.5, h.x - 2.4, h.y + 1.9, h.z + 0.5, n], [h.x - HELI.rotor, h.y + 1.5, h.z - HELI.rotor, h.x + HELI.rotor, h.y + 1.9, h.z + HELI.rotor, n + ' rotor']);
      if (!i) { const c = cop(t, LB); out.push([c.x - 1.3, c.y - 1.2, c.z - 0.75, h.x + HELI.hook[0] + 0.3, h.y + HELI.hook[1], c.z + 0.75, 'rope ladder']); } }
    return out;
  }

  // ---- the film: [from t, key, about the car?, quick cut?, camera] ----
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), SHOT = { key: '', eye, look, fov: 50, about: true }, S2 = {}, H2 = {}, P2 = {};
  const carPt = (st, f, up, r, o) => o.set(st.x + cos(st.yaw) * f - sin(st.yaw) * r, GROUND + st.y + up, st.z + sin(st.yaw) * f + cos(st.yaw) * r);
  const xJump = X(tApex);
  const SHOTS = [
    [0, 'gantry', false, false, (t, c) => { eye.set(GX1 - 112, 7.2, Z0 + 0.0); const u = ramp(t, 1.5, 2.4); look.set(lerp(GX1, c.x, u), lerp(6.2, 1, u), lerp(Z0 + 9, c.z, u)); return 44; }],
    [2.4, 'invoegen', true, false, (t, c) => { eye.set(c.x + 10.5, 0.8, Z0 + 19); look.set(c.x, 0.9, c.z - 1.2); return 52; }],
    [4.05, 'kier', true, false, (t, c) => { eye.set(c.x - 6, 11.5, Z0 + 14.5); look.set(c.x + 3, 0.4, Z0 + 10.6); return 56; }],
    [4.85, 'slalom', true, false, (t, c) => { eye.set(c.x - 8, 2.3, Z0 + zOff(t - 0.18)); look.set(c.x + 12, 1.1, c.z); return 60; }],
    [6.45, 'bonnet', false, false, (t, c) => { carPt(c, 1.1, 1.53, 0, eye); carPt(c, 12, 0, 0, look); return 70; }], // over the bonnet, 0.55 m clear of it and of the windscreen (the 0.45 m near plane cut the car), tilted so the nose shows
    [8.1, 'flits', true, true, (t, c) => { eye.set(flits.x + 1.2, 3.1, Z0 + flits.z + 0.1); look.set(c.x, 0.9, c.z); return 40; }],
    [8.6, 'kaas', false, false, (t, c) => { const k = vx(kaas, t); eye.set(k - 6, 3.4, Z0 + 16.3); look.set(k - 30, 0.8, Z0 + 10.5); return 55; }], // riding along beside the cheese truck's open doors, looking back at the spill
    [8.75 + dT, 'drone', true, false, (t, c) => { eye.set(c.x - 20, 13.5, Z0 + 17); look.set(c.x + 9, 0, Z0 + 6.5); return 50; }],
    [10.4 + dT, 'helis', true, false, (t, c) => { eye.set(c.x + 12.5, 0.75, Z0 + 5.5); look.set(c.x - 6, lerp(3, 6, ramp(t, 10.4 + dT, 11.6 + dT)), Z0 + 7.5); return 62; }],
    [12.1 + dT, 'zoeklicht', true, false, (t, c) => { heli(0, t, H2); eye.set(H2.x + 2.9, H2.y - 2.5, H2.z + 0.35); look.set(c.x + 2, 0.5, c.z); return 40; }],
    [13.75 + dT, 'agent', false, true, (t, c) => { cop(t, P2); eye.set(P2.x + 6.0, P2.y + 0.9, P2.z + 3.0); look.set(P2.x - 0.6, P2.y - 0.35, P2.z - 0.4); return 54; }],
    [14.6 + dT, 'wiek', true, false, (t, c) => { eye.set(vx(blade, t) + 21.5, 0.9, Z0 + 16.75); look.set(c.x, 1.0, c.z); return 54; }],
    [16.1 + dT, 'aanloop', true, false, (t, c) => { eye.set(c.x - 7.5, 1.7, Z0 + zOff(t - 0.15) + 0.6); look.set(c.x + 22, 2.4, Z0 + L3); return 56; }],
    [tR0 - 0.2, 'oprit', true, true, (t, c) => { eye.set(vx(transporter, t) + 3, 2.2, Z0 + 18.6); look.set(c.x + 1.5, GROUND + c.y + 1, c.z); return 58; }],
    [tT + 0.12, 'sprong', true, false, (t, c) => { eye.set(xJump + 14, 2.6, Z0 + 78); look.set(c.x, GROUND + c.y + 1.6, Z0 + 12); return 30; }],
    [tApex, 'looping', true, false, (t, c) => { eye.set(c.x + 15, GROUND + c.y - 3.2, c.z + 0.4); look.set(c.x, GROUND + c.y + 1.2, c.z - 0.4); return 52; }],
    [tApex + 0.62, 'landing', true, false, (t, c) => { eye.set(xL + 30, 1.1, Z0 + 21.6); look.set(c.x, GROUND + c.y + 0.8, c.z); return clamp(2 * atan2(7, hypot(c.x - eye.x, c.z - eye.z)) * 180 / PI, 26, 56); }],
    [tL + 0.95, 'afrit', true, false, (t, c) => { eye.set(c.x - 8, 1.9, Z0 + zOff(t - 0.1)); look.set(c.x + 18, 1.9, c.z + 0.4); return 58; }],
  ];
  function shot(t) {
    t = clamp(t, 0, D); let i = 0; while (i + 1 < SHOTS.length && SHOTS[i + 1][0] <= t) i++;
    const s = SHOTS[i]; SHOT.key = s[1]; SHOT.about = s[2]; SHOT.fov = s[4](t, state(t, S2)); return SHOT;
  }
  const film = [0]; for (let i = 1; i <= D * 120 + 1; i++) film.push(film[i - 1] + 1 / 120 / timeScale((i - 0.5) / 120)); // film seconds at each 1/120 s of sequence time
  const filmTime = (t) => film[clamp(Math.round(t * 120), 0, film.length - 1)];

  const kmh = (t) => Math.round(V(t) * 3.6);
  const lines = [ // [sequence time, the examiner, seconds]
    [0.3, 'Dit is de A9. Why are we on the A9?!', 2.2], [2.6, 'Goed. Invoegen. Er is geen gat. THERE IS NO GAP.', 1.5], [tD + 0.35, 'Dat was geen gat. Dat was een kier.', 1.8],
    [6.7, 'Inhalen doen we LINKS. Niet over de vluchtstrook!', 1.5], [8.4, 'Dat wordt een dure foto.', 1.4], [9.85, 'Is that... cheese?', 1.1], [11.0, 'Dat reken ik u ook aan.', 1.3],
    [10.3 + dT, 'Nu ook nog een helikopter?! Ik zwaai wel even.', 2], [12.3 + dT, 'We are on the news. Mijn moeder kijkt.', 2], [tBl - 0.4, 'Niet onder de... okay. Onder de wiek.', 2],
    [16.6 + dT, 'Afrit Alkmaar-Centrum. Richting aangeven, graag.', 1.6], [tR0 - 0.1, 'Dat is geen afrit. DAT IS GEEN AFRIT.', 1.4], [tApex - 0.25, 'Ik heb een hypotheek.', 1.6], [tL + 0.4, 'U vergat uw spiegels.', 2.2],
    [tL + 2.75, 'The police would like a word. Na het examen.', 2],
  ];
  const checks = [[tD + 0.45, 'Invoegen', 'merging', `met ${kmh(tD)} km/u`], [9.1, 'Inhalen', 'overtaking', 'over de vluchtstrook']];
  const events = [[1.6, 'siren'], [1.9, 'whoosh'], [tD, 'whoosh'], [tD + 0.45, 'bell'], [5.5, 'whoosh'], [6.6, 'whoosh'], [tDoor, 'creak'], [tFlash, 'flash'], [tFlash + 0.02, 'pop'], [8.9, 'whoosh'], [9.1, 'bell'], [9.0, 'siren'], [tH + 0.6, 'heli'], [17.6, 'siren'],
    ...KAAS.map((c) => [c.te + c.hops[0][1], 'kaas']), [tBl, 'whoosh'], [POL[1].tb, 'skid'], [tR0, 'thud'], [tT, 'whoosh'], [tL, 'boom'], [D - 0.25, 'whoosh']].sort((a, b) => a[0] - b[0]);

  // ---------------------------------------------------------------- the audit ----------------------------------------------------------------
  const M = new THREE.Matrix4(), E = new THREE.Euler(), AX = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], CC = new THREE.Vector3(), W = new THREE.Vector3();
  // the car's box in the world: the same turns the film gives the real car (yaw, then pitch about the axle line, then roll about a line 0.75 m up)
  function carBox(st) {
    M.makeRotationFromEuler(E.set(0, -st.yaw, 0)).multiply(new THREE.Matrix4().makeRotationZ(st.pitch)); CC.set(0, 0.75, 0).applyMatrix4(M);
    M.multiply(new THREE.Matrix4().makeRotationX(st.roll)); M.extractBasis(AX[0], AX[1], AX[2]);
    CC.add(W.set(0, TOP - 0.75, 0).applyMatrix4(M)); CC.x += st.x; CC.y += GROUND + st.y; CC.z += st.z; return { c: CC, ax: AX };
  }
  // separating axes: an oriented box (centre c, axes ax, half sizes h) against an upright one
  function hits(c, ax, h, b) {
    const bc = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], bh = [(b[3] - b[0]) / 2, (b[4] - b[1]) / 2, (b[5] - b[2]) / 2];
    const d = [bc[0] - c.x, bc[1] - c.y, bc[2] - c.z], A = ax.map((a) => [a.x, a.y, a.z]), I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const sep = (L) => { const l = hypot(...L); if (l < 1e-6) return false; let ra = 0, rb = 0; for (let i = 0; i < 3; i++) { ra += h[i] * abs(A[i][0] * L[0] + A[i][1] * L[1] + A[i][2] * L[2]); rb += bh[i] * abs(L[i]); } return abs(d[0] * L[0] + d[1] * L[1] + d[2] * L[2]) > ra + rb; };
    for (const a of A) if (sep(a)) return false; for (const a of I) if (sep(a)) return false;
    for (const a of A) for (const b2 of I) if (sep([a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]])) return false;
    return true;
  }
  const segHits = (a, b, bx, pad = 0) => { let t0 = 0, t1 = 1; for (let i = 0; i < 3; i++) { const o = a.getComponent(i), d = b.getComponent(i) - o, lo = bx[i] - pad, hi = bx[i + 3] + pad; if (abs(d) < 1e-9) { if (o < lo || o > hi) return false; } else { let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u]; t0 = max(t0, u); t1 = min(t1, v); if (t0 > t1) return false; } } return true; };

  function audit({ aspect = 16 / 9, clearance = 0.15 } = {}) {
    const bad = new Map(), note = (k, t, extra = '') => { if (!bad.has(k)) bad.set(k, `${k} at t=${t.toFixed(2)}${extra}`); };
    const half = [CAR.len / 2 + clearance, CAR.hgt / 2 + clearance, CAR.wid / 2 + clearance], st = {}, tgt = new THREE.Vector3(), f = new THREE.Vector3(), r = new THREE.Vector3(), up = new THREE.Vector3();
    let seen = {}, prevKey = '', cutAt = 0;
    const cuts = [];
    for (let i = 0; i <= D * 60; i++) {
      const t = i / 60; state(t, st); const all = solids(t, st.x), { c, ax } = carBox(st);
      for (const b of all) if (hits(c, ax, half, b)) note(`car touches ${b[6]}`, t);
      if (st.y === 0 && !st.air) { const edge = st.z - Z0; if (edge > WIDE + 10 && (st.x < XW || st.x > XE)) note('car leaves the road', t); }
      // camera
      const s = shot(t), e = s.eye;
      if (s.key !== prevKey) { cuts.push([t, s.key]); prevKey = s.key; }
      if (e.y < GROUND + 0.35) note(`camera '${s.key}' below 0.35 m`, t);
      for (const b of all) if (e.x > b[0] - 0.6 && e.x < b[3] + 0.6 && e.y > b[1] - 0.6 && e.y < b[4] + 0.6 && e.z > b[2] - 0.6 && e.z < b[5] + 0.6) note(`camera '${s.key}' inside or within 0.6 m of ${b[6]}`, t);
      if (!s.key.startsWith('bonnet')) { const h2 = [CAR.len / 2 + 0.6, CAR.hgt / 2 + 0.6, CAR.wid / 2 + 0.6]; if (hits(c, ax, h2, [e.x, e.y, e.z, e.x, e.y, e.z])) note(`camera '${s.key}' within 0.6 m of the car`, t); }
      if (s.about) {
        tgt.copy(c); f.copy(s.look).sub(e).normalize(); r.crossVectors(f, up.set(0, 1, 0)).normalize(); up.crossVectors(r, f);
        W.copy(tgt).sub(e); const zc = W.dot(f), k = tan(s.fov * PI / 360), sx = W.dot(r) / (zc * k * aspect), sy = W.dot(up) / (zc * k);
        const o = (seen[s.key] ||= { n: 0, off: 0, hid: 0, t });
        o.n++; if (zc < 0.5 || abs(sx) > 0.95 || abs(sy) > 0.95) o.off++;
        else if (!s.key.startsWith('bonnet')) { let blocked = 0; for (const dy of [0, 0.7]) { tgt.copy(c); tgt.y += dy; if (all.some((b) => segHits(e, tgt, b))) blocked++; } if (blocked === 2) o.hid++; }
      }
    }
    for (const k in seen) { const o = seen[k]; if (o.off / o.n > 0.08) note(`car off screen in shot '${k}' for ${Math.round(100 * o.off / o.n)}% of it`, o.t); if (o.hid / o.n > 0.2) note(`car hidden in shot '${k}' for ${Math.round(100 * o.hid / o.n)}% of it`, o.t); }
    cuts.forEach(([t, k], i) => { const len = filmTime(i + 1 < cuts.length ? cuts[i + 1][0] : D) - filmTime(t), quick = SHOTS.find((s) => s[1] === k)[3]; if (len < (quick ? 0.4 : 1.6)) note(`shot '${k}' lasts only ${len.toFixed(2)} s`, t); });
    // traffic against traffic and against everything that stands still
    for (let i = 0; i <= D * 20; i++) {
      const t = i / 20;
      for (let a = 0; a < traffic.length; a++) { const p = traffic[a], pl = KINDS[p.kind].len / 2 + 0.5, px = vx(p, t);
        for (let b = a + 1; b < traffic.length; b++) { const q = traffic[b]; if (abs(p.z - q.z) < 2.7 && abs(px - vx(q, t)) < pl + KINDS[q.kind].len / 2 + 0.5) note(`${p.name} touches ${q.name}`, t); } }
    }
    for (const o of traffic) for (const b of fixedBoxes) if (b[6] !== 'gantry' && b[6] !== 'viaduct deck' && b[6] !== 'lamp' && abs(o.z - (b[2] + b[5]) / 2) < (b[5] - b[2]) / 2 + 1.4 && b[1] < 4) note(`${o.name} drives through a ${b[6]}`, 0);
    for (let i = 0; i <= D * 30; i++) { const t = i / 30, all = solids(t, X(t), 500); // helicopters against everything else
      for (const h of all) if (/helicopter|ladder/.test(h[6])) for (const b of all) if (b !== h && !/helicopter|ladder/.test(b[6]) && h[0] < b[3] + 0.3 && h[3] > b[0] - 0.3 && h[1] < b[4] + 0.3 && h[4] > b[1] - 0.3 && h[2] < b[5] + 0.3 && h[5] > b[2] - 0.3) note(`${h[6]} touches ${b[6]}`, t);
      const a = heli(0, t, HB), ax0 = a.x, az0 = a.z, ay0 = a.y, b = heli(1, t, LB); if (a.on && b.on && hypot(ax0 - b.x, az0 - b.z) < 2 * HELI.rotor + 2 && abs(ay0 - b.y) < 4) note('the helicopters touch', t); }
    // the police cars (their real turned box) and the cheese against the traffic, everything that stands still, the helicopters and each other; the car's own check above covers the car
    const p = {}, pc = new THREE.Vector3(), pax = [new THREE.Vector3(), new THREE.Vector3(0, 1, 0), new THREE.Vector3()], ph = [COP.len / 2 + 0.1, COP.hgt / 2 + 0.1, COP.wid / 2 + 0.1];
    for (let i = 0; i <= D * 60; i++) { const t = i / 60, all = solids(t, X(t), 500);
      for (let a = 0; a < 2; a++) { police(a, t, p); if (!p.on) continue; pax[0].set(cos(p.yaw), 0, sin(p.yaw)); pax[2].set(-sin(p.yaw), 0, cos(p.yaw)); pc.set(p.x, COP.hgt / 2, p.z);
        for (const b of all) if (b[6] !== p.name && b[0] < p.x + 6 && b[3] > p.x - 6 && b[2] < p.z + 6 && b[5] > p.z - 6 && hits(pc, pax, ph, b)) note(`${p.name} touches ${b[6]}`, t); }
      for (const k of all) if (k[6].startsWith('Gouda')) for (const b of all) if (b !== k && !b[6].startsWith('police') && k[0] < b[3] + 0.1 && k[3] > b[0] - 0.1 && k[1] < b[4] + 0.1 && k[4] > b[1] - 0.1 && k[2] < b[5] + 0.1 && k[5] > b[2] - 0.1) note(`${k[6]} touches ${b[6]}`, t);
    }
    return [...bad.values()];
  }

  // what the car comes within `d` metres of, and when (for tuning the near misses)
  const near = (d) => { const got = new Map(), st = {}, h = [CAR.len / 2 + d, CAR.hgt / 2 + d, CAR.wid / 2 + d]; for (let i = 0; i <= D * 60; i++) { const t = i / 60; state(t, st); const { c, ax } = carBox(st); for (const b of solids(t, st.x)) if (!got.has(b[6]) && hits(c, ax, h, b)) got.set(b[6], t); } return [...got].map(([k, t]) => `${k} (t=${t.toFixed(2)})`); };
  const timeline = SHOTS.map((s, i) => ({ t: s[0], film: filmTime(s[0]), key: s[1], until: i + 1 < SHOTS.length ? SHOTS[i + 1][0] : D }));
  return {
    duration: D, filmDuration: filmTime(D), state, shot, heli, light, cop, traffic, vx, solids, audit, near, lines, checks, events, timeScale, filmTime, timeline, X, zOff,
    police, cheese, door, cheeses: KAAS.length, T: { tA1, tD, tBl, tR0, tT, tApex, tL, tH, tLight, flash: tFlash, door: tDoor }, start: state(0, {}), end: state(D, {}),
    layout: { XW, RA0, RA1, RB0, RB1, XV, XE, M0, M1, E0, E1, zA, zB, gantries, lamps, hecto, flits, barriers, viaduct, railS, xL, L: [L1, L2, L3, SH], EDGE, WIDE, RAMPZ, RW, farms, sign, ditches, rows },
  };
}
let cached; export const getPlan = () => (cached ||= makePlan());

// ================================================================ the meshes ================================================================
const box = (l, h, w) => new THREE.BoxGeometry(l, h, w), cyl = (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, s);
// Ditches, drainage channels and the sea all use the same tiny repeating wave field.
let waterMaterial;
export function countryWater() {
  if (waterMaterial) return waterMaterial;
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * 2 * PI, v = y / size * 2 * PI, i = (y * size + x) * 4;
    const nx = 0.17 * cos(2 * u + 3 * v) + 0.09 * cos(3 * u - v);
    const ny = 0.28 * cos(2 * u + 3 * v) - 0.04 * cos(3 * u - v) + 0.19 * cos(5 * v + sin(u));
    const len = hypot(nx, ny, 1); data.set([128 + nx / len * 127, 128 + ny / len * 127, 128 + 127 / len, 255], i);
  }
  const ripple = new THREE.DataTexture(data, size, size); ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  ripple.magFilter = THREE.LinearFilter; ripple.minFilter = THREE.LinearMipmapLinearFilter; ripple.generateMipmaps = true; ripple.needsUpdate = true;
  waterMaterial = mat('#ffffff', { vertexColors: true, normalMap: ripple, normalScale: new THREE.Vector2(0.54, 0.54), roughness: 0.26, metalness: 0.12 });
  return waterMaterial;
}
// a box rounded off in side view (length along x, standing on y = 0, width along z): everything on the road is a toy
function rb(len, h, wid, r = 0.25, b = 0.06) {
  const w = len / 2 - b, t = h - 2 * b; r = min(r, w, t / 2);
  const s = new THREE.Shape(); s.moveTo(-w + r, 0); s.lineTo(w - r, 0); s.quadraticCurveTo(w, 0, w, r); s.lineTo(w, t - r); s.quadraticCurveTo(w, t, w - r, t); s.lineTo(-w + r, t); s.quadraticCurveTo(-w, t, -w, t - r); s.lineTo(-w, r); s.quadraticCurveTo(-w, 0, -w + r, 0);
  return new THREE.ExtrudeGeometry(s, { depth: wid - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 1, curveSegments: 3 }).translate(0, b, -(wid - 2 * b) / 2);
}
const TURN = { 'z+': (g) => g, 'z-': (g) => g.rotateY(PI), 'x+': (g) => g.rotateY(PI / 2), 'x-': (g) => g.rotateY(-PI / 2), 'y+': (g) => g.rotateX(-PI / 2), 'y-': (g) => g.rotateX(PI / 2) };
// coloured parts and lettered panels merged into one geometry: one draw call per vehicle. Lettering comes from the atlas, the rest samples its white corner
function kit(uv) {
  const p = [], n = [], c = [], t = [], col = new THREE.Color();
  const add = (g, color, x, y, z, rect) => {
    if (g.index) g = g.toNonIndexed(); g.translate(x, y, z); col.set(color);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { p.push(P.getX(i), P.getY(i), P.getZ(i)); n.push(N.getX(i), N.getY(i), N.getZ(i)); c.push(col.r, col.g, col.b); if (rect) t.push(lerp(rect[0], rect[2], U.getX(i)), lerp(rect[1], rect[3], U.getY(i))); else t.push(uv.white[0], uv.white[1]); }
    return k;
  };
  const k = {
    part: (g, color, x = 0, y = 0, z = 0, tile) => add(g, color, x, y, z, uv[tile]),
    decal: (name, w, h, x, y, z, face = 'z+') => add(TURN[face](new THREE.PlaneGeometry(w, h)), '#ffffff', x, y, z, uv[name]),
    both: (name, w, h, x, y, z) => k.decal(name, w, h, x, y, z, 'z+').decal(name, w, h, x, y, -z, 'z-'), // the same panel on both flanks
    geo: () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(t, 2)); return g; },
  };
  return k;
}

// every bit of lettering in one texture
function makeAtlas() {
  const W = 1024, uv = {}, jobs = [], F = (px) => `bold ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const put = (name, w, h, draw) => jobs.push([name, w, h, draw]);
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const text = (g, s, x, y, px, fill, align = 'left') => { g.font = F(px); g.fillStyle = fill; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };
  const arrow = (g, x, y, s, a) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, s); g.lineTo(-s * 0.75, 0); g.lineTo(-s * 0.28, 0); g.lineTo(-s * 0.28, -s); g.lineTo(s * 0.28, -s); g.lineTo(s * 0.28, 0); g.lineTo(s * 0.75, 0); g.closePath(); g.fill(); g.restore(); }; // points down; turn it with a
  const shield = (g, s, x, y, bg, fg) => { g.font = F(34); const w = g.measureText(s).width + 22; g.fillStyle = bg; rr(g, x, y - 23, w, 46, 6); g.fill(); g.strokeStyle = fg; g.lineWidth = 3; g.stroke(); text(g, s, x + 11, y + 2, 34, fg); return w; };
  const panel = (g, w, h) => { g.fillStyle = '#fff'; rr(g, 0, 0, w, h, 20); g.fill(); g.fillStyle = '#1554b4'; rr(g, 6, 6, w - 12, h - 12, 15); g.fill(); };
  put('white', 32, 32, () => {});
  put('amsterdam', 500, 192, (g, w, h) => { panel(g, w, h); const s = shield(g, 'A9', 28, 50, '#d3202c', '#fff'); text(g, 'Amsterdam', 40 + s, 52, 52, '#fff'); text(g, 'Haarlem', 28, 112, 44, '#fff'); arrow(g, 130, 158, 22, 0); arrow(g, 370, 158, 22, 0); });
  put('denhelder', 500, 192, (g, w, h) => { panel(g, w, h); const s = shield(g, 'N9', 28, 50, '#ffd21f', '#111'); text(g, 'Den Helder', 40 + s, 52, 52, '#fff'); text(g, 'Alkmaar', 28, 112, 44, '#fff'); arrow(g, 250, 158, 22, 0); });
  put('afrit', 500, 192, (g, w, h) => { panel(g, w, h); g.strokeStyle = '#fff'; g.lineWidth = 4; rr(g, 26, 22, 150, 50, 8); g.stroke(); text(g, 'Afrit 5', 101, 49, 34, '#fff', 'center'); text(g, 'Alkmaar-Centrum', 26, 122, 50, '#fff'); arrow(g, 440, 60, 26, -PI * 0.75); });
  put('kaas', 500, 128, (g, w, h) => { g.fillStyle = '#ffd43a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2a81d'; g.beginPath(); g.arc(78, 64, 50, 0, PI * 2); g.fill(); g.fillStyle = '#ffd43a'; g.beginPath(); g.moveTo(78, 64); g.arc(78, 64, 52, -0.5, 0.25); g.fill(); g.fillStyle = '#e08a12'; for (const [x, y, r] of [[58, 46, 8], [92, 88, 10], [50, 80, 6], [84, 34, 5]]) { g.beginPath(); g.arc(x, y, r, 0, PI * 2); g.fill(); } text(g, 'KAAS', 150, 60, 96, '#c0271f'); text(g, 'vers van de markt', 156, 110, 22, '#7a4a10'); });
  put('tulp', 500, 128, (g, w, h) => { g.fillStyle = '#ff7fb2'; g.fillRect(0, 0, w, h); text(g, 'TULPEN', 24, 56, 84, '#fff'); text(g, 'recht uit de polder', 30, 108, 22, '#8a1d4f'); ['#e8222e', '#ffd21f', '#8d3fc4', '#fff'].forEach((c, i) => { const x = 372 + i * 32; g.strokeStyle = '#1f8a3a'; g.lineWidth = 5; g.beginPath(); g.moveTo(x, 118); g.lineTo(x, 60); g.stroke(); g.fillStyle = c; g.beginPath(); g.moveTo(x - 13, 62); g.quadraticCurveTo(x - 15, 22, x - 7, 26); g.lineTo(x, 40); g.lineTo(x + 7, 26); g.quadraticCurveTo(x + 15, 22, x + 13, 62); g.quadraticCurveTo(x, 74, x - 13, 62); g.fill(); }); });
  put('bus', 500, 96, (g, w, h) => { g.fillStyle = '#fdfdf8'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(0, 96); g.quadraticCurveTo(180, 20, 500, 70); g.lineTo(500, 96); g.fill(); g.fillStyle = '#19a0c9'; g.beginPath(); g.moveTo(0, 96); g.quadraticCurveTo(220, 50, 500, 86); g.lineTo(500, 96); g.fill(); text(g, 'DAGJE UIT TOURS', 250, 34, 44, '#133a7c', 'center'); });
  put('transport', 256, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); text(g, 'TRANSPORT', 128, 30, 38, '#30343c', 'center'); g.fillStyle = '#30343c'; g.fillRect(14, 52, 228, 5); });
  put('matrix', 96, 96, (g) => { g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, 96, 96); g.strokeStyle = '#ff2a22'; g.lineWidth = 8; g.beginPath(); g.arc(48, 48, 38, 0, PI * 2); g.stroke(); text(g, '100', 48, 51, 36, '#fff', 'center'); });
  put('stop', 64, 64, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 31, 0, PI * 2); g.fill(); g.fillStyle = '#d81e28'; g.beginPath(); g.arc(32, 32, 26, 0, PI * 2); g.fill(); text(g, 'STOP', 32, 34, 18, '#fff', 'center'); });
  put('hm', 64, 64, (g) => { g.fillStyle = '#12854a'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#d3202c'; g.fillRect(8, 6, 48, 22); text(g, 'A9', 32, 18, 19, '#fff', 'center'); text(g, '61,3', 32, 46, 21, '#fff', 'center'); });
  put('politie', 256, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); text(g, 'POLITIE', 128, 34, 50, '#12409a', 'center'); });
  put('nieuws', 256, 64, (g, w, h) => { g.fillStyle = '#e02630'; g.fillRect(0, 0, w, h); text(g, 'NIEUWS', 112, 34, 46, '#fff', 'center'); g.fillStyle = '#fff'; g.beginPath(); g.arc(228, 32, 13, 0, PI * 2); g.fill(); });
  put('lang', 256, 64, (g, w, h) => { g.fillStyle = '#ffd21f'; g.fillRect(0, 0, w, h); for (let i = -1; i < 12; i++) { g.fillStyle = i % 2 ? '#d81e28' : '#fff'; g.beginPath(); g.moveTo(i * 24, 64); g.lineTo(i * 24 + 24, 64); g.lineTo(i * 24 + 40, 46); g.lineTo(i * 24 + 16, 46); g.fill(); } text(g, 'LANG TRANSPORT', 128, 24, 26, '#111', 'center'); });
  put('stripes', 128, 32, (g) => { g.fillStyle = '#ffd21f'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#12409a'; for (let i = -1; i < 6; i++) { g.beginPath(); g.moveTo(i * 32, 32); g.lineTo(i * 32 + 16, 32); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 0); g.fill(); } });
  put('plate', 96, 24, (g) => { g.fillStyle = '#ffcf1a'; g.fillRect(0, 0, 96, 24); g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(1, 1, 94, 22); text(g, '12-TOY-3', 48, 13, 17, '#111', 'center'); });
  put('auto', 256, 48, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); text(g, 'AUTOTRANSPORT', 128, 26, 27, '#d3202c', 'center'); });
  put('kaasrek', 128, 128, (g) => { g.fillStyle = '#2b1d12'; g.fillRect(0, 0, 128, 128); for (const y of [31, 63, 95, 127]) { g.fillStyle = '#7a5530'; g.fillRect(0, y - 3, 128, 4); for (const x of [10, 68]) for (const d of [16, 30]) { g.fillStyle = '#e39a1c'; rr(g, x, y - 3 - d + 2, 50, 13, 6); g.fill(); g.fillStyle = '#ffd84a'; g.fillRect(x + 5, y - 3 - d + 3, 40, 3); } } }); // the inside of the cheese trailer: shelves of Gouda
  put('afstand', 256, 128, (g, w, h) => { panel(g, w, h); text(g, 'Alkmaar', 24, 42, 34, '#fff'); text(g, '3', 232, 42, 34, '#fff', 'right'); text(g, 'Den Helder', 24, 90, 34, '#fff'); text(g, '38', 232, 90, 34, '#fff', 'right'); });
  put('succes', 256, 64, (g, w, h) => { g.fillStyle = '#fbf7ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e6dfc8'; g.lineWidth = 2; for (const x of [64, 128, 192]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, 64); g.stroke(); } g.save(); g.translate(128, 34); g.rotate(-0.03); text(g, 'SUCCES!', 0, 0, 50, '#d81e28', 'center'); g.restore(); });
  // Printed enamel and glass share the existing sign atlas, including the ordinary traffic instances.
  const glazing = (g, w, h, panes) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    for (const [a, c] of [[0, '#7793a3'], [0.36, '#536b7a'], [0.64, '#334550'], [0.68, '#283b49'], [1, '#334754']]) sky.addColorStop(a, c);
    g.fillStyle = '#24333d'; g.fillRect(0, 0, w, h); g.fillStyle = sky; g.fillRect(2, 2, w - 4, h - 4);
    g.strokeStyle = '#8ca4ad'; g.lineWidth = 2;
    for (let i = 0; i < panes; i++) {
      const x = i * w / panes;
      if (i) { g.fillStyle = '#25343b'; g.fillRect(x - 2, 0, 4, h); }
      g.beginPath(); g.moveTo(x + 5, 6); g.lineTo(x + w / panes * 0.76, 6); g.stroke();
    }
  };
  put('glass', 96, 48, (g, w, h) => glazing(g, w, h, 1));
  put('coachGlass', 256, 48, (g, w, h) => glazing(g, w, h, 7));
  put('grille', 96, 48, (g, w, h) => {
    g.fillStyle = '#6b787e'; g.fillRect(0, 0, w, h); g.fillStyle = '#24333d'; g.fillRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#a1b0b6'; for (let y = 8; y < h - 5; y += 8) g.fillRect(8, y, w - 16, 2);
  });
  put('headlight', 88, 42, (g, w, h) => {
    g.fillStyle = '#333f47'; g.fillRect(0, 0, w, h); g.fillStyle = '#a9b5b8'; g.fillRect(3, 3, w - 6, h - 6);
    for (const x of [24, 54]) {
      const r = g.createRadialGradient(x - 3, 18, 2, x, 21, 15); r.addColorStop(0, '#fffce7'); r.addColorStop(0.42, '#d9dccb');
      r.addColorStop(0.74, '#79848a'); r.addColorStop(1, '#ede4c7');
      g.fillStyle = r; g.beginPath(); g.arc(x, 21, 15, 0, 2 * PI); g.fill();
    }
    g.fillStyle = '#eeb246'; g.fillRect(w - 13, 6, 8, h - 12);
  });
  put('rearLamp', 96, 40, (g, w, h) => {
    g.fillStyle = '#593644'; g.fillRect(0, 0, w, h); g.fillStyle = '#d64e46'; g.fillRect(4, 4, 57, h - 8);
    g.fillStyle = '#ef9540'; g.fillRect(65, 4, 27, 14); g.fillStyle = '#c8d3d4'; g.fillRect(65, 22, 27, 13);
    g.fillStyle = 'rgba(255,247,235,.26)'; for (let x = 6; x < 94; x += 7) g.fillRect(x, 5, 2, h - 10);
  });
  put('hub', 64, 64, (g) => {
    g.translate(32, 32);
    const ring = (r, c) => { g.fillStyle = c; g.beginPath(); g.arc(0, 0, r, 0, PI * 2); g.fill(); };
    ring(47, '#8c9699'); ring(28, '#d8dedc'); ring(24, '#555e63');
    for (let i = 0; i < 6; i++) { g.rotate(PI / 3); g.fillStyle = '#c9d0d0'; g.fillRect(-4, -25, 7, 24); }
    ring(10, '#afb9ba'); ring(5, '#71797c');
  });
  const tex = canvasTex(W, W, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, W); let x = 0, y = 0, row = 0;
    for (const [name, w, h, draw] of jobs) { if (x + w > W) { x = 0; y += row + 6; row = 0; } g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); draw(g, w, h);
      if (['kaas', 'tulp', 'transport'].includes(name)) {
        for (let u = 7; u < w; u += 16) { g.fillStyle = 'rgba(70,45,30,.1)'; g.fillRect(u, 0, 1.5, h); g.fillStyle = 'rgba(255,255,245,.24)'; g.fillRect(u + 2, 0, 1, h); }
        g.fillStyle = 'rgba(54,57,53,.4)'; for (let u = 8; u < w; u += 32) { g.fillRect(u, 4, 2, 2); g.fillRect(u, h - 6, 2, 2); }
      }
      g.restore(); uv[name] = [(x + 0.5) / W, 1 - (y + h - 0.5) / W, (x + w - 0.5) / W, 1 - (y + 0.5) / W]; x += w + 6; row = max(row, h); }
  }, false);
  uv.white = [(uv.white[0] + uv.white[2]) / 2, (uv.white[1] + uv.white[3]) / 2];
  return { tex, uv };
}

// flat pieces of ground that never overlap in plan, so nothing can flicker: trapezoids between two x and two z (z measured from the centre line)
class Flat {
  constructor() { this.p = []; this.u = []; this.c = []; this.k = new THREE.Color(); }
  quad(x0, x1, a0, b0, a1, b1, col = '#ffffff', uv) {
    if (b0 - a0 < 1e-4 && b1 - a1 < 1e-4) return;
    const count = Math.max(1, Math.ceil((x1 - x0) / 85)), k = this.k.set(col);
    // Split long straights without changing their painted lane markings or shoulder edges.
    for (let n = 0; n < count; n++) {
      const points = [[n / count, 0], [n / count, 1], [(n + 1) / count, 1], [(n + 1) / count, 0]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const [v, upper] = points[i], x = lerp(x0, x1, v), z = upper ? lerp(b0, b1, v) : lerp(a0, a1, v);
        this.p.push(x, GROUND, Z0 + z); this.c.push(k.r, k.g, k.b);
        if (uv) { const a = uv[upper ? 1 : 0], b = uv[upper ? 2 : 3]; this.u.push(lerp(a[0], b[0], v), lerp(a[1], b[1], v)); }
        else this.u.push(x / 9, z / 9);
      }
    }
  }
  mesh(material) {
    const g = new THREE.BufferGeometry(), n = new Float32Array(this.p.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; return m;
  }
}

export function buildSnelweg(scene) {
  const plan = getPlan(), Y = plan.layout, { tex: atlas, uv } = makeAtlas();
  const { XW, RA0, RA1, RB0, RB1, XV, XE, M0, M1, E0, E1, zA, zB } = Y;
  const still = new THREE.Group(), moving = new THREE.Group(); scene.add(still, moving);
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas, roughness: 0.55 });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q0 = new THREE.Quaternion(), QW = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), DOWN = new THREE.Vector3(0, -1, 0);
  const grain = (g, w, h, n, seed) => { const r = rnd(seed); for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.03 + r() * 0.06})` : `rgba(0,0,0,${0.04 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } };

  // ---- the ground: asphalt with its markings in the texture, verges, the ramps ----
  const asphalt = (span, wide) => canvasTex(256, 512, (g, w, h) => {
    const py = (z) => ((z - 1.5) / span) * h, m = h / span, line = (z, wd) => g.fillRect(0, py(z - wd / 2), w, wd * m), dash = (z, wd, on, every) => { for (let x = 0; x < 12; x += every) g.fillRect((x / 12) * w, py(z - wd / 2), (on / 12) * w, wd * m); };
    g.fillStyle = '#474a51'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f4248'; g.fillRect(0, py(L3 + 1.75), w, h); // the shoulder is a shade darker
    for (const c of wide ? [L1, L2, L3, SH] : [L1, L2, L3]) for (const o of [-0.85, 0.85]) for (const [wd, a] of [[0.9, 0.1], [0.55, 0.12], [0.25, 0.1]]) { g.fillStyle = `rgba(16,16,20,${a})`; g.fillRect(0, py(c + o - wd / 2), w, wd * m); } // where the tyres run
    grain(g, w, h, 9000, 7); asphaltGrain(g, w, h, span); g.fillStyle = '#f4f3ea';
    line(2.0, 0.22); dash(L1 + 1.75, 0.18, 3, 12); dash(L2 + 1.75, 0.18, 3, 12);
    if (wide) { dash(L3 + 1.75, 0.45, 1.5, 3); line(EDGE, 0.22); } else line(L3 + 1.75, 0.22);
  });
  const roadA = new Flat(), roadB = new Flat(), roadC = new Flat(), verge = new Flat();
  const greens = ['#6aa84a', '#73b352', '#62a046', '#7ab85a'], vA = (z) => 1 - (abs(z) - 1.5) / (EDGE - 1.5), vB = (z) => 1 - (z - 1.5) / (WIDE - 1.5);
  // A broken olive shoulder margin between the asphalt and the better-cut grass.
  const vergeEdge = (x0, x1, edge0, field0, edge1, field1, color) => {
    const cut = (x, edge, field) => edge + Math.sign(field - edge)
      * min(abs(field - edge), 1.55 + 0.4 * sin(x * 0.13) + 0.25 * sin(x * 0.31));
    for (let x = x0; x < x1; x += 36) {
      const next = min(x1, x + 36), u = (x - x0) / (x1 - x0), v = (next - x0) / (x1 - x0);
      const e = lerp(edge0, edge1, u), g = lerp(field0, field1, u);
      const en = lerp(edge0, edge1, v), gn = lerp(field0, field1, v);
      const t = cut(x, e, g), tn = cut(next, en, gn), straw = sin(x * 0.031) > 0.2 ? '#819650' : '#8da05e';
      if (field0 >= edge0 && field1 >= edge1) {
        verge.quad(x, next, e, t, en, tn, straw); verge.quad(x, next, t, g, tn, gn, color);
      } else {
        verge.quad(x, next, g, t, gn, tn, color); verge.quad(x, next, t, e, tn, en, straw);
      }
    }
  };
  const sect = (x) => { // the southern half, cut across at x: where the main road ends and where the ramp lies
    const wide = (x > M0 && x < M1) || (x > E0 && x < E1), edge = wide ? WIDE : EDGE;
    let p = x > XW - 4 && x < RA1 + 60 ? zA(x) : x > RB0 - 10 && x < XE + 4 ? zB(x) : null; if (p !== null && p + RW <= edge + 0.01) p = null;
    return { wide, edge, p: p ?? edge - RW, n: p === null ? edge : max(p - RW, edge), s: p === null ? edge : p + RW };
  };
  const xs = [CORRIDOR.x0, XW - 4, XW + 4, M0, M1, E0, E1, XE - 4, XE + 4, CORRIDOR.x1]; for (let x = RA0; x <= RA1 + 60; x += 10) xs.push(x); for (let x = RB0 - 10; x <= RB1 + 1; x += 10) xs.push(x);
  xs.sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1]; if (b - a < 1e-6) continue;
    const A = sect(a + 1e-3), Bq = sect(b - 1e-3), g1 = greens[i % 4], g2 = greens[(i + 2) % 4], S1 = CORRIDOR.z1 - Z0, stub = (a === XW - 4 || a === XE - 4);
    if (A.wide) roadB.quad(a, b, 1.5, WIDE, 1.5, WIDE, '#fff', [[a / 12, vB(1.5)], [a / 12, vB(WIDE)], [b / 12, vB(WIDE)], [b / 12, vB(1.5)]]);
    else roadA.quad(a, b, 1.5, EDGE, 1.5, EDGE, '#fff', [[a / 12, 1], [a / 12, 0], [b / 12, 0], [b / 12, 1]]);
    vergeEdge(a, b, A.edge, A.n, Bq.edge, Bq.n, g1);
    const rv = (z, p) => (z - (p - RW)) / (2 * RW);
    roadC.quad(a, b, A.n, A.s, Bq.n, Bq.s, '#fff', [[a / 8, rv(A.n, A.p)], [a / 8, rv(A.s, A.p)], [b / 8, rv(Bq.s, Bq.p)], [b / 8, rv(Bq.n, Bq.p)]]);
    if (stub) roadC.quad(a, b, A.s, S1, Bq.s, S1, '#fff', [[A.s / 8, 0], [S1 / 8, 0], [S1 / 8, 1], [A.s / 8, 1]]); else vergeEdge(a, b, A.s, S1, Bq.s, S1, g2);
  }
  { const a = CORRIDOR.x0, b = CORRIDOR.x1, N = CORRIDOR.z0 - Z0;
    roadA.quad(a, b, -EDGE, -1.5, -EDGE, -1.5, '#fff', [[a / 12, 0], [a / 12, 1], [b / 12, 1], [b / 12, 0]]);
    vergeEdge(a, b, -EDGE, N, -EDGE, N, greens[1]);
    verge.quad(a, b, -1.5, -0.79, -1.5, -0.79, '#95935e');
    verge.quad(a, b, -0.79, 0.79, -0.79, 0.79, '#839b51');
    verge.quad(a, b, 0.79, 1.5, 0.79, 1.5, '#95935e'); }
  const grass = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); const r = rnd(4); for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? `rgba(20,70,10,${0.05 + r() * 0.12})` : `rgba(255,255,200,${0.05 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 5); } });
  const rampTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#474a51'; g.fillRect(0, 0, w, h); grain(g, w, h, 700, 9); asphaltGrain(g, w, h, 4); g.fillStyle = '#f4f3ea'; g.fillRect(0, 7, w, 4); g.fillRect(0, h - 11, w, 4); });
  [[roadA, asphalt(EDGE - 1.5, false)], [roadB, asphalt(WIDE - 1.5, true)], [roadC, rampTex], [verge, grass]].forEach(([f, map], i) => still.add(f.mesh(mat('#ffffff', { map, bumpMap: map, bumpScale: 0.023, roughness: 0.89, vertexColors: i === 3 }))));

  // ---- everything that stands still ----
  const solid = kit(uv), light = kit(uv), steel = '#aeb6bd', concrete = '#c9c5bb';
  for (const g of Y.gantries) {
    const zc = Z0 + (g.z0 + g.z1) / 2, span = g.z1 - g.z0;
    for (const edge of [g.z0, g.z1]) {
      const z = Z0 + edge;
      for (const side of [-1, 1]) {
        solid.part(box(0.16, 5.36, 0.46).rotateZ(side * 0.036), steel, g.x + side * 0.12, 2.68, z);
      }
      solid.part(box(0.54, 0.45, 0.53), '#79868a', g.x, 0.38, z);
      solid.part(box(0.03, 0.16, 0.23), '#e1b549', g.x - 0.25, 0.53, z);
    }
    for (const y of [5.29, 6.11]) solid.part(box(0.8, 0.18, span + 1.2), steel, g.x, y, zc);
    const bays = Math.ceil(span / 1.8), step = span / bays;
    for (let n = 0; n < bays; n++) for (const side of [-1, 1]) {
      const brace = box(0.11, 0.11, hypot(step, 0.82)).rotateX((n % 2 ? -1 : 1) * atan2(0.82, step));
      solid.part(brace, '#84939b', g.x + side * 0.32, 5.7, Z0 + g.z0 + (n + 0.5) * step);
    }
    for (const z of [g.z0, g.z1]) solid.part(box(0.58, 0.28, 0.58), '#74818b', g.x, 0.14, Z0 + z);
    g.signs.forEach((name, i) => { const z = Z0 + (i ? 14.2 : 5.6); for (const o of [-2.6, 2.6]) solid.part(box(0.2, 3.3, 0.2), steel, g.x - 0.3, 7.8, z + o); solid.part(box(0.16, 3.0, 7.8), '#0f3f8c', g.x - 0.5, 7.9, z).decal(name.replace('2', ''), 7.8, 3.0, g.x - 0.62, 7.9, z, 'x-'); });
    // The black cabinets hang immediately under the blue boards on the approach to Kooimeer.
    for (const centre of [5.6, 14.2]) {
      const z = Z0 + centre;
      solid.part(box(0.25, 1.07, 7.61), '#313b3e', g.x - 0.42, 5.76, z);
      solid.part(box(0.31, 0.12, 7.69), '#1b2426', g.x - 0.43, 5.26, z);
      solid.part(box(0.07, 2.86, 7.73), '#9ca5a7', g.x - 0.38, 7.9, z);
      for (const height of [6.82, 7.93, 9.04]) solid.part(box(0.11, 0.07, 7.63), '#c7cecc', g.x - 0.30, height, z);
    }
    for (const l of [L1, L2, L3, SH]) solid.part(box(0.25, 1.0, 1.0), '#16171a', g.x - 0.52, 5.7, Z0 + l).decal('matrix', 0.9, 0.9, g.x - 0.685, 5.7, Z0 + l, 'x-');
  }
  { const f = Y.flits, z = Z0 + f.z; solid.part(box(0.5, 2.1, 0.5), '#8b9388', f.x, 1.05, z).part(box(0.56, 0.3, 0.56), '#ffd21f', f.x, 1.9, z).part(box(0.08, 0.36, 0.34), '#101216', f.x - 0.27, 1.5, z).part(box(0.6, 0.12, 0.6), '#5d655c', f.x, 2.16, z); }
  { const v = Y.viaduct, x = v.x, zc = Z0 + (v.z0 + v.z1) / 2, len = v.z1 - v.z0, road = '#474a51';
    solid.part(box(12, 1.2, len), concrete, x, 5.9, zc).part(box(8.6, 0.06, len), road, x, 6.53, zc).part(box(11.4, 0.5, len - 0.4), '#a9a59b', x, 5.12, zc);
    for (const s of [-1, 1]) solid.part(box(0.3, 1.1, len), '#3f79c4', x + s * 5.85, 7.05, zc).part(box(0.4, 0.12, len), '#e9eef2', x + s * 5.85, 7.66, zc);
    for (const z of v.piers) solid.part(box(1.2, 4.9, 1.2), concrete, x, 2.45, Z0 + z).part(box(9, 0.5, 1.6), concrete, x, 4.65, Z0 + z);
    solid.part(box(12, 5.3, 3), concrete, x, 2.65, Z0 + v.z0 - 1.5).part(box(12, 5.3, 3), concrete, x, 2.65, Z0 + v.z1 + 1.5);
    solid.decal('succes', 7.2, 1.5, x - 6.04, 6.85, Z0 + RAMPZ - 0.5, 'x-');
    for (const [za, zb] of [[Z0 + v.z0 - 3, Z0 + v.z0 - 3 - v.down], [Z0 + v.z1 + 3, Z0 + v.z1 + 3 + v.down]]) { // the banks the crossing road climbs
      const top = [], side = [], tri = (arr, a, b, c) => arr.push(...a, ...b, ...c), h = 6.5, w = 5, o = w + h * 1.5, far = zb, dir = Math.sign(zb - za);
      const fix = (arr, want) => { for (let i = 0; i < arr.length; i += 9) { const ux = arr[i + 3] - arr[i], uy = arr[i + 4] - arr[i + 1], uz = arr[i + 5] - arr[i + 2], wx = arr[i + 6] - arr[i], wy = arr[i + 7] - arr[i + 1], wz = arr[i + 8] - arr[i + 2]; const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; if (nx * want(i)[0] + ny * want(i)[1] + nz * want(i)[2] < 0) for (let k = 0; k < 3; k++) [arr[i + 3 + k], arr[i + 6 + k]] = [arr[i + 6 + k], arr[i + 3 + k]]; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(arr.length / 3 * 2), 2)); return g; };
      tri(top, [x - w, h + 0.06, za], [x + w, h + 0.06, za], [x + w, 0, far]); tri(top, [x - w, h + 0.06, za], [x + w, 0, far], [x - w, 0, far]);
      tri(side, [x - w, h + 0.06, za], [x - o, 0, za], [x - w, 0, far]); tri(side, [x + w, h + 0.06, za], [x + o, 0, za], [x + w, 0, far]);
      tri(side, [x - o, 0, za], [x + o, 0, za], [x + w, h + 0.06, za]); tri(side, [x - o, 0, za], [x + w, h + 0.06, za], [x - w, h + 0.06, za]);
      solid.part(fix(top, () => [0, 1, 0]), road).part(fix(side, (i) => (i < 9 ? [-1, 0.5, 0] : i < 18 ? [1, 0.5, 0] : [0, 0, -dir])), '#5f9d45');
    } }
  // long runs in 40 m pieces: one 6400 m box, clipped right by a low camera, lost enough depth precision to draw its top edge over the cars in front of it
  const run = (a, b, h, w, color, y, z) => { for (let x = a; x < b - 1e-6; x += 40) { const l = min(40, b - x); light.part(box(l, h, w), color, x + l / 2, y, z); } };
  // Twin folded steel runners read as an open barrier from the Nijenburgerweg overpass.
  const faces = [], fold = [[0.46, 0.086], [0.49, 0.14], [0.55, 0.148], [0.625, 0.086],
    [0.70, 0.148], [0.76, 0.14], [0.79, 0.086], [0.79, 0.047]];
  for (const side of [-1, 1]) for (let i = 1; i < fold.length; i++) {
    const [y0, z0] = fold[i - 1], [y1, z1] = fold[i];
    const points = [[0, y0, side * z0], [1, y0, side * z0], [1, y1, side * z1], [0, y1, side * z1]];
    for (const j of side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) faces.push(...points[j]);
  }
  const rail = new THREE.BufferGeometry();
  rail.setAttribute('position', new THREE.Float32BufferAttribute(faces, 3));
  rail.computeVertexNormals();
  const railRuns = [[X0, X1, -1.1], [X0, X1, 1.1], [X0, X1, -18.4], ...Y.railS.map(([a, b]) => [a, b, 18.4])];
  for (const [a, b, z] of railRuns) {
    const near = max(a, XW - 160), far = min(b, XE + 160);
    run(a, min(b, near), 0.32, 0.12, steel, 0.62, Z0 + z);
    run(max(a, far), b, 0.32, 0.12, steel, 0.62, Z0 + z);
    // Taper the ends of the outer runners into the grass beside the slip roads.
    const terminal = (x) => z === 18.4 ? 0.23 + 0.77 * sm(min(x - a, b - x) / 4) : 1;
    for (let x = near; x < far;) {
      const next = min(x + 40, far, x < a + 4 ? a + 4 : Infinity, x < b - 4 ? b - 4 : Infinity);
      const g = rail.clone(), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) * (next - x);
        pos.setXY(i, dx, pos.getY(i) * terminal(x + dx));
      }
      if (terminal(x) !== terminal(next)) g.computeVertexNormals();
      light.part(g, '#afb9bb', x, 0, Z0 + z); x = next;
    }
  }
  for (const [a, b, z] of Y.barriers) { run(a, b, 1.5, 0.3, '#3f8f57', 0.75, Z0 + z); run(a, b, 2.1, 0.14, '#bfe6ee', 2.55, Z0 + z); run(a, b, 0.16, 0.36, '#2f6f43', 3.68, Z0 + z); for (let x = a; x <= b; x += 10) light.part(box(0.3, 3.8, 0.44), '#2f6f43', x, 1.9, Z0 + z); }
  const solidMesh = new THREE.Mesh(solid.geo(), paint), lightMesh = new THREE.Mesh(light.geo(), paint); solidMesh.castShadow = solidMesh.receiveShadow = lightMesh.receiveShadow = true; still.add(solidMesh, lightMesh);
  const many = (geo, material, list, shadow, parent = still) => { // [[x, y, z, turn, sx, sy, sz]]
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((o, i) => im.setMatrixAt(i, M.compose(V.set(o[0], o[1], o[2]), Q.setFromEuler(E.set(0, o[3] || 0, 0)), S.set(o[4] ?? 1, o[5] ?? 1, o[6] ?? 1))));
    im.castShadow = shadow; im.receiveShadow = true; parent.add(im); return im;
  };
  { const posts = [];
    for (const [a, b, z] of railRuns) for (let x = a + 2; x < b; x += (x > XW - 120 && x < XE + 150 ? 4 : 16)) {
      const h = z === 18.4 ? 0.23 + 0.77 * sm(min(x - a, b - x) / 4) : 1;
      posts.push([x, 0, Z0 + z, 0, 1, h, 1]);
    }
    const bracket = kit(uv).part(new THREE.CylinderGeometry(0.077, 0.077, 0.74, 4, 1, true).rotateY(PI / 4), '#68747b', 0, 0.37, 0)
      .part(new THREE.PlaneGeometry(0.10, 0.265).rotateX(-PI / 2), '#b8bfbd', 0, 0.76, 0);
    many(bracket.geo(), paint, posts, false);
    const lamp = kit(uv).part(new THREE.CylinderGeometry(0.095, 0.15, 11.84, 6, 1, true), steel, 0, 5.92, 0);
    const curve = [[0, 11.76], [0.29, 11.97], [0.72, 12.10], [2.42, 12.12]];
    for (const side of [-1, 1]) {
      // An open, continuous section has no hidden caps at the bends.
      const verts = [], indices = [];
      for (const [z, y] of curve) for (const [dx, dy] of [[-0.06, -0.07], [-0.06, 0.07], [0.06, 0.07], [0.06, -0.07]]) {
        verts.push(dx, y + dy, side * z);
      }
      for (let i = 0; i < curve.length - 1; i++) for (let j = 0; j < 4; j++) {
        const a = i * 4 + j, b = i * 4 + (j + 1) % 4;
        if (side > 0) indices.push(a, a + 4, b, b, a + 4, b + 4);
        else indices.push(a, b, a + 4, b, b + 4, a + 4);
      }
      const arm = new THREE.BufferGeometry(); arm.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); arm.setIndex(indices); arm.computeVertexNormals();
      lamp.part(arm, steel).part(box(0.41, 0.15, 0.71), '#68767b', 0, 12.07, side * 2.44)
        .part(new THREE.PlaneGeometry(0.33, 0.60).rotateX(PI / 2), '#f9e9b0', 0, 11.99, side * 2.44);
    }
    many(lamp.geo(), paint, Y.lamps.map((x) => [x, GROUND, Z0]), true);
    const hm = kit(uv).part(box(0.08, 1.3, 0.1), '#e9eef2', 0, 0.65, 0).part(box(0.06, 0.5, 0.5), '#12854a', 0, 1.05, 0).decal('hm', 0.46, 0.46, -0.07, 1.05, 0, 'x-').decal('hm', 0.46, 0.46, 0.07, 1.05, 0, 'x+');
    many(hm.geo(), paint, Y.hecto.map(([x, z]) => [x, GROUND, Z0 + z]), false); }

  // ---- the scenery close to the road: ditches with reed, poplars, two stolp farms and a distance sign ----
  { const r = rnd(23), nearFarm = (x) => Y.farms.some((f) => abs(x - f[0]) < 18), water = kit(uv), reeds = [], trees = [];
    for (const [[a, b], z] of Y.ditches) { water.part(new THREE.PlaneGeometry(b - a, 2, Math.ceil((b - a) / 40)).rotateX(-PI / 2), '#4f8aa3', (a + b) / 2, GROUND + 0.04, Z0 + z);
      for (let x = a; x < b; x += 2.2 + r() * 2.5) if (!nearFarm(x) && r() < 0.8) reeds.push([x, GROUND, Z0 + z + (r() < 0.5 ? -1.2 : 1.2) + (r() - 0.5) * 0.4, r() * 6, 0.8 + r() * 0.5, 0.8 + r() * 0.6, 0.8 + r() * 0.5]); }
    for (const [a, b, z] of Y.rows) for (let x = a; x < b; x += 11) if (!nearFarm(x)) trees.push([x + (r() - 0.5) * 2, GROUND, Z0 + z + (r() - 0.5) * 1.5, r() * 6, 0.9 + r() * 0.25, 0.85 + r() * 0.35, 0.9 + r() * 0.25]);
    const ditch = water.geo(), pos = ditch.attributes.position;
    for (let i = 0; i < pos.count; i++) ditch.attributes.uv.setXY(i, pos.getX(i) / 12, pos.getZ(i) / 12);
    still.add(new THREE.Mesh(ditch, countryWater())); // lifted 4 cm, no polygon offset: seen edge-on, a sloped offset pulled the ditches in front of everything
    const reed = kit(uv); [[0, 0, 1.9, 0.12, '#9bab55'], [0.12, 0.08, 1.6, -0.15, '#b3b86a'], [-0.1, 0.1, 1.75, 0.2, '#8a9a48'], [0.05, -0.12, 1.45, -0.1, '#a5b45c'], [-0.08, -0.06, 1.3, 0.25, '#b3b86a']].forEach(([x, z, h, lean, c]) => reed.part(new THREE.ConeGeometry(0.045, h, 3).translate(0, h / 2, 0).rotateZ(lean), c, x, 0, z));
    reed.part(cyl(0.045, 0.045, 0.26, 5), '#6b4a2a', -0.02, 1.7, 0).part(cyl(0.04, 0.04, 0.22, 5), '#6b4a2a', 0.27, 1.55, 0.08); // two bulrush heads
    many(reed.geo(), paint, reeds, false);
    // Short, irregular patches of dry and fresh growth sit on the banks behind the steel.
    const tuft = kit(uv), grassRandom = rnd(481);
    for (let i = 0; i < 7; i++) {
      const x = (grassRandom() - 0.5) * 0.94, z = (grassRandom() - 0.5) * 0.42;
      const h = 0.09 + grassRandom() * 0.26, w = 0.038 + grassRandom() * 0.04;
      const blade = new THREE.BufferGeometry();
      const vertices = [x - w, 0, z, x + w, 0, z + w, x + w * 1.8, h, z + w];
      blade.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); blade.computeVertexNormals();
      tuft.part(blade, ['#868543', '#83934b', '#c3ad68', '#a1aa5e'][i % 4]);
    }
    const tufts = [];
    for (const [a, b, z] of railRuns) for (let x = max(a, XW - 120); x < min(b, XE + 150); x += 2 + grassRandom() * 4) {
      const bank = abs(z) < 2 ? z * 0.54 : z + Math.sign(z) * 0.52;
      tufts.push([x, GROUND + 0.012, Z0 + bank + (grassRandom() - 0.5) * 0.42,
        grassRandom() * PI * 2, 1.3 + grassRandom() * 1.4, 0.75 + grassRandom() * 0.65, 1]);
    }
    many(tuft.geo(), paint, tufts, false);
    const poplar = kit(uv).part(new THREE.CylinderGeometry(0.085, 0.18, 3.72, 6, 1, true), '#6d5741', 0, 1.86, 0);
    // Break the long poplar line into divided crowns above a visible fork.
    for (const side of [-1, 1]) poplar.part(new THREE.CylinderGeometry(0.045, 0.10, 1.65, 4, 1, true).rotateZ(side * 0.39), '#73604b', -side * 0.31, 2.92, 0);
    for (const [x, y, z, w, h, c] of [[0.10, 5.96, 0.14, 1.16, 3.03, '#437d3d'], [-0.52, 4.88, -0.19, 0.95, 2.0, '#548a43'],
      [0.58, 5.05, -0.26, 0.87, 1.80, '#6a9a4c'], [-0.20, 6.62, 0.39, 0.79, 1.72, '#679449']]) {
      poplar.part(new THREE.IcosahedronGeometry(1, 0).rotateY(y).scale(w, h, w * 0.91), c, x, y, z);
    }
    const pm = many(poplar.geo(), paint, trees, true), k = new THREE.Color(); trees.forEach((t, i) => pm.setColorAt(i, k.set(['#ffffff', '#e2f2d6', '#f2ffe8', '#d6ead0'][i % 4])));
    const farm = kit(uv), brick = '#b5523b', trim = '#f2efe6', slate = '#4a4f57';
    for (const [x, z, bx, bz] of Y.farms) { const zc = Z0 + z, gable = new THREE.Shape([new THREE.Vector2(-3.2, 0), new THREE.Vector2(3.2, 0), new THREE.Vector2(0, 2.4)]);
      farm.part(box(11, 4, 11), brick, x, 2, zc).part(box(11.3, 0.3, 11.3), trim, x, 4.1, zc).part(new THREE.ConeGeometry(8.6, 8.4, 4, 1).rotateY(PI / 4), slate, x, 8.45, zc).part(box(0.8, 1.6, 0.8), brick, x + 2, 11.5, zc + 1.5); // the stolp: square walls, a pyramid roof
      for (const s of [-1, 1]) farm.part(box(11.06, 1.1, 1.0), trim, x, 2.4, zc + s * 2.6).part(box(11.08, 0.8, 0.7), '#2b3a4a', x, 2.4, zc + s * 2.6); // windows all round
      for (const side of [-1, 1]) for (const dx of [-3.4, 0, 3.4]) {
        const z = zc + side * 5.5;
        farm.part(box(1.28, 1.44, 0.14), trim, x + dx, 2.12, z);
        farm.part(box(0.99, 1.16, 0.1), '#6792a1', x + dx, 2.12, z + side * 0.08);
        farm.part(box(1.38, 0.13, 0.28), '#d6cec0', x + dx, 1.34, z);
      }
      farm.part(box(0.2, 2.1, 1.3), '#2f6b45', x - 5.55, 1.05, zc).part(box(10, 4.4, 6), '#8a3a2a', x + bx, 2.2, zc + bz).part(new THREE.ExtrudeGeometry(gable, { depth: 10.4, bevelEnabled: false }).translate(0, 0, -5.2).rotateY(PI / 2), slate, x + bx, 4.4, zc + bz).part(box(0.2, 3, 2.6), trim, x + bx + (bx > 0 ? 5.05 : -5.05), 1.5, zc + bz); }
    const s = Y.sign, sz = Z0 + s.z; farm.part(box(0.12, 3.4, 0.12), steel, s.x, 1.7, sz - 0.8).part(box(0.12, 3.4, 0.12), steel, s.x, 1.7, sz + 0.8).part(box(0.1, 1.3, 2.6), '#9aa3ad', s.x - 0.02, 2.65, sz).decal('afstand', 2.6, 1.3, s.x - 0.08, 2.65, sz, 'x-');
    const fm = new THREE.Mesh(farm.geo(), paint); fm.castShadow = fm.receiveShadow = true; still.add(fm); }

  // ---- the vehicles: each kind is one geometry ----
  const tyre = '#1b1c20', dark = '#2c3038';
  const rod = (k, a, b, radius, color, sides = 6) => {
    const start = new THREE.Vector3(...a), delta = new THREE.Vector3(...b).sub(start), midpoint = start.addScaledVector(delta, 0.5);
    const g = cyl(radius, radius, delta.length(), sides);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    k.part(g, color, ...midpoint.toArray()); return k;
  };
  const truck = (cab, body, sign) => { const k = kit(uv);
    k.part(box(16.2, 0.36, 2.2), dark, -0.1, 0.82, 0).part(rb(2.5, 2.95, 2.5, 0.4), cab, 7.0, 0.6, 0).part(box(0.06, 1.0, 2.1), '#ffffff', 8.26, 2.55, 0, 'glass').part(box(1.1, 0.8, 2.56), '#ffffff', 7.35, 2.6, 0, 'glass').part(box(0.06, 0.7, 1.7), '#ffffff', 8.26, 1.4, 0, 'grille').part(box(0.34, 0.36, 2.54), '#d9dde0', 8.14, 0.62, 0);
    for (const z of [-0.95, 0.95]) k.part(box(0.06, 0.2, 0.34), '#ffffff', 8.27, 0.98, z, 'headlight').part(box(0.06, 0.24, 0.3), '#ffffff', -8.23, 1.22, z, 'rearLamp');
    k.part(rb(13.7, 3.0, 2.44, 0.22), body, -1.35, 1.0, 0).part(box(13.0, 0.2, 2.4), dark, -1.35, 0.98, 0).both(sign, 11.2, sign === 'transport' ? 2.8 : 2.6, -1.35, 2.5, 1.31).decal(sign, 10, sign === 'transport' ? 2.4 : 2.3, -1.35, 4.03, 0, 'y+').decal('plate', 0.6, 0.15, -8.24, 0.8, 0, 'x-');
    // The trailer is framed by corner posts and an underrun guard. They fit inside the previous body and axle extents.
    for (const side of [-1, 1]) {
      for (const x of [-8.03, 5.31]) k.part(box(0.18, 2.68, 0.10), '#a6b0ae', x, 2.48, side * 1.23);
      for (const y of [0.48, 0.83]) k.part(box(5.9, 0.13, 0.12), '#b6bebd', -0.55, y, side * 1.14);
      for (const x of [-3.12, 1.98]) k.part(box(0.13, 0.64, 0.12), '#647077', x, 0.76, side * 1.07);
      k.part(box(1.02, 0.16, 0.32), '#64757b', 6.63, 0.64, side * 1.08);
    }
    k.part(box(0.07, 0.95, 0.07), '#71858e', 8.255, 2.55, 0);
    if (sign === 'kaas') k.decal('kaasrek', 2.4, 2.5, -8.212, 2.65, 0, 'x-'); // behind her rear doors
    return k.geo(); };
  // A pressed body with real wheel wells and a tapered glazed cabin. The revised model shares
  // the previous axles, overall height, bumpers and A9 audit envelope.
  const carParts = (k, x, body) => {
    const shell = new THREE.Shape(); shell.moveTo(-2.055, 0.38);
    for (const axle of [-1.3, 1.3]) { shell.lineTo(axle - 0.405, 0.38); shell.absarc(axle, 0.38, 0.405, PI, 0, true); }
    shell.lineTo(2.055, 0.38); shell.lineTo(2.055, 0.76); shell.lineTo(1.83, 0.95);
    shell.lineTo(0.87, 1.04); shell.lineTo(-1.52, 1.04); shell.lineTo(-2.055, 0.86); shell.closePath();
    const pressed = new THREE.ExtrudeGeometry(shell, { depth: 1.72, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 6 }).translate(0, 0, -0.86);
    k.part(pressed, body, x, 0, 0);
    const lower = [[-1.53, 1.02, -0.83], [0.91, 1.02, -0.83], [0.91, 1.02, 0.83], [-1.53, 1.02, 0.83]];
    const upper = [[-1.18, 1.46, -0.70], [0.44, 1.46, -0.70], [0.44, 1.46, 0.70], [-1.18, 1.46, 0.70]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, corners = [lower[i], upper[i], upper[j], lower[j]], cab = new THREE.BufferGeometry();
      cab.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
      cab.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
      cab.setIndex([0, 1, 2, 2, 3, 0]); cab.computeVertexNormals(); k.part(cab, '#ffffff', x, 0, 0, 'glass');
      rod(k, [x + lower[i][0], lower[i][1], lower[i][2]], [x + upper[i][0], upper[i][1], upper[i][2]], 0.032, body);
    }
    k.part(rb(1.7, 0.08, 1.45, 0.12, 0.018), body, x - 0.37, 1.42, 0);
    for (const side of [-1, 1]) {
      rod(k, [x - 0.45, 1.04, side * 0.828], [x - 0.45, 1.443, side * 0.715], 0.031, '#26343c');
      k.part(box(0.2, 0.05, 0.06), '#afb8b7', x - 0.52, 0.93, side * 0.87);
      k.part(box(0.25, 0.11, 0.13), body, x + 0.59, 1.08, side * 0.82);
      k.part(box(0.13, 0.15, 0.38), '#ffffff', x + 2.045, 0.77, side * 0.56, 'headlight');
      k.part(box(0.14, 0.15, 0.35), '#ffffff', x - 2.04, 0.78, side * 0.59, 'rearLamp');
    }
    k.part(box(0.12, 0.12, 1.59), '#43535c', x + 2.04, 0.48, 0).part(box(0.14, 0.16, 1.62), '#44505b', x - 2.03, 0.45, 0);
    k.part(box(0.09, 0.20, 0.69), '#ffffff', x + 2.075, 0.70, 0, 'grille');
    return k.decal('plate', 0.52, 0.13, x - 2.115, 0.52, 0, 'x-');
  };
  const bike = (k, x, c) => { const wheel = () => new THREE.TorusGeometry(0.33, 0.04, 5, 12).rotateY(PI / 2); k.part(wheel(), tyre, x, 1.45, -0.52).part(wheel(), tyre, x, 1.45, 0.52).part(box(0.05, 0.06, 1.0), c, x, 1.62, 0).part(box(0.05, 0.5, 0.06), c, x, 1.72, -0.18).part(box(0.05, 0.42, 0.06), c, x, 1.68, 0.4).part(box(0.1, 0.06, 0.26), tyre, x, 1.98, -0.18).part(box(0.4, 0.05, 0.05), tyre, x, 1.9, 0.4); };
  const GEO = {
    truck: truck('#f2f2ee', '#f6f6f2', 'transport'), kaas: truck('#d3202c', '#ffd43a', 'kaas'), tulp: truck('#2f9a4a', '#ff7fb2', 'tulp'),
    car: carParts(kit(uv), 0, '#f4f4f0').geo(),
    caravan: (() => { const k = carParts(kit(uv), 3.7, '#f4f4f0'); k.part(box(1.5, 0.1, 0.12), dark, 0.9, 0.55, 0).part(rb(7.2, 2.3, 2.24, 0.55), '#fbf8ee', -2.1, 0.5, 0).part(box(6.3, 0.2, 2.3), '#ff7a1a', -2.1, 1.25, 0).part(box(6.3, 0.08, 2.3), '#19a0c9', -2.1, 1.05, 0).part(box(1.4, 0.6, 2.3), '#ffffff', -0.6, 1.95, 0, 'glass').part(box(1.2, 0.6, 2.3), '#ffffff', -3.6, 1.95, 0, 'glass').part(box(0.5, 0.08, 1.5), dark, -5.95, 1.05, 0).part(box(0.06, 0.9, 0.06), dark, -5.76, 1.5, -0.3).part(box(0.06, 0.9, 0.06), dark, -5.76, 1.5, 0.3); bike(k, -5.95, '#e02630'); bike(k, -6.25, '#19a0c9'); return k.decal('plate', 0.52, 0.13, -5.72, 0.75, 0.6, 'x-').geo(); })(),
    bus: (() => { const k = kit(uv); k.part(rb(12.6, 3.15, 2.56, 0.55), '#fdfdf8', 0, 0.4, 0).part(box(11.0, 0.95, 2.62), '#ffffff', -0.2, 2.6, 0, 'coachGlass').part(box(0.06, 1.5, 2.2), '#ffffff', 6.3, 2.3, 0, 'glass').part(box(11.6, 0.2, 2.62), '#19a0c9', 0, 0.75, 0).both('bus', 7.5, 1.44, -0.2, 1.48, 1.34).decal('plate', 0.6, 0.15, -6.33, 0.9, 0, 'x-');
      for (const x of [-4.5, -2.1, 0.3, 2.7, 4.65]) for (const side of [-1, 1]) k.part(box(0.045, 0.32, 0.07), '#b4c1bd', x, 0.99, side * 1.25);
      for (const z of [-0.95, 0.95]) k.part(box(0.06, 0.2, 0.36), '#ffffff', 6.3, 0.95, z, 'headlight').part(box(0.06, 0.3, 0.24), '#e02630', -6.3, 1.3, z); return k.geo(); })(),
    tractor: (() => { const k = kit(uv), green = '#3d9a3a'; k.part(box(3.7, 0.5, 0.7), dark, 0.2, 0.85, 0).part(rb(2.1, 0.9, 0.92, 0.25), green, 1.2, 1.0, 0).part(rb(1.6, 1.62, 1.5, 0.3), green, -0.75, 1.15, 0).part(box(1.1, 0.8, 1.56), '#ffffff', -0.75, 2.1, 0, 'glass').part(box(1.66, 0.75, 1.1), '#ffffff', -0.75, 2.1, 0, 'glass').part(cyl(0.07, 0.07, 1.0, 6), dark, 1.7, 2.3, 0.28).part(cyl(0.13, 0.13, 0.2, 8), '#ff8a1e', -0.75, 2.86, 0).part(box(0.06, 0.24, 0.6), '#ffd21f', 2.26, 1.45, 0);
      for (const z of [-0.84, 0.84]) k.part(box(1.5, 0.12, 0.56), green, -0.95, 1.9, z); return k.geo(); })(),
    blade: (() => { const k = kit(uv), white = '#f4f4f0';
      k.part(box(6.4, 0.4, 2.2), dark, 15.25, 0.9, 0).part(rb(3.2, 2.9, 2.5, 0.4), '#ff8a1e', 16.85, 0.6, 0).part(box(0.06, 1.0, 2.1), '#ffffff', 18.46, 2.55, 0, 'glass').part(box(1.2, 0.8, 2.56), '#ffffff', 17.4, 2.6, 0, 'glass').part(box(2.2, 1.9, 1.7), '#6d747c', 13.4, 2.05, 0);
      k.part(new THREE.CylinderGeometry(0.22, 1.0, 34, 12).rotateZ(-PI / 2).scale(1, 1, 0.8), white, -2, 3.47, 0).part(new THREE.CylinderGeometry(0.03, 0.26, 2.2, 12).rotateZ(-PI / 2).scale(1, 1, 0.8), '#e02630', -20.1 + 1.1, 3.47, 0).part(cyl(1.08, 1.08, 0.5, 12).rotateZ(PI / 2), '#8d959c', 14.9, 3.47, 0);
      k.part(box(4.5, 0.5, 2.3), dark, -14.75, 1.0, 0).part(box(2.4, 1.95, 1.5), '#6d747c', -14.75, 2.2, 0).part(box(0.08, 0.6, 2.3), '#ffd21f', -17.02, 1.6, 0).decal('lang', 2.24, 0.56, -17.1, 1.6, 0, 'x-');
      for (const z of [-0.8, 0.8]) k.part(cyl(0.12, 0.12, 0.22, 8), '#ff8a1e', -16.6, 1.36, z).part(box(0.06, 0.2, 0.34), '#fff3b8', 18.46, 0.98, z); return k.geo(); })(),
    transporter: (() => { const k = kit(uv), s = new THREE.Shape(), lip = new THREE.Shape(), N = 20;
      for (let i = 0; i <= N; i++) s[i ? 'lineTo' : 'moveTo'](DECK.foot + i, DECK.y(i)); for (let i = N; i >= 0; i--) s.lineTo(DECK.foot + i, max(0.03, DECK.y(i) - 0.18));
      for (let i = 0; i <= N; i++) lip[i ? 'lineTo' : 'moveTo'](DECK.foot + i, DECK.y(i) + 0.14); for (let i = N; i >= 0; i--) lip.lineTo(DECK.foot + i, max(0.03, DECK.y(i) - 0.2));
      const ex = (sh, d) => new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
      k.part(ex(s, DECK.half * 2), '#ffb21f', 0, 0, 0).part(ex(lip, 0.12), '#d3202c', 0, 0, DECK.half + 0.06).part(ex(lip, 0.12), '#d3202c', 0, 0, -DECK.half - 0.06);
      k.part(box(15.5, 0.4, 2.3), dark, 8.25, 0.75, 0).part(rb(3.0, 2.72, 2.5, 0.4), '#2d7fd1', 14.5, 0.58, 0).part(box(0.06, 1.0, 2.1), '#ffffff', 16.01, 2.4, 0, 'glass').part(box(1.2, 0.8, 2.56), '#ffffff', 15.0, 2.45, 0, 'glass').both('auto', 2.3, 0.43, 14.4, 1.4, 1.285).part(box(2.2, 0.2, 2.3), dark, -4, 0.34, 0);
      for (const u of [11.5, 15, 18.5]) for (const z of [-1.1, 1.1]) k.part(box(0.16, DECK.y(u) - 0.18 - 0.93, 0.16), '#6d747c', DECK.foot + u, (DECK.y(u) - 0.18 + 0.95) / 2, z);
      for (const z of [-0.95, 0.95]) k.part(box(0.06, 0.2, 0.34), '#fff3b8', 16.01, 0.98, z); return k.geo(); })(),
    wheel: (() => { const k = kit(uv); k.part(cyl(1, 1, 1, 12).rotateX(PI / 2), tyre).part(cyl(0.58, 0.58, 1.2, 10).rotateX(PI / 2), '#ffffff', 0, 0, 0, 'hub'); return k.geo(); })(),
    // Dutch police: white, the blue and yellow band, POLITIE on the doors and the bonnet, a light bar (its two lamps are separate meshes so they can flash)
    police: (() => { const k = carParts(kit(uv), 0, '#f7f7f2'); k.both('stripes', 3.5, 0.26, 0, 0.62, 0.906).both('politie', 1.04, 0.26, 0.1, 0.95, 0.906).decal('politie', 1.1, 0.27, 1.3, 1.156, 0, 'y+').part(box(0.42, 0.06, 1.38), '#30343c', -0.3, 1.53, 0).part(box(0.36, 0.06, 0.2), '#e9eef2', -0.3, 1.59, 0);
      for (const x of [-1.3, 1.3]) for (const z of [-0.8, 0.8]) k.part(cyl(0.36, 0.36, 0.26, 12).rotateX(PI / 2), tyre, x, 0.36, z).part(cyl(0.2, 0.2, 0.28, 8).rotateX(PI / 2), '#cfd4d8', x, 0.36, z);
      return k.geo(); })(),
    gouda: (() => { const { r, h } = CHEESE, rind = '#e39a1c', face = '#ffd84a', k = kit(uv), C = (a, b, hh, y) => k.part(new THREE.CylinderGeometry(a, b, hh, 22, 1, true), rind, 0, y, 0);
      C(r, r, h * 0.62, 0); C(r * 0.84, r, h * 0.19, h * 0.405); C(r, r * 0.84, h * 0.19, -h * 0.405);
      k.part(new THREE.CircleGeometry(r * 0.84, 22).rotateX(-PI / 2), face, 0, h / 2, 0).part(new THREE.CircleGeometry(r * 0.84, 22).rotateX(PI / 2), face, 0, -h / 2, 0).part(new THREE.CircleGeometry(0.08, 12).rotateX(-PI / 2), '#c0271f', 0.17, h / 2 + 0.004, 0.08);
      return k.geo().rotateX(PI / 2); })(), // the axle along z: it stands on its edge and rolls along x
  };
  const tints = ['#ffffff', '#ffe3a1', '#bfe3ff', '#ffc2c2', '#d1f5c8', '#e7d2ff', '#ffd9b0', '#c9f2ee'], carTints = ['#e63b3b', '#3f7fe0', '#f4f4f0', '#ffc928', '#2f2f36', '#3fae5a', '#ff8a1e', '#9aa3ad', '#8d3fc4'];
  const enamel = paint.clone(); enamel.roughness = 0.39; enamel.metalness = 0.16;
  const batch = {}, lone = [], wheels = [];
  const sorted = { truck: [], car: [], caravan: [] };
  for (const o of plan.traffic) {
    const special = { 'tulip truck': 'tulp', 'cheese truck': 'kaas', 'tour bus': 'bus', tractor: 'tractor', 'blade transport': 'blade', transporter: 'transporter' }[o.name];
    if (special) { const m = new THREE.Mesh(GEO[special], enamel); m.castShadow = m.receiveShadow = true; m.position.set(0, GROUND, o.z); m.frustumCulled = false; moving.add(m); lone.push([o, m]); } else sorted[o.kind].push(o);
    for (const [wx, r, w, tr] of KINDS[o.kind].wheels) for (const s of [-1, 1]) wheels.push([o, wx * o.dir, r, w, o.z + s * tr]);
  }
  for (const kind in sorted) {
    const list = sorted[kind], im = new THREE.InstancedMesh(GEO[kind], enamel, list.length), pal = kind === 'car' ? carTints : kind === 'truck' ? tints : ['#ffffff', '#ffe9c4'], k = new THREE.Color();
    list.forEach((o, i) => im.setColorAt(i, k.set(pal[(i * 5 + 1) % pal.length]))); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; moving.add(im); batch[kind] = [list, im];
  }
  const wheelMesh = new THREE.InstancedMesh(GEO.wheel, paint, wheels.length); wheelMesh.castShadow = true; wheelMesh.frustumCulled = false; moving.add(wheelMesh);

  // ---- the helicopters ----
  const heliBody = (body, belly, sign, news) => { const k = kit(uv);
    k.part(rb(5.0, 2.4, 2.2, 1.0), body, 0.4, -1.1, 0).part(rb(1.5, 1.3, 2.27, 0.6), '#455b6a', 2.2, -0.35, 0).part(box(5.2, 0.42, 0.42), body, -4.6, 0.6, 0).part(box(0.9, 1.6, 0.14), belly, -7.0, 1.1, 0).part(box(1.2, 0.12, 1.4), belly, -6.9, 0.62, 0).part(cyl(0.16, 0.2, 0.5, 8), dark, 0.3, 1.5, 0).part(box(2.2, 0.5, 2.26), belly, -0.3, -0.75, 0);
    for (const side of [-1, 1]) {
      const skid = side * 0.95;
      rod(k, [-1.3, -1.59, skid], [2.02, -1.59, skid], 0.073, '#34434a', 8);
      rod(k, [2.02, -1.59, skid], [2.29, -1.45, skid], 0.073, '#616e72', 8);
      for (const x of [-0.79, 1.22]) rod(k, [x, -1.55, skid], [x + 0.31, -1.10, side * 0.68], 0.055, '#7f8c8f');
      k.part(box(0.20, 0.22, 0.21), '#ffc24b', -6.88, 0.63, side * 0.57);
    }
    k.part(rb(2.15, 0.23, 1.34, 0.22), belly, -0.03, -1.23, 0);
    k.part(cyl(0.46, 0.55, 0.22, 12), '#62747a', 0.36, 1.21, 0);
    k.part(cyl(0.22, 0.40, 0.21, 10), '#9ca6a6', 0.36, 1.42, 0);
    for (const side of [-1, 1]) {
      k.part(box(0.95, 0.19, 0.05), '#ffffff', -1.05, 0.52, side * 1.104, 'grille');
      k.part(box(0.68, 0.10, 0.04), '#687c82', -1.18, -0.25, side * 1.102);
    }
    k.part(box(1.95, 0.56, 2.19), '#ffffff', 0.22, 0.83, 0, 'glass');
    for (const z of [-1.095, 1.095]) {
      k.part(box(0.09, 0.58, 0.045), body, 0.09, 0.83, z);
      k.part(box(0.34, 0.07, 0.055), '#778389', -1.33, 0.09, z);
    }
    for (const x of [-3.55, -5.45]) k.part(box(0.24, 0.45, 0.47), belly, x, 0.6, 0);
    k.both(sign, 2.2, 0.55, -0.3, 0.42, 1.14).decal(sign, 2.2, 0.55, 0.2, -1.14, 0, 'y-');
    if (news) k.part(new THREE.IcosahedronGeometry(0.4, 1), dark, 2.3, -1.42, 0).part(cyl(0.16, 0.16, 0.12, 10).rotateZ(PI / 2), '#7fd4ff', 2.68, -1.5, 0).part(box(0.5, 0.3, 0.3), dark, 2.3, -1.1, 0);
    else k.both('stripes', 2.2, 0.42, -0.3, -0.75, 1.165).part(cyl(0.34, 0.33, 0.28, 12), '#667782', HELI.lamp[0], HELI.lamp[1] + 0.2, 0).part(cyl(0.26, 0.26, 0.085, 12), '#ffffff', HELI.lamp[0], HELI.lamp[1] + 0.03, 0, 'headlight').part(cyl(0.1, 0.1, 0.2, 8), '#3f7fe0', -1.0, 1.4, 0);
    return k.geo(); };
  const rotor = kit(uv);
  for (const sign of [-1, 1]) for (const axis of [0, 1]) {
    const len = HELI.rotor - 0.45, along = (d) => axis ? [0, 0, sign * d] : [sign * d, 0, 0];
    rotor.part(axis ? box(0.34, 0.06, len) : box(len, 0.06, 0.34), dark, ...along(len / 2));
    rotor.part(axis ? box(0.34, 0.06, 0.45) : box(0.45, 0.06, 0.34), '#d9b64b', ...along(len + 0.225));
  }
  for (const sign of [-1, 1]) {
    rotor.part(box(1.04, 0.105, 0.17), '#88989a', sign * 0.48, 0.001, 0);
    rotor.part(box(0.17, 0.105, 1.04), '#88989a', 0, 0.001, sign * 0.48);
  }
  const rotorGeo = rotor.part(cyl(0.3, 0.3, 0.2, 8), '#8d959c').geo();
  const tailGeo = kit(uv).part(box(1.7, 0.2, 0.05), dark).part(box(0.2, 1.7, 0.05), dark).geo();
  const discMat = new THREE.MeshBasicMaterial({ color: '#30343c', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const helis = [['#fbfbf6', '#12409a', 'politie', false], ['#e02630', '#fbfbf6', 'nieuws', true]].map(([a, b, sign, news]) => {
    const g = new THREE.Group(), body = new THREE.Mesh(heliBody(a, b, sign, news), enamel), rotor = new THREE.Mesh(rotorGeo, paint), tail = new THREE.Mesh(tailGeo, paint), disc = new THREE.Mesh(new THREE.CircleGeometry(HELI.rotor, 28).rotateX(-PI / 2), discMat);
    rotor.position.set(0.3, 1.74, 0); disc.position.set(0.3, 1.72, 0); tail.position.set(-7.15, 1.1, 0.14); body.castShadow = rotor.castShadow = true; g.add(body, rotor, tail, disc); moving.add(g); return { g, rotor, tail };
  });
  // the rope ladder with the traffic cop on it, his stop paddle on a separate arm so it can wave
  const ladder = new THREE.Group(); moving.add(ladder);
  { const k = kit(uv), L = HELI.ladder, blue = '#17336f', vis = '#e8f02a', skin = '#f0c39a';
    for (const z of [-0.22, 0.22]) k.part(box(0.05, L, 0.05), '#c9b68c', 0, -L / 2, z); for (let y = 0.3; y < L; y += 0.4) k.part(box(0.045, 0.045, 0.44), '#8a6b3c', 0, -y, 0);
    const y = -L + 0.35; // his feet
    for (const z of [-0.13, 0.13]) k.part(box(0.2, 0.8, 0.2), blue, 0.16, y + 0.4, z).part(box(0.3, 0.1, 0.2), tyre, 0.2, y + 0.03, z);
    k.part(box(0.3, 0.72, 0.52), vis, 0.17, y + 1.16, 0).part(box(0.31, 0.12, 0.53), '#c9ccd2', 0.17, y + 1.05, 0).part(box(0.31, 0.12, 0.53), '#c9ccd2', 0.17, y + 1.3, 0).part(box(0.26, 0.28, 0.28), skin, 0.17, y + 1.68, 0).part(box(0.32, 0.12, 0.32), '#fbfbf6', 0.17, y + 1.87, 0).part(box(0.16, 0.04, 0.3), blue, 0.38, y + 1.82, 0).part(box(0.13, 0.13, 0.5), vis, 0.08, y + 1.5, -0.42).part(box(0.13, 0.4, 0.13), vis, 0.02, y + 1.7, -0.3);
    const m = new THREE.Mesh(k.geo(), paint); m.castShadow = true; ladder.add(m);
    const a = kit(uv).part(box(0.13, 0.62, 0.13), vis, 0, 0.31, 0).part(box(0.06, 0.5, 0.06), '#8a6b3c', 0, 0.85, 0).part(cyl(0.3, 0.3, 0.04, 16).rotateZ(PI / 2), '#fbfbf6', 0, 1.3, 0).decal('stop', 0.56, 0.56, 0.035, 1.3, 0, 'x+').decal('stop', 0.56, 0.56, -0.035, 1.3, 0, 'x-');
    ladder.arm = new THREE.Mesh(a.geo(), paint); ladder.arm.position.set(0.17, y + 1.42, 0.33); ladder.add(ladder.arm); }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const glow = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,240,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }, false);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); flash.position.set(Y.flits.x - 0.4, 1.55, Z0 + Y.flits.z);
  const AXIS = new THREE.Vector3(0, -1, 0);
  beam.onBeforeRender = (r, sc, cam) => { // from inside the shaft it is a wall of light, so it fades out as the camera comes close to it
    const dx = cam.position.x - beam.position.x, dy = cam.position.y - beam.position.y, dz = cam.position.z - beam.position.z, along = dx * AXIS.x + dy * AXIS.y + dz * AXIS.z, away = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along)) - beam.scale.x * Math.max(0, along) / beam.scale.y;
    beam.material.opacity = 0.07 * Math.min(1, Math.max(0, (away - 1) / 6)); };
  beam.frustumCulled = pool.frustumCulled = false; moving.add(beam, pool, flash);

  // ---- the police cars, the cheese truck's doors and her Gouda ----
  const lit = new THREE.MeshBasicMaterial({ color: '#4d94ff' }), unlit = mat('#1b2c66', { roughness: 0.4 }), halo = new THREE.SpriteMaterial({ map: glow, color: '#3f86ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), lampGeo = box(0.34, 0.14, 0.52);
  const cops = [0, 1].map(() => {
    const g = new THREE.Group(), body = new THREE.Mesh(GEO.police, enamel); body.castShadow = body.receiveShadow = true; g.add(body);
    const lamps = [-1, 1].map((s) => { const m = new THREE.Mesh(lampGeo, unlit); m.position.set(-0.3, 1.63, s * 0.4); g.add(m); return m; });
    const halos = [-1, 1].map((s) => { const sp = new THREE.Sprite(halo); sp.position.set(-0.3, 1.75, s * 0.4); sp.scale.setScalar(2.4); g.add(sp); return sp; });
    moving.add(g); return { g, lamps, halos };
  });
  const kaasTruck = lone.find(([o]) => o.name === 'cheese truck')[1], doors = [-1, 1].map((s) => { // hinged at her rear corners, closed over the shelves of cheese
    const k = kit(uv).part(box(0.05, 2.5, 1.26), '#ffd43a', 0, 0, -s * 0.63).part(box(0.07, 2.3, 0.05), '#d9a21c', -0.01, 0, -s * 1.2).part(box(0.08, 0.06, 0.46), '#8d959c', -0.03, 0.1, -s * 0.95);
    const g = new THREE.Group(), m = new THREE.Mesh(k.geo(), enamel); m.castShadow = true; g.add(m); g.position.set(-8.245, 2.65, s * 1.28); kaasTruck.add(g); return g;
  });
  const goudas = Array.from({ length: plan.cheeses }, () => { const m = new THREE.Mesh(GEO.gouda, paint); m.castShadow = true; m.rotation.order = 'YXZ'; moving.add(m); return m; });

  const H = {}, T = {}, tF = plan.T.flash, PC = {}, KC = {};
  function frame(t, now = 0) {
    for (const [o, m] of lone) m.position.x = plan.vx(o, t);
    for (const kind in batch) { const [list, im] = batch[kind]; for (let i = 0; i < list.length; i++) { const o = list[i]; im.setMatrixAt(i, M.compose(V.set(plan.vx(o, t), GROUND, o.z), o.dir > 0 ? Q0 : QW, ONE)); } im.instanceMatrix.needsUpdate = true; }
    for (let i = 0; i < wheels.length; i++) { const w = wheels[i], x = plan.vx(w[0], t) + w[1]; wheelMesh.setMatrixAt(i, M.compose(V.set(x, GROUND + w[2], w[4]), Q.setFromEuler(E.set(0, 0, -x / w[2])), S.set(w[2], w[2], w[3]))); }
    wheelMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 2; i++) { const h = plan.heli(i, t, H), o = helis[i]; o.g.visible = h.on; o.g.position.set(h.x, h.y, h.z); o.g.rotation.set(0.05 * sin(now * 1.3 + i), 0, -0.13 + 0.02 * sin(now * 1.7 + i * 2)); o.rotor.rotation.y = now * 38 + i; o.tail.rotation.z = now * 50; }
    const h = plan.heli(0, t, H); ladder.visible = h.on; ladder.position.set(h.x + HELI.hook[0], h.y + HELI.hook[1], h.z + HELI.hook[2]); ladder.rotation.z = -HELI.swing + 0.03 * sin(now * 2.2); ladder.arm.rotation.x = 0.25 + 0.55 * sin(now * 9);
    const l = plan.light(t, T); beam.visible = l.on && h.on; pool.visible = beam.visible && l.y < GROUND + 0.1;
    if (beam.visible) { V.set(h.x + HELI.lamp[0], h.y + HELI.lamp[1], h.z); S.set(l.x - V.x, l.y - V.y, l.z - V.z); const len = S.length(), r = Math.min(len * 0.17, 4.2); beam.position.copy(V); beam.quaternion.setFromUnitVectors(DOWN, S.divideScalar(len)); beam.scale.set(r, len, r); AXIS.copy(S); pool.position.set(l.x, GROUND + 0.04, l.z); pool.scale.set(r * 1.05, 1, r * 1.05); }
    const f = t - tF; flash.visible = f >= 0 && f < 0.16; if (flash.visible) flash.scale.setScalar(2 + 12 * (1 - f / 0.16));
    for (let i = 0; i < 2; i++) { const p = plan.police(i, t, PC), o = cops[i], on = floor(now * 7 + i * 0.5) % 2 === 0; o.g.visible = p.on; o.g.position.set(p.x, GROUND, p.z); o.g.rotation.y = -p.yaw; o.lamps[0].material = on ? lit : unlit; o.lamps[1].material = on ? unlit : lit; o.halos[0].visible = on; o.halos[1].visible = !on; }
    doors.forEach((g, i) => { const s = i ? 1 : -1; g.rotation.y = s * plan.door(t, s); });
    for (let i = 0; i < goudas.length; i++) { const c = plan.cheese(i, t, KC), m = goudas[i]; m.visible = c.on; m.position.set(c.x, GROUND + c.y, c.z); m.rotation.set(c.lean, -c.yaw, -c.roll); }
  }
  frame(0, 0);
  return { ...plan, plan, frame, show: (on) => { moving.visible = on; }, still, moving };
}
