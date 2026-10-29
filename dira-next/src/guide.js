// The guided walk: a route and its written steps turned into a track along each floor, the pose
// (position and facing) of the walking figure anywhere on it, and the route's styling on the
// map: the walked part greyed, chevrons along the way ahead, turn arrows painted on the floor,
// the landmark of the current step lit, and a beam over where you are heading on this floor.

const COLOR = {
  route: '#C8553D',
  walked: '#B9AAA0',
  walkedDark: '#5E4D43',
  beam: '#C8553D',
  landmark: '#F0A58F',
};

// ---------- Track ----------

/** Metres east and north of a fixed point, and back. Fine at building scale. */
function projector(lat0, lon0) {
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
  return {
    toM: ([lon, lat]) => [(lon - lon0) * mLon, (lat - lat0) * mLat],
    toLL: ([x, y]) => [lon0 + x / mLon, lat0 + y / mLat],
  };
}

const headingOf = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;

/** Distance along a polyline (metres) of the point on it nearest to p. */
function project(leg, p) {
  let best = { d: Infinity, s: 0 };
  for (let k = 1; k < leg.pts.length; k++) {
    const a = leg.pts[k - 1];
    const b = leg.pts[k];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (d < best.d) best = { d, s: leg.cum[k - 1] + t * Math.sqrt(L) };
  }
  return best.s;
}

/**
 * legs: per floor, the route in metres with running distances. stops: where the figure stands
 * after each written step, as { leg, s } (leg index, metres along it).
 */
export function buildTrack(route, steps) {
  const [lon0, lat0] = route.legs[0].coordinates[0];
  const P = projector(lat0, lon0);
  const legs = route.legs.map((l) => {
    const pts = l.coordinates.map(P.toM);
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    return { levelId: l.levelId, coords: l.coordinates, pts, cum, total: cum[cum.length - 1] };
  });
  const stops = [];
  let leg = 0;
  steps.forEach((step, i) => {
    if (i === 0) {
      stops.push({ leg: 0, s: 0 });
      return;
    }
    // A step on the next floor starts that floor's leg.
    while (leg < legs.length - 1 && legs[leg].levelId !== step.levelId) leg++;
    if (step.kind === 'arrive' || step.toLevelId) stops.push({ leg, s: legs[leg].total });
    else stops.push({ leg, s: project(legs[leg], P.toM(step.point)) });
  });
  return { legs, stops, P };
}

/** Position, facing and a look-ahead point at s metres along leg `li`. */
export function poseAt(track, li, s, ahead = 3) {
  const leg = track.legs[li];
  const at = (d) => {
    const x = Math.max(0, Math.min(leg.total, d));
    let k = 1;
    while (k < leg.pts.length - 1 && leg.cum[k] < x) k++;
    const a = leg.pts[k - 1];
    const b = leg.pts[k] || a;
    const span = leg.cum[k] - leg.cum[k - 1] || 1;
    const t = Math.max(0, Math.min(1, (x - leg.cum[k - 1]) / span));
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], a, b };
  };
  const here = at(s);
  const front = at(s + ahead);
  // Facing: towards a point a little ahead, so the camera starts turning into a corner early.
  const to = Math.hypot(front.p[0] - here.p[0], front.p[1] - here.p[1]) > 0.3 ? front.p : here.b;
  const from = to === here.b ? here.a : here.p;
  return { ll: track.P.toLL(here.p), heading: headingOf(from, to), aheadLL: track.P.toLL(front.p) };
}

/** Metres from s to the next real corner on the leg (Infinity when the leg runs straight on). */
export function distanceToTurn(track, li, s) {
  const leg = track.legs[li];
  for (let k = 1; k < leg.pts.length - 1; k++) {
    if (leg.cum[k] <= s) continue;
    const h1 = headingOf(leg.pts[k - 1], leg.pts[k]);
    const h2 = headingOf(leg.pts[k], leg.pts[k + 1]);
    const turn = Math.abs(((h2 - h1 + 540) % 360) - 180);
    if (turn > 30) return leg.cum[k] - s;
  }
  return Infinity;
}

/** The leg cut at s: what has been walked, and what lies ahead. */
function cut(track, li, s) {
  const leg = track.legs[li];
  const done = [];
  const ahead = [];
  const here = poseAt(track, li, s, 0).ll;
  for (let k = 0; k < leg.pts.length; k++) {
    if (leg.cum[k] <= s) done.push(leg.coords[k]);
    else ahead.push(leg.coords[k]);
  }
  done.push(here);
  ahead.unshift(here);
  return { done, ahead };
}

const line = (coords, level) => ({ type: 'Feature', properties: { level }, geometry: { type: 'LineString', coordinates: coords.length > 1 ? coords : [coords[0], coords[0]] } });
const fc = (features) => ({ type: 'FeatureCollection', features });

/** Walked and ahead parts of the whole route, with the figure at (li, s); null = not walking. */
export function splitRoute(track, at) {
  const done = [];
  const ahead = [];
  track.legs.forEach((leg, i) => {
    if (!at || i > at.leg) ahead.push(line(leg.coords, leg.levelId));
    else if (i < at.leg) done.push(line(leg.coords, leg.levelId));
    else {
      const c = cut(track, i, at.s);
      done.push(line(c.done, leg.levelId));
      ahead.push(line(c.ahead, leg.levelId));
    }
  });
  return { done: fc(done), ahead: fc(ahead) };
}

/** A painted arrow where each turn step turns, facing the way you arrive. */
export function turnFeatures(track, steps) {
  const out = [];
  steps.forEach((step, i) => {
    if (!['left', 'right', 'around'].includes(step.kind) || i === 0) return;
    const at = track.stops[i - 1];
    const pose = poseAt(track, at.leg, Math.max(0, at.s - 1.5), 1.5);
    out.push({ type: 'Feature', properties: { level: track.legs[at.leg].levelId, icon: `guide-turn-${step.kind}`, heading: pose.heading }, geometry: { type: 'Point', coordinates: poseAt(track, at.leg, at.s, 0).ll } });
  });
  return fc(out);
}

/** A ring of `n` points, radius r metres, around a lon/lat. */
function circle(track, ll, r, n = 28) {
  const c = track.P.toM(ll);
  const ring = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    ring.push(track.P.toLL([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]));
  }
  return ring;
}

/** The beam on each floor: over the destination, or over the lift or escalator you leave by. */
export function beamFeatures(track, destPoint) {
  const out = [];
  track.legs.forEach((leg, i) => {
    const last = i === track.legs.length - 1;
    const at = last ? destPoint : leg.coords[leg.coords.length - 1];
    out.push({ type: 'Feature', properties: { level: leg.levelId, part: 'beam', final: last }, geometry: { type: 'Polygon', coordinates: [circle(track, at, 0.9)] } });
    out.push({ type: 'Feature', properties: { level: leg.levelId, part: 'ring', final: last }, geometry: { type: 'Polygon', coordinates: [circle(track, at, 2.4)] } });
  });
  return fc(out);
}

// ---------- Map layers ----------

function canvasImage(size, draw) {
  const scale = 2;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = size * scale;
  ctx.canvas.height = size * scale;
  ctx.scale(scale, scale);
  draw(ctx, size);
  return { image: ctx.getImageData(0, 0, size * scale, size * scale), pixelRatio: scale };
}

/** Chevron pointing along the line (to the right in the image). */
const chevron = (ctx, s) => {
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.36, s * 0.24);
  ctx.lineTo(s * 0.64, s * 0.5);
  ctx.lineTo(s * 0.36, s * 0.76);
  ctx.stroke();
};

/** A floor arrow: up the image is the way you arrive; it bends left, right or back. */
function turnArrow(kind) {
  return (ctx, s) => {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.94);
      if (kind === 'around') {
        ctx.lineTo(s * 0.5, s * 0.42);
        ctx.arc(s * 0.36, s * 0.42, s * 0.14, 0, Math.PI, true);
        ctx.lineTo(s * 0.22, s * 0.62);
      } else {
        const dir = kind === 'left' ? -1 : 1;
        ctx.lineTo(s * 0.5, s * 0.5);
        ctx.quadraticCurveTo(s * 0.5, s * 0.3, s * (0.5 + dir * 0.22), s * 0.3);
      }
    };
    const head = () => {
      ctx.beginPath();
      if (kind === 'around') {
        ctx.moveTo(s * 0.1, s * 0.6);
        ctx.lineTo(s * 0.34, s * 0.6);
        ctx.lineTo(s * 0.22, s * 0.8);
      } else {
        const dir = kind === 'left' ? -1 : 1;
        ctx.moveTo(s * (0.5 + dir * 0.2), s * 0.15);
        ctx.lineTo(s * (0.5 + dir * 0.42), s * 0.3);
        ctx.lineTo(s * (0.5 + dir * 0.2), s * 0.45);
      }
      ctx.closePath();
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // White outline, then the terracotta arrow on top.
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = s * 0.2;
    path();
    ctx.stroke();
    head();
    ctx.lineWidth = s * 0.08;
    ctx.stroke();
    ctx.fill();
    ctx.strokeStyle = COLOR.route;
    ctx.fillStyle = COLOR.route;
    ctx.lineWidth = s * 0.12;
    path();
    ctx.stroke();
    head();
    ctx.fill();
  };
}

export const GUIDE_LAYERS = ['guide-done', 'guide-chevrons', 'guide-turns', 'guide-landmark', 'guide-ring', 'guide-beam'];

/** Adds the guide's sources and layers; the floor-level ones go under `beforeId` (the walls). */
export function addGuideLayers(map, beforeId) {
  const add = (id, size, draw) => {
    if (map.hasImage(id)) return;
    const { image, pixelRatio } = canvasImage(size, draw);
    map.addImage(id, image, { pixelRatio });
  };
  add('guide-chevron', 24, chevron);
  for (const k of ['left', 'right', 'around']) add(`guide-turn-${k}`, 96, turnArrow(k));
  const empty = fc([]);
  for (const id of ['guide-done', 'guide-ahead', 'guide-turns', 'guide-landmark', 'guide-beam']) map.addSource(id, { type: 'geojson', data: empty });
  const none = ['==', ['get', 'level'], ''];
  map.addLayer({
    id: 'guide-done',
    type: 'line',
    source: 'guide-done',
    filter: none,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': COLOR.walked, 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 3.5, 20, 10] },
  }, beforeId);
  map.addLayer({
    id: 'guide-chevrons',
    type: 'symbol',
    source: 'guide-ahead',
    filter: none,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 56,
      'icon-image': 'guide-chevron',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 17, 0.5, 20, 1, 21.5, 1.4],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
    },
  }, beforeId);
  map.addLayer({
    id: 'guide-turns',
    type: 'symbol',
    source: 'guide-turns',
    filter: none,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-rotate': ['get', 'heading'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 17, 0.4, 20, 1.15, 21.5, 1.7],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
    },
  }, beforeId);
  map.addLayer({
    id: 'guide-landmark',
    type: 'fill-extrusion',
    source: 'guide-landmark',
    filter: none,
    paint: { 'fill-extrusion-color': COLOR.landmark, 'fill-extrusion-height': 0.5, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.85 },
  }, beforeId);
  map.addLayer({
    id: 'guide-ring',
    type: 'fill',
    source: 'guide-beam',
    filter: none,
    paint: { 'fill-color': COLOR.beam, 'fill-opacity': ['case', ['get', 'final'], 0.28, 0.16] },
  }, beforeId);
  map.addLayer({
    id: 'guide-beam',
    type: 'fill-extrusion',
    source: 'guide-beam',
    filter: none,
    paint: {
      'fill-extrusion-color': COLOR.beam,
      'fill-extrusion-base': 0,
      'fill-extrusion-height': 16,
      'fill-extrusion-opacity': 0.42,
      'fill-extrusion-vertical-gradient': true,
    },
  });
}

/** Show the guide layers for one floor. */
export function showGuideLevel(map, levelId) {
  const on = ['==', ['get', 'level'], levelId || ''];
  for (const id of GUIDE_LAYERS) if (map.getLayer(id)) map.setFilter(id, id === 'guide-ring' ? ['all', on, ['==', ['get', 'part'], 'ring']] : id === 'guide-beam' ? ['all', on, ['==', ['get', 'part'], 'beam']] : on);
}

export function setGuideTheme(map, dark) {
  if (map.getLayer('guide-done')) map.setPaintProperty('guide-done', 'line-color', dark ? COLOR.walkedDark : COLOR.walked);
}
