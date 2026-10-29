// Light and dark colours for the 3D map. The layers (from @imdf/mapLayers.js and
// buildingLayers.js) are built in the light palette; in dark mode each colour is swapped for
// a dark one: fixed picks for the base colours, and for the shop tints the same hue with the
// lightness turned down, so food, banks and the rest stay apart.
import { COLORS, unitFeatures, wallFeatures } from '@imdf/mapLayers.js';

const DARK = {
  background: '#120B08',
  site: '#1E140F',
  siteLine: '#33241C',
  floor: '#2A1D16',
  wall: '#4A372C',
  outerWall: '#5A4436',
  selected: '#8A3D2C',
  routeCasing: '#1A110C',
  connector: '#7A4A35',
  connectorWall: '#9A6248',
  slab: '#2A1D16',
  shell: '#C8B4A6',
  earth: '#5A4436',
};
const LIGHT = { slab: COLORS.floor, shell: '#8E7A6C', earth: '#A88C76', connectorWall: '#6E4B3A' };

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex([h, s, l]) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** A light map colour in dark mode. */
function darkOf(hex) {
  const up = hex.toUpperCase();
  if (up === COLORS.floor.toUpperCase()) return DARK.floor;
  if (up === COLORS.wall.toUpperCase()) return DARK.wall;
  if (up === COLORS.outerWall.toUpperCase()) return DARK.outerWall;
  if (up === LIGHT.connectorWall.toUpperCase()) return DARK.connectorWall;
  const [h, s, l] = hexToHsl(hex);
  if (l < 0.5) return DARK.connector; // lifts, escalators, stairs
  return hslToHex([h, Math.min(1, s * 0.35), 0.17 + (1 - l) * 0.7]);
}

const recolor = (fc, key, dark) =>
  dark ? { ...fc, features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, [key]: darkOf(f.properties[key]) } })) } : fc;

/** Paint the map (and the whole-building layers, when present) light or dark. */
export function applyMapTheme(map, imdf, dark) {
  const paint = (layer, prop, value) => map.getLayer(layer) && map.setPaintProperty(layer, prop, value);
  paint('background', 'background-color', dark ? DARK.background : COLORS.background);
  paint('venue-fill', 'fill-color', dark ? DARK.site : COLORS.site);
  paint('venue-line', 'line-color', dark ? DARK.siteLine : COLORS.siteLine);
  paint('level-fill', 'fill-color', dark ? DARK.floor : COLORS.floor);
  paint('unit-selected', 'fill-color', dark ? DARK.selected : COLORS.selected);
  paint('route-casing', 'line-color', dark ? DARK.routeCasing : COLORS.routeCasing);
  const units = recolor(unitFeatures(imdf), 'fill', dark);
  const walls = recolor(wallFeatures(imdf), 'color', dark);
  map.getSource('units')?.setData(units);
  map.getSource('walls')?.setData(walls);
  map.getSource('bld-units')?.setData(units);
  map.getSource('bld-walls')?.setData(walls);
  // The building view keeps its outer walls out by colour; follow the swap.
  if (map.getLayer('bld-walls')) map.setFilter('bld-walls', ['!=', ['get', 'color'], dark ? DARK.outerWall : COLORS.outerWall]);
  paint('bld-slab', 'fill-extrusion-color', dark ? DARK.slab : LIGHT.slab);
  paint('bld-shell', 'fill-extrusion-color', dark ? DARK.shell : LIGHT.shell);
  paint('bld-earth', 'fill-extrusion-color', dark ? DARK.earth : LIGHT.earth);
}
