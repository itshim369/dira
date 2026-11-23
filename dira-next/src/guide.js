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
  arrow: '#E0673F',
  arrowLit: '#FF8A4C',
  keep: '#E9C9A8',
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
// ---------- Floor arrows ----------
// Arrows painted on the floor where a person has to decide: at every turn, a ribbon that follows
// the real bend (from a few metres before the corner to a few metres past it, ending in a head),
// and at junctions the route goes straight through, a short "keep straight" arrow.

const ARROW = { before: 5, after: 5.5, width: 1.3, head: 2.4, headLen: 2 };
const KEEP = { before: 1.5, after: 3, width: 0.9, head: 1.8, headLen: 1.5 };

/** Points every `step` metres along leg li between s0 and s1, rounded off at corners. */
function sampleLeg(track, li, s0, s1, step = 0.5) {
  const out = [];
  for (let s = s0; s < s1; s += step) out.push(poseAtM(track, li, s));
  out.push(poseAtM(track, li, s1));
  // Round the corner the way a person walks it: average each point with its neighbours.
  for (let pass = 0; pass < 3; pass++)
    for (let k = 1; k < out.length - 1; k++) out[k] = [(out[k - 1][0] + 2 * out[k][0] + out[k + 1][0]) / 4, (out[k - 1][1] + 2 * out[k][1] + out[k + 1][1]) / 4];
  return out;
}

function poseAtM(track, li, d) {
  const leg = track.legs[li];
  const x = Math.max(0, Math.min(leg.total, d));
  let k = 1;
  while (k < leg.pts.length - 1 && leg.cum[k] < x) k++;
  const a = leg.pts[k - 1];
  const b = leg.pts[k] || a;
  const t = Math.max(0, Math.min(1, (x - leg.cum[k - 1]) / (leg.cum[k] - leg.cum[k - 1] || 1)));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** A ribbon along pts (metres) with an arrow head at the end, as a lon/lat ring. */
function ribbon(track, pts, { width, head, headLen }) {
  if (pts.length < 2) return null;
  const n = (k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  };
  // The shaft stops where the head begins.
  let body = pts.length - 1;
  let back = 0;
  while (body > 1 && back < headLen) {
    back += Math.hypot(pts[body][0] - pts[body - 1][0], pts[body][1] - pts[body - 1][1]);
    body--;
  }
  const left = [];
  const right = [];
  for (let k = 0; k <= body; k++) {
    const [nx, ny] = n(k);
    left.push([pts[k][0] + (nx * width) / 2, pts[k][1] + (ny * width) / 2]);
    right.push([pts[k][0] - (nx * width) / 2, pts[k][1] - (ny * width) / 2]);
  }
  const [nx, ny] = n(body);
  const base = pts[body];
  const tip = pts[pts.length - 1];
  const ring = [...left, [base[0] + (nx * head) / 2, base[1] + (ny * head) / 2], tip, [base[0] - (nx * head) / 2, base[1] - (ny * head) / 2], ...right.reverse()];
  ring.push(ring[0]);
  return ring.map(track.P.toLL);
}

/**
 * Floor arrows for the route. `network` (from corridorNetwork) adds "keep straight" arrows at
 * junctions; `current` is the step being walked, whose arrow is lit.
 */
export function turnFeatures(track, steps, network = null, current = null) {
  const out = [];
  const turnsAt = track.legs.map(() => []);
  steps.forEach((step, i) => {
    if (!['left', 'right', 'around'].includes(step.kind) || i === 0) return;
    const at = track.stops[i - 1];
    const leg = track.legs[at.leg];
    turnsAt[at.leg].push(at.s);
    const pts = sampleLeg(track, at.leg, Math.max(0, at.s - ARROW.before), Math.min(leg.total, at.s + ARROW.after));
    const ring = ribbon(track, pts, ARROW);
    if (ring) out.push({ type: 'Feature', properties: { level: leg.levelId, kind: 'turn', current: current === i || current === i - 1 }, geometry: { type: 'Polygon', coordinates: [ring] } });
  });
  // Junctions the route goes straight through: a short arrow, so you know not to turn.
  if (network) {
    track.legs.forEach((leg, li) => {
      const net = network.find((n) => n.levelId === leg.levelId);
      if (!net) return;
      const placed = [];
      for (const node of net.nodes) {
        if (node.degree < 3) continue;
        const p = track.P.toM(node.at);
        const s = projectS(leg, p);
        if (s == null || s < 6 || s > leg.total - 6) continue;
        if (turnsAt[li].some((t) => Math.abs(t - s) < 9) || placed.some((t) => Math.abs(t - s) < 10)) continue;
        const q = poseAtM(track, li, s);
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 2.5) continue;
        placed.push(s);
        const ring = ribbon(track, sampleLeg(track, li, s - KEEP.before, s + KEEP.after), KEEP);
        if (ring) out.push({ type: 'Feature', properties: { level: leg.levelId, kind: 'keep', current: false }, geometry: { type: 'Polygon', coordinates: [ring] } });
      }
    });
  }
  return fc(out);
}

function projectS(leg, p) {
  let best = null;
  for (let k = 1; k < leg.pts.length; k++) {
    const a = leg.pts[k - 1];
    const b = leg.pts[k];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (!best || d < best.d) best = { d, s: leg.cum[k - 1] + t * Math.sqrt(L) };
  }
  return best ? best.s : null;
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

export const GUIDE_LAYERS = ['guide-done', 'guide-chevrons', 'guide-turns', 'guide-turn-edge', 'guide-landmark', 'guide-ring', 'guide-beam'];

/** Adds the guide's sources and layers; the floor-level ones go under `beforeId` (the walls). */
export function addGuideLayers(map, beforeId) {
  const add = (id, size, draw) => {
    if (map.hasImage(id)) return;
    const { image, pixelRatio } = canvasImage(size, draw);
    map.addImage(id, image, { pixelRatio });
  };
  add('guide-chevron', 24, chevron);
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
    type: 'fill-extrusion',
    source: 'guide-turns',
    filter: none,
    paint: {
      'fill-extrusion-color': ['case', ['get', 'current'], COLOR.arrowLit, ['==', ['get', 'kind'], 'keep'], COLOR.keep, COLOR.arrow],
      'fill-extrusion-height': ['case', ['get', 'current'], 0.14, 0.06],
      'fill-extrusion-base': 0.02,
      'fill-extrusion-opacity': 0.95,
    },
  }, beforeId);
  map.addLayer({
    id: 'guide-turn-edge',
    type: 'line',
    source: 'guide-turns',
    filter: none,
    layout: { 'line-join': 'round' },
    paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 18, 0.6, 21, 2.2], 'line-opacity': ['case', ['==', ['get', 'kind'], 'keep'], 0.5, 0.9] },
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
