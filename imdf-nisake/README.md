# Nisake Commercial Centre (IMDF)

A demo business centre for Dira, in IMDF 1.0.0. It is drawn from two reference plans supplied by the project owner:

- **Floors 1–3:** a four-storey student hostel, re-planned as a business centre. Every room is now a stall: eight per floor around a lounge and corridor. The staircase and lift stay where they were.
- **Ground floor:** the mess and kitchen become a food court with three food stalls. The reception stays. The parents' room becomes a business lounge, the toilets stay, and a bank agency with an ATM sits at the front.
- **Basement:** the games floor stays the fun floor. It has an arcade, an air hockey and table games room, a craft and art studio, a mini cinema and washrooms around the fireplace lounge. The basement stairs sit under the main staircase, and the lift runs to the basement too.

| Level | Theme |
|---|---|
| B | Fun zone |
| G | Food court and services |
| 1 | Fashion and beauty |
| 2 | Tech and services |
| 3 | Health and offices |

Tenant names are made up for the demo. Opening hours are marked `demo`, and photos are the openly licensed sample photos from `imdf-sarit` (credited on each card).

```
node scripts/build_imdf.mjs     # writes public/imdf/*, public/content/places.json, public/photos/mock/
node scripts/check-routes.mjs   # every place reachable from the main entrance by stairs, lift and fastest, no route through a wall
```

The layout is in metres in `scripts/build_imdf.mjs`. The building is 36 m × 20 m, `x` runs east along the street front and `y` runs north from the front wall. The building is placed on open ground in Nairobi (`ORIGIN`). The new Dira copies `public/` in with `npm run sync` and shows the whole building stacked in 3D (aerial and side views) before you choose a floor.
