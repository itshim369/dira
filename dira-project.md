# Dira: Project Brief

Indoor navigation web app for malls, hospitals, conferences and events. First live venue: Sarit Centre, Westlands, Nairobi.

Last updated: 25 October 2026

---

## 1. Problem

People get lost inside large venues such as malls, conference centres, event grounds and hospitals. Once inside, they cannot easily tell:

- which area or floor they are on
- where a specific destination is (Conference Room 1, the dining hall, a shop, the stairs, washrooms)
- how to get there, especially when the route crosses floors

Outdoor maps (Google Maps) do not solve this well indoors: GPS is weak inside buildings, and most venues do not publish usable floor-level maps.

## 2. Solution

Dira shows the venue's floor plan, lets the user mark where they are and where they want to go, and draws the route on the map, floor by floor, with written step-by-step directions.

### 2.1 Full product (long term)

| Area | Description |
|---|---|
| Venue maps | Venues supply their floor plans. Dira converts them into interactive maps with every shop, room, lift, escalator, staircase, washroom and entrance. |
| Floor selector | Multi-storey buildings have a floor dropdown. Floors on the current route are marked. |
| Tier 1: Google Maps integration (paid by the venue) | Live GPS position. The user's movement updates on the map as they walk. |
| Tier 2: Offline mode (default, venue has not paid) | No live tracking. The user picks their location by matching what they see (a shop, a landmark) to the map, then picks a destination and gets a static route with directions. Less interactive than Tier 1, but it works without connectivity or integration. |
| Floor changes | The user chooses how to change floors: fastest, escalator, lift (step free) or stairs. |

### 2.2 Prototype scope (current phase)

- Offline mode only. No GPS, no Google Maps.
- Web app, mobile first, fully responsive.
- Sarit Centre as the one live venue, mapped from its official floor plan PDF.
- A small set of demo venues with sample data to show the app supports multiple venue types.
- User keys in their location (search or tap on the map), picks a destination, and the app draws the route with lines across floors.

## 3. Brand

### 3.1 Name

**Dira** (previous working name "Njia" is retired).

### 3.2 Logo

Three SVG files supplied by the team:

| File | Use |
|---|---|
| `dira-logo-light.svg` | Cream background (#FAF3EC), espresso wordmark and trail |
| `dira-logo-on-espresso.svg` | Espresso background (#3B2418), cream wordmark, sand trail |
| `dira-logo-dark.svg` | Transparent background, for dark surfaces |

Logo parts: a terracotta map pin (#C8553D) with a hollow centre, a dotted trail leading to it from a start dot, and the "Dira" wordmark below. In the web app the pin mark and wordmark are used side by side in headers, and the full stacked logo is used in feature sections.

### 3.3 Colour

The palette is limited to two brand colours plus tints taken from the logo. No other hues.

| Token | Hex | Use |
|---|---|---|
| Terracotta | `#C8553D` | Primary actions, route line, destination highlight, accents |
| Espresso | `#3B2418` | Text, dark surfaces, floor dropdown, secondary buttons |
| Cream | `#FAF3EC` | Page background (from the light logo) |
| Sand | `#F2D9C4` | Chips, icon backgrounds, logo trail on dark |
| White | `#FFFFFF` | Cards, map surfaces |
| Line | `#EAD9CE` | Borders and dividers (tint of the brand colours) |
| Muted text | `#6B5146`, `#8A6E62` | Secondary text (tints of espresso) |

### 3.4 Typography

Google Fonts, latin subset:

- **Unbounded** (600, 800): headings, wordmark-style numbers, step numbers, time estimates
- **Instrument Sans** (400 to 700): body text, labels, buttons, map labels

### 3.5 Design rules (set by the team)

- No em dashes anywhere in copy.
- No emojis. Icons are line-drawn SVG icons only.
- Only the two brand colours (plus the tints above). No multi-colour palettes.
- No floating decorative dots. Route lines on maps are solid, not dotted. (The dotted trail inside the logo itself stays as designed.)
- No cards with glowing bottom shadows or glowing outlines. Cards use flat 1.5px borders.
- The floor dropdown must always be present on the map screen.
- Must look interactive and appealing to first-time users.
- Mobile responsive.

## 4. Screens and user flow

```
Landing  ->  Get started  ->  Choose a venue  ->  Sarit Centre card  ->  Map + route  ->  All steps
```

### 4.1 Landing (hero page)

- Header: Dira logo, "Venues" link, "Open app" button.
- Hero: eyebrow "Indoor navigation", headline "Never get lost inside a building again.", one-paragraph explanation, "Get started" (primary) and "How it works" (secondary).
- Hero visual: a sample floor plan card with a route line, floor dropdown chip and a "Next step" bar.
- "Made for": Malls, Hospitals, Conferences, Events.
- "Three taps to anywhere": 01 Choose your venue, 02 Tap where you are, 03 Follow the line.
- Feature rows: Works offline; Every floor in one dropdown; Escalator, lift or stairs.
- Closing section on espresso: "Start with Sarit Centre" with the full logo and a "Get started" button.
- Footer.

### 4.2 Choose a venue (home)

- Back button, logo.
- Title "Where are you today?", search field, category chips (All, Malls, Hospitals, Events).
- Featured Sarit Centre card with an illustrated map preview (the card and image are clickable), "Live" tag, facts (8 floors, 4 car parks, works offline), "Open map" button.
- "More venues" grid of demo venues tagged "Demo".
- "Manage a venue?" call to action for venue owners.

### 4.3 Map and route

- Header: back, venue name, "offline map saved" status, search.
- Route card: "You are at" and "Going to" (each opens a searchable place picker), swap button.
- Floor dropdown (native select) listing all floors.
- Floor-change mode chips: Fastest, Escalator, Lift, Stairs.
- Interactive floor plan: tap any shop to set it as start or destination. Route drawn as a solid terracotta line with a white casing, start dot, destination pin, "You are here" label, escalator, lift and washroom markers, zoom controls.
- Summary: time, distance, number of floor changes, next step, "All steps" button.

### 4.4 Floors and steps

- Route summary with the floor sequence (for example Lower Ground, Ground, First).
- Floor dropdown expanded, floors tagged Start, Route or Destination.
- Ordered step list. Each step has an icon (turn, escalator, lift, stairs, arrive), a sentence, a landmark, and a floor tag. Tapping a step jumps the map to that floor.

### 4.5 Responsive behaviour

| Screen | Desktop (1280px) | Phone (390px) |
|---|---|---|
| Landing | Hero text beside the map preview; steps and features in 3 columns | Everything stacks to one column |
| Venues | Search beside the title; Sarit card image beside its details; demo venues in a multi-column grid | Single column |
| Map | Route panel on the left, map on the right | Route panel above the map |
| Steps | Summary and floor dropdown beside the step list | Stacked |

Implementation notes: fluid layouts with flex-wrap and auto-fit grids, type sized with `clamp()`, touch targets at least 44px, 16px minimum side gutter, no horizontal page scroll.

## 5. Venue data: Sarit Centre

Source: `Sarit_Centre_Mall_Map.pdf` (8 pages, one per floor). Tenant names below are transcribed from the PDF; names marked "(verify)" were too small to read with certainty. The PDF is a snapshot and some tenants may have moved.

The building has a diagonal north-west wing, a central loop of shops on the main floors, and an office tower (floors 3 to 6).

### 5.1 Lower Ground

- Anchors: Carrefour, Hotpoint, Absa Bank
- Shops and services: KCB Advantage, Safaricom (2 units), Oppo, Silent Night, Kashco, I&M Bank Select, Kashmir Arts, NCBA Bank, Homecare (verify), Posta, Colostone, Vivo, Jaffs Optical (2 units), Monty's Kenya Ltd, Java, Goodlife Pharmacy, Mi Home, Kaiser, Craigs Ltd, Bank of Baroda, Healthy U 2000 Ltd, Eye Co, Bella Zuri, NCBA Loop, Samsung, Knight Frank, Vitu Zote, Prime Bank, Holiday Bazaar (verify)
- Parking and access: Car Park A, Car Park B, Silo Car Park, Pedestrian entry/exit Lower Kabete Road
- Amenities: washrooms (3 marked), escalators, stairs, lifts, accessible routes

### 5.2 Ground floor

- Anchors: LC Waikiki, MRP Home, Max, Text Book Centre, Toyworld, Nairobi Sports House
- Shops and services: KCB Bank, Bata Shoe Kenya, I&M Bank, Noor Lampshades, Microcity, Airtel Kenya, Telkom, House of Gear (verify), Kashmir Arts, Anisuma, Chapa Copy, Goodlife Pharmacy, Africolor Labs Ltd, Techno, Miniso, Skechers, Huawei, Five Elements by Healthy U, Home & Beyond, Lavie International, The Summer Lounge, Anta, Babyshop, Cilantro, BBrood, The Whisk Shop, Jewelart Jewellers, Vivo Woman, Octave, Smart Baby, Levis, Clarks, Party Depot, Nikon, Swarovski, True Cosmetics, Mycurves, City Walk, Lintons Beauty World, Nail Bar, City Brands
- Parking and access: Car Park C, Silo Car Park, pedestrian entry/exit to Karuna Road, second pedestrian entry on the west side, two ride-app pickup points
- Amenities: washrooms (3 marked), escalators, stairs, lifts

### 5.3 First floor

- Anchors: Woolworths, Pins Entertainment, Sports Direct, Nike Store, Mr. Price (MRP), DTB Bank
- Shops and services: The Daily Cafe and Bistro, DIB Bank, Tulip, Italian Men's & Ladies' Fashions (2 units), Emarati Perfumes, Haria Uniforms, Multichoice Kenya, African Lifestyle Hub Fashion, African Lifestyle Hub Home, Secrets, Vero Moda / Jack and Jones, Dr. Mattress, Leos Salon, Standard Chartered Bank, Adidas, True Cosmetics, Town Team, Samsonite, Tessori Jewellery, Aldo, Safari / Vivo Sale Outlet, House of Brands, CPS, Home and Beyond, Victoria Carpet, DRM Furniture, Tanja, Puma, Kitu Kali, Yves Rocher, Barista & Co, Prayer Room
- Amenities: washrooms (2 marked), escalators, stairs, lifts

### 5.4 Second floor

- Anchors: Sarit Expo Centre, Century Cinemax, Jump Extreme
- Food: Rocomamas, Sierra Wines & Tapas, Bila Shaka, Gelato Street, Non Solo Gelato, Fonda's Taqueria, The Dhaba, Paan Island, Tastigo Grill, Hatchbox, Chinese Corner, American Fried Chicken, Let's Eat Indian, food court seating
- Offices and services: Sarit Management, Vista Management, Strategic Consultants, WWICS, AA of Kenya, Gertrude's Children's Hospital, Bhullar Advocates, Beauty Quest, Pinnacle Dental Centre, The Library
- Amenities: washrooms (2 marked), escalators, stairs, lifts

### 5.5 Third floor (office tower)

Design for Living, AL, AA Kenya, GSM Retail, Urban Dynamics, SA, Dr. Abda F. Khan, Serv-All Insurance Agency Ltd, Eyequip Vision Ltd. Two lifts, one staircase.

### 5.6 Fourth floor (office tower)

AAR, Blue Sky Dental, Upin Vasani & Co (Certified Public Accountants), SPL, AL. Two lifts, one staircase.

### 5.7 Fifth floor

Alloy Padel. Stairs and lift.

### 5.8 Sixth floor

Alloy Lounge, Smash Fit, Refloat Studio. Stairs and lift.

### 5.9 Map drawing approach

- Redraw each floor as simplified vector shapes in Dira's colours, following Sarit's real layout (including the diagonal wing) so it matches the signs on site.
- Do not copy the PDF artwork directly.
- Real brand logos are not used. Each shop shows its name, with a lettered tile in the brand colours where a badge is needed.

## 6. Demo venues (sample data)

| Venue | Type | Size |
|---|---|---|
| Kijani Galleria | Mall | 3 floors |
| Mto Plaza | Mall | 2 wings, 4 floors, linked by a ground floor walkway |
| Lakeview Medical Centre | Hospital | 4 floors |
| Nairobi Tech Expo 2026 | Event | 2 halls |

All four are invented. Kijani Galleria and Mto Plaza already have full sample maps from the first prototype (see section 9).

## 7. Navigation engine

Built and tested in the first prototype; carries over to the web app.

### 7.1 Map model

- Each floor has **corridors** (line segments) and **places** (shops, amenities, connectors), each with an outline and a door point.
- Each door is projected onto the nearest corridor. The corridors are split at every door projection and junction, forming a walking graph.
- **Connectors** (escalator, lift, stairs, walkway) link the same connector across adjacent floors. Walkways link separate wings.

### 7.2 Route search

Dijkstra shortest path over the graph. Corridor edges cost their length. Connector edges cost depends on the selected mode:

| Mode | Escalator | Stairs | Lift | Walkway |
|---|---|---|---|---|
| Fastest | 120 | 160 | 220 | 150 |
| Escalator | 60 | 900 | 900 | 150 |
| Lift (step free) | not allowed | not allowed | 60 | 150 |
| Stairs | 900 | 60 | 900 | 150 |

Costs are in map units per floor change. If no route exists (for example step free between floors with no lift), the app says so.

### 7.3 Directions

- Path is split into one leg per floor. Collinear segments merge into single walking runs.
- Turns come from the cross product of the previous and current direction: left, right, straight, or turn around.
- Each run names a landmark at its end ("until you reach Anisuma").
- Runs under 3 m are folded into the next instruction.
- Floor changes merge consecutive levels into one step ("Take the escalator up to Level 2, 2 floors").
- Final step states which side the destination is on.
- Distance: map units converted to metres by a per-venue scale. Time: walking at 1.2 m/s plus per-level connector time (escalator 25s, lift 45s, stairs 35s, walkway 25s).

### 7.4 Proposed venue data format (JSON, one file per venue)

```json
{
  "id": "sarit",
  "name": "Sarit Centre",
  "area": "Westlands, Nairobi",
  "type": "mall",
  "scale": 0.6,
  "floors": [
    {
      "id": "G",
      "name": "Ground floor",
      "level": 0,
      "stack": "main",
      "outline": [[24,158],[146,36],[192,36]],
      "corridors": [[176,72,116.6,131.4]],
      "places": [
        {
          "id": "G-toyworld",
          "name": "Toyworld",
          "category": "kids",
          "shape": [[252,212],[288,212],[288,264],[252,264]],
          "door": [270,212]
        },
        {
          "id": "G-esc-1",
          "name": "Escalators",
          "category": "escalator",
          "connects": "esc-1",
          "shape": [[160,160],[178,160],[178,178],[160,178]],
          "door": [169,178]
        }
      ]
    }
  ]
}
```

Adding a venue means adding a data file, not changing code.

## 8. Place categories

- Shops: supermarket, food and drink, fashion, beauty, health, banking, electronics, home, kids, entertainment, services, sport and fitness
- Amenities: washrooms, help desk, entrance, car park, baby care, prayer or quiet room, seating, ATM, ride-app pickup
- Connectors: escalator, lift, stairs, walkway

## 9. Work produced so far

| Item | Status |
|---|---|
| First prototype ("Njia", single-page offline app) | Built. Three invented malls (Kijani Galleria, Mto Plaza, Savanna Square), working route engine, floor dropdown, mode selection, turn-by-turn steps. Design rejected; engine kept. |
| Design review canvas ("Dira Design Review") | Built. Four screens (Landing, Choose a venue, Sarit map, Floors and steps) at desktop and phone width, using Dira branding, logo, palette and fonts. Map and steps on these screens are illustrative, not computed yet. |
| Dira logo (light, on espresso, dark) | Supplied by the team, in use. |
| Sarit Centre floor plan PDF | Supplied, transcribed in section 5. |

## 10. Open decisions

1. **Floors to map:** all 8 Sarit floors with every tenant, or Lower Ground to Second in full and floors 3 to 6 simplified.
2. **Demo venues:** open working sample maps, or show a "Map coming soon" page.
3. **Shop badges:** confirm name plus lettered tile in place of brand logos.
4. **Build target:** single web app published for review, or a project folder (for example React + Vite) the team runs and extends.
5. **Dark mode:** add one using espresso as the background, or keep light only.

## 11. Suggestions

- Keep venue maps as data files so new venues need no code changes.
- Include car parks (A, B, C, Silo) and ride-app pickups as selectable start points, since many visitors arrive by car or taxi.
- Add a "Report a wrong shop" link so venues can send corrections when tenants change.
- Save each venue's map on the device after first open so offline mode works in basements and car parks.

## 12. Next steps

1. Team answers the open decisions in section 10.
2. Trace Sarit Centre floors into the venue data format.
3. Build the web app on the approved design with the existing route engine.
4. Test routes on site at Sarit Centre and correct the map data.
5. Prepare the venue onboarding process (floor plan intake, mapping, review) for the next venues.
