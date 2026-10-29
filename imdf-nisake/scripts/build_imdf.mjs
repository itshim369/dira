// Builds the IMDF 1.0.0 archive and card content for Nisake Commercial Centre.
//
// Drawn from two reference plans supplied by the project owner (26 October 2026):
//  - a four-storey hostel (ground floor with mess, kitchen, reception, parents' room and
//    toilets; floors 1 to 3 with eight rooms each around a lounge, a staircase and a lift),
//    re-planned as a business centre: every room is a stall, the mess is a food court, the
//    parents' room a business lounge, the staircase and lift stay where they are;
//  - a basement games floor (games/fireplace room, craft room, theatre, bathroom, heater room,
//    storage), kept as the fun floor: arcade, table games, craft studio and mini cinema. The
//    basement stair is placed under the main staircase and a lift is added beside it.
//
// Plans are laid out in metres: x runs east along the street front, y north from the front
// wall. Building 36 m x 20 m; the main entrance is in the middle of the front (south) wall.
// Run: node scripts/build_imdf.mjs
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/', import.meta.url);
const SARIT_MOCK = new URL('../../imdf-sarit/public/photos/mock/', import.meta.url);

// A demo building: placed on open ground in Nairobi so the basemap stays empty around it.
const ORIGIN = [36.7842, -1.2928]; // lon, lat of the building's south-west corner
const mLat = 111132.92 - 559.82 * Math.cos((2 * ORIGIN[1] * Math.PI) / 180);
const mLon = 111412.84 * Math.cos((ORIGIN[1] * Math.PI) / 180);
const ll = ([x, y]) => [+(ORIGIN[0] + x / mLon).toFixed(8), +(ORIGIN[1] + y / mLat).toFixed(8)];

const uuid = (key) => {
  const h = createHash('sha1').update(`nisake:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const ring = (pts) => {
  // Exterior rings counter-clockwise (RFC 7946), closed.
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  const p = a < 0 ? [...pts].reverse() : pts;
  return [...p, p[0]].map(ll);
};
const polygon = (pts) => ({ type: 'Polygon', coordinates: [ring(pts)] });
const centroid = (pts) => {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
};
const point = (xy) => ({ type: 'Point', coordinates: ll(xy) });

// ---------- Shared core: the staircase and lift stack on every floor ----------
const STAIRS = rect(13, 15, 19, 20);
const LIFT = rect(19, 16, 22, 20);
const CORE_DOOR = [19, 14]; // where you step off the stairs or lift, in the lobby

// ---------- Floors ----------
// Each unit: [key, outline, unit category, occupant {name, category, ...} or amenity, ...]
const UPPER_WALKWAY = [
  [0, 6.5], [36, 6.5], [36, 9.5], [26, 9.5], [26, 20], [22, 20], [22, 16], [19, 16], [19, 15], [13, 15], [13, 20], [10, 20], [10, 9.5], [0, 9.5],
];
function upperFloor(n, tenants) {
  const no = (k) => `${n}0${k}`;
  const stall = (k, outline) => ({ key: `stall-${no(k)}`, outline, category: 'room', occupant: { ...tenants[k - 1], stall: no(k) } });
  return [
    stall(1, rect(0, 14.75, 10, 20)),
    stall(2, rect(0, 9.5, 10, 14.75)),
    stall(3, rect(26, 9.5, 36, 14.75)),
    stall(4, rect(26, 14.75, 36, 20)),
    stall(5, rect(0, 0, 9, 6.5)),
    stall(6, rect(9, 0, 18, 6.5)),
    stall(7, rect(18, 0, 27, 6.5)),
    stall(8, rect(27, 0, 36, 6.5)),
    { key: 'balcony-w', outline: rect(-2.2, 9.5, 0, 20), category: 'nonpublic', name: 'Balcony' },
    { key: 'balcony-e', outline: rect(36, 9.5, 38.2, 20), category: 'nonpublic', name: 'Balcony' },
    { key: 'lounge', outline: UPPER_WALKWAY, category: 'walkway', name: 'Lounge and corridor', amenities: [{ key: 'seating', category: 'seating', name: 'Lounge seating', at: [18, 11] }] },
  ];
}

const LEVELS = [
  {
    key: 'B',
    ordinal: -1,
    name: 'Basement',
    short: 'B',
    theme: 'Fun Zone',
    outline: [[0, 0], [36, 0], [36, 20], [8, 20], [8, 10], [0, 10]],
    units: [
      // Games room: the open lounge with armchairs and fireplace stays open floor; the air
      // hockey and games tables become an arcade and a table games room.
      { key: 'lounge', outline: [[8, 6], [26, 6], [26, 20], [22, 20], [22, 16], [19, 16], [19, 15], [8, 15]], category: 'walkway', name: 'Fireplace lounge', amenities: [{ key: 'fireplace', category: 'seating', name: 'Fireplace lounge', at: [12, 9] }] },
      { key: 'arcade', outline: rect(8, 0, 22, 6), category: 'room', occupant: { name: 'Nisake Arcade', category: 'familyfuncenter', stall: 'B01' } },
      { key: 'airhockey', outline: rect(8, 15, 13, 20), category: 'room', occupant: { name: 'Air Hockey & Table Games', category: 'familyfuncenter', stall: 'B02' } },
      { key: 'craft', outline: rect(0, 0, 8, 10), category: 'room', occupant: { name: 'Ufundi Craft & Art Studio', category: 'artsandcrafts', stall: 'B03' } },
      { key: 'cinema', outline: rect(26, 6, 36, 20), category: 'room', occupant: { name: 'Nisake Mini Cinema', category: 'theater.movie', stall: 'B04' } },
      { key: 'wc', outline: rect(22, 0, 27, 6), category: 'restroom', amenity: { category: 'restroom', name: 'Washrooms' } },
      { key: 'plant', outline: rect(27, 0, 31.5, 6), category: 'nonpublic', name: 'Plant room' },
      { key: 'store', outline: rect(31.5, 0, 36, 6), category: 'nonpublic', name: 'Storage' },
    ],
  },
  {
    key: 'G',
    ordinal: 0,
    name: 'Ground floor',
    short: 'G',
    theme: 'Food court and services',
    outline: rect(0, 0, 36, 20),
    units: [
      {
        key: 'lobby',
        outline: [[0, 0], [26, 0], [26, 4.5], [36, 4.5], [36, 6], [26, 6], [26, 20], [22, 20], [22, 16], [19, 16], [19, 15], [0, 15]],
        category: 'walkway',
        name: 'Reception lobby and food court',
        amenities: [
          { key: 'entrance', category: 'entry', name: 'Main entrance', at: [18, 0.8] },
          { key: 'info', category: 'information', name: 'Reception and information', at: [18, 7] },
          { key: 'seating', category: 'seating', name: 'Food court seating', at: [6, 8] },
        ],
      },
      // The kitchen, store and wash area along the back of the mess become three food stalls.
      { key: 'food-1', outline: rect(0, 15, 4.5, 20), category: 'room', occupant: { name: 'Choma Grill House', category: 'restaurant', stall: 'G01' } },
      { key: 'food-2', outline: rect(4.5, 15, 9, 20), category: 'room', occupant: { name: 'Pwani Swahili Kitchen', category: 'specialtyfood', stall: 'G02' } },
      { key: 'food-3', outline: rect(9, 15, 13, 20), category: 'room', occupant: { name: 'Kahawa Corner', category: 'coffee', stall: 'G03' } },
      // Parents' room -> business lounge; toilets stay; a bank agency at the front.
      { key: 'lounge', outline: rect(26, 11, 36, 20), category: 'room', occupant: { name: 'Nisake Business Lounge', category: 'corporateoffices', stall: 'G04' } },
      { key: 'wc-ladies', outline: rect(26, 6, 31, 11), category: 'restroom', amenity: { category: 'restroom', name: 'Ladies washrooms' } },
      { key: 'wc-gents', outline: rect(31, 6, 36, 11), category: 'restroom', amenity: { category: 'restroom', name: 'Gents washrooms' } },
      { key: 'bank', outline: rect(26, 0, 36, 4.5), category: 'room', occupant: { name: 'Pesa Point Bank Agency', category: 'bank', stall: 'G05' }, amenities: [{ key: 'atm', category: 'atm', name: 'ATM', at: [27.2, 5.2], inWalkway: true }] },
    ],
  },
  {
    key: 'F1',
    ordinal: 1,
    name: 'First floor',
    short: '1',
    theme: 'Fashion and beauty',
    outline: [[0, 0], [36, 0], [36, 9.5], [38.2, 9.5], [38.2, 20], [-2.2, 20], [-2.2, 9.5], [0, 9.5]],
    units: upperFloor(1, [
      { name: 'Kitenge Couture', category: 'clothing.womens' },
      { name: 'Urembo Beauty Bar', category: 'beautysalon' },
      { name: 'Kinyozi Classic Barbers', category: 'hairstylist' },
      { name: 'Hatua Shoes', category: 'shoes' },
      { name: 'Shanga Jewellery', category: 'jewelry' },
      { name: 'Mavazi Menswear', category: 'clothing.mens' },
      { name: 'Rangi Optical', category: 'eyewear.opticians' },
      { name: 'Harufu Perfumes', category: 'perfume' },
    ]),
  },
  {
    key: 'F2',
    ordinal: 2,
    name: 'Second floor',
    short: '2',
    theme: 'Tech and services',
    outline: [[0, 0], [36, 0], [36, 9.5], [38.2, 9.5], [38.2, 20], [-2.2, 20], [-2.2, 9.5], [0, 9.5]],
    units: upperFloor(2, [
      { name: 'Simu Hub', category: 'mobilephones' },
      { name: 'Kompyuta Point', category: 'computersandaccessories' },
      { name: 'Chapa Print & Copy', category: 'copyshop' },
      { name: 'Picha Photo Studio', category: 'photography' },
      { name: 'Fundi Electronics Repair', category: 'electronicappliances' },
      { name: 'Vitabu Bookshop', category: 'books' },
      { name: 'Zawadi Gifts', category: 'giftshops' },
      { name: 'Safiri Travel', category: 'airline' },
    ]),
  },
  {
    key: 'F3',
    ordinal: 3,
    name: 'Third floor',
    short: '3',
    theme: 'Health and offices',
    outline: [[0, 0], [36, 0], [36, 9.5], [38.2, 9.5], [38.2, 20], [-2.2, 20], [-2.2, 9.5], [0, 9.5]],
    units: upperFloor(3, [
      { name: 'Afya Dental Clinic', category: 'dentistry' },
      { name: 'Tiba Family Doctors', category: 'physician' },
      { name: 'Dawa Pharmacy', category: 'pharmacy' },
      { name: 'Haki Advocates', category: 'lawyer' },
      { name: 'Hesabu Accountants', category: 'accounting' },
      { name: 'Bima Insurance Agency', category: 'insurance' },
      { name: 'Kazi Co-working', category: 'corporateoffices' },
      { name: 'Nguvu Fitness Studio', category: 'gym' },
    ]),
  },
];

// ---------- Card content ----------
const TEXT = {
  familyfuncenter: ['Games and family fun.', ['Arcade games', 'Air hockey', 'Birthday parties'], 'Mo-Su 10:00-22:00'],
  artsandcrafts: ['Craft and art studio: classes, kits and supplies.', ['Art classes', 'Craft kits', 'Kids workshops'], 'Tu-Su 10:00-19:00'],
  'theater.movie': ['Mini cinema with recliner seating for 30.', ['Films', 'Private screenings', 'Snacks'], 'Mo-Su 12:00-23:00'],
  restaurant: ['Grilled meats, ugali and kachumbari.', ['Nyama choma', 'Lunch', 'Takeaway'], 'Mo-Su 10:00-22:00'],
  specialtyfood: ['Coastal Swahili dishes: biryani, pilau and samosas.', ['Biryani', 'Pilau', 'Samosas'], 'Mo-Su 10:00-21:00'],
  coffee: ['Kenyan coffee, tea and pastries.', ['Coffee', 'Tea', 'Pastries'], 'Mo-Sa 07:00-20:00; Su 09:00-18:00'],
  corporateoffices: ['Shared desks, meeting rooms and a quiet lounge for business visitors.', ['Meeting rooms', 'Wi-Fi', 'Hot desks'], 'Mo-Fr 08:00-19:00; Sa 09:00-14:00'],
  bank: ['Bank agency: deposits, withdrawals, M-Pesa and account opening.', ['Deposits', 'M-Pesa', 'Account opening'], 'Mo-Fr 08:30-17:00; Sa 09:00-13:00'],
  'clothing.womens': ["Women's fashion in kitenge and modern cuts, made to measure.", ['Dresses', 'Kitenge', 'Tailoring'], 'Mo-Sa 09:00-19:00'],
  'clothing.mens': ["Men's suits, shirts and casual wear.", ['Suits', 'Shirts', 'Alterations'], 'Mo-Sa 09:00-19:00'],
  beautysalon: ['Hair, nails and make-up.', ['Hair', 'Nails', 'Make-up'], 'Mo-Sa 08:00-20:00; Su 10:00-17:00'],
  hairstylist: ['Barber shop: cuts, shaves and beard trims.', ['Haircuts', 'Shaves', 'Beard trims'], 'Mo-Sa 08:00-20:00; Su 10:00-17:00'],
  shoes: ['Shoes for work, school and weekends.', ['Formal', 'Sneakers', 'School shoes'], 'Mo-Sa 09:00-19:00'],
  jewelry: ['Beaded and silver jewellery, made in Kenya.', ['Beadwork', 'Silver', 'Gifts'], 'Mo-Sa 09:00-19:00'],
  'eyewear.opticians': ['Eye tests, frames and contact lenses.', ['Eye tests', 'Frames', 'Lenses'], 'Mo-Sa 09:00-18:00'],
  perfume: ['Perfumes, oils and body sprays.', ['Perfume', 'Oud', 'Gift sets'], 'Mo-Sa 09:00-19:00'],
  mobilephones: ['Phones, accessories and screen repairs.', ['Smartphones', 'Accessories', 'Repairs'], 'Mo-Sa 08:30-19:00'],
  computersandaccessories: ['Laptops, printers and accessories.', ['Laptops', 'Printers', 'Accessories'], 'Mo-Sa 08:30-18:30'],
  copyshop: ['Printing, photocopying, binding and branding.', ['Printing', 'Photocopy', 'Branding'], 'Mo-Sa 07:30-19:00'],
  photography: ['Passport photos, portraits and printing.', ['Passport photos', 'Portraits', 'Prints'], 'Mo-Sa 09:00-18:00'],
  electronicappliances: ['Repairs for TVs, radios, laptops and phones.', ['TV repair', 'Laptop repair', 'Spare parts'], 'Mo-Sa 08:30-18:30'],
  books: ['Books, school texts and stationery.', ['Books', 'Textbooks', 'Stationery'], 'Mo-Sa 09:00-18:30'],
  giftshops: ['Gifts, cards and wrapping.', ['Gifts', 'Cards', 'Wrapping'], 'Mo-Sa 09:00-19:00'],
  airline: ['Travel agency: flights, holidays and visa help.', ['Flights', 'Holidays', 'Visa help'], 'Mo-Fr 08:30-17:30; Sa 09:00-13:00'],
  dentistry: ['General and cosmetic dentistry.', ['Check-ups', 'Whitening', 'Braces'], 'Mo-Fr 08:00-18:00; Sa 09:00-13:00'],
  physician: ['Family doctors and a small lab.', ['Consultations', 'Lab tests', 'Vaccines'], 'Mo-Fr 08:00-19:00; Sa 09:00-14:00'],
  pharmacy: ['Prescriptions, over-the-counter medicine and health products.', ['Prescriptions', 'Medicine', 'Health products'], 'Mo-Sa 08:00-21:00; Su 10:00-18:00'],
  lawyer: ['Advocates: conveyancing, contracts and business law.', ['Conveyancing', 'Contracts', 'Business law'], 'Mo-Fr 08:30-17:30'],
  accounting: ['Accounts, tax returns and audits for small businesses.', ['Bookkeeping', 'KRA returns', 'Audits'], 'Mo-Fr 08:30-17:30'],
  insurance: ['Motor, health and business insurance.', ['Motor', 'Health', 'Business'], 'Mo-Fr 08:30-17:00'],
  gym: ['Fitness studio: classes and personal training.', ['Classes', 'Weights', 'Personal training'], 'Mo-Fr 06:00-21:00; Sa,Su 08:00-16:00'],
};
const MOCK_BY_CATEGORY = {
  familyfuncenter: 'fun', artsandcrafts: 'home', 'theater.movie': 'cinema', restaurant: 'restaurant', specialtyfood: 'restaurant',
  coffee: 'cafe', corporateoffices: 'office', bank: 'bank', 'clothing.womens': 'fashion', 'clothing.mens': 'fashion',
  beautysalon: 'beauty', hairstylist: 'salon', shoes: 'shoes', jewelry: 'jewellery', 'eyewear.opticians': 'optician',
  perfume: 'beauty', mobilephones: 'phones', computersandaccessories: 'electronics', copyshop: 'services', photography: 'electronics',
  electronicappliances: 'electronics', books: 'books', giftshops: 'home', airline: 'office', dentistry: 'clinic',
  physician: 'clinic', pharmacy: 'pharmacy', lawyer: 'office', accounting: 'office', insurance: 'bank', gym: 'gym',
};
const AMENITY_TEXT = {
  restroom: ['Washrooms.', ['Washrooms']],
  elevator: ['Lift to every floor, Basement to Third, step free.', ['Step free']],
  stairs: ['Main staircase, Basement to Third.', []],
  atm: ['Cash machine.', ['Cash']],
  entry: ['Main entrance from the street, up the front steps.', []],
  information: ['Reception: directions, stall enquiries and lost property.', ['Help desk']],
  seating: ['Open seating.', ['Seating']],
};
const credits = existsSync(new URL('credits.json', SARIT_MOCK)) ? JSON.parse(readFileSync(new URL('credits.json', SARIT_MOCK), 'utf8')) : {};
const usedPhotos = new Set();
function photoFor(category) {
  const m = credits[MOCK_BY_CATEGORY[category]];
  if (!m) return null;
  usedPhotos.add(MOCK_BY_CATEGORY[category]);
  return { src: m.src, caption: 'Sample photo for the demo, not this business', credit: `${m.author}, ${m.licence}`, source: m.page, sample: true };
}

// ---------- Write features ----------
const fc = (features) => ({ type: 'FeatureCollection', features });
const F = { venue: [], building: [], footprint: [], level: [], unit: [], opening: [], amenity: [], anchor: [], occupant: [], address: [], relationship: [] };
const places = {};
const levelMeta = {};

const addressId = uuid('address');
const buildingId = uuid('building');
const SITE = [[-8, -12], [44, -12], [44, 30], [-8, 30]];
F.address.push({ type: 'Feature', id: addressId, feature_type: 'address', geometry: null, properties: { address: 'Nisake Commercial Centre (demo building)', unit: null, locality: 'Nairobi', province: 'KE-30', country: 'KE', postal_code: null, postal_code_ext: null, postal_code_vanity: null } });
F.venue.push({ type: 'Feature', id: uuid('venue'), feature_type: 'venue', geometry: polygon(SITE), properties: { category: 'businesscampus', restriction: null, name: { en: 'Nisake Commercial Centre' }, alt_name: null, hours: 'Mo-Sa 08:00-21:00; Su 10:00-18:00', phone: null, website: null, display_point: point([18, 10]), address_id: addressId } });
F.building.push({ type: 'Feature', id: buildingId, feature_type: 'building', geometry: null, properties: { name: { en: 'Nisake Commercial Centre' }, alt_name: null, category: 'unspecified', restriction: null, display_point: point([18, 10]), address_id: addressId } });
F.footprint.push({ type: 'Feature', id: uuid('footprint'), feature_type: 'footprint', geometry: polygon(rect(0, 0, 36, 20)), properties: { category: 'ground', name: null, building_ids: [buildingId] } });

const coreUnits = { stairs: [], elevator: [] };
for (const L of LEVELS) {
  const levelId = uuid(`level:${L.key}`);
  F.level.push({ type: 'Feature', id: levelId, feature_type: 'level', geometry: polygon(L.outline), properties: { category: 'unspecified', restriction: null, outdoor: false, ordinal: L.ordinal, name: { en: L.name }, short_name: { en: L.short }, display_point: point(centroid(L.outline)), address_id: null, building_ids: [buildingId] } });
  levelMeta[L.key] = { id: levelId, name: L.name, short: L.short, ordinal: L.ordinal, approximate: false, note: L.theme };

  const units = [
    ...L.units,
    { key: 'stairs', outline: STAIRS, category: 'stairs', name: 'Stairs', amenity: { category: 'stairs', name: 'Stairs' } },
    { key: 'lift', outline: LIFT, category: 'elevator', name: 'Lift', amenity: { category: 'elevator', name: 'Lift' } },
  ];
  const walkway = units.find((u) => u.category === 'walkway');
  const walkwayId = uuid(`unit:${L.key}:${walkway.key}`);
  for (const u of units) {
    const id = uuid(`unit:${L.key}:${u.key}`);
    const name = u.occupant?.name || u.name || u.amenity?.name || null;
    const accessible = u.category === 'elevator' || u.category === 'walkway';
    F.unit.push({ type: 'Feature', id, feature_type: 'unit', geometry: polygon(u.outline), properties: { category: u.category, restriction: u.category === 'nonpublic' ? 'restricted' : null, accessibility: accessible ? ['wheelchair'] : null, name: name ? { en: name } : null, alt_name: u.occupant?.stall ? { en: `Stall ${u.occupant.stall}` } : null, level_id: levelId, display_point: point(centroid(u.outline)) } });
    if (u.category === 'stairs' || u.category === 'elevator') coreUnits[u.category].push({ id, ordinal: L.ordinal });
    if (u.occupant) {
      const anchorId = uuid(`anchor:${L.key}:${u.key}`);
      const occId = uuid(`occupant:${L.key}:${u.key}`);
      F.anchor.push({ type: 'Feature', id: anchorId, feature_type: 'anchor', geometry: point(centroid(u.outline)), properties: { address_id: null, unit_id: id } });
      const [description, tags, hours] = TEXT[u.occupant.category];
      F.occupant.push({ type: 'Feature', id: occId, feature_type: 'occupant', geometry: null, properties: { name: { en: u.occupant.name }, category: u.occupant.category, anchor_id: anchorId, hours, phone: null, website: null, validity: null, correlation_id: null } });
      places[occId] = { description: `${description} Stall ${u.occupant.stall}.`, tags, hours, hours_status: 'demo', website: null, photo: photoFor(u.occupant.category), flags: ['demo-tenant'] };
    }
    const amenities = [...(u.amenity ? [{ key: u.key, at: centroid(u.outline), ...u.amenity }] : []), ...(u.amenities || [])];
    for (const a of amenities) {
      const aid = uuid(`amenity:${L.key}:${u.key}:${a.key || a.category}`);
      F.amenity.push({ type: 'Feature', id: aid, feature_type: 'amenity', geometry: point(a.at), properties: { category: a.category, accessibility: ['elevator', 'restroom'].includes(a.category) ? ['wheelchair'] : null, name: { en: a.name }, alt_name: null, hours: null, phone: null, website: null, unit_ids: [a.inWalkway ? walkwayId : id], address_id: null, correlation_id: null } });
      const [description, tags] = AMENITY_TEXT[a.category] || ['', []];
      places[aid] = { description, tags, hours: null, hours_status: null, website: null, photo: null, flags: [] };
    }
  }
  // The lift and stairs open south onto the lobby on every floor.
  for (const [key, x0, x1, y, name] of [['stairs', 13.5, 18.5, 15, 'Stairs landing'], ['lift', 19.4, 21.6, 16, 'Lift doors']]) {
    F.opening.push({ type: 'Feature', id: uuid(`opening:${L.key}:${key}`), feature_type: 'opening', geometry: { type: 'LineString', coordinates: [ll([x0, y]), ll([x1, y])] }, properties: { category: 'pedestrian', accessibility: key === 'lift' ? ['wheelchair'] : null, access_control: null, door: key === 'lift' ? { type: 'sliding', automatic: true, material: 'metal' } : null, name: { en: name }, alt_name: null, display_point: point([(x0 + x1) / 2, y]), level_id: levelId } });
  }
  if (L.key === 'G') {
    F.opening.push({ type: 'Feature', id: uuid('opening:G:entrance'), feature_type: 'opening', geometry: { type: 'LineString', coordinates: [ll([16, 0]), ll([20, 0])] }, properties: { category: 'pedestrian', accessibility: null, access_control: null, door: { type: 'double', automatic: true, material: 'glass' }, name: { en: 'Main entrance' }, alt_name: null, display_point: point([18, 0]), level_id: levelId } });
  }
}
// Stairs and lift join each pair of adjacent floors.
for (const kind of ['stairs', 'elevator']) {
  const stack = coreUnits[kind].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = 1; i < stack.length; i++) {
    F.relationship.push({ type: 'Feature', id: uuid(`rel:${kind}:${i}`), feature_type: 'relationship', geometry: null, properties: { category: kind, direction: 'undirected', origin: { id: stack[i - 1].id, feature_type: 'unit' }, intermediary: null, destination: { id: stack[i].id, feature_type: 'unit' }, hours: null } });
  }
}

// ---------- Validate ----------
const ids = new Set();
for (const list of Object.values(F)) for (const f of list) {
  if (ids.has(f.id)) throw new Error(`duplicate id ${f.id}`);
  ids.add(f.id);
}
for (const a of F.anchor) if (!ids.has(a.properties.unit_id)) throw new Error('anchor without unit');
for (const r of F.relationship) if (!ids.has(r.properties.origin.id) || !ids.has(r.properties.destination.id)) throw new Error('bad relationship');

// ---------- Write ----------
rmSync(new URL('imdf/', OUT), { recursive: true, force: true });
mkdirSync(new URL('imdf/', OUT), { recursive: true });
mkdirSync(new URL('content/', OUT), { recursive: true });
writeFileSync(new URL('imdf/manifest.json', OUT), JSON.stringify({ version: '1.0.0', created: '2026-10-26T00:00:00', generated_by: 'Dira imdf-nisake build_imdf.mjs', language: 'en-KE', extensions: null }, null, 1));
for (const [name, list] of Object.entries(F)) writeFileSync(new URL(`imdf/${name}.geojson`, OUT), JSON.stringify(fc(list)));
writeFileSync(
  new URL('content/places.json', OUT),
  JSON.stringify(
    {
      venue: { description: 'Business centre on five levels: a fun zone in the basement, a food court and services on the ground floor, and stalls for fashion, tech, health and offices above. Demo building.', photo: null, hours: 'Mo-Sa 08:00-21:00; Su 10:00-18:00', hours_status: 'demo' },
      places,
      levels: levelMeta,
    },
    null,
    1,
  ),
);
// Sample photos come from the Sarit project's openly licensed set.
mkdirSync(new URL('photos/mock/', OUT), { recursive: true });
const mockCredits = {};
for (const k of usedPhotos) {
  cpSync(new URL(`${k}.jpg`, SARIT_MOCK), new URL(`photos/mock/${k}.jpg`, OUT));
  mockCredits[k] = credits[k];
}
writeFileSync(new URL('photos/mock/credits.json', OUT), JSON.stringify(mockCredits, null, 1));
console.log(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, v.length])));
