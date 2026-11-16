// Downloads Alkmaar city-centre map data from OpenStreetMap (Overpass) and
// flattens it into data/alkmaar.json in local metres. Run: node tools/build-map.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const S = 52.6272, W = 4.7375, N = 52.6378, E = 4.7600;
const LAT0 = (S + N) / 2, LON0 = (W + E) / 2;
const bbox = `${S},${W},${N},${E}`;
const RAW = new URL('./raw-osm.json', import.meta.url);
const OUT = new URL('../data/alkmaar.json', import.meta.url);

const query = `[out:json][timeout:90];(
way["building"](${bbox});relation["building"](${bbox});
way["highway"](${bbox});
way["natural"="water"](${bbox});relation["natural"="water"](${bbox});
way["waterway"](${bbox});
way["leisure"~"park|garden|pitch"](${bbox});way["landuse"~"grass|forest|meadow|village_green"](${bbox});
node["natural"="tree"](${bbox});
);out geom;`;

if (!existsSync(RAW)) {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'city-diorama-script' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error('Overpass ' + res.status + ' ' + (await res.text()).slice(0, 200));
  await writeFile(RAW, await res.text());
}
const osm = JSON.parse(await readFile(RAW, 'utf8'));

const r1 = (v) => Math.round(v * 10) / 10;
const X = (lon) => (lon - LON0) * Math.cos((LAT0 * Math.PI) / 180) * 111320;
const Z = (lat) => -(lat - LAT0) * 110540; // north is -z
const flat = (geom) => geom.flatMap((g) => [r1(X(g.lon)), r1(Z(g.lat))]);
const hash = (n) => ((Math.imul(n, 2654435761) >>> 0) % 1000) / 1000;

const ROAD_W = { primary: 9, secondary: 8, tertiary: 7, residential: 5.5, unclassified: 6, living_street: 5,
  pedestrian: 6, service: 3.5, cycleway: 2.5, footway: 2, path: 1.8, steps: 2, primary_link: 6, secondary_link: 6, tertiary_link: 6 };

const out = { origin: [LAT0, LON0], buildings: [], roads: [], water: [], waterways: [], green: [], trees: [], pois: {} };

const closed = (g) => g.length > 3 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon;
const outers = (el) => el.type === 'way' ? [el.geometry] :
  (el.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry && closed(m.geometry)).map((m) => m.geometry);

// A relation's outline often comes as several open ways: join them end to end into closed rings.
// Without this the Noordhollandsch Kanaal, the widest water in town, is missing.
const stitch = (el) => {
  const key = (g) => g.lat + ',' + g.lon, rings = [];
  const segs = (el.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry && !closed(m.geometry)).map((m) => m.geometry);
  while (segs.length) {
    let r = segs.pop(), i;
    while (!closed(r) && (i = segs.findIndex((s) => key(s[0]) === key(r.at(-1)) || key(s.at(-1)) === key(r.at(-1)))) >= 0) {
      const [s] = segs.splice(i, 1); r = r.concat((key(s[0]) === key(r.at(-1)) ? s : s.toReversed()).slice(1));
    }
    if (closed(r)) rings.push(r);
  }
  return rings;
};
const EDGE = 1500; // such a ring runs on for kilometres: keep the part within 1.5 km of the centre
const clip = (p) => { // Sutherland-Hodgman against the four sides of a square
  let P = []; for (let i = 0; i < p.length; i += 2) P.push([p[i], p[i + 1]]);
  for (const [ax, sign] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
    const inside = (q) => sign * q[ax] <= EDGE, o = [];
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length]; if (inside(a)) o.push(a);
      if (inside(a) !== inside(b)) { const t = (sign * EDGE - a[ax]) / (b[ax] - a[ax]); o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    });
    P = o;
  }
  return P.flat().map(r1);
};
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
const big = []; // the stitched waters

for (const el of osm.elements) {
  const t = el.tags || {};
  if (el.type === 'node') { if (t.natural === 'tree') out.trees.push(r1(X(el.lon)), r1(Z(el.lat))); continue; }
  if (t.building) {
    for (const g of outers(el)) {
      if (!closed(g)) continue;
      let h = parseFloat(t.height) || (parseFloat(t['building:levels']) * 3.1 + 2.5) || 0;
      if (!h) h = /church|cathedral/.test(t.building) ? 22 : /shed|garage|roof|hut/.test(t.building) ? 3 : 7 + hash(el.id) * 6;
      const b = { p: flat(g.slice(0, -1)), h: r1(h) };
      if (t.name) b.n = t.name;
      if (/church|cathedral/.test(t.building)) b.k = 'church';
      out.buildings.push(b);
    }
  } else if (t.highway && el.geometry) {
    if (/proposed|construction|corridor|elevator|platform/.test(t.highway)) continue;
    const r = { p: flat(el.geometry), w: parseFloat(t.width) || ROAD_W[t.highway] || 4, k: t.highway };
    if (t.name) r.n = t.name;
    if (t.bridge && t.bridge !== 'no') r.b = 1;
    if (t.tunnel && t.tunnel !== 'no') continue;
    if (t.area === 'yes') r.a = 1;
    out.roads.push(r);
  } else if (t.natural === 'water') {
    for (const g of outers(el)) if (closed(g)) out.water.push(flat(g.slice(0, -1)));
    for (const g of stitch(el)) { const p = clip(flat(g.slice(0, -1))); if (p.length > 5) { out.water.push(p); big.push(p); } }
  } else if (t.waterway && el.geometry) {
    out.waterways.push({ p: flat(el.geometry), w: parseFloat(t.width) || (t.waterway === 'canal' ? 12 : 5), n: t.name });
  } else if ((t.leisure || t.landuse) && el.geometry && closed(el.geometry)) {
    out.green.push(flat(el.geometry.slice(0, -1)));
  }
}

// Landmarks she would recognise, by name
const centroid = (p) => { let x = 0, z = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; z += p[i + 1]; } return [r1(x / (p.length / 2)), r1(z / (p.length / 2))]; };
out.buildings = out.buildings.filter((b) => !big.some((w) => inPoly(w, ...centroid(b.p)))); // nothing stands in the middle of the canal
for (const b of out.buildings) if (b.n && /Waag|Grote|Laurens|Molen|Accijns|Stadhuis|Station/i.test(b.n)) out.pois[b.n] = centroid(b.p);

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
const names = [...new Set(out.roads.map((r) => r.n).filter(Boolean))];
console.log(JSON.stringify({ buildings: out.buildings.length, roads: out.roads.length, water: out.water.length,
  waterways: out.waterways.length, green: out.green.length, trees: out.trees.length / 2, pois: out.pois,
  bridges: out.roads.filter((r) => r.b).map((r) => r.n + ':' + r.k).join(', ').slice(0, 900), streets: names.length }, null, 1));
