// Prints written directions for a few routes over the synced Sarit archive. Run: npm test
import { readFileSync } from 'node:fs';
import { indexImdf } from '../../imdf-sarit/src/imdf.js';
import { createRouter } from '../../imdf-sarit/src/route.js';
import { buildSteps } from '../src/directions.js';

const dir = new URL('../public/venues/sarit/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const raw = { manifest: read('imdf/manifest.json') };
for (const f of ['venue', 'building', 'level', 'footprint', 'unit', 'opening', 'amenity', 'anchor', 'occupant', 'address', 'relationship']) raw[f] = read(`imdf/${f}.geojson`);
const imdf = indexImdf(raw, read('content/places.json'));
const router = createRouter(imdf);
const find = (n) => imdf.pois.find((p) => p.name === n);

let problems = 0;
for (const [a, b, mode] of [
  ['Entrance 5', 'Carrefour', 'fastest'],
  ['Java', 'Century Cinemax', 'fastest'],
  ['Java', 'Century Cinemax', 'stairs'],
  ['Hotpoint', 'Woolworths', 'lift'],
]) {
  const from = find(a);
  const to = find(b);
  const r = router.route(from, to, { mode });
  if (!r) {
    problems++;
    console.log(`${a} -> ${b} (${mode}): NO ROUTE`);
    continue;
  }
  const steps = buildSteps(imdf, r, from, to);
  console.log(`\n${a} -> ${b} (${mode}): ${Math.round(r.metres)} m, ${Math.round(r.seconds / 60)} min`);
  for (const s of steps) console.log(`  [${imdf.levelById.get(s.levelId).short}] ${s.title}. ${s.detail}`);
  if (steps.some((s) => /NaN|undefined/.test(s.title + s.detail))) problems++;
}
console.log(problems ? `\n${problems} problem(s)` : '\nAll directions built');
process.exit(problems ? 1 : 0);
