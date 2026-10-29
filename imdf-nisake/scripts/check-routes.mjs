// Every place reachable from the main entrance, no route through a wall. Run after build_imdf.
import { readFileSync } from 'node:fs';
import { indexImdf } from '../../imdf-sarit/src/imdf.js';
import { createRouter } from '../../imdf-sarit/src/route.js';
const read = (f) => JSON.parse(readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8'));
const raw = { manifest: read('imdf/manifest.json') };
for (const f of ['venue', 'building', 'level', 'footprint', 'unit', 'opening', 'amenity', 'anchor', 'occupant', 'address', 'relationship']) raw[f] = read(`imdf/${f}.geojson`);
const imdf = indexImdf(raw, read('content/places.json'));
const router = createRouter(imdf);
const entrance = imdf.pois.find((p) => p.name === 'Main entrance');
const lat0 = imdf.levels[0].feature.geometry.coordinates[0][0][1];
const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
const M = ([x, y]) => [x * mLon, y * mLat];
const inside = ([x, y], ring) => { let h = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) h = !h; } return h; };
let bad = 0, miss = 0, n = 0;
for (const mode of ['fastest', 'lift', 'stairs']) for (const p of imdf.pois) {
  if (p.id === entrance.id) continue;
  const r = router.route(entrance, p, { mode });
  if (!r) { miss++; console.log('no route', mode, p.name); continue; }
  n++;
  const allowed = new Set([entrance.unitId, p.unitId, ...r.transitions.flatMap((t) => [t.fromUnitId, t.toUnitId])]);
  for (const leg of r.legs) {
    const walls = imdf.units.filter((u) => u.properties.level_id === leg.levelId && u.properties.category !== 'walkway' && !allowed.has(u.id)).map((u) => ({ u, ring: u.geometry.coordinates[0].map(M) }));
    const pts = leg.coordinates.map(M);
    for (let k = 1; k < pts.length; k++) for (let s = 0; s <= 20; s++) {
      const q = [pts[k - 1][0] + ((pts[k][0] - pts[k - 1][0]) * s) / 20, pts[k - 1][1] + ((pts[k][1] - pts[k - 1][1]) * s) / 20];
      const w = walls.find((w) => inside(q, w.ring));
      if (w) { bad++; console.log('through wall', p.name, '->', w.u.properties.name?.en); k = pts.length; break; }
    }
  }
}
console.log(`${n} routes, ${miss} missing, ${bad} through walls; ${imdf.pois.length} places`);
const show = (to, mode) => { const r = router.route(entrance, imdf.pois.find((p) => p.name === to), { mode }); console.log(`Main entrance -> ${to} (${mode}): ${Math.round(r.metres)} m, ${r.transitions.map((t) => t.kind).join(', ') || 'same floor'}`); };
show('Nisake Mini Cinema', 'fastest'); show('Afya Dental Clinic', 'lift'); show('Hatua Shoes', 'stairs'); show('Ladies washrooms', 'fastest');
process.exit(bad || miss ? 1 : 0);
