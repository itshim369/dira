// Walking routes over IMDF walkway units, across levels.
// Each level's walkway polygons are rasterised into a 0.6 m grid. Lifts, escalators and stairs
// (IMDF relationship features) join the grids of adjacent levels. A multi-source Dijkstra finds
// the cheapest walk from any door of the start to any door of the destination, with a small
// cost for hugging walls; each level's piece is then straightened with line-of-sight checks.

const CELL = 0.6; // metres
const CLEARANCE_WEIGHT = 2.2;
const CLEARANCE_CELLS = 1.5; // walkable cells must be at least this far (in cells) from a wall
const DOOR_REACH_M = 2.6; // a door cell lies within this distance of the unit's edge
const DOOR_BAND_M = 0.9; // ...and within this much of the closest open cell, so routes meet the shopfront
const MIN_AREA_CELLS = Math.round(30 / (CELL * CELL)); // open areas under 30 m² are trace leftovers
const WALK_SPEED = 1.2; // m/s
const SECONDS_PER_LEVEL = { elevator: 45, escalator: 25, stairs: 35 };
// How to change floors: a weight on each connector's real time; null = not allowed.
export const MODES = {
  fastest: { elevator: 1, escalator: 1, stairs: 1 },
  escalator: { elevator: 4, escalator: 1, stairs: 4 },
  lift: { elevator: 1, escalator: null, stairs: null },
  stairs: { elevator: 4, escalator: 4, stairs: 1 },
};
const D = Math.SQRT2;

export function createRouter(imdf) {
  const ring0 = imdf.levels[0].feature.geometry.coordinates[0];
  const lat0 = ring0.reduce((s, p) => s + p[1], 0) / ring0.length;
  const lon0 = ring0.reduce((s, p) => s + p[0], 0) / ring0.length;
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
  const toM = ([lon, lat]) => [(lon - lon0) * mLon, (lat - lat0) * mLat];
  const toLL = ([x, y]) => [lon0 + x / mLon, lat0 + y / mLat];

  // ---------- One grid per level ----------
  const grids = [];
  let total = 0;
  for (const level of imdf.levels) {
    const ring = level.feature.geometry.coordinates[0].map(toM);
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const minX = Math.min(...xs) - 4;
    const minY = Math.min(...ys) - 4;
    const W = Math.ceil((Math.max(...xs) + 4 - minX) / CELL);
    const H = Math.ceil((Math.max(...ys) + 4 - minY) / CELL);
    const g = { level, minX, minY, W, H, offset: total, walk: new Uint8Array(W * H), dist: null };
    total += W * H;
    // 1. Open floor: the walkway units, with their holes (shop blocks, voids, wells).
    for (const u of imdf.units) {
      if (u.properties.level_id !== level.id || u.properties.category !== 'walkway') continue;
      fillPolygon(g, u.geometry.coordinates.map((r) => r.map(toM)), 1);
    }
    // 2. Walls: every other unit on this floor is solid (shops, washrooms, non-public space,
    //    lifts, escalators, stairs). Routes reach them only through their doors.
    for (const u of imdf.units) {
      if (u.properties.level_id !== level.id || u.properties.category === 'walkway') continue;
      fillPolygon(g, u.geometry.coordinates.map((r) => r.map(toM)), 0);
    }
    // 3. Clearance: drop the first cell next to any wall. This removes the slivers between
    //    neighbouring shops and around corners that a trace leaves behind, and keeps routes
    //    about a metre off the walls, as people walk.
    g.dist = chamfer(g);
    const open = g.walk.slice();
    const openDist = g.dist;
    for (let k = 0; k < W * H; k++) if (g.walk[k] && g.dist[k] < CLEARANCE_CELLS) g.walk[k] = 0;
    // 4. Keep every open area of a real size. Some are only reached by lift or travelator
    //    (the space in front of Carrefour); tiny leftovers of the trace are dropped.
    keepLargeComponents(g, MIN_AREA_CELLS);
    // 5. A real corridor narrower than the clearance (about 2 m, e.g. beside AL on the Fourth
    //    floor) must stay open: rejoin the pieces along its centre line, never through a sliver.
    bridgeNarrowCorridors(g, open, openDist);
    g.dist = chamfer(g);
    grids.push(g);
  }
  const gridByLevel = new Map(grids.map((g) => [g.level.id, g]));
  const N = total;
  const cellCentre = (g, i, j) => [g.minX + (i + 0.5) * CELL, g.minY + (j + 0.5) * CELL];
  const cellOf = (g, [x, y]) => [Math.floor((x - g.minX) / CELL), Math.floor((y - g.minY) / CELL)];
  const gridOfIndex = (k) => {
    for (let n = grids.length - 1; n >= 0; n--) if (k >= grids[n].offset) return grids[n];
    return grids[0];
  };

  function nearestWalkable(g, [x, y], maxM = 45) {
    const [ci, cj] = cellOf(g, [x, y]);
    const r = Math.ceil(maxM / CELL);
    let best = null;
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= g.W || j >= g.H || !g.walk[j * g.W + i]) continue;
        const d = di * di + dj * dj - Math.min(g.dist[j * g.W + i], 3) * 0.5;
        if (!best || d < best.d) best = { k: j * g.W + i, d };
      }
    return best ? best.k : null;
  }

  // Doors of a unit: every walkable cell along its outline that faces a corridor. The trace has
  // no door positions, so a route may use whichever side is nearest. (IMDF openings on unit
  // edges would pin these down exactly.) Returned as global cell indices.
  const doorCache = new Map();
  function doorsOfUnit(unit, fallbackPoint) {
    const key = unit ? unit.id : `pt:${fallbackPoint}`;
    if (doorCache.has(key)) return doorCache.get(key);
    const g = gridByLevel.get(unit.properties.level_id);
    let cells = [];
    if (unit.properties.category !== 'walkway') {
      const ring = unit.geometry.coordinates[0].map(toM);
      const ux = ring.map((p) => p[0]);
      const uy = ring.map((p) => p[1]);
      const [i0, j0] = cellOf(g, [Math.min(...ux) - 7, Math.min(...uy) - 7]);
      const [i1, j1] = cellOf(g, [Math.max(...ux) + 7, Math.max(...uy) + 7]);
      let best = null;
      const near = [];
      for (let j = Math.max(0, j0); j <= Math.min(g.H - 1, j1); j++)
        for (let i = Math.max(0, i0); i <= Math.min(g.W - 1, i1); i++) {
          const k = j * g.W + i;
          if (!g.walk[k]) continue;
          const e = edgeDistance(cellCentre(g, i, j), ring);
          if (e <= DOOR_REACH_M) near.push({ k, e });
          if (e <= 6 && (!best || e < best.e)) best = { k, e };
        }
      // Only the band of open floor right along the unit: in a wide corridor a route must reach
      // the shopfront, not stop on the far side because that was cheaper.
      const closest = Math.min(...near.map((c) => c.e));
      cells = near.filter((c) => c.e <= closest + DOOR_BAND_M).map((c) => c.k);
      if (!cells.length && best) cells = [best.k];
    }
    if (!cells.length && fallbackPoint) {
      const k = nearestWalkable(g, toM(fallbackPoint));
      if (k != null) cells = [k];
    }
    const global = cells.map((k) => k + g.offset);
    doorCache.set(key, global);
    return global;
  }

  function doorsOf(poi) {
    const unit = poi.unitId && imdf.unitById.get(poi.unitId);
    if (!unit) return [];
    if (unit.properties.category === 'walkway') {
      const g = gridByLevel.get(unit.properties.level_id);
      const k = nearestWalkable(g, toM(poi.point));
      return k == null ? [] : [k + g.offset];
    }
    return doorsOfUnit(unit, poi.point);
  }

  // ---------- Vertical links ----------
  // Each lift, escalator or stair unit gets one landing cell (its door nearest its middle);
  // a relationship joins the landings of its two units.
  const landing = new Map();
  const landingUnit = new Map(); // landing cell -> lift/escalator/stair unit id
  // A lift or travelator with an IMDF opening on its edge is boarded there (for example the
  // Lower Ground travelators that land in front of Carrefour); otherwise at its door nearest
  // its middle.
  function openingOn(unit) {
    const ring = unit.geometry.coordinates[0].map(toM);
    for (const o of imdf.openings) {
      if (o.properties.level_id !== unit.properties.level_id) continue;
      const [a, b] = o.geometry.coordinates.map(toM);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (edgeDistance(mid, ring) < 1) return mid;
    }
    return null;
  }
  function landingOf(unit) {
    if (landing.has(unit.id)) return landing.get(unit.id);
    const doors = doorsOfUnit(unit, unit.properties.display_point?.coordinates);
    const centre = openingOn(unit) || toM(unit.properties.display_point?.coordinates || unit.geometry.coordinates[0][0]);
    let best = null;
    for (const k of doors) {
      const g = gridOfIndex(k);
      const local = k - g.offset;
      const c = cellCentre(g, local % g.W, Math.floor(local / g.W));
      const d = Math.hypot(c[0] - centre[0], c[1] - centre[1]);
      if (!best || d < best.d) best = { k, d };
    }
    landing.set(unit.id, best ? best.k : null);
    if (best) landingUnit.set(best.k, unit.id);
    return landing.get(unit.id);
  }
  // Landing cells are found before the links, so open areas with neither the main corridor
  // nor a lift/travelator landing can be dropped: nothing can reach them.
  for (const u of imdf.units) if (['elevator', 'escalator', 'stairs'].includes(u.properties.category)) landingOf(u);
  for (const g of grids) {
    const landings = [...landing.values()].filter((k) => k != null && k >= g.offset && k < g.offset + g.W * g.H).map((k) => k - g.offset);
    keepReachableComponents(g, landings);
    g.dist = chamfer(g);
  }
  doorCache.clear();

  const links = new Map(); // global cell -> [{to, kind, levels}]
  for (const r of imdf.relationships) {
    const ua = imdf.unitById.get(r.a);
    const ub = imdf.unitById.get(r.b);
    if (!ua || !ub) continue;
    const a = landingOf(ua);
    const b = landingOf(ub);
    if (a == null || b == null) continue;
    const la = imdf.levelById.get(ua.properties.level_id).ordinal;
    const lb = imdf.levelById.get(ub.properties.level_id).ordinal;
    const levels = Math.abs(lb - la);
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      if (!links.has(from)) links.set(from, []);
      links.get(from).push({ to, kind: r.category, levels });
    }
  }

  // ---------- Search ----------
  function search(starts, goals, weights) {
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const via = new Int8Array(N); // 0 walk, 1 elevator, 2 escalator, 3 stairs
    const closed = new Uint8Array(N);
    const goal = new Uint8Array(N);
    for (const k of goals) goal[k] = 1;
    const heap = new Heap();
    for (const s of starts) {
      g[s] = 0;
      heap.push(s, 0);
    }
    const KIND = { elevator: 1, escalator: 2, stairs: 3 };
    let t = -1;
    while (heap.size) {
      const k = heap.pop();
      if (closed[k]) continue;
      if (goal[k]) {
        t = k;
        break;
      }
      closed[k] = 1;
      const G = gridOfIndex(k);
      const local = k - G.offset;
      const i = local % G.W;
      const j = (local / G.W) | 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= G.W || nj >= G.H) continue;
          const nl = nj * G.W + ni;
          if (!G.walk[nl]) continue;
          if (di && dj && (!G.walk[j * G.W + ni] || !G.walk[nj * G.W + i])) continue;
          const n = nl + G.offset;
          if (closed[n]) continue;
          const ng = g[k] + (di && dj ? D : 1) * (1 + CLEARANCE_WEIGHT / (1 + G.dist[nl]));
          if (ng < g[n]) {
            g[n] = ng;
            came[n] = k;
            via[n] = 0;
            heap.push(n, ng);
          }
        }
      for (const link of links.get(k) || []) {
        const weight = weights[link.kind];
        if (weight == null || closed[link.to]) continue;
        const cost = ((SECONDS_PER_LEVEL[link.kind] * weight * WALK_SPEED) / CELL) * link.levels;
        const ng = g[k] + cost;
        if (ng < g[link.to]) {
          g[link.to] = ng;
          came[link.to] = k;
          via[link.to] = KIND[link.kind];
          heap.push(link.to, ng);
        }
      }
    }
    if (t === -1) return null;
    const path = [];
    for (let k = t; k !== -1; k = came[k]) path.push({ k, via: via[k] });
    return path.reverse();
  }

  function clearLine(G, a, b) {
    const [x0, y0] = a;
    const [x1, y1] = b;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let s = 0; s <= n; s++) {
      const i = Math.round(x0 + ((x1 - x0) * s) / n);
      const j = Math.round(y0 + ((y1 - y0) * s) / n);
      // Every cell the straight line crosses must be open floor (walls are already a cell away).
      if (!G.walk[j * G.W + i]) return false;
    }
    return true;
  }

  function smooth(G, cells) {
    if (cells.length < 3) return cells;
    const out = [cells[0]];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let far = anchor + 1;
      for (let k = cells.length - 1; k > anchor + 1; k--) {
        if (clearLine(G, cells[anchor], cells[k])) {
          far = k;
          break;
        }
      }
      out.push(cells[far]);
      anchor = far;
    }
    return out;
  }

  const KIND_NAME = { 1: 'elevator', 2: 'escalator', 3: 'stairs' };

  /** Where a route meets a place: the nearest point of its unit's outline to `p` (metres), or the
   * place itself for an amenity standing in a corridor. Null when that would be a long jump. */
  function frontOf(poi, p) {
    const unit = poi.unitId && imdf.unitById.get(poi.unitId);
    if (!unit) return null;
    const g = gridByLevel.get(unit.properties.level_id);
    if (unit.properties.category === 'walkway') {
      // An amenity in a corridor: walk up to it, unless it is drawn outside the building
      // (entrance markers sit on the outer wall).
      const q = toM(poi.point);
      const inside = pointInRing(q, g.level.feature.geometry.coordinates[0].map(toM));
      return inside && Math.hypot(q[0] - p[0], q[1] - p[1]) <= DOOR_REACH_M ? q : null;
    }
    // A shop: the nearest point of an edge that faces open floor (its front, never the side wall
    // it shares with the shop next door).
    const open = (q, n) => {
      const [i, j] = cellOf(g, [q[0] + n[0] * 1.3, q[1] + n[1] * 1.3]);
      return i >= 0 && j >= 0 && i < g.W && j < g.H && !!g.walk[j * g.W + i];
    };
    const q = nearestOnRing(p, unit.geometry.coordinates[0].map(toM), 1, open);
    return q && Math.hypot(q[0] - p[0], q[1] - p[1]) <= DOOR_REACH_M + 0.5 ? q : null;
  }

  return {
    /** The walkable floor per level, for audits and debugging: { levelId, W, H, cell, walk, cellCentre(i,j) -> [lon,lat] }. */
    inspect() {
      return grids.map((g) => ({
        levelId: g.level.id,
        W: g.W,
        H: g.H,
        cell: CELL,
        walk: g.walk,
        landings: [...landing.values()].filter((k) => k != null && k >= g.offset && k < g.offset + g.W * g.H).map((k) => k - g.offset),
        cellCentre: (i, j) => toLL(cellCentre(g, i, j)),
        doorsOf: (poi) => doorsOf(poi).filter((k) => k >= g.offset && k < g.offset + g.W * g.H).map((k) => k - g.offset),
      }));
    },
    /** { legs: [{levelId, coordinates}], transitions: [{kind, fromLevelId, toLevelId, levels, at}], metres, seconds } */
    /** mode: fastest | escalator | lift | stairs. stepFree is the same as mode "lift". */
    route(from, to, { stepFree = false, mode = stepFree ? 'lift' : 'fastest' } = {}) {
      const a = doorsOf(from);
      const b = doorsOf(to);
      if (!a.length || !b.length) return null;
      const path = search(a, b, MODES[mode] || MODES.fastest);
      if (!path) return null;

      // Split into per-level runs; a connector hop starts a new run.
      const runs = [];
      const transitions = [];
      let run = null;
      let prevK = null;
      for (const step of path) {
        const G = gridOfIndex(step.k);
        if (step.via && run) {
          const prev = transitions[transitions.length - 1];
          const kind = KIND_NAME[step.via];
          if (prev && prev.kind === kind && run.cells.length <= 1 && runs.length && prev.runIndex === runs.length) {
            // Same lift or escalator, carrying on to the next floor: one ride.
            prev.toLevelId = G.level.id;
            prev.toUnitId = landingUnit.get(step.k) || null;
            prev.levels += 1;
            run = { G, cells: [] };
          } else {
            runs.push(run);
            const last = run.cells[run.cells.length - 1];
            transitions.push({
              kind,
              fromLevelId: run.G.level.id,
              toLevelId: G.level.id,
              levels: 1,
              at: last ? toLL(cellCentre(run.G, last[0], last[1])) : null,
              fromUnitId: landingUnit.get(prevK) || null,
              toUnitId: landingUnit.get(step.k) || null,
              runIndex: runs.length,
            });
            run = { G, cells: [] };
          }
        }
        if (!run) run = { G, cells: [] };
        const local = step.k - G.offset;
        run.cells.push([local % G.W, Math.floor(local / G.W)]);
        prevK = step.k;
      }
      runs.push(run);

      let metres = 0;
      const kept = runs.filter((r) => r.cells.length);
      const legs = kept
        .map((r, n) => {
          const pts = smooth(r.G, r.cells).map(([i, j]) => cellCentre(r.G, i, j));
          // Run the line from the start's front to the destination's front, not just between the
          // open cells beside them.
          if (n === 0) {
            const f = frontOf(from, pts[0]);
            if (f) pts.unshift(f);
          }
          if (n === kept.length - 1) {
            const f = frontOf(to, pts[pts.length - 1]);
            if (f) pts.push(f);
          }
          if (pts.length === 1) pts.push(pts[0]);
          for (let k = 1; k < pts.length; k++) metres += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
          return { levelId: r.G.level.id, coordinates: pts.map(toLL) };
        });
      let seconds = metres / WALK_SPEED;
      for (const t of transitions) seconds += SECONDS_PER_LEVEL[t.kind] * t.levels;
      return { legs, transitions: transitions.map(({ runIndex, ...t }) => t), metres, seconds };
    },
  };
}

// ---------- Grid helpers ----------
/** Scanline fill of a polygon given as rings (outer + holes, even-odd), setting cells to value. */
function fillPolygon(g, rings, value) {
  for (let j = 0; j < g.H; j++) {
    const y = g.minY + (j + 0.5) * CELL;
    const hits = [];
    for (const ring of rings) {
      for (let k = 0; k + 1 < ring.length; k++) {
        const [x1, y1] = ring[k];
        const [x2, y2] = ring[k + 1];
        if (y1 > y !== y2 > y) hits.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    hits.sort((a, b) => a - b);
    for (let k = 0; k + 1 < hits.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((hits[k] - g.minX) / CELL - 0.5));
      const i1 = Math.min(g.W - 1, Math.floor((hits[k + 1] - g.minX) / CELL - 0.5));
      for (let i = i0; i <= i1; i++) g.walk[j * g.W + i] = value;
    }
  }
}

// Rejoin open areas that the clearance split apart. A bridge may only use cells of the traced
// walkway (open before clearance, outside every unit), is 4-connected and at most
// BRIDGE_MAX_CELLS long, and only joins areas that each survived clearance and the size filter,
// so slivers between shops never become routes on their own. On the Sarit plans this reopens
// the 1.5-2 m corridor ends around AAR and AL (floors 3 and 4) and the passage from the
// lift 110 / Entrance 4 lobby to the Lower Ground corridor; Carrefour's travelator zone stays
// separate because no traced walkway joins it to the main corridor.
const BRIDGE_MIN_DIST = 1.0;
const BRIDGE_MAX_CELLS = Math.round(12 / CELL);
function bridgeNarrowCorridors(g, open, openDist) {
  const { W, H, walk } = g;
  for (let guard = 0; guard < 50; guard++) {
    const { comp, sizes } = labelComponents(g);
    if (sizes.length < 2) return;
    let joined = false;
    for (let c = 0; c < sizes.length && !joined; c++) {
      // Breadth-first from piece c through bridgeable cells, preferring none: the first other
      // piece reached is the nearest, and the path between is carved open.
      const prev = new Int32Array(W * H).fill(-2);
      const depth = new Int32Array(W * H);
      let queue = [];
      for (let k = 0; k < W * H; k++) if (comp[k] === c) (prev[k] = -1), queue.push(k);
      while (queue.length && !joined) {
        const next = [];
        for (const k of queue) {
          if (depth[k] >= BRIDGE_MAX_CELLS) continue;
          const i = k % W;
          for (const nb of [k - 1, k + 1, k - W, k + W]) {
            if (nb < 0 || nb >= W * H || (nb === k - 1 && i === 0) || (nb === k + 1 && i === W - 1)) continue;
            if (prev[nb] !== -2) continue;
            if (walk[nb] && comp[nb] !== c) {
              for (let p = k; comp[p] !== c; p = prev[p]) walk[p] = 1;
              joined = true;
              break;
            }
            if (walk[nb] || !open[nb] || openDist[nb] < BRIDGE_MIN_DIST) continue;
            prev[nb] = k;
            depth[nb] = depth[k] + 1;
            next.push(nb);
          }
          if (joined) break;
        }
        queue = next;
      }
    }
    if (!joined) return;
  }
}

// Keep the main open area and any area holding a lift/travelator landing; drop the rest.
function keepReachableComponents(g, landingCells) {
  const { comp, sizes } = labelComponents(g);
  if (!sizes.length) return;
  const largest = sizes.indexOf(Math.max(...sizes));
  const keep = new Set([largest]);
  for (const k of landingCells) if (comp[k] >= 0) keep.add(comp[k]);
  for (let k = 0; k < g.W * g.H; k++) if (g.walk[k] && !keep.has(comp[k])) g.walk[k] = 0;
}

// Keep every connected open area of at least minCells; smaller fragments traced from the plan
// (alcoves cut off by a kiosk or a door symbol) would otherwise trap a route.
function keepLargeComponents(g, minCells) {
  const { comp, sizes } = labelComponents(g);
  if (!sizes.length) return;
  const largest = Math.max(...sizes);
  for (let k = 0; k < g.W * g.H; k++) if (g.walk[k] && sizes[comp[k]] < Math.min(minCells, largest)) g.walk[k] = 0;
}

function labelComponents(g) {
  const { W, H, walk } = g;
  const comp = new Int32Array(W * H).fill(-1);
  const sizes = [];
  const stack = [];
  for (let k = 0; k < W * H; k++) {
    if (!walk[k] || comp[k] !== -1) continue;
    const id = sizes.length;
    let n = 0;
    comp[k] = id;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop();
      n++;
      const i = c % W;
      for (const nb of [c - 1, c + 1, c - W, c + W]) {
        if (nb < 0 || nb >= W * H || (nb === c - 1 && i === 0) || (nb === c + 1 && i === W - 1)) continue;
        if (walk[nb] && comp[nb] === -1) {
          comp[nb] = id;
          stack.push(nb);
        }
      }
    }
    sizes.push(n);
  }
  return { comp, sizes };
}

// Chamfer distance to the nearest wall, in cells.
function chamfer(g) {
  const { W, H, walk } = g;
  const dist = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) dist[k] = walk[k] ? 1e6 : 0;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!dist[k]) continue;
      if (i > 0) dist[k] = Math.min(dist[k], dist[k - 1] + 1);
      if (j > 0) dist[k] = Math.min(dist[k], dist[k - W] + 1);
      if (i > 0 && j > 0) dist[k] = Math.min(dist[k], dist[k - W - 1] + D);
      if (i < W - 1 && j > 0) dist[k] = Math.min(dist[k], dist[k - W + 1] + D);
    }
  for (let j = H - 1; j >= 0; j--)
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i;
      if (!dist[k]) continue;
      if (i < W - 1) dist[k] = Math.min(dist[k], dist[k + 1] + 1);
      if (j < H - 1) dist[k] = Math.min(dist[k], dist[k + W] + 1);
      if (i < W - 1 && j < H - 1) dist[k] = Math.min(dist[k], dist[k + W + 1] + D);
      if (i > 0 && j < H - 1) dist[k] = Math.min(dist[k], dist[k + W - 1] + D);
    }
  return dist;
}

/** Nearest point of a unit's outline to [x, y], kept `margin` metres in from the corners of
 * edges long enough, so a route ends on a shop's own front, not on the corner it shares. */
function nearestOnRing([x, y], ring, margin = 1, accept = null) {
  let best = null;
  // Rings run counter-clockwise, so the outside of each edge is on its right.
  const ccw = ringArea(ring) > 0;
  for (let k = 0; k + 1 < ring.length; k++) {
    const [x1, y1] = ring[k];
    const [x2, y2] = ring[k + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const L = dx * dx + dy * dy;
    if (!L) continue;
    const m = L > (margin * 2.5) ** 2 ? margin / Math.sqrt(L) : 0;
    const t = Math.max(m, Math.min(1 - m, ((x - x1) * dx + (y - y1) * dy) / L));
    const q = [x1 + t * dx, y1 + t * dy];
    const len = Math.sqrt(L);
    const out = ccw ? [dy / len, -dx / len] : [-dy / len, dx / len];
    if (accept && !accept(q, out)) continue;
    const d = Math.hypot(x - q[0], y - q[1]);
    if (!best || d < best.d) best = { q, d };
  }
  return best ? best.q : null;
}

function ringArea(ring) {
  let a = 0;
  for (let k = 0; k + 1 < ring.length; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
  return a / 2;
}

function pointInRing([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function edgeDistance([x, y], ring) {
  let best = Infinity;
  for (let k = 0; k + 1 < ring.length; k++) {
    const [x1, y1] = ring[k];
    const [x2, y2] = ring[k + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}

class Heap {
  constructor() {
    this.k = [];
    this.p = [];
  }
  get size() {
    return this.k.length;
  }
  push(key, pri) {
    const { k, p } = this;
    k.push(key);
    p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] <= p[i]) break;
      [k[up], k[i]] = [k[i], k[up]];
      [p[up], p[i]] = [p[i], p[up]];
      i = up;
    }
  }
  pop() {
    const { k, p } = this;
    const top = k[0];
    const lk = k.pop();
    const lp = p.pop();
    if (k.length) {
      k[0] = lk;
      p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
