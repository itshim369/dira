// Loads an IMDF archive (unzipped, served from /imdf) plus the viewer's card content, and
// indexes it: levels by ordinal, units, places (occupants, amenities, unnamed units).

const FILES = ['manifest.json', 'venue', 'building', 'level', 'footprint', 'unit', 'opening', 'amenity', 'anchor', 'occupant', 'address', 'relationship'];

export async function loadImdf(base = './imdf/', contentUrl = './content/places.json') {
  const entries = await Promise.all(
    FILES.map(async (f) => {
      const name = f.endsWith('.json') ? f : `${f}.geojson`;
      const res = await fetch(base + name);
      if (!res.ok) throw new Error(`Could not load ${name}`);
      return [f.replace('.json', ''), await res.json()];
    }),
  );
  let content = null;
  try {
    const res = await fetch(contentUrl);
    if (res.ok) content = await res.json();
  } catch {
    content = null;
  }
  return indexImdf(Object.fromEntries(entries), content);
}

export const label = (labels) => (labels ? labels.en || Object.values(labels)[0] : null);

// Occupant categories grouped into the shortcut buttons and map colours.
const GROUPS = {
  food: ['cafe', 'coffee', 'desserts', 'icecream', 'gelato', 'restaurant', 'fastfood', 'foodcourt', 'bakedgoods', 'indian', 'chinese', 'mexican', 'burgers', 'chickenshop', 'tapas', 'specialtyfood', 'loungebar'],
  money: ['bank', 'atm', 'currencyexchange', 'financialservices', 'insurance', 'insurance.health'],
  tech: ['mobilephones', 'telecommunications', 'computersandaccessories', 'electronicappliances', 'appliances', 'televisionserviceproviders'],
  style: ['clothing', 'clothing.womens', 'clothing.mens', 'departmentstore', 'uniforms', 'sportswear', 'shoes', 'jewelry', 'perfume', 'cosmetics', 'beautysalon', 'hairstylist', 'leathergoods', 'luggage', 'eyewear.opticians'],
  home: ['homedecor', 'homeandgarden', 'kitchenandbath', 'hardware', 'mattresses', 'furniture', 'carpet', 'lighting', 'artsandcrafts', 'pictureframing', 'giftshops', 'interiordesign'],
  grocery: ['supermarket'],
  fun: ['theater.movie', 'familyfuncenter', 'trampolining', 'eventspace', 'gym', 'sportsclub', 'floatspa'],
  health: ['pharmacy', 'dentistry', 'pediatrics', 'physician', 'opticians', 'veterinarian', 'vitaminssupplements'],
};

export function groupOf(category) {
  for (const [g, cats] of Object.entries(GROUPS)) if (cats.includes(category)) return g;
  return 'other';
}

const CATEGORY_TEXT = {
  appliances: 'Home appliances',
  bank: 'Bank',
  desserts: 'Frozen yoghurt',
  shopping: 'Shop',
  vitaminssupplements: 'Health store',
  electronicappliances: 'Electronics',
  giftshops: 'Gifts',
  bicycleshop: 'Bicycles',
  'eyewear.opticians': 'Optician',
  opticians: 'Optician',
  homedecor: 'Homeware',
  'realestate.agents': 'Real estate',
  leathergoods: 'Leather goods',
  jewelry: 'Jewellery',
  mobilephones: 'Phones',
  pharmacy: 'Pharmacy',
  cafe: 'Cafe',
  coffee: 'Coffee',
  hairstylist: 'Hair salon',
  courier: 'Courier',
  computersandaccessories: 'Computers',
  clothing: 'Fashion',
  'clothing.womens': "Women's fashion",
  'clothing.mens': "Men's fashion",
  airline: 'Airline office',
  veterinarian: 'Vet',
  beautysalon: 'Beauty',
  books: 'Books',
  shoes: 'Shoes',
  postoffice: 'Post office',
  currencyexchange: 'Forex bureau',
  artsandcrafts: 'Arts and crafts',
  perfume: 'Perfume',
  hardware: 'Hardware',
  advertising: 'Advertising',
  pictureframing: 'Framing',
  luggage: 'Luggage',
  mattresses: 'Mattresses',
  telecommunications: 'Mobile network',
  homeandgarden: 'Home and kitchen',
  kitchenandbath: 'Kitchen',
  supermarket: 'Supermarket',
  icecream: 'Ice cream',
  gelato: 'Gelato',
  restaurant: 'Restaurant',
  indian: 'Indian food',
  chinese: 'Chinese food',
  mexican: 'Mexican food',
  burgers: 'Burgers',
  chickenshop: 'Chicken',
  tapas: 'Wine and tapas',
  specialtyfood: 'Speciality food',
  bakedgoods: 'Bakery',
  loungebar: 'Lounge',
  cosmetics: 'Beauty',
  sportswear: 'Sportswear',
  sportinggoods: 'Sports',
  departmentstore: 'Department store',
  uniforms: 'Uniforms',
  toystore: 'Toys',
  babyclothesandsupplies: 'Baby',
  partysupplies: 'Party supplies',
  photography: 'Photo lab',
  copyshop: 'Printing',
  lighting: 'Lighting',
  furniture: 'Furniture',
  carpet: 'Carpets',
  televisionserviceproviders: 'Pay TV',
  familyfuncenter: 'Entertainment',
  trampolining: 'Trampoline park',
  'theater.movie': 'Cinema',
  eventspace: 'Expo hall',
  dentistry: 'Dentist',
  pediatrics: "Children's clinic",
  physician: 'Doctor',
  lawyer: 'Lawyers',
  accounting: 'Accountants',
  insurance: 'Insurance',
  'insurance.health': 'Health insurance',
  corporateoffices: 'Office',
  propertymanagement: 'Management office',
  businessconsulting: 'Consultants',
  passportvisaservices: 'Visa services',
  automotive: 'Motoring',
  architecture: 'Architects',
  interiordesign: 'Interior design',
  gym: 'Gym',
  sportsclub: 'Padel club',
  floatspa: 'Float spa',
  restroom: 'Washrooms',
  escalator: 'Escalator',
  elevator: 'Lift',
  stairs: 'Stairs',
  atm: 'ATM',
  entry: 'Entrance',
  parking: 'Car park',
  prayerroom: 'Prayer room',
  unnamed: 'Unit, name to confirm',
};
export const categoryText = (c) => CATEGORY_TEXT[c] || c.replace(/[._]/g, ' ').replace(/^\w/, (x) => x.toUpperCase());

export function indexImdf(raw, content = null) {
  const byId = new Map();
  for (const [name, fc] of Object.entries(raw)) {
    if (name === 'manifest') continue;
    for (const f of fc.features) byId.set(f.id, f);
  }
  const places = content?.places || {};
  const levelMeta = Object.values(content?.levels || {});
  const levels = [...raw.level.features]
    .sort((a, b) => a.properties.ordinal - b.properties.ordinal)
    .map((l) => {
      const meta = levelMeta.find((m) => m.id === l.id) || {};
      return {
        id: l.id,
        feature: l,
        ordinal: l.properties.ordinal,
        name: label(l.properties.name),
        short: label(l.properties.short_name),
        approximate: !!meta.approximate,
        note: meta.note || null,
      };
    });
  const levelById = new Map(levels.map((l) => [l.id, l]));
  const units = raw.unit.features;
  const unitById = new Map(units.map((u) => [u.id, u]));
  const levelOfUnit = (uid) => unitById.get(uid)?.properties.level_id;

  const pois = [];
  for (const o of raw.occupant.features) {
    const anchor = byId.get(o.properties.anchor_id);
    const unit = unitById.get(anchor.properties.unit_id);
    pois.push({
      id: o.id,
      kind: 'occupant',
      name: label(o.properties.name),
      category: o.properties.category,
      group: groupOf(o.properties.category),
      unitId: unit.id,
      levelId: unit.properties.level_id,
      point: anchor.geometry.coordinates,
      area: polygonArea(unit.geometry.coordinates[0]),
      content: places[o.id] || null,
    });
  }
  for (const a of raw.amenity.features) {
    const cat = a.properties.category;
    const unitId = a.properties.unit_ids[0] || null;
    pois.push({
      id: a.id,
      kind: 'amenity',
      name: label(a.properties.name) || categoryText(cat),
      category: cat,
      group: cat === 'atm' ? 'money' : cat === 'restroom' || cat === 'prayerroom' ? 'help' : ['entry', 'parking'].includes(cat) ? 'exits' : 'move',
      unitId,
      levelId: levelOfUnit(unitId),
      point: a.geometry.coordinates,
      area: 0,
      content: places[a.id] || null,
    });
  }
  // Units with no readable tenant name: tappable while reviewing, never in search results.
  const occupiedUnits = new Set(pois.map((p) => p.unitId));
  for (const u of units) {
    const c = places[u.id];
    if (!c?.unnamed || occupiedUnits.has(u.id)) continue;
    pois.push({
      id: u.id,
      kind: 'unnamed',
      name: 'Unnamed unit',
      category: 'unnamed',
      group: 'other',
      unitId: u.id,
      levelId: u.properties.level_id,
      point: u.properties.display_point.coordinates,
      area: polygonArea(u.geometry.coordinates[0]),
      content: c,
      reviewRef: c.feature,
    });
  }

  // Number repeated amenity names per level so lists stay readable ("Washrooms 2").
  const key = (p) => `${p.levelId}|${p.name}`;
  const totals = new Map();
  for (const p of pois) if (p.kind === 'amenity') totals.set(key(p), (totals.get(key(p)) || 0) + 1);
  const counter = new Map();
  for (const p of pois) {
    if (p.kind !== 'amenity' || totals.get(key(p)) < 2 || /\d$/.test(p.name)) continue;
    const n = (counter.get(key(p)) || 0) + 1;
    counter.set(key(p), n);
    p.name = `${p.name} ${n}`;
  }

  const relationships = raw.relationship.features.map((r) => ({
    category: r.properties.category,
    a: r.properties.origin.id,
    b: r.properties.destination.id,
  }));

  return {
    manifest: raw.manifest,
    venue: raw.venue.features[0],
    venueContent: content?.venue || null,
    building: raw.building.features[0],
    footprint: raw.footprint.features[0],
    levels,
    levelById,
    units,
    unitById,
    openings: raw.opening.features,
    relationships,
    pois,
    occupantByUnit: new Map(pois.filter((p) => p.kind === 'occupant').map((p) => [p.unitId, p])),
    poiByUnit: unitLookup(pois, unitById),
    counts: {
      levels: levels.length,
      units: units.length,
      occupants: raw.occupant.features.length,
      amenities: raw.amenity.features.length,
      openings: raw.opening.features.length,
      relationships: raw.relationship.features.length,
      unnamed: pois.filter((p) => p.kind === 'unnamed').length,
    },
  };
}

/** Which place a tap on a unit opens: its shop or unnamed-unit entry first, else an amenity
 * that owns the room (washrooms, lifts). Amenities standing in a corridor or shop never win. */
function unitLookup(pois, unitById) {
  const map = new Map();
  for (const p of pois) if (p.unitId && p.kind !== 'amenity') map.set(p.unitId, p);
  for (const p of pois) {
    if (p.kind !== 'amenity' || !p.unitId || map.has(p.unitId)) continue;
    const cat = unitById.get(p.unitId)?.properties.category;
    if (['restroom', 'escalator', 'elevator', 'stairs', 'room'].includes(cat)) map.set(p.unitId, p);
  }
  return map;
}

/** Area in square metres (equirectangular, fine at building scale). */
function polygonArea(ring) {
  const lat0 = (ring[0][1] * Math.PI) / 180;
  const mLat = 111132.92 - 559.82 * Math.cos(2 * lat0);
  const mLon = 111412.84 * Math.cos(lat0);
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) a += ring[i][0] * mLon * ring[i + 1][1] * mLat - ring[i + 1][0] * mLon * ring[i][1] * mLat;
  return Math.abs(a / 2);
}
