# Sarit Centre in IMDF

A side project next to the Dira app. It turns the official Sarit Centre floor plans (all eight levels, Lower Ground to Sixth) into an IMDF 1.0.0 archive, then shows it in a 3D indoor map modelled on Pointr's web map: search card with shortcuts, place cards with photo, opening hours and product types, "Set a route", step-by-step directions across floors with a walking marker, step-free routing, floor switcher and zoom.

IMDF (Indoor Mapping Data Format) is the indoor map standard created by Apple and published by the OGC as a community standard. Apple Maps accepts venue maps in this format.

**Start with [REVIEW.md](REVIEW.md)**: it lists every unit whose name could not be read or needs confirming, how sure each floor's position is, and what is missing (photos, confirmed hours). The numbered maps in `review/` show where each unit is.

## Run it

```
npm install
npm run dev      # http://localhost:5174
npm test         # loads the archive and checks every place is reachable, on foot and step free
npm run build    # static site in dist/
```

## Rebuild the data

Needs Python with `opencv-python-headless`, `numpy` and `pymupdf`.

```
npm run data       # all three steps below
npm run extract    # trace every floor plan page into polygons (data/extracted-*.json, review/overlay-*.jpg)
npm run register   # line every floor up with the Lower Ground (data/registration.json)
npm run imdf       # write public/imdf/*, public/content/places.json and REVIEW.md
```

Tenant names live in `data/names-*.json`, one entry per traced unit id: `[name, IMDF occupant category, flag]`. Flags: `verify` (best reading, check on site), `label` (a car park or entrance sign drawn in blue, not a shop), `amenity` (a room that is an amenity, such as the prayer room). `null` means the name was not readable. Fix a name there and run `npm run imdf`.

## What is where

| Path | What it holds |
|---|---|
| `scripts/extract_units.py` | Traces one PDF page by colour: blue shops, warm grey walkways, yellow washrooms, green escalators, brown stairs, navy lifts, magenta ATMs, mid grey non-public space, green entrance markers, pale grey site |
| `scripts/register_floors.py` | Fits each floor onto the Lower Ground: building outline overlap, then lift shafts (they stack exactly). The office tower floors are placed on the Second floor's tower lifts |
| `scripts/build_imdf.py` | Georeferences everything and writes the IMDF feature files, including `relationship` features joining lifts, escalators and stairs between floors, then validates ids, references and required fields |
| `scripts/content.py` | Card content by business type, plus facts for well-known brands and the openly licensed photos. Not part of IMDF |
| `public/imdf/` | The archive, also zipped as `sarit-imdf.zip` |
| `public/content/places.json` | Card content keyed by IMDF feature id: description, product types, estimated hours, photo, website, review flags |
| `public/photos/` | Openly licensed photos from Wikimedia Commons, credited on each card |
| `public/photos/mock/` | Demo sample photos, one per type of business (`python scripts/fetch_mock_photos.py`). Cards badge them “Sample photo”. To use a tenant's real photo, add it to `PHOTOS` and `BRANDS` in `scripts/content.py` and run `npm run imdf` |
| `src/` | The viewer. `route.js` rasterises each floor's walkways into a 0.6 m grid and joins floors through the IMDF relationships |
| `data/landings.json` | Where you step on and off lifts and travelators when the plan alone does not show it (the travelators into Carrefour's entrance zone). Written into the archive as `opening` features |

## Walls and routes

Routes only use open floor. `route.js` fills each floor's walkway polygons (with their holes: shop blocks, voids, light wells), cuts out every other unit as solid wall, then drops the first cell next to any wall so routes keep about a metre off walls and corners. Corridors narrower than that (about 1.5 to 2 m, such as the corridor ends round AAR and AL on floors 3 and 4) are reopened along their centre line. Checks:

```
node scripts/audit-walls.mjs --pairs=800    # samples routes every 0.25 m; fails any that enter a unit or leave the building
node scripts/test-routes.mjs                # every place reachable from Carrefour, plus sample routes
node scripts/render-walkable.mjs 4 --place="Blue Sky Dental"       # review/walkable-4.svg: the open floor the router sees
node scripts/render-walkable.mjs --from="Hotpoint" --to="AAR"      # review/route-*.svg: a route drawn on each floor
```

## Known limits

- The HD PDF repeats the Lower Ground image on all eight pages, so Ground to Sixth come from the standard PDF at a quarter of the detail. That is why most of the unreadable names are on those floors. A sharp export of each floor would fix most of REVIEW.md.
- Georeference is approximate: the Lower Ground centre is pinned to Sarit Centre's published coordinates (1.25972 S, 36.80139 E), north is assumed up, and scale is estimated at 0.07 m per pixel of the HD plan. Change `ORIGIN`, `METRES_PER_PX` and `ROTATION_DEG` in `build_imdf.py` once surveyed points are available.
- Floors 3 and 4 (office tower) are placed by their lifts; floors 5 and 6 have one lift each and no shared outline, so their position is a guess. The viewer marks these floors as approximate.
- Shop doors are not on the plans, so routes may enter a unit from any side that faces a corridor. IMDF `opening` features on unit edges would fix this.
- Opening hours are estimates by type of business and are labelled as such. Only Carrefour, KCB and the venue itself have photos (openly licensed, from other branches where noted); every other card asks for one.
