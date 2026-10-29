// Shared helpers for places: labels, shortcut groups and icons for map markers.
import { tr } from './prefs.js';

/** A place's name in the viewer's language: amenities ("Washrooms 2", "Lift", "Main entrance")
 * are translated, keeping their number; shop and business names stay as they are. */
export function placeName(poi) {
  if (!poi) return '';
  if (poi.kind !== 'amenity' && poi.kind !== 'unnamed') return poi.name;
  const m = poi.name.match(/^(.*?)(\s\d+)?$/);
  return tr(m[1]) + (m[2] || '');
}

export const SHORTCUTS = [
  { id: 'food', label: 'Food and drink', icon: 'food' },
  { id: 'money', label: 'Banks and ATMs', icon: 'money' },
  { id: 'help', label: 'Washrooms', icon: 'wc' },
  { id: 'exits', label: 'Exits and parking', icon: 'exit' },
];

export const PICKER_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'shops', label: 'Shops', match: (p) => p.kind === 'occupant' && !['food', 'money'].includes(p.group) },
  { id: 'food', label: 'Food', match: (p) => p.group === 'food' },
  { id: 'money', label: 'Banks and ATMs', match: (p) => p.group === 'money' },
  { id: 'help', label: 'Washrooms', match: (p) => p.group === 'help' },
  { id: 'exits', label: 'Entrances and parking', match: (p) => p.group === 'exits' },
];

export const AMENITY_ICON = {
  restroom: 'wc',
  escalator: 'escalator',
  elevator: 'lift',
  stairs: 'stairs',
  atm: 'atm',
  entry: 'door',
  parking: 'parking',
  prayerroom: 'prayer',
};

// Inline SVG paths (24px grid) for markers built outside React.
const MARKER_PATHS = {
  wc: '<path d="M7 6a1.5 1.5 0 1 0 0-.01M17 6a1.5 1.5 0 1 0 0-.01M5 21v-6H4l1.5-6h3L10 15H9v6M15 9h4v6h-1v6h-2v-6h-1V9Z"/>',
  escalator: '<path d="M3 18h4.5L16 7h5"/>',
  lift: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 10 3-3 3 3m-6 4 3 3 3-3"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  atm: '<path d="M3 5h18v11H3zM7 20h10M12 16v4M8 10.5h8"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
  prayer: '<path d="M12 3v4m-2-2h4M6 21V11l6-4 6 4v10M10 21v-5h4v5"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-7 2.5 3v4M8 11l3-3.5 3.5 1L17 12M11 7.5 9.5 13"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
};

export function markerIcon(categoryOrName) {
  const name = AMENITY_ICON[categoryOrName] || categoryOrName;
  const path = MARKER_PATHS[name] || MARKER_PATHS.info;
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function initials(name) {
  const words = name
    .replace(/[^A-Za-z0-9&' ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['the', 'and', 'of', '&', 'ltd', 'by'].includes(w.toLowerCase()));
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
