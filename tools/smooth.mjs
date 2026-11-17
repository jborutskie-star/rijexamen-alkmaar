// Replays the drive at 60 fps and reports the roughest frames: sudden changes in turn rate, lean or speed.
import { readFileSync } from 'node:fs';
import { makeDrive } from '../src/drive.js';
const load = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const drive = makeDrive(load('route.json'), load('alkmaar.json').water);
const dt = 1 / 60, rows = [];
let p = drive.state(0), pv = null;
const J = [drive.layout.hop, drive.layout.ramp], impact = (s) => J.some((j) => Math.abs(s - j.s0) < 3 || Math.abs(s - j.land) < 3); // ramp feet and landings are meant to thump
for (let t = dt; t < drive.duration; t += dt * p.timeScale) { // slow motion stretches real time, as in the film
  const q = drive.state(t), ts = p.timeScale, d = dt * ts; // rates are per second of drive time; a change is what one film frame shows of it
  const v = { yaw: (q.yaw - p.yaw) / d, lean: (q.lean - p.lean) / d, x: (q.x - p.x) / d, z: (q.z - p.z) / d, roll: (q.roll - p.roll) / d, pitch: (q.pitch - p.pitch) / d, y: (q.y - p.y) / d };
  if (pv) rows.push({ s: q.s, yaw: ts * Math.abs(v.yaw - pv.yaw), lean: ts * Math.abs(v.lean - pv.lean), pos: Math.abs(q.s - drive.layout.ducks.halt) < 1 ? 0 : ts * Math.hypot(v.x - pv.x, v.z - pv.z) /* the emergency stop is meant to be abrupt */, pitch: impact(q.s) ? 0 : Math.abs(v.pitch - pv.pitch), y: impact(q.s) ? 0 : Math.abs(v.y - pv.y) });
  p = q; pv = v;
}
const LIMIT = { yaw: 0.45, lean: 0.08, pos: 0.6, pitch: 0.4, y: 0.8 }; // change per frame that the eye reads as a twitch (yaw allows the deliberate flat spin)
let bad = 0;
for (const k of Object.keys(LIMIT)) {
  const worst = [...rows].sort((a, b) => b[k] - a[k]).slice(0, 5), over = rows.filter((r) => r[k] > LIMIT[k]).length; bad += over;
  console.log(k.padEnd(6), 'frames over limit:', String(over).padStart(4), ' worst:', worst.map((r) => `${r[k].toFixed(3)}@${r.s.toFixed(0)}m`).join('  '));
}
console.log(bad ? `ROUGH: ${bad} twitchy frames` : 'OK: the drive is smooth'); process.exit(bad ? 1 : 0);
