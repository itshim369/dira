// Line icons on a 24px grid, drawn with currentColor. Same family as the Dira app.

export const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  swap: '<path d="M8 4v16m0-16L4 8m4-4 4 4m4 12V4m0 16-4-4m4 4 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowLeft: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  navigate: '<path d="m3 11 18-8-8 18-2-8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  food: '<path d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10m10-18c-2 0-3 2.5-3 6s1.5 4 3 4v8"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  help: '<path d="M7 6a1.5 1.5 0 1 0 0-.01M17 6a1.5 1.5 0 1 0 0-.01M5 21v-6H4l1.5-6h3L10 15H9v6M15 9h4v6h-1v6h-2v-6h-1V9Z"/>',
  exit: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  wc: '<path d="M7 6a1.5 1.5 0 1 0 0-.01M17 6a1.5 1.5 0 1 0 0-.01M5 21v-6H4l1.5-6h3L10 15H9v6M15 9h4v6h-1v6h-2v-6h-1V9Z"/>',
  escalator: '<path d="M3 18h4.5L16 7h5"/>',
  elevator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 10 3-3 3 3m-6 4 3 3 3-3"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  atm: '<rect x="3" y="5" width="18" height="11" rx="2"/><path d="M7 20h10M12 16v4M8 10.5h8"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-7 2.5 3v4M8 11l3-3.5 3.5 1L17 12M11 7.5 9.5 13"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  prayer: '<path d="M12 3v4m-2-2h4M6 21V11l6-4 6 4v10M10 21v-5h4v5"/>',
};

export function Icon({ name, size = 22, strokeWidth = 2.2, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}

/** SVG markup string, for map markers built outside React. */
export function iconSvg(name, size = 20, strokeWidth = 2.2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

export const AMENITY_ICON = {
  restroom: 'wc',
  escalator: 'escalator',
  elevator: 'elevator',
  stairs: 'stairs',
  atm: 'atm',
  entry: 'door',
  parking: 'parking',
  prayerroom: 'prayer',
};

export function initials(name) {
  const words = name
    .replace(/[^A-Za-z0-9&' ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['the', 'and', 'of', '&', 'ltd'].includes(w.toLowerCase()));
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
