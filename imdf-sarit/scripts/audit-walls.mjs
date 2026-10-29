// Checks that routes never pass through walls. Every route segment is sampled every 0.25 m
// and must stay inside the floor outline and out of every unit that is not a walkway
// (shops, washrooms, non-public space, lifts, escalators, stairs), except the start and
// destination units and the lift/escalator/stair units the route actually uses.
// Run: npm run audit   (or: node scripts/audit-walls.mjs --pairs=600)
import { readFileSync } from 'node:fs';
import { indexImdf } from '../src/imdf.js';
import { createRouter } from '../src/route.js';

const dir = new URL('../public/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const raw = { manifest: read('imdf/manifest.json') };
for (const f of ['venue', 'building', 'level', 'footprint', 'unit', 'opening', 'amenity', 'anchor', 'occupant', 'address', 'relationship']) raw[f] = read(`imdf/${f}.geojson`);
const imdf = indexImdf(raw, read('content/places.json'));
const router = createRouter(imdf);

const arg = process.argv.find((a) => a.startsWith('--pairs='));
const PAIRS = arg ? +arg.split('=')[1] : 500;
const STEP_M = 0.25;

const ring0 = imdf.levels[0].feature.geometry.coordinates[0];
const lat0 = ring0[0][1];
const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
const M = ([lon, lat]) => [lon * mLon, lat * mLat];

function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const unitsByLevel = new Map();
for (const u of imdf.units) {
  if (u.properties.category === 'walkway') continue;
  const list = unitsByLevel.get(u.properties.level_id) || [];
  list.push({ u, ring: u.geometry.coordinates[0].map(M), name: imdf.poiByUnit.get(u.id)?.name || u.properties.category });
  unitsByLevel.set(u.properties.level_id, list);
}
const outlineOf = new Map(imdf.levels.map((l) => [l.id, l.feature.geometry.coordinates[0].map(M)]));
const connectorKinds = new Set(['elevator', 'escalator', 'stairs']);

let seed = 11;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const named = imdf.pois.filter((p) => p.kind !== 'unnamed' && !connectorKinds.has(p.category));

let routes = 0;
let bad = 0;
const examples = [];
const t0 = performance.now();
for (let i = 0; i < PAIRS; i++) {
  const a = named[Math.floor(rand() * named.length)];
  const b = named[Math.floor(rand() * named.length)];
  if (a.id === b.id) continue;
  const r = router.route(a, b, { mode: ['fastest', 'lift', 'stairs', 'escalator'][i % 4] });
  if (!r) continue;
  routes++;
  let hit = null;
  for (const leg of r.legs) {
    const pts = leg.coordinates.map(M);
    // Only the start, the destination and the lifts/escalators/stairs this route rides may be entered.
    const allowed = new Set([a.unitId, b.unitId]);
    for (const t of r.transitions) {
      allowed.add(t.fromUnitId);
      allowed.add(t.toUnitId);
    }
    const walls = (unitsByLevel.get(leg.levelId) || []).filter((w) => !allowed.has(w.u.id));
    const outline = outlineOf.get(leg.levelId);
    for (let k = 1; k < pts.length && !hit; k++) {
      const [x1, y1] = pts[k - 1];
      const [x2, y2] = pts[k];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / STEP_M));
      for (let s = 0; s <= n; s++) {
        const p = [x1 + ((x2 - x1) * s) / n, y1 + ((y2 - y1) * s) / n];
        if (!inside(p, outline)) {
          hit = `${imdf.levelById.get(leg.levelId).short}: leaves the building`;
          break;
        }
        const w = walls.find((w) => inside(p, w.ring));
        if (w) {
          hit = `${imdf.levelById.get(leg.levelId).short}: through ${w.name}`;
          break;
        }
      }
    }
  }
  if (hit) {
    bad++;
    if (examples.length < 14) examples.push(`${a.name} -> ${b.name}: ${hit}`);
  }
}
console.log(`${bad} of ${routes} routes pass through a wall (${Math.round((performance.now() - t0) / Math.max(1, routes))} ms per route)`);
for (const e of examples) console.log('  ' + e);
process.exit(bad ? 1 : 0);
