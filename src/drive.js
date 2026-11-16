// Pure driving maths: where the exam car is at any moment. No three.js in here,
// so tools/check.mjs can run the exact same motion and prove nothing clips.
export const CAR = { len: 4.0, wid: 1.8 };
const { PI, sin, cos, tan, atan, atan2, hypot, max, min, floor } = Math;
export const clamp = (v, a, b) => max(a, min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
const ramp = (s, a, b) => { const t = clamp((s - a) / (b - a), 0, 1); return t * t * t * (t * (6 * t - 15) + 10); }; // 0 before a, 1 after b, starting and stopping without a jolt
const bump = (s, a, b, c, d) => ramp(s, a, b) * (1 - ramp(s, c, d)); // 0-1-0
const keys = (k) => (s) => {
  if (s <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (s <= k[i][0]) return lerp(k[i - 1][1], k[i][1], smooth((s - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k.at(-1)[1];
};

// water = the map's water polygons: wherever the route crosses one, the street becomes a humpback bridge
export function makeDrive(route, water = []) {
  const n = route.path.length / 2, M = route.marks, R = route.room;
  // the mapped line has small kinks where two streets meet; ease them out so the car never twitches sideways
  let P = route.path;
  for (let pass = 0; pass < 2; pass++) P = P.map((_, q) => { const i = q >> 1, o = q & 1, w = min(2, i, n - 1 - i); let t = 0; for (let j = i - w; j <= i + w; j++) t += P[2 * j + o]; return t / (2 * w + 1); });
  const S = new Float64Array(n);
  for (let i = 1; i < n; i++) S[i] = S[i - 1] + hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]);
  const L = S[n - 1];
  const m = Object.fromEntries(Object.entries(M).map(([k, i]) => [k, S[i]])); // marks in metres

  // heading (unwrapped) per path point. H is the line itself; Hs is eased over a few metres and turns the car's body,
  // so the car rolls into a bend instead of snapping round it. K is how sharply Hs is turning.
  const H = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = max(0, i - 1), b = min(n - 1, i + 1);
    let h = atan2(P[2 * b + 1] - P[2 * a + 1], P[2 * b] - P[2 * a]);
    if (i) { while (h - H[i - 1] > PI) h -= 2 * PI; while (h - H[i - 1] < -PI) h += 2 * PI; }
    H[i] = h;
  }
  const blur = (A, w) => A.map((_, i) => { let t = 0, c = 0; for (let j = max(0, i - w); j <= min(n - 1, i + w); j++, c++) t += A[j]; return t / c; });
  const Hs = blur(blur(H, 3), 3);
  // how much room the street leaves, eased, so the drift angle never steps when a street opens out
  const Rs = blur(blur(Array.from(R, (_, i) => { let t = 6; for (let j = max(0, i - 4); j <= min(n - 1, i + 6); j++) t = min(t, R[j]); return t; }), 5), 5);
  let Kl; // curvature again, eased further: it leans the body
  const K = blur(Hs.map((_, i) => { const a = max(0, i - 5), b = min(n - 1, i + 5); return (Hs[b] - Hs[a]) / (S[b] - S[a]); }), 3);

  Kl = blur(blur(K, 6), 6);
  const idx = (s) => { let i = clamp(floor(s), 0, n - 2); while (i < n - 2 && S[i + 1] < s) i++; while (i > 0 && S[i] > s) i--; return i; };
  const sample = (A, s) => { const i = idx(s), f = clamp((s - S[i]) / (S[i + 1] - S[i]), 0, 1); return lerp(A[i], A[i + 1], f); };
  // point on the centre-line, on a curve through the path points; beyond either end it carries on straight
  function centre(s) {
    const i = idx(s), f = (s - S[i]) / (S[i + 1] - S[i]), out = f < 0 || f > 1, a = max(0, i - 1), b = min(n - 1, i + 2);
    const f2 = f * f, f3 = f2 * f, h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = 3 * f2 - 2 * f3, h11 = f3 - f2;
    const at = (o) => out ? lerp(P[2 * i + o], P[2 * i + 2 + o], f)
      : h00 * P[2 * i + o] + h10 * (P[2 * i + 2 + o] - P[2 * a + o]) / (i + 1 - a) + h01 * P[2 * i + 2 + o] + h11 * (P[2 * b + o] - P[2 * i + o]) / (b - i);
    return { x: at(0), z: at(1), h: sample(H, s), hs: sample(Hs, s), k: s < 0 || s > L ? 0 : sample(K, s) };
  }
  // place something beside the route: s metres along, `off` metres to the right
  function place(s, off = 0) { const c = centre(s); return { x: c.x - sin(c.h) * off, z: c.z + cos(c.h) * off, h: c.h }; }

  // ---- choreography, all keyed on distance along the route ----
  const stop = L, park = { lat: 3.0, gap: 5.4 };
  const jump = (r0, len, deg, fly) => { const a = (deg * PI) / 180, tipY = len * tan(a); return { r0, r1: r0 + len, a, fly, land: r0 + len + fly, tipY, k: (tipY + tan(a) * fly) / (fly * fly) }; };
  const hop = jump(m.mient - 92, 6, 13, 18); // over the roadworks on the Langestraat, with a full flat spin
  const bridge = jump(m.bridgeN + 1.5, 8.6, 16, 30); // the open drawbridge, with a barrel roll
  const JUMPS = [hop, bridge];
  const rev = { a0: m.dam + 14, a1: m.dam + 30, b0: m.annabrug - 54, b1: m.annabrug - 38 }; // spin round, drive backwards along the canal, spin back
  const boomS = m.zout + 55; // the fireworks stall on the Zoutstraat
  const WEAVE0 = m.lange + 95, WEAVE_N = 7, WEAVE_L = 26;
  const humps = []; // [from, to] in metres for every stretch of the line that is over water
  for (let i = 0; i < n; i++) if (water.some((w) => inPoly(w, P[2 * i], P[2 * i + 1]))) { const l = humps.at(-1); if (l && S[i] - l.s1 < 9) l.s1 = S[i] + 2; else humps.push({ s0: S[i] - 2, s1: S[i] + 2 }); }
  for (let i = humps.length - 1; i >= 0; i--) { const b = humps[i]; if (b.s1 - b.s0 < 7 || (b.s1 > bridge.r0 - 8 && b.s0 < bridge.land)) humps.splice(i, 1); else { b.h = clamp(0.045 * (b.s1 - b.s0), 0.4, 1.05); b.w = 7.6; } }
  const deckY = (s) => { for (const b of humps) if (s > b.s0 && s < b.s1) return b.h * sin((PI * (s - b.s0)) / (b.s1 - b.s0)) ** 2; return 0; }; // height of the road surface over a bridge

  const speed = keys([
    [0, 1.5], [22, 15], [m.lange - 14, 13], [m.lange + 12, 13], [m.lange + 70, 29], [hop.r0 - 34, 29], [hop.r0, 25], [hop.land, 24], [hop.land + 14, 14],
    [m.mient - 14, 13], [m.mient + 22, 15], [m.waagIn - 5, 16], [m.donut - 6, 12.5], [m.schapen - 22, 12.5], [m.schapen, 15],
    [m.voordam - 4, 11], [m.voordam + 30, 19], [m.zijdam - 12, 11], [m.zijdam + 12, 12], [m.zijdam + 40, 21], [m.dam, 20],
    [rev.a0 + 6, 15], [rev.a1 + 6, 14.5], [rev.b0 - 8, 14.5], [rev.b0 + 8, 15], [m.annabrug - 12, 11.5], [m.annabrug + 14, 12.5], [m.anna, 20],
    [bridge.r0, 23], [bridge.land, 20], [m.zout - 12, 11], [m.zout + 12, 11], [m.zout + 50, 22], [m.limmer - 48, 22], [m.limmer - 12, 11.5], [m.limmer + 12, 12],
    [m.willems - 6, 18], [m.bier, 16], [stop - 30, 12], [stop - 12, 6.5], [stop - 5, 4], [stop, 0.45],
  ]);
  // swing wide, spin round, then reverse into the parking gap in one glide
  const parkLat = keys([[stop - 34, 0], [stop - 26, -1.1], [stop - 11.5, -1.1], [stop - 0.4, park.lat], [stop, park.lat]]);
  const lat = (s) =>
    // slalom through the cyclists on the Langestraat
    1.45 * sin((PI * (s - WEAVE0)) / WEAVE_L) * bump(s, WEAVE0 - 6, WEAVE0 + 18, WEAVE0 + WEAVE_N * WEAVE_L - 18, WEAVE0 + WEAVE_N * WEAVE_L + 6)
    // round the half barrier at the bridge
    - 1.15 * bump(s, m.bridgeN - 32, m.bridgeN - 13, m.bridgeN - 4, bridge.land)
    // a wide berth for the fireworks
    - 0.9 * bump(s, boomS - 30, boomS - 8, boomS + 6, boomS + 30)
    + parkLat(s);
  const spin = (s) => PI * (ramp(s, rev.a0, rev.a1) + ramp(s, rev.b0, rev.b1) + 2 * ramp(s, hop.r1 + 1.5, hop.land - 5) + ramp(s, stop - 27, stop - 11));
  const ramped = (s) => { for (const j of JUMPS) if (s > j.r0 && s < j.land) return s < j.r1 ? (s - j.r0) * tan(j.a) : j.tipY + tan(j.a) * (s - j.r1) - j.k * (s - j.r1) ** 2; return deckY(s); };
  const height = (s) => (ramped(s - 1.4) + 2 * ramped(s - 0.7) + 3 * ramped(s) + 2 * ramped(s + 0.7) + ramped(s + 1.4)) / 9; // rounds off the foot of each ramp and the touchdown
  const inAir = (s) => JUMPS.some((j) => s > j.r1 && s < j.land);
  const grip = (s) => JUMPS.reduce((g, j) => g * (1 - bump(s, j.r0 - 9, j.r0 - 1, j.land + 0.5, j.land + 8)), 1); // no drifting on a ramp or in the air
  const squash = (s) => JUMPS.reduce((q, j) => q + (s < j.land ? 0 : 0.08 * sin(min(PI, (s - j.land) * 0.5)) * (1 - ramp(s, j.land, j.land + 6))), 0); // suspension dip on landing
  const wheelie = (s) => 0.2 * bump(s, 2, 7, 13, 21); // the front wheels leave the ground at the start
  const AX = 1.25; // half the wheelbase
  const rollStunt = (s) => 2 * PI * ramp(s, bridge.r1 + 1, bridge.land - 3);
  const timeScale = (s) => (1 - 0.74 * bump(s, bridge.r1 - 2, bridge.r1 + 3, bridge.land - 7, bridge.land - 1))
    * (1 - 0.66 * bump(s, hop.r1 - 1, hop.r1 + 2, hop.land - 5, hop.land - 0.5)) * (1 - 0.62 * bump(s, boomS + 4, boomS + 7, boomS + 17, boomS + 26));

  const TS = 0.25, NT = Math.ceil(L / TS) + 1, T = new Float64Array(NT);
  for (let i = 1; i < NT; i++) T[i] = T[i - 1] + TS / speed((i - 0.5) * TS);
  const duration = T[NT - 1];
  const tOf = (s) => { const q = clamp(s / TS, 0, NT - 1), i = min(NT - 2, floor(q)); return lerp(T[i], T[i + 1], q - i); };
  const sOf = (t) => {
    if (t <= 0) return 0; if (t >= duration) return L;
    let a = 0, b = NT - 1; while (b - a > 1) { const c = (a + b) >> 1; if (T[c] <= t) a = c; else b = c; }
    return (a + (t - T[a]) / (T[b] - T[a])) * TS;
  };

  function stateAt(s) {
    const c = centre(s), l = lat(s), dl = (lat(s + 0.5) - lat(s - 0.5));
    const v = speed(s), air = inAir(s), w = wheelie(s);
    // tail steps out a few metres before the apex; wilder in the donut; tamer where the street is tight
    const kd = sample(K, clamp(s + 3, 0, L)), wild = 1 + 0.9 * bump(s, m.donut - 12, m.donut + 4, m.schapen - 30, m.schapen - 12);
    const tight = sample(Rs, clamp(s, 0, L));
    const beta = clamp(0.42 * kd * v * wild, -0.95, 0.95) * grip(s) * (1 - ramp(s, stop - 36, stop - 28)) * lerp(0.12, 1, ramp(tight, 2.2, 4.2));
    const travel = c.hs + atan(dl); // direction the car is actually moving
    const yF = height(s + AX), yR = height(s - AX); // ride on both axles, so the nose never dips into the ramp
    const spinning = bump(s, rev.a0 - 2, rev.a0 + 3, rev.a1 - 3, rev.a1 + 2) + bump(s, rev.b0 - 2, rev.b0 + 3, rev.b1 - 3, rev.b1 + 2) + bump(s, stop - 29, stop - 25, stop - 13, stop - 9);
    return {
      s, v, air, beta, k: c.k, y: (yF + yR) / 2 + sin(w) * AX,
      x: c.x - sin(c.hs) * l, z: c.z + cos(c.hs) * l,
      travel, yaw: travel + beta + spin(s),
      pitch: atan((yF - yR) / (2 * AX)) + w, squash: squash(s),
      roll: rollStunt(s), lean: 0.16 * Math.tanh((sample(Kl, clamp(s, 0, L)) * v * v * 0.011) / 0.16) * grip(s),
      slide: Math.abs(beta) + 0.8 * spinning + 0.5 * (1 - ramp(s, 20, 28)), // how much the tyres are smoking, 0..1+
      rev: ramp(s, rev.a0, rev.a1) - ramp(s, rev.b0, rev.b1) + ramp(s, stop - 27, stop - 11), // 1 while the car is travelling backwards
      timeScale: timeScale(s),
    };
  }

  // ---- things placed relative to the route (shared by the scene and the clipping check) ----
  const cyclists = Array.from({ length: WEAVE_N }, (_, i) => {
    const sm = WEAVE0 + WEAVE_L * (i + 0.5), side = -Math.sign(sin((PI * (sm - WEAVE0)) / WEAVE_L)) * 1.75;
    return { sm, side, v: 4.2 + (i % 3) * 0.5, tm: tOf(sm), halt: hop.r0 - 16 - (WEAVE_N - 1 - i) * 3.2 }; // they queue up at the roadworks
  });
  const cyclistAt = (c, t) => { const s = min(c.sm + c.v * (t - c.tm), c.halt); return { ...place(s, c.side), s }; };
  const parked = [-3, -2, 1, 2].map((i) => ({ ...place(stop + i * park.gap, park.lat), i }));
  // decorations (trees, cheese, bystanders) are only placed where they stand clear of the car's line
  const clear = (x, z, d = 5.5) => { for (let i = 0; i < n; i++) if (hypot(P[2 * i] - x, P[2 * i + 1] - z) < d) return false; return true; };
  const asRamp = (j) => ({ s0: j.r0, s1: j.r1, angle: j.a, tipY: j.tipY, land: j.land, ...place(j.r0, 0) });
  const post = (s, off, r, h, kind) => ({ ...place(s, off), r, h, kind }); // something standing in the street: r metres round, h metres tall
  const boom = { ...post(boomS, 4.6, 1.25, 2.6, 'stall'), s: boomS };
  const works = [ // the roadworks under the hop: all of it lower than the car flies
    ...[-1.8, -0.9, 0, 0.9, 1.8].flatMap((o) => [post(hop.r1 + 1.6, o, 0.3, 1.05, 'fence'), post(hop.r1 + 11.4, o, 0.3, 1.05, 'fence')]),
    ...[3, 5, 7, 9].flatMap((d) => [post(hop.r1 + d, -2.3, 0.25, 0.6, 'cone'), post(hop.r1 + d, 2.3, 0.25, 0.6, 'cone')]),
    post(hop.r1 + 6.5, 0, 1.6, 0.5, 'pit'), post(hop.r1 + 4, -4.4, 0.45, 1.7, 'worker'), post(hop.r1 + 8.5, 3.9, 0.45, 1.7, 'worker'), post(hop.r0 - 3, -4.6, 1.3, 2.7, 'digger'), post(hop.r0 - 11, 3.7, 0.45, 2.1, 'sign'),
  ];
  const layout = {
    clear, cyclists, cyclistAt, parked, park, rev, boom, works, humps, deckY, roadY: height, // roadY: how high the road is under the car
    solids: [...works, boom],
    barrier: { ...place(m.bridgeN - 9, 0), from: 0.35, to: 2.9 }, // right-hand half barrier, metres right of centre
    ramp: asRamp(bridge), hop: asRamp(hop),
    donut: route.donut,
    crowd: Array.from({ length: 9 }, (_, i) => place(stop - 12 + i * 3.1, 7.4 + (i % 2) * 1.3)).filter((_, i) => i !== 4), // nobody stands right in front of the driver's door, that is the camera's spot
  };

  return { L, m, duration, speed, tOf, sOf, stateAt, state: (t) => stateAt(sOf(t)), place, centre, layout };
}

// the four ground corners of a car-sized box
export function footprint(x, z, yaw, len = CAR.len, wid = CAR.wid) {
  const fx = cos(yaw) * len / 2, fz = sin(yaw) * len / 2, rx = -sin(yaw) * wid / 2, rz = cos(yaw) * wid / 2;
  return [[x + fx + rx, z + fz + rz], [x + fx - rx, z + fz - rz], [x - fx - rx, z - fz - rz], [x - fx + rx, z - fz + rz]];
}
