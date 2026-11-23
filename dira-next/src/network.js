// The corridor network of each floor: the centre lines of its open floor, as a graph of junctions
// and the corridors between them. It is how a person reads a building (walk down this corridor,
// decide at that junction), so the wireframe draws it and the directions use its junctions.

const SPUR_M = 3.5; // dead ends shorter than this are trace noise, not corridors
const SIMPLIFY_M = 0.45;

/** One entry per level: { levelId, nodes: [{ id, at: [lon, lat], degree }], edges: [{ a, b, coords: [[lon, lat]], metres }] } */
export function corridorNetwork(router) {
  return router.inspect().map((g) => levelNetwork(g));
}

function levelNetwork({ levelId, W, H, cell, walk, cellCentre }) {
  const sk = thin(walk, W, H);
  const at = (k) => [k % W, (k / W) | 0];
  const around = (k) => {
    const [i, j] = at(k);
    const out = [];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni >= 0 && nj >= 0 && ni < W && nj < H && sk[nj * W + ni]) out.push(nj * W + ni);
      }
    return out;
  };

  // Nodes: skeleton cells that are not plain corridor (ends and junctions). Touching junction
  // cells are one junction.
  const nodeOf = new Int32Array(W * H).fill(-1);
  const nodes = [];
  for (let k = 0; k < W * H; k++) {
    if (!sk[k] || nodeOf[k] !== -1 || around(k).length === 2) continue;
    const id = nodes.length;
    const cells = [];
    const stack = [k];
    nodeOf[k] = id;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      for (const n of around(c)) {
        if (nodeOf[n] === -1 && around(n).length !== 2) {
          nodeOf[n] = id;
          stack.push(n);
        }
      }
    }
    const ci = cells.reduce((s, c) => s + (c % W), 0) / cells.length;
    const cj = cells.reduce((s, c) => s + ((c / W) | 0), 0) / cells.length;
    nodes.push({ id, cells, i: ci, j: cj });
  }

  // Edges: follow plain corridor cells from one node to the next.
  const seen = new Uint8Array(W * H);
  let edges = [];
  for (const node of nodes) {
    for (const c of node.cells) {
      for (const first of around(c)) {
        if (nodeOf[first] === node.id || seen[first]) continue;
        const path = [c];
        let prev = c;
        let cur = first;
        while (nodeOf[cur] === -1) {
          seen[cur] = 1;
          path.push(cur);
          const next = around(cur).find((n) => n !== prev && !path.includes(n) && (nodeOf[n] !== node.id || path.length > 2));
          if (next == null) break;
          prev = cur;
          cur = next;
        }
        if (nodeOf[cur] === -1) continue; // ran into a loop of plain cells
        if (nodeOf[cur] === node.id && path.length < 3) continue;
        path.push(cur);
        edges.push({ a: node.id, b: nodeOf[cur], cells: path });
      }
    }
  }
  // Adjacent junction cells share no corridor cells: join nodes that touch directly.
  const key = (e) => (e.a < e.b ? `${e.a}-${e.b}-${e.cells.length}` : `${e.b}-${e.a}-${e.cells.length}`);
  const uniq = new Map();
  for (const e of edges) if (!uniq.has(key(e))) uniq.set(key(e), e);
  edges = [...uniq.values()];

  // Prune short dead ends, twice (removing one spur can expose another).
  const metres = (e) => e.cells.length * cell;
  for (let pass = 0; pass < 2; pass++) {
    const degree = new Map();
    for (const e of edges) {
      degree.set(e.a, (degree.get(e.a) || 0) + 1);
      degree.set(e.b, (degree.get(e.b) || 0) + 1);
    }
    edges = edges.filter((e) => !((degree.get(e.a) === 1 || degree.get(e.b) === 1) && e.a !== e.b && metres(e) < SPUR_M && edges.length > 1));
  }

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) || 0) + 1);
    degree.set(e.b, (degree.get(e.b) || 0) + 1);
  }
  const used = nodes.filter((n) => degree.has(n.id));
  const toLL = ([i, j]) => cellCentre(i, j);
  return {
    levelId,
    nodes: used.map((n) => ({ id: n.id, at: toLL([n.i, n.j]), degree: degree.get(n.id) })),
    edges: edges.map((e) => {
      const pts = simplify(
        e.cells.map((c) => at(c)),
        SIMPLIFY_M / cell,
      );
      return { a: e.a, b: e.b, coords: pts.map(toLL), metres: metres(e) };
    }),
  };
}

/** Zhang-Suen thinning: the one-cell-wide centre lines of the open floor. */
function thin(walk, W, H) {
  const im = new Uint8Array(walk.length);
  for (let k = 0; k < walk.length; k++) im[k] = walk[k] ? 1 : 0;
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let j = 1; j < H - 1; j++)
        for (let i = 1; i < W - 1; i++) {
          const k = j * W + i;
          if (!im[k]) continue;
          const p2 = im[k - W], p3 = im[k - W + 1], p4 = im[k + 1], p5 = im[k + W + 1];
          const p6 = im[k + W], p7 = im[k + W - 1], p8 = im[k - 1], p9 = im[k - W - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (a !== 1) continue;
          if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
          del.push(k);
        }
      for (const k of del) im[k] = 0;
      if (del.length) changed = true;
    }
  }
  return im;
}

/** Douglas-Peucker on [i, j] cell positions. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x0, y0] = pts[s];
    const [x1, y1] = pts[e];
    const L = Math.hypot(x1 - x0, y1 - y0) || 1;
    let far = -1;
    let fd = tol;
    for (let k = s + 1; k < e; k++) {
      const d = Math.abs((x1 - x0) * (y0 - pts[k][1]) - (x0 - pts[k][0]) * (y1 - y0)) / L;
      if (d > fd) {
        fd = d;
        far = k;
      }
    }
    if (far !== -1) {
      keep[far] = 1;
      stack.push([s, far], [far, e]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}
