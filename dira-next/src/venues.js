// Venues Dira knows about. A live venue points at a synced IMDF archive (scripts/sync-venues.mjs);
// the others show on the venues page as "coming soon".

export const venues = [
  {
    id: 'sarit',
    name: 'Sarit Centre',
    area: 'Westlands, Nairobi',
    type: 'mall',
    status: 'live',
    base: './venues/sarit/',
    logo: './brand/sarit-logo.png',
    facts: ['8 floors', '196 places', 'Works offline'],
  },
  {
    id: 'nisake',
    name: 'Nisake Commercial Centre',
    area: 'Nairobi · demo building',
    type: 'business',
    status: 'live',
    base: './venues/nisake/',
    logo: './brand/nisake-logo.svg',
    building3d: true,
    facts: ['5 floors', '33 businesses', 'Aerial and side views'],
  },
  { id: 'kijani', name: 'Kijani Galleria', type: 'mall', status: 'soon', icon: 'bag', facts: ['3 floors'] },
  { id: 'mto', name: 'Mto Plaza', type: 'mall', status: 'soon', icon: 'building', facts: ['2 wings', '4 floors'] },
  { id: 'lakeview', name: 'Lakeview Medical Centre', type: 'hospital', status: 'soon', icon: 'hospital', facts: ['4 floors'] },
  { id: 'techexpo', name: 'Nairobi Tech Expo 2026', type: 'event', status: 'soon', icon: 'calendar', facts: ['2 halls'] },
];

export const getVenue = (id) => venues.find((v) => v.id === id);
export const TYPE_LABEL = { mall: 'Mall', business: 'Business centre', hospital: 'Hospital', event: 'Event' };
