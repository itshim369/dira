// Writes review/walkable-<LEVEL>.svg: the router's walkable floor (cream), walls (units, dark),
// lift/travelator landings (blue) and, optionally, the door cells of one place (red).
// Usage: node scripts/render-walkable.mjs [LEVEL_SHORT ...] [--place="Blue Sky Dental"] [--from="Java" --to="AAR"]
// With --from/--to the route is drawn in green on every floor it crosses.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { indexImdf } from '../src/imdf.js';
import { createRouter } from '../src/route.js';

const dir = new URL('../public/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const raw = { manifest: read('imdf/manifest.json') };
for (const f of ['venue', 'building', 'level', 'footprint', 'unit', 'opening', 'amenity', 'anchor', 'occupant', 'address', 'relationship']) raw[f] = read(`imdf/${f}.geojson`);
const imdf = indexImdf(raw, read('content/places.json'));
const router = createRouter(imdf);
const placeArg = process.argv.find((a) => a.startsWith('--place='));
const place = placeArg ? imdf.pois.find((p) => p.name === placeArg.slice(8).replace(/"/g, '')) : null;
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const named = (flag) => {
  const a = process.argv.find((x) => x.startsWith(`--${flag}=`));
  return a ? imdf.pois.find((p) => p.name === a.slice(flag.length + 3).replace(/"/g, '')) : null;
};
const from = named('from');
const to = named('to');
const route = from && to ? router.route(from, to) : null;

const out = new URL('../review/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const g of router.inspect()) {
  const level = imdf.levelById.get(g.levelId);
  if (want.length && !want.includes(level.short)) continue;
  const lat0 = imdf.levels[0].feature.geometry.coordinates[0][0][1];
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
  const [lon00, lat00] = g.cellCentre(0, 0);
  const S = 4; // px per cell
  const px = ([lon, lat]) => [(((lon - lon00) * mLon) / g.cell) * S + S / 2, g.H * S - ((((lat - lat00) * mLat) / g.cell) * S + S / 2)];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${g.W * S}" height="${g.H * S}" viewBox="0 0 ${g.W * S} ${g.H * S}"><rect width="100%" height="100%" fill="#f4f1ee"/>`;
  let d = '';
  for (let j = 0; j < g.H; j++)
    for (let i = 0; i < g.W; i++) {
      if (!g.walk[j * g.W + i]) continue;
      d += `M${i * S} ${(g.H - 1 - j) * S}h${S}v${S}h-${S}z`;
    }
  svg += `<path d="${d}" fill="#f2d9c4"/>`;
  for (const u of imdf.units) {
    if (u.properties.level_id !== g.levelId || u.properties.category === 'walkway') continue;
    const pts = u.geometry.coordinates[0].map(px).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
    svg += `<polygon points="${pts}" fill="${['elevator', 'escalator', 'stairs'].includes(u.properties.category) ? '#5a3a2b' : '#c9b8ad'}" stroke="#3b2418" stroke-width="1.5"/>`;
  }
  for (const k of g.landings) svg += `<circle cx="${(k % g.W) * S + S / 2}" cy="${(g.H - 1 - Math.floor(k / g.W)) * S + S / 2}" r="6" fill="#2b6cb0"/>`;
  for (const leg of route?.legs || []) {
    if (leg.levelId !== g.levelId) continue;
    svg += `<polyline points="${leg.coordinates.map(px).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#1f8a4c" stroke-width="5" stroke-linejoin="round"/>`;
  }
  if (place && place.levelId === g.levelId) for (const k of g.doorsOf(place)) svg += `<rect x="${(k % g.W) * S}" y="${(g.H - 1 - Math.floor(k / g.W)) * S}" width="${S}" height="${S}" fill="#c8553d"/>`;
  svg += `<text x="10" y="24" font-family="Arial" font-size="20">${level.name}: walkable floor (sand), walls (grey/brown), landings (blue)${place ? `, doors of ${place.name} (red)` : ''}${route ? `, route ${from.name} to ${to.name} (green)` : ''}</text></svg>`;
  if (route && !route.legs.some((l) => l.levelId === g.levelId)) continue;
  const file = route ? `route-${level.short}.svg` : `walkable-${level.short}.svg`;
  writeFileSync(new URL(file, out), svg);
  console.log(`review/${file}`);
}
