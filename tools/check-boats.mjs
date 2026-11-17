// No canal water inside a boat. Each boat floats with its origin on the waterline and world.js bobs and rolls it by SWAY (src/landmarks.js).
// Looking straight down anywhere over a boat, the first surface met (a floor, a deck, a seat) must stand clear of the water plane, or the water shows through:
// at least 5 cm above still water, and 2 cm at the bottom of the bob with the boat rolled furthest. `node tools/check-boats.mjs`. Exits 1 on any problem.
import { registerHooks } from 'node:module';
const root = new URL('..', import.meta.url);
registerHooks({ resolve: (spec, ctx, next) => (spec === 'three' ? { url: new URL('vendor/three.module.js', root).href, shortCircuit: true } : next(spec, ctx)) });
const THREE = await import('three'), L = await import('../src/landmarks.js');

const STILL = 0.05, ROCKED = 0.02, STEP = 0.04, { bob, roll } = L.SWAY, problems = [], rows = [];
for (const name of ['rondvaartboot', 'sloep', 'roeiboot', 'tjalk', 'woonboot']) {
  const g = L[name](), T = [], v = new THREE.Vector3(); g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.isMesh) return; const p = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : p.count;
    for (let i = 0; i < n; i += 3) { const t = []; for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k).applyMatrix4(o.matrixWorld); t.push(v.x, v.y, v.z); } T.push(t); }
  });
  const box = new THREE.Box3().setFromObject(g); let still = { y: Infinity }, rocked = { y: Infinity };
  for (let x = box.min.x; x <= box.max.x; x += STEP) for (let z = box.min.z; z <= box.max.z; z += STEP) {
    let top = -Infinity; // the highest surface straight above (x, z): what a camera looking down sees there
    for (const [x0, y0, z0, x1, y1, z1, x2, y2, z2] of T) {
      const d = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0); if (Math.abs(d) < 1e-9) continue; // standing on edge: seen from above it is only a line
      const a = ((x1 - x) * (z2 - z) - (x2 - x) * (z1 - z)) / d, b = ((x2 - x) * (z0 - z) - (x0 - x) * (z2 - z)) / d, c = 1 - a - b;
      if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) top = Math.max(top, a * y0 + b * y1 + c * y2);
    }
    if (top === -Infinity) continue;
    const low = top * Math.cos(roll) - Math.abs(z) * Math.sin(roll) - bob;
    if (top < still.y) still = { y: top, x, z }; if (low < rocked.y) rocked = { y: low, x, z };
  }
  const at = (p) => `${(p.y * 100).toFixed(1)} cm at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
  if (still.y < STILL) problems.push(`${name}: the lowest surface seen from above is ${at(still)}, under ${STILL * 100} cm above still water`);
  if (rocked.y < ROCKED) problems.push(`${name}: bobbed down and rolled, the lowest surface seen from above is ${at(rocked)}, under ${ROCKED * 100} cm above the water`);
  rows.push(`${name} ${(still.y * 100).toFixed(1)}/${(rocked.y * 100).toFixed(1)}`);
}
if (problems.length) { console.log(`PROBLEMS (${problems.length}):`); for (const p of problems) console.log(' - ' + p); process.exit(1); }
console.log(`OK: no water inside any boat (lowest surface seen from above, cm over still water / bobbed and rolled: ${rows.join(', ')})`);
