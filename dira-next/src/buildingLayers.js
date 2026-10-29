// Whole-building view: every floor stacked at its real order, a see-through shell, and the
// ground cut away so the basement shows below street level. Built from the same IMDF
// features as the floor map (wallFeatures, unitFeatures), lifted by each floor's height.
import { COLORS, unitFeatures, wallFeatures } from '@imdf/mapLayers.js';

export const STOREY_M = 6; // floor-to-floor in the stacked view, a little taller than real so floors read apart
const SLAB_M = 0.45;

export const BUILDING_LAYERS = ['bld-earth', 'bld-slab', 'bld-units', 'bld-walls', 'bld-shell', 'bld-pick'];

/** Height (metres) of each floor's slab in the stacked view; ground floor sits on the ground. */
export function levelHeights(imdf) {
  const ground = imdf.levels.find((l) => l.ordinal === 0) || imdf.levels[0];
  const lowest = imdf.levels[0].ordinal;
  const groundZ = (ground.ordinal - lowest) * STOREY_M;
  return { z: new Map(imdf.levels.map((l) => [l.id, (l.ordinal - lowest) * STOREY_M])), groundZ };
}

const byLevel = (heights, offset = 0) => ['match', ['get', 'level'], ...[...heights.z].flatMap(([id, z]) => [id, z + offset]), 0];

function outerWalls(imdf) {
  const lat0 = imdf.levels[0].feature.geometry.coordinates[0][0][1];
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
  const features = [];
  for (const l of imdf.levels) {
    const ring = l.feature.geometry.coordinates[0];
    for (let k = 0; k + 1 < ring.length; k++) {
      const [ax, ay] = ring[k];
      const [bx, by] = ring[k + 1];
      const dx = (bx - ax) * mLon;
      const dy = (by - ay) * mLat;
      const len = Math.hypot(dx, dy);
      if (len < 0.2) continue;
      // A glass skin just outside each floor's own outer wall (rings run counter-clockwise, so
      // outside is on the right), so the two never share a face.
      const n = [dy / len / mLon, -dx / len / mLat];
      const p = (x, y, d) => [x + n[0] * d, y + n[1] * d];
      features.push({ type: 'Feature', properties: { level: l.id }, geometry: { type: 'Polygon', coordinates: [[p(ax, ay, 0.12), p(bx, by, 0.12), p(bx, by, 0.32), p(ax, ay, 0.32), p(ax, ay, 0.12)]] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

// A block of ground around the footprint, `margin` metres wide: the cut-away that shows the basement.
function earthBlock(imdf, margin) {
  const ring = (imdf.footprint || imdf.levels[0].feature).geometry.coordinates[0];
  const lat0 = ring[0][1];
  const dLat = margin / (111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180));
  const dLon = margin / (111412.84 * Math.cos((lat0 * Math.PI) / 180));
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - dLon, Math.max(...xs) + dLon, Math.min(...ys) - dLat, Math.max(...ys) + dLat];
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } };
}

export function addBuildingLayers(map, imdf) {
  const heights = levelHeights(imdf);
  const levels = { type: 'FeatureCollection', features: imdf.levels.map((l) => ({ type: 'Feature', geometry: l.feature.geometry, properties: { level: l.id } })) };
  map.addSource('bld-levels', { type: 'geojson', data: levels });
  map.addSource('bld-units', { type: 'geojson', data: unitFeatures(imdf) });
  map.addSource('bld-walls', { type: 'geojson', data: wallFeatures(imdf) });
  map.addSource('bld-shell', { type: 'geojson', data: outerWalls(imdf) });
  map.addSource('bld-earth', { type: 'geojson', data: earthBlock(imdf, 5) });
  const hidden = { visibility: 'none' };

  map.addLayer({
    id: 'bld-slab',
    type: 'fill-extrusion',
    source: 'bld-levels',
    layout: hidden,
    paint: { 'fill-extrusion-color': COLORS.floor, 'fill-extrusion-base': byLevel(heights), 'fill-extrusion-height': byLevel(heights, SLAB_M), 'fill-extrusion-vertical-gradient': true },
  });
  map.addLayer({
    id: 'bld-units',
    type: 'fill-extrusion',
    source: 'bld-units',
    layout: hidden,
    paint: { 'fill-extrusion-color': ['get', 'fill'], 'fill-extrusion-base': byLevel(heights, SLAB_M), 'fill-extrusion-height': byLevel(heights, SLAB_M + 0.04) },
  });
  map.addLayer({
    id: 'bld-walls',
    type: 'fill-extrusion',
    source: 'bld-walls',
    layout: hidden,
    // Inner walls only: the glass skin stands in for each floor's outer wall, so you can see in.
    filter: ['!=', ['get', 'color'], COLORS.outerWall],
    paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': byLevel(heights, SLAB_M), 'fill-extrusion-height': ['+', byLevel(heights, SLAB_M), ['get', 'h']], 'fill-extrusion-vertical-gradient': true },
  });
  map.addLayer({
    id: 'bld-shell',
    type: 'fill-extrusion',
    source: 'bld-shell',
    layout: hidden,
    paint: { 'fill-extrusion-color': '#8E7A6C', 'fill-extrusion-base': byLevel(heights, SLAB_M), 'fill-extrusion-height': byLevel(heights, STOREY_M), 'fill-extrusion-opacity': 0.16 },
  });
  // The chosen floor, tinted; also what a tap on a floor hits.
  map.addLayer({
    id: 'bld-pick',
    type: 'fill-extrusion',
    source: 'bld-levels',
    layout: hidden,
    filter: ['==', ['get', 'level'], ''],
    paint: { 'fill-extrusion-color': COLORS.route, 'fill-extrusion-base': byLevel(heights, -0.02), 'fill-extrusion-height': byLevel(heights, SLAB_M + 0.06), 'fill-extrusion-opacity': 0.55 },
  });
  // The ground: a slab of earth up to street level, see-through so the basement shows. Added
  // last: a see-through extrusion drawn first would hide what stands behind it.
  if (heights.groundZ > 0) {
    map.addLayer({ id: 'bld-earth', type: 'fill-extrusion', source: 'bld-earth', layout: hidden, paint: { 'fill-extrusion-color': '#A88C76', 'fill-extrusion-base': 0, 'fill-extrusion-height': heights.groundZ - 0.05, 'fill-extrusion-opacity': 0.24 } });
  }
}

// Floor names beside the stack in the side view. Symbols are lifted to each floor's height with
// symbol-height-offset; each label is drawn to an image in the app's font, so no glyph server
// is needed and the labels work offline.
function labelImage(short, name, dark) {
  const edge = dark ? '#F3E6DC' : '#3B2418';
  const face = dark ? '#241812' : '#FFFFFF';
  const scale = 2;
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `700 ${14 * scale}px ${font}`;
  const nameW = ctx.measureText(name).width;
  const h = 32 * scale;
  const tag = h - 8 * scale;
  const w = Math.ceil(4 * scale + tag + 8 * scale + nameW + 14 * scale);
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  const pill = (x, y, cw, ch, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, ch / 2);
    ctx.fill();
  };
  pill(0, 0, w, h, edge);
  pill(1.5 * scale, 1.5 * scale, w - 3 * scale, h - 3 * scale, face);
  pill(4 * scale, 4 * scale, tag, tag, '#C8553D');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 ${(short.length > 1 ? 11 : 13) * scale}px ${font}`;
  ctx.fillText(short, 4 * scale + tag / 2, h / 2 + scale);
  ctx.textAlign = 'left';
  ctx.fillStyle = edge;
  ctx.font = `700 ${14 * scale}px ${font}`;
  ctx.fillText(name, 4 * scale + tag + 8 * scale, h / 2 + scale);
  return { image: ctx.getImageData(0, 0, w, h), pixelRatio: scale };
}

function floorLabelFeatures(map, imdf, translate, dark) {
  const heights = levelHeights(imdf);
  const ring = (imdf.footprint || imdf.levels[0].feature).geometry.coordinates[0];
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const lat0 = ring[0][1];
  // A little west of the building (the map controls are on the right), level with each storey.
  const at = [Math.min(...xs) - 4 / (111412.84 * Math.cos((lat0 * Math.PI) / 180)), (Math.min(...ys) + Math.max(...ys)) / 2];
  const features = imdf.levels.map((l) => {
    // One image per floor, language and theme: switching back reuses it.
    const name = translate(l.name);
    const icon = `floor-label-${l.id}-${dark ? 'd' : 'l'}-${name}`;
    if (!map.hasImage(icon)) {
      const { image, pixelRatio } = labelImage(l.short, name, dark);
      map.addImage(icon, image, { pixelRatio });
    }
    return { type: 'Feature', geometry: { type: 'Point', coordinates: at }, properties: { level: l.id, icon, h: heights.z.get(l.id) + 1.6 } };
  });
  return { type: 'FeatureCollection', features };
}

/** Redraw the floor labels in another language or theme. */
export function updateFloorLabels(map, imdf, translate, dark) {
  map.getSource('bld-labels')?.setData(floorLabelFeatures(map, imdf, translate, dark));
}

export function addFloorLabels(map, imdf, translate = (s) => s, dark = false) {
  map.addSource('bld-labels', { type: 'geojson', data: floorLabelFeatures(map, imdf, translate, dark) });
  map.addLayer({
    id: 'bld-labels',
    type: 'symbol',
    source: 'bld-labels',
    layout: {
      visibility: 'none',
      'icon-image': ['get', 'icon'],
      'icon-anchor': 'right',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-height-offset': ['get', 'h'],
    },
  });
}

/** Floor names: shown in the side view only. */
export function showFloorLabels(map, on) {
  if (map.getLayer('bld-labels')) map.setLayoutProperty('bld-labels', 'visibility', on ? 'visible' : 'none');
}

/** Show the stacked building (and hide the single-floor layers), or the reverse. */
export function showBuilding(map, on, floorLayers) {
  for (const id of BUILDING_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  for (const id of floorLayers) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'none' : 'visible');
}

export function highlightFloor(map, levelId) {
  if (map.getLayer('bld-pick')) map.setFilter('bld-pick', ['==', ['get', 'level'], levelId || '']);
}

/** Where you arrive on a floor: between the lift doors and the stairs landing. */
export function arrivalPoint(imdf, levelId) {
  const doors = imdf.openings.filter((o) => o.properties.level_id === levelId && /lift|stairs/i.test(o.properties.name?.en || ''));
  const pts = doors.length
    ? doors.map((o) => o.properties.display_point.coordinates)
    : imdf.units.filter((u) => u.properties.level_id === levelId && ['elevator', 'stairs'].includes(u.properties.category)).map((u) => u.properties.display_point.coordinates);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** What arrives you on a floor, for the label: "Stairs and lift", "Lift", ... */
export function arrivalLabel(imdf, levelId) {
  const kinds = new Set(imdf.units.filter((u) => u.properties.level_id === levelId).map((u) => u.properties.category));
  const parts = [kinds.has('stairs') && 'Stairs', kinds.has('elevator') && 'Lift', kinds.has('escalator') && 'Escalator'].filter(Boolean);
  return parts.length ? parts.join(' and ') : null; // e.g. "Stairs and Lift", a translation key
}
