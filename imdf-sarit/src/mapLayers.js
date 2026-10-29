// MapLibre style and layers for an IMDF venue: flat floors coloured by use, thin extruded walls
// along every unit edge, and the route line. Every feature carries its level id so one filter
// shows one floor. Colours are tints of the Dira palette.

export const COLORS = {
  background: '#E7DFD8',
  site: '#D9CFC6',
  siteLine: '#C9BCB1',
  floor: '#FFFDFB',
  wall: '#FFFFFF',
  outerWall: '#EADFD6',
  selected: '#E39C86',
  route: '#C8553D',
  routeCasing: '#FFFFFF',
};

const FILL_BY_GROUP = {
  grocery: '#F2D9C4',
  food: '#F5D2C4',
  money: '#EBDBD0',
  tech: '#EFE3DA',
  style: '#F6E2D8',
  home: '#F2E7DD',
  fun: '#F0DCCF',
  health: '#EEDFD6',
  other: '#F4ECE5',
};
const FILL_BY_UNIT = {
  restroom: '#E3D3C8',
  escalator: '#5A3A2B',
  elevator: '#5A3A2B',
  stairs: '#5A3A2B',
  nonpublic: '#D8CDC5',
  walkway: COLORS.floor,
  room: '#EEE6DF',
};

export function unitFeatures(imdf) {
  return {
    type: 'FeatureCollection',
    features: imdf.units.map((u) => {
      const occ = imdf.occupantByUnit.get(u.id);
      const cat = u.properties.category;
      const fill = occ ? FILL_BY_GROUP[occ.group] : FILL_BY_UNIT[cat] || FILL_BY_UNIT.room;
      return { type: 'Feature', geometry: u.geometry, properties: { uid: u.id, level: u.properties.level_id, category: cat, fill } };
    }),
  };
}

export function levelFeatures(imdf) {
  return {
    type: 'FeatureCollection',
    features: imdf.levels.map((l) => ({ type: 'Feature', geometry: l.feature.geometry, properties: { level: l.id } })),
  };
}

/** Thin wall slabs along each edge of every enclosed unit, plus each floor's outer wall. */
export function wallFeatures(imdf) {
  const lat0 = imdf.levels[0].feature.geometry.coordinates[0][0][1];
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
  const feats = [];

  const addRing = (ring, thickness, height, color, level) => {
    for (let k = 0; k + 1 < ring.length; k++) {
      const [ax, ay] = ring[k];
      const [bx, by] = ring[k + 1];
      const dx = (bx - ax) * mLon;
      const dy = (by - ay) * mLat;
      const len = Math.hypot(dx, dy);
      if (len < 0.2) continue;
      // Rings run counter-clockwise, so the inside is on the left of each edge.
      const off = [((-dy / len) * thickness) / mLon, ((dx / len) * thickness) / mLat];
      feats.push({
        type: 'Feature',
        properties: { h: height, color, level },
        geometry: {
          type: 'Polygon',
          coordinates: [[[ax, ay], [bx, by], [bx + off[0], by + off[1]], [ax + off[0], ay + off[1]], [ax, ay]]],
        },
      });
    }
  };

  for (const u of imdf.units) {
    const cat = u.properties.category;
    if (cat === 'walkway') continue;
    const dark = ['escalator', 'elevator', 'stairs'].includes(cat);
    addRing(u.geometry.coordinates[0], 0.35, dark ? 1.2 : 2.4, dark ? '#6E4B3A' : COLORS.wall, u.properties.level_id);
  }
  for (const l of imdf.levels) addRing(l.feature.geometry.coordinates[0], 0.7, 3.4, COLORS.outerWall, l.id);
  return { type: 'FeatureCollection', features: feats };
}

export function baseStyle() {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': COLORS.background } }],
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.32, position: [1.2, 200, 35] },
  };
}

const LEVEL_LAYERS = ['level-fill', 'unit-floor', 'unit-selected', 'walls', 'route-casing', 'route-line'];

export function addImdfLayers(map, imdf, levelId) {
  const empty = { type: 'FeatureCollection', features: [] };
  map.addSource('venue', { type: 'geojson', data: imdf.venue });
  map.addSource('levels', { type: 'geojson', data: levelFeatures(imdf) });
  map.addSource('units', { type: 'geojson', data: unitFeatures(imdf) });
  map.addSource('walls', { type: 'geojson', data: wallFeatures(imdf) });
  map.addSource('route', { type: 'geojson', data: empty });

  map.addLayer({ id: 'venue-fill', type: 'fill', source: 'venue', paint: { 'fill-color': COLORS.site } });
  map.addLayer({ id: 'venue-line', type: 'line', source: 'venue', paint: { 'line-color': COLORS.siteLine, 'line-width': 1.5 } });
  map.addLayer({ id: 'level-fill', type: 'fill', source: 'levels', paint: { 'fill-color': COLORS.floor } });
  map.addLayer({ id: 'unit-floor', type: 'fill', source: 'units', paint: { 'fill-color': ['get', 'fill'] } });
  map.addLayer({
    id: 'unit-selected',
    type: 'fill',
    source: 'units',
    filter: ['==', ['get', 'uid'], ''],
    paint: { 'fill-color': COLORS.selected, 'fill-opacity': 0.85 },
  });
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': COLORS.routeCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 6, 20, 16] },
  });
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': COLORS.route, 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 3.5, 20, 10] },
  });
  map.addLayer({
    id: 'walls',
    type: 'fill-extrusion',
    source: 'walls',
    paint: {
      'fill-extrusion-color': ['get', 'color'],
      'fill-extrusion-height': ['get', 'h'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 1,
      'fill-extrusion-vertical-gradient': true,
    },
  });
  showLevel(map, levelId);
}

/** Show one floor. The route source holds every leg; its layers filter to this floor too. */
export function showLevel(map, levelId, selectedUnit = '') {
  const onLevel = ['==', ['get', 'level'], levelId];
  for (const id of LEVEL_LAYERS) {
    if (!map.getLayer(id)) continue;
    map.setFilter(id, id === 'unit-selected' ? ['all', onLevel, ['==', ['get', 'uid'], selectedUnit]] : onLevel);
  }
}
