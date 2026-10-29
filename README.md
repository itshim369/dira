# Dira

Indoor navigation for malls, business centres, hospitals and event venues in Nairobi. Choose where you are and where you are going, and Dira draws the route floor by floor on a 3D map, with written directions and a guided walk.

**Live:** https://dira-next.vercel.app

## What it does

- **Two questions, then the map.** "You are at" and "Going to", picked by search or by category (food, banks and ATMs, washrooms, exits). The map opens with the route.
- **Routes across floors** by the fastest way, escalator, lift (step free) or stairs, with time, distance and floor changes.
- **Guided walk.** A figure walks the route one step at a time on a following 3D camera, with turn arrows and the next landmark highlighted. It goes full screen on phones.
- **Written steps** with landmarks and floor tags, and a link to share a route.
- **Place cards** with photo, opening hours and what the place sells.
- **Whole-building view** for Nisake: the building stacked in 3D from the rooftop or the side, then zooming into the chosen floor.
- English, Kiswahili and French, light and dark mode, and works offline after the first visit.

## Venues

| Venue | Floors | Source |
|---|---|---|
| Sarit Centre, Westlands | 8 (Lower Ground to Sixth) | Traced from the official floor plan PDFs |
| Nisake Commercial Centre (demo) | 5 (Basement to Third) | Drawn from reference plans supplied by the team; tenants are made up |

Both are stored in [IMDF](https://docs.ogc.org/cs/20-094/index.html) 1.0.0, the indoor map standard used by Apple Maps.

## Repository layout

| Folder | What it holds |
|---|---|
| [`dira-next/`](dira-next/) | The web app (React 19, Vite, MapLibre GL). This is what is deployed. |
| [`imdf-sarit/`](imdf-sarit/) | Sarit Centre's IMDF archive and the scripts that build it, plus the shared engine the app uses: IMDF loading, routing (`src/route.js`), opening hours and map layers. |
| [`imdf-nisake/`](imdf-nisake/) | Nisake Commercial Centre's IMDF archive and the script that builds it. |
| [`dira-project.md`](dira-project.md) | Project brief: problem, product, brand and scope. |

The app reads the engine straight from `../imdf-sarit/src` and copies each venue's `public/` data in when it starts, so keep the three folders side by side.

## Run it

Needs Node.js 20.19+ or 22.12+.

```
cd dira-next
npm install
npm run dev       # http://localhost:5175
npm test          # prints written directions for sample routes
npm run build     # static site in dist/
```

Only `dira-next` needs `npm install`. `npm run dev` and `npm run build` sync the venue data first.

## Check the routes

```
cd imdf-sarit
node scripts/test-routes.mjs                  # every Sarit place reachable, on foot and step free
node scripts/audit-walls.mjs --pairs=800      # no route enters a unit or leaves the building

cd ../imdf-nisake
node scripts/check-routes.mjs                 # every Nisake place reachable by stairs, lift and fastest
```

## Change venue data

- **Nisake:** edit the layout in `imdf-nisake/scripts/build_imdf.mjs` and run `node scripts/build_imdf.mjs`.
- **Sarit:** tenant names are in `imdf-sarit/data/names-*.json`; fix one and run `npm run imdf` (needs Python). Re-tracing the floor plans (`npm run data`) needs the Sarit PDFs in `../images/`, which are not in this repository. See [`imdf-sarit/README.md`](imdf-sarit/README.md) and [`imdf-sarit/REVIEW.md`](imdf-sarit/REVIEW.md) for names still to confirm.
- **New venue:** build its IMDF archive, then add it to `dira-next/scripts/sync-venues.mjs` and `dira-next/src/venues.js` with `status: 'live'`.

## Deploy

The site is on Vercel. Because the app needs the neighbouring folders, it is built locally and only `dist/` is uploaded:

```
cd dira-next
npm run deploy
```

Bump `CACHE` in `dira-next/public/sw.js` with each release so returning visitors get the new version.

## Known limits

- Sarit floors 3 to 6 (the office tower) are placed approximately, and some tenant names on the upper floors could not be read from the plans.
- Opening hours are estimates, and most photos are labelled samples.
- There is no live position yet: the visitor picks the shop or sign in front of them as their start.
