// Copies each venue's IMDF archive, card content and photos from its source project into
// public/venues/<id>/, so the app serves (and caches for offline use) one folder per venue.
// Adding a venue = adding its IMDF project here and an entry in src/venues.js.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const VENUES = [
  { id: 'sarit', from: '../imdf-sarit/public' },
  { id: 'nisake', from: '../imdf-nisake/public' },
];

for (const v of VENUES) {
  const src = new URL(`../${v.from}/`, import.meta.url);
  const dest = new URL(`../public/venues/${v.id}/`, import.meta.url);
  if (!existsSync(new URL('imdf/manifest.json', src))) {
    console.error(`${v.id}: no IMDF archive at ${v.from}/imdf. Build it there first (npm run imdf).`);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const dir of ['imdf', 'content', 'photos']) {
    if (existsSync(new URL(dir, src))) cpSync(new URL(dir, src), new URL(dir, dest), { recursive: true });
  }
  console.log(`${v.id}: synced from ${v.from}`);
}
