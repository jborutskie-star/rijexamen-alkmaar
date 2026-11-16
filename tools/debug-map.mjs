// Draws data/alkmaar.json (and the route, if present) to debug/map.html for eyeballing.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const d = JSON.parse(await readFile(new URL('../data/alkmaar.json', import.meta.url), 'utf8'));
const pts = (p) => { let s = ''; for (let i = 0; i < p.length; i += 2) s += `${p[i]},${p[i + 1]} `; return s; };
const DRIVE = /primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|service/;
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-780 -600 1560 1200" style="background:#e9e4d8;width:3120px">`;
for (const g of d.green) s += `<polygon points="${pts(g)}" fill="#b9d8a0"/>`;
for (const w of d.water) s += `<polygon points="${pts(w)}" fill="#7db4d8"/>`;
for (const r of d.roads) s += `<polyline points="${pts(r.p)}" fill="none" stroke="${r.b ? '#e33' : DRIVE.test(r.k) ? '#fff' : '#d8cfc0'}" stroke-width="${r.w}" stroke-linecap="round" stroke-linejoin="round"/>`;
for (const b of d.buildings) s += `<polygon points="${pts(b.p)}" fill="${b.k ? '#a55' : '#b9a48c'}" stroke="#8a765f" stroke-width=".3"/>`;
const seen = new Set();
for (const r of d.roads) if (r.n && DRIVE.test(r.k) && !seen.has(r.n)) { seen.add(r.n); const m = (r.p.length >> 2) * 2; s += `<text x="${r.p[m]}" y="${r.p[m + 1]}" font-size="7" font-family="Arial" fill="#124">${r.n}</text>`; }
for (const [n, [x, z]] of Object.entries(d.pois)) s += `<circle cx="${x}" cy="${z}" r="5" fill="#f0f"/><text x="${x + 7}" y="${z}" font-size="11" font-weight="bold" font-family="Arial" fill="#a0a">${n}</text>`;
for (let x = -700; x <= 700; x += 100) s += `<text x="${x}" y="-590" font-size="8" fill="#888">${x}</text><line x1="${x}" y1="-600" x2="${x}" y2="600" stroke="#0001" stroke-width=".5"/>`;
for (let z = -500; z <= 500; z += 100) s += `<text x="-778" y="${z}" font-size="8" fill="#888">${z}</text><line x1="-780" y1="${z}" x2="780" y2="${z}" stroke="#0001" stroke-width=".5"/>`;
const routeFile = new URL('../data/route.json', import.meta.url);
if (existsSync(routeFile)) {
  const r = JSON.parse(await readFile(routeFile, 'utf8'));
  s += `<polyline points="${pts(r.path)}" fill="none" stroke="#f60" stroke-width="2"/>`;
  r.path.forEach((v, i) => { if (i % 40 === 0) s += `<text x="${v}" y="${r.path[i + 1]}" font-size="9" font-weight="bold" fill="#c30">${i / 2}</text>`; });
}
s += '</svg>';
await mkdir(new URL('../debug/', import.meta.url), { recursive: true });
await writeFile(new URL('../debug/map.html', import.meta.url), `<body style="margin:0">${s}</body>`);
console.log('ok', s.length);
