// Checks the IMDF archive loads and that places can be reached on foot, across floors. Run: npm test
import { readFileSync } from 'node:fs';
import { indexImdf } from '../src/imdf.js';
import { createRouter } from '../src/route.js';

const dir = new URL('../public/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const raw = { manifest: read('imdf/manifest.json') };
for (const f of ['venue', 'building', 'level', 'footprint', 'unit', 'opening', 'amenity', 'anchor', 'occupant', 'address', 'relationship']) raw[f] = read(`imdf/${f}.geojson`);

const imdf = indexImdf(raw, read('content/places.json'));
console.log('IMDF', imdf.manifest.version, imdf.counts);

let t0 = performance.now();
const router = createRouter(imdf);
console.log(`router built in ${Math.round(performance.now() - t0)} ms`);

const lvl = (id) => imdf.levelById.get(id).short;
const find = (name) => imdf.pois.find((p) => p.name === name);
const carrefour = find('Carrefour');
const named = imdf.pois.filter((p) => p.kind !== 'unnamed');
let failed = 0;
let failedStepFree = 0;
t0 = performance.now();
for (const p of named) {
  if (p === carrefour) continue;
  if (!router.route(carrefour, p)) {
    failed++;
    console.log(`  no route: Carrefour -> ${p.name} (${lvl(p.levelId)})`);
  }
  if (!router.route(carrefour, p, { stepFree: true })) failedStepFree++;
}
console.log(`${named.length - 1 - failed}/${named.length - 1} places reachable from Carrefour (${Math.round((performance.now() - t0) / (2 * named.length))} ms per route); ${failedStepFree} not reachable step free`);

for (const [a, b, opts] of [
  ['Carrefour', 'Woolworths', {}],
  ['Java', 'Century Cinemax', {}],
  ['Java', 'Century Cinemax', { stepFree: true }],
  ['Hotpoint', 'AAR', {}],
  ['Entrance 1', 'Alloy Lounge', { stepFree: true }],
]) {
  const r = router.route(find(a), find(b), opts);
  if (!r) {
    console.log(`${a} -> ${b}: NO ROUTE`);
    continue;
  }
  const hops = r.transitions.map((t) => `${t.kind} ${lvl(t.fromLevelId)}>${lvl(t.toLevelId)}`).join(', ');
  console.log(`${a} -> ${b}${opts.stepFree ? ' (step free)' : ''}: ${Math.round(r.metres)} m, ${Math.round(r.seconds / 60)} min, ${hops || 'same floor'}`);
}
process.exit(failed ? 1 : 0);
