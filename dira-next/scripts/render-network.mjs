// Draws each Sarit floor's corridor network over its open floor, to check it by eye.
// Run: node scripts/render-network.mjs <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { indexImdf } from '../../imdf-sarit/src/imdf.js';
import { createRouter } from '../../imdf-sarit/src/route.js';
import { corridorNetwork } from '../src/network.js';

const out = process.argv[2] || 'network-review';
const dir = new URL('../../imdf-sarit/public/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const raw = { manifest: read('imdf/manifest.json') };
for (const f of ['venue', 'building', 'level', 'footprint', 'unit', 'opening', 'amenity', 'anchor', 'occupant', 'address', 'relationship']) raw[f] = read(`imdf/${f}.geojson`);
const imdf = indexImdf(raw, read('content/places.json'));
const router = createRouter(imdf);
let t0 = performance.now();
const net = corridorNetwork(router);
console.log(`network in ${Math.round(performance.now() - t0)} ms`);
mkdirSync(out, { recursive: true });
const grids = router.inspect();
for (const [n, lv] of net.entries()) {
  const g = grids[n];
  const name = imdf.levelById.get(lv.levelId).short;
  const [lon0, lat0] = g.cellCentre(0, 0);
  const [lon1, lat1] = g.cellCentre(1, 1);
  const px = ([lon, lat]) => [((lon - lon0) / (lon1 - lon0)) * 3, (g.H - (lat - lat0) / (lat1 - lat0)) * 3];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${g.W * 3}" height="${g.H * 3}" style="background:#1a110c">`;
  for (let j = 0; j < g.H; j++) for (let i = 0; i < g.W; i++) if (g.walk[j * g.W + i]) s += `<rect x="${i * 3}" y="${(g.H - j) * 3 - 3}" width="3" height="3" fill="#3b2a20"/>`;
  for (const e of lv.edges) s += `<polyline fill="none" stroke="#e9b48a" stroke-width="2" points="${e.coords.map((c) => px(c).join(',')).join(' ')}"/>`;
  for (const v of lv.nodes) s += `<circle cx="${px(v.at)[0]}" cy="${px(v.at)[1]}" r="${v.degree > 2 ? 4 : 2.5}" fill="${v.degree > 2 ? '#c8553d' : '#faf3ec'}"/>`;
  writeFileSync(`${out}/net-${name}.svg`, s + '</svg>');
  console.log(name, 'nodes', lv.nodes.length, 'junctions', lv.nodes.filter((v) => v.degree > 2).length, 'edges', lv.edges.length, 'metres', Math.round(lv.edges.reduce((s, e) => s + e.metres, 0)));
}
