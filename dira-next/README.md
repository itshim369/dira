# Dira on IMDF (dira-next)

A second Dira app built on the `imdf-sarit` IMDF archive. The original app in `dira-web` is untouched: this one copies its logo, icons, styles and offline service worker, and replaces the hand-drawn venue data and 2D map with the IMDF archive and a 3D map of every floor.

```
npm install
npm run dev     # http://localhost:5175 (syncs the venue data first)
npm run build   # static site in dist/
npm test        # prints written directions for a few routes
```

## Features

From the original Dira:

- Landing page, venues page with Sarit live and four venues coming soon, "Manage a venue?"
- Map screen: "You are at" and "Going to" with a searchable place picker grouped by floor, swap, the cross-section floor dropdown, Fastest / Escalator / Lift / Stairs, summary with time, distance, floor changes, next step and "All steps"
- Steps page: written turn-by-turn directions with landmarks and floor tags; tap a step to see it on the map
- Tap a shop on the map to set it as your start or destination, and "Report a wrong shop"
- Route kept in the URL, last route remembered on the device, works offline after the first visit

New:

- 3D map from the IMDF archive, all eight Sarit floors, with floor-change tags ("Up to 2") and a walking figure on the route
- Place cards with photo (real or a badged sample), open now, opening hours, description, product types, website
- Shortcuts for food, banks and ATMs, washrooms, exits and parking
- "Nearest washroom", "Nearest ATM" and "Nearest exit" from where you are
- Share a route as a link
- 2D and 3D view, approximate-position notice on the office tower floors

## How it fits together

| Path | What it does |
|---|---|
| `scripts/sync-venues.mjs` | Copies `../imdf-sarit/public/{imdf,content,photos}` into `public/venues/sarit/` |
| `src/venues.js` | Venue list. A live venue points at its synced folder |
| `src/data.js` | Loads a venue's IMDF archive and builds its router, once per session |
| `src/directions.js` | Turns a route into written steps (turns, landmarks, floor changes, side of arrival) |
| `src/components/IndoorMap.jsx` | The 3D map: one floor at a time, markers, route, tags, walking figure |
| `@imdf/*` | The shared engine in `../imdf-sarit/src` (IMDF loading, routing, opening hours, map layers) |

To add a venue: build its IMDF archive, add it to `scripts/sync-venues.mjs` and `src/venues.js` with `status: 'live'`.

The data limits listed in `../imdf-sarit/REVIEW.md` apply here too: approximate positions on floors 3 to 6, unreadable names, estimated opening hours and sample photos.
