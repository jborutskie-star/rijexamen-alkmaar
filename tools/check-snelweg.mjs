// Replays the motorway sequence without a browser and reports anything that touches, hides the car or puts the camera inside something.
// usage: node tools/check-snelweg.mjs [-v]
import { register } from 'node:module';
const three = new URL('../vendor/three.module.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export function resolve(s, c, next) { return s === 'three' ? { url: ${JSON.stringify(three)}, shortCircuit: true } : next(s, c); }`));
const { makePlan } = await import('../src/snelweg.js');
const plan = makePlan(), problems = plan.audit();
if (process.argv.includes('-v')) {
  const s = plan.start, e = plan.end;
  console.log(`sequence ${plan.duration} s, film ${plan.filmDuration.toFixed(1)} s; start x=${s.x.toFixed(0)} z=${s.z.toFixed(1)}, end x=${e.x.toFixed(0)} z=${e.z.toFixed(1)}`);
  console.log(Object.entries(plan.T).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' '));
  console.log(Object.entries(plan.layout).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${Math.round(v)}`).join(' '));
  for (const d of [0.3, 0.6, 1, 1.6]) console.log(`within ${d} m of the car: ${plan.near(d).join(', ')}`);
  for (const s of plan.timeline) console.log(`  t=${s.t.toFixed(2)} (film ${s.film.toFixed(1)} s, lasts ${(plan.filmTime(s.until) - s.film).toFixed(1)} s) ${s.key}`);
}
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log('OK: the snelweg is clean');
