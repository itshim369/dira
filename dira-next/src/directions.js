// Written step-by-step directions from an IMDF route (legs per floor + floor changes).
// Turns come from the angle between straight runs, landmarks from the nearest named place on
// that floor, and each floor change becomes one "Take the escalator up to ..." step.

const MIN_RUN_M = 9;
const SIMPLIFY_M = 2.5;
const LANDMARK_RANGE_M = 16;
import { tr } from './prefs.js';
import { placeName } from './places.js';

const RIDE = { elevator: 'lift', escalator: 'escalator', stairs: 'stairs' };

function projector(lat0) {
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
  return ([lon, lat]) => [lon * mLon, lat * mLat];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);

/** Signed angle from a to b in degrees, positive = turning left (x east, y north). */
function angle(a, b) {
  return (Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180) / Math.PI;
}

function turnOf(prev, cur) {
  if (!prev) return 'straight';
  const a = angle(prev, cur);
  if (Math.abs(a) > 150) return 'around';
  if (a > 28) return 'left';
  if (a < -28) return 'right';
  return 'straight';
}

function sideOf(dir, toTarget) {
  if (!dir || len(toTarget) < 1.5) return 'ahead';
  const a = angle(dir, toTarget);
  if (Math.abs(a) < 35) return 'ahead';
  if (Math.abs(a) > 145) return 'behind';
  return a > 0 ? 'left' : 'right';
}

const metres = (m) => `${Math.max(5, Math.round(m / 5) * 5)} m`;

/** Ramer-Douglas-Peucker on indices, so small kinks in the grid path do not become turns. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts.map((_, i) => i);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ab = sub(pts[b], pts[a]);
    const L = len(ab) || 1;
    let far = -1;
    let dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const ap = sub(pts[i], pts[a]);
      const d = Math.abs(ab[0] * ap[1] - ab[1] * ap[0]) / L;
      if (d > dmax) {
        dmax = d;
        far = i;
      }
    }
    if (dmax > eps) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return [...keep.keys()].filter((i) => keep[i]);
}

export function buildSteps(imdf, route, from, to) {
  if (!route) return [];
  const P = projector(route.legs[0].coordinates[0][1]);
  const levelName = (id) => tr(imdf.levelById.get(id)?.name || '');
  const named = imdf.pois.filter((p) => p.kind === 'occupant' && p.id !== from.id && p.id !== to.id);
  const landmarkNear = (levelId, pt, used) => {
    let best = null;
    for (const p of named) {
      if (p.levelId !== levelId || used.has(p.name)) continue;
      const d = len(sub(P(p.point), pt));
      if (d < LANDMARK_RANGE_M && (!best || d < best.d)) best = { p, d };
    }
    return best?.p || null;
  };

  const steps = [
    {
      kind: 'start',
      title: tr('Start at {name}', { name: placeName(from) }),
      detail: levelName(from.levelId),
      levelId: from.levelId,
      point: from.point,
    },
  ];
  const used = new Set();
  let lastDir = null;

  route.legs.forEach((leg, li) => {
    const all = leg.coordinates.map(P);
    const idx = simplify(all, SIMPLIFY_M);
    const pts = idx.map((i) => all[i]);
    const lls = idx.map((i) => leg.coordinates[i]);
    // Straight runs: short ones fold into the next, and a run that carries straight on joins
    // the one before it, so only real turns become steps.
    const runs = [];
    for (let k = 1; k < pts.length; k++) {
      const d = sub(pts[k], pts[k - 1]);
      if (len(d) < 0.01) continue;
      const last = runs[runs.length - 1];
      if (last && (len(last.vec) < MIN_RUN_M || turnOf(last.vec, d) === 'straight')) {
        last.vec = sub(pts[k], last.start);
        last.end = pts[k];
        last.endLL = lls[k];
        last.walked += len(d);
      } else {
        runs.push({ start: pts[k - 1], end: pts[k], vec: d, endLL: lls[k], walked: len(d) });
      }
    }
    // A short last run (stepping up to a door or a lift) joins the run before it.
    if (runs.length > 1 && runs[runs.length - 1].walked < MIN_RUN_M) {
      const tail = runs.pop();
      const prev = runs[runs.length - 1];
      prev.end = tail.end;
      prev.endLL = tail.endLL;
      prev.walked += tail.walked;
    }
    const transition = route.transitions[li];
    const isLast = li === route.legs.length - 1;
    lastDir = li === 0 ? null : lastDir;

    runs.forEach((run, ri) => {
      const turn = ri === 0 ? 'straight' : turnOf(runs[ri - 1].vec, run.vec);
      const dist = metres(run.walked);
      const key =
        turn === 'left'
          ? 'Turn left and walk {dist}'
          : turn === 'right'
            ? 'Turn right and walk {dist}'
            : turn === 'around'
              ? 'Turn around and walk {dist}'
              : ri === 0 && li > 0
                ? 'Step off and walk {dist}'
                : 'Walk {dist}';
      const title = tr(key, { dist });
      let detail;
      let landmarkId = null;
      if (ri === runs.length - 1 && transition) detail = tr(`to the ${RIDE[transition.kind]}`);
      else if (ri === runs.length - 1 && isLast) detail = tr('toward {name}', { name: placeName(to) });
      else {
        const lm = landmarkNear(leg.levelId, run.end, used);
        if (lm) used.add(lm.name);
        landmarkId = lm?.id || null;
        detail = lm ? tr('until you reach {name}', { name: lm.name }) : tr('to the next junction');
      }
      steps.push({ kind: turn, title, detail, levelId: leg.levelId, point: run.endLL, metres: run.walked, landmarkId });
    });
    if (runs.length) lastDir = runs[runs.length - 1].vec;

    if (transition) {
      const up = imdf.levelById.get(transition.toLevelId).ordinal > imdf.levelById.get(transition.fromLevelId).ordinal;
      steps.push({
        kind: transition.kind,
        title: tr(`Take the ${RIDE[transition.kind]} ${up ? 'up' : 'down'} to the {floor}`, { floor: levelName(transition.toLevelId) }),
        detail: transition.levels > 1 ? tr('{n} floors', { n: transition.levels }) : tr('From the {floor}', { floor: levelName(transition.fromLevelId) }),
        levelId: transition.fromLevelId,
        toLevelId: transition.toLevelId,
        point: leg.coordinates[leg.coordinates.length - 1],
      });
    }
  });

  const finalLeg = route.legs[route.legs.length - 1];
  const end = P(finalLeg.coordinates[finalLeg.coordinates.length - 1]);
  const side = sideOf(lastDir, sub(P(to.point), end));
  steps.push({
    kind: 'arrive',
    title: tr('Arrive at {name}', { name: placeName(to) }),
    detail: tr({ ahead: 'It is straight ahead', behind: 'It is behind you', left: 'It is on your left', right: 'It is on your right' }[side]),
    levelId: to.levelId,
    point: to.point,
  });
  return steps;
}
