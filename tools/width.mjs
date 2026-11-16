// prints the free street width (wall to wall) along the route, every 10 m
import { readFile } from 'node:fs/promises';
import { makeDrive } from '../src/drive.js';
const load = async (f) => JSON.parse(await readFile(new URL('../data/' + f, import.meta.url), 'utf8'));
const map = await load('alkmaar.json'), drive = makeDrive(await load('route.json'));
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
const blocked = (x, z) => map.buildings.some((b) => inPoly(b.p, x, z));
let out = '';
for (let s = +process.argv[2] || 0; s < (+process.argv[3] || drive.L); s += 10) {
  const free = (sg) => { for (let q = 0; q <= 10; q += 0.2) { const p = drive.place(s, q * sg); if (blocked(p.x, p.z)) return q; } return 10; };
  out += `${s}:${free(-1).toFixed(1)}/${free(1).toFixed(1)}  `;
}
console.log(out);
