import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { corridorNetwork } from '../network.js';

// The wireframe ("blueprint") of a venue: each floor's plan image vacuum-formed into a slab, its
// walls raised from the trace, the corridor network on the floor, lifts, escalators and stairs
// joining the floors, and an optional route through the stack. Turn, tilt and zoom freely.

const WALL_M = 2.8;
const LOW_WALL_M = 1.2; // non-public space: present but quiet
const C = {
  bg: '#140d09',
  slab: '#2a1c14',
  outline: '#f4dcc4',
  shop: '#d9b394',
  quiet: '#6f5647',
  washroom: '#9cc3cf',
  elevator: '#e07a5f',
  escalator: '#f2a65a',
  stairs: '#d8b23a',
  net: '#ffd9a8',
  junction: '#ff7a52',
  route: '#ff6b3d',
  plan: '#e9c9a8',
};
const UNIT_COLOR = { restroom: C.washroom, 'restroom.male': C.washroom, 'restroom.female': C.washroom, elevator: C.elevator, escalator: C.escalator, stairs: C.stairs, nonpublic: C.quiet, room: C.quiet };

export default function Blueprint3D({ imdf, router, plans, planBase, focusId, gap, show, route }) {
  const el = useRef(null);
  const api = useRef(null);

  // ---------- Build the scene once per venue ----------
  useEffect(() => {
    const host = el.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(C.bg);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(C.bg, 700, 1600);
    const camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 25;
    controls.maxDistance = 900;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.screenSpacePanning = true;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    // Venue metres: x east, z south (three.js is y up).
    const [lon0, lat0] = imdf.venue.properties.display_point.coordinates;
    const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
    const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
    const P = ([lon, lat], y = 0) => new THREE.Vector3((lon - lon0) * mLon, y, -(lat - lat0) * mLat);

    const fatMaterials = [];
    const fat = (positions, color, width, opacity = 1) => {
      const geo = new LineSegmentsGeometry().setPositions(positions);
      const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false });
      fatMaterials.push(mat);
      return new LineSegments2(geo, mat);
    };
    const thin = (positions, color, opacity = 1) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    };
    const ringSegments = (ring, y, out) => {
      for (let k = 1; k < ring.length; k++) {
        const a = P(ring[k - 1], y);
        const b = P(ring[k], y);
        out.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    };

    const network = corridorNetwork(router);
    const netByLevel = new Map(network.map((n) => [n.levelId, n]));
    const levels = [...imdf.levels].sort((a, b) => a.ordinal - b.ordinal);
    const minOrdinal = levels[0].ordinal;
    const floors = new Map();
    const texLoader = new THREE.TextureLoader();

    for (const level of levels) {
      const group = new THREE.Group();
      const parts = { plan: [], walls: [], paths: [], base: [] };
      // Slab: the floor's outline, filled.
      const outer = level.feature.geometry.coordinates[0];
      const shape = new THREE.Shape(outer.map(([lon, lat]) => new THREE.Vector2((lon - lon0) * mLon, (lat - lat0) * mLat)));
      const slabGeo = new THREE.ShapeGeometry(shape);
      slabGeo.rotateX(-Math.PI / 2);
      const slab = new THREE.Mesh(slabGeo, new THREE.MeshBasicMaterial({ color: C.slab, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      slab.position.y = -0.05;
      parts.base.push(slab);
      const edge = [];
      ringSegments(outer, 0, edge);
      parts.base.push(fat(edge, C.outline, 2.6, 1));

      // Plan image, vacuum-formed onto the slab: its ink becomes light, its paper transparent.
      const plan = plans?.[level.id];
      if (plan) {
        // Cut to the floor's outline so each floor reads as one closed shape, not a loose sheet.
        const [tl, tr, , bl] = plan.corners.map((c) => P(c));
        const ux = tr.x - tl.x, uz = tr.z - tl.z, wx = bl.x - tl.x, wz = bl.z - tl.z;
        const det = ux * wz - uz * wx || 1;
        const geo = slabGeo.clone();
        const pos = geo.attributes.position;
        const uv = [];
        for (let k = 0; k < pos.count; k++) {
          const qx = pos.getX(k) - tl.x, qz = pos.getZ(k) - tl.z;
          const u = (qx * wz - qz * wx) / det;
          const w = (ux * qz - uz * qx) / det;
          uv.push(u, 1 - w);
        }
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.translate(0, 0.07, 0);
        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: { map: { value: null }, texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, tint: { value: new THREE.Color(C.plan) }, opacity: { value: 0.9 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          // Edges of the drawing glow (a Sobel filter on brightness); flat colour is only a faint wash.
          fragmentShader: `uniform sampler2D map; uniform vec2 texel; uniform vec3 tint; uniform float opacity; varying vec2 vUv;
            float L(vec2 o){ return dot(texture2D(map, vUv + o * texel).rgb, vec3(0.299, 0.587, 0.114)); }
            void main(){
              float tl = L(vec2(-1, 1)), t = L(vec2(0, 1)), tr = L(vec2(1, 1));
              float l = L(vec2(-1, 0)), r = L(vec2(1, 0));
              float bl = L(vec2(-1, -1)), b = L(vec2(0, -1)), br = L(vec2(1, -1));
              float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
              float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
              float edge = smoothstep(0.12, 0.55, length(vec2(gx, gy)));
              float wash = (1.0 - L(vec2(0))) * 0.12;
              if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;
          gl_FragColor = vec4(tint, max(edge, wash) * opacity); }`,
        });
        texLoader.load(planBase + plan.image, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mat.uniforms.texel.value.set(1 / tex.image.width, 1 / tex.image.height);
          mat.uniforms.map.value = tex;
        });
        parts.plan.push(new THREE.Mesh(geo, mat));
      }

      // Walls: every room raised from its trace, as wireframe.
      const byColor = new Map();
      for (const u of imdf.units) {
        if (u.properties.level_id !== level.id || u.properties.category === 'walkway') continue;
        const color = UNIT_COLOR[u.properties.category] || C.shop;
        const h = color === C.quiet ? LOW_WALL_M : WALL_M;
        if (!byColor.has(color)) byColor.set(color, []);
        const out = byColor.get(color);
        for (const ring of u.geometry.coordinates) {
          ringSegments(ring, 0, out);
          ringSegments(ring, h, out);
          // Uprights only at corners, so straight walls read as planes, not cages.
          for (let k = 0; k < ring.length - 1; k++) {
            const prev = ring[(k - 1 + ring.length - 1) % (ring.length - 1)];
            const cur = ring[k];
            const next = ring[k + 1];
            const a1 = Math.atan2(cur[1] - prev[1], cur[0] - prev[0]);
            const a2 = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
            const turn = Math.abs(((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
            if (turn < 0.35) continue;
            const v = P(cur, 0);
            out.push(v.x, 0, v.z, v.x, h, v.z);
          }
        }
      }
      for (const [color, segs] of byColor) parts.walls.push(thin(segs, color, color === C.quiet ? 0.45 : 0.8));

      // The corridor network: centre lines, junctions marked.
      const net = netByLevel.get(level.id);
      if (net) {
        const segs = [];
        for (const e of net.edges)
          for (let k = 1; k < e.coords.length; k++) {
            const a = P(e.coords[k - 1], 0.25);
            const b = P(e.coords[k], 0.25);
            segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
        parts.paths.push(fat(segs, C.net, 1.8, 0.75));
        const pts = net.nodes.filter((n) => n.degree > 2).flatMap((n) => P(n.at, 0.3).toArray());
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        parts.paths.push(new THREE.Points(geo, new THREE.PointsMaterial({ color: C.junction, size: 3.5, sizeAttenuation: false, transparent: true, depthWrite: false })));
      }

      // Floor name, floating at the floor's west edge.
      // Floor badge at the floor's west-most corner.
      const west = outer.map((c) => P(c)).reduce((a, b) => (b.x < a.x ? b : a));
      const label = textSprite(level.short);
      label.position.set(west.x - 3, 1, west.z);
      parts.base.push(label);

      for (const list of Object.values(parts)) for (const o of list) group.add(o);
      scene.add(group);
      const box = new THREE.Box3().setFromObject(slab);
      floors.set(level.id, { group, parts, rank: level.ordinal - minOrdinal, label, box });
    }

    // The drafting plate: a framed base under the building so the drawing has a finished edge.
    const foot = new THREE.Box3();
    for (const f of floors.values()) foot.union(f.box);
    const PAD = 14;
    const x0 = foot.min.x - PAD, x1 = foot.max.x + PAD, z0 = foot.min.z - PAD, z1 = foot.max.z + PAD;
    const plate = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: '#1b120d', transparent: true, opacity: 0.9, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.set((x0 + x1) / 2, -0.4, (z0 + z1) / 2);
    fill.renderOrder = -2;
    plate.add(fill);
    const grid = [];
    for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) grid.push(x, -0.3, z0, x, -0.3, z1);
    for (let z = Math.ceil(z0 / 10) * 10; z < z1; z += 10) grid.push(x0, -0.3, z, x1, -0.3, z);
    plate.add(thin(grid, C.outline, 0.07));
    const sq = (a0, a1, b0, b1, y) => [a0, y, b0, a1, y, b0, a1, y, b0, a1, y, b1, a1, y, b1, a0, y, b1, a0, y, b1, a0, y, b0];
    plate.add(fat(sq(x0, x1, z0, z1, -0.3), C.outline, 1.6, 0.6));
    plate.add(thin(sq(x0 + 4, x1 - 4, z0 + 4, z1 - 4, -0.3), C.outline, 0.3));
    const T = 10;
    const ticks = [];
    for (const [cx, cz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x1, z1, -1, -1], [x0, z1, 1, -1]]) ticks.push(cx, -0.25, cz, cx + sx * T, -0.25, cz, cx, -0.25, cz, cx, -0.25, cz + sz * T);
    plate.add(fat(ticks, C.junction, 3, 1));
    const north = northSprite();
    north.position.set(x1 - 12, 1, z0 + 12);
    plate.add(north);
    scene.add(plate);

    // Lifts, escalators and stairs between floors: vertical links at their shafts.
    const centreOf = (unitId) => {
      const u = imdf.unitById.get(unitId);
      if (!u) return null;
      const ring = u.geometry.coordinates[0];
      return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    };
    const links = { elevator: [], escalator: [], stairs: [] };
    const linkEnds = [];
    for (const r of imdf.relationships) {
      const kind = r.category === 'elevator' ? 'elevator' : r.category === 'escalator' ? 'escalator' : r.category === 'stairs' ? 'stairs' : null;
      const ua = imdf.unitById.get(r.a);
      const ub = imdf.unitById.get(r.b);
      if (!kind || !ua || !ub) continue;
      linkEnds.push({ kind, a: centreOf(r.a), b: centreOf(r.b), la: ua.properties.level_id, lb: ub.properties.level_id });
    }
    const linkObjects = {};
    for (const kind of Object.keys(links)) {
      const mat = new LineMaterial({ color: C[kind], linewidth: kind === 'elevator' ? 3 : 2, transparent: true, opacity: 0.9, dashed: kind === 'stairs', dashSize: 1.2, gapSize: 0.8, depthWrite: false });
      fatMaterials.push(mat);
      const obj = new LineSegments2(new LineSegmentsGeometry(), mat);
      scene.add(obj);
      linkObjects[kind] = obj;
    }

    // Route: a bright line through the stack and a light that travels along it.
    const routeLine = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: C.route, linewidth: 6, transparent: true, depthTest: false }));
    fatMaterials.push(routeLine.material);
    routeLine.renderOrder = 10;
    scene.add(routeLine);
    const runner = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), new THREE.MeshBasicMaterial({ color: '#fff1e0', depthTest: false }));
    runner.renderOrder = 11;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 14), new THREE.MeshBasicMaterial({ color: C.route, transparent: true, opacity: 0.35, depthTest: false }));
    halo.renderOrder = 11;
    runner.add(halo);
    const startMark = ring3(C.outline);
    const endMark = ring3(C.route);
    scene.add(runner, startMark, endMark);
    let routePath = null; // { pts: Vector3[], cum: number[], total }

    // Fit a box on screen from a direction: the distance at which its bounding sphere fills the
    // narrower field of view.
    const target = new THREE.Vector3();
    const camGoal = new THREE.Vector3();
    let gliding = false;
    controls.addEventListener('start', () => (gliding = false));
    let view = { box: null, dir: null };
    const fit = (instant = false) => {
      if (!view.box) return;
      const sphere = view.box.getBoundingSphere(new THREE.Sphere());
      // The bars over the canvas: frame the building in the clear space between them.
      const r = host.getBoundingClientRect();
      const w = r.width || 1;
      const h = r.height || 1;
      let top = 0;
      let bottom = 0;
      for (const n of document.querySelectorAll('.blueprint-top, .venue-nav-float')) top = Math.max(top, n.getBoundingClientRect().bottom - r.top);
      for (const n of document.querySelectorAll('.blueprint-floors, .blueprint-focus')) bottom = Math.max(bottom, r.bottom - n.getBoundingClientRect().top);
      top = Math.min(top, h * 0.4) + 8;
      bottom = Math.min(bottom, h * 0.3) + 8;
      camera.setViewOffset(w, h, 0, (bottom - top) / 2, w, h);
      const tanFull = Math.tan((camera.fov * Math.PI) / 360);
      const tanV = (tanFull * (h - top - bottom)) / h;
      const tanH = (tanFull * (w - 32)) / h;
      // Exact fit: each corner of the box, seen from a direction, must sit inside the frame. Try
      // directions round the south side (so north stays roughly up) and keep the one that shows
      // the building largest: on a tall phone that turns the long side away from you.
      const { min, max } = view.box;
      const corners = [];
      for (const cx of [min.x, max.x]) for (const cy of [min.y, max.y]) for (const cz of [min.z, max.z]) corners.push(new THREE.Vector3(cx, cy, cz).sub(sphere.center));
      const distFor = (dir) => {
        const fwd = dir.clone().negate();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, fwd);
        let d = 10;
        for (const o of corners) {
          const z = o.dot(fwd);
          d = Math.max(d, z + Math.abs(o.dot(right)) / tanH, z + Math.abs(o.dot(up)) / tanV);
        }
        return d;
      };
      const e = view.elevation;
      let best = null;
      for (let deg = -60; deg <= 60; deg += 5) {
        const a = (deg * Math.PI) / 180;
        const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
        // A slight preference for the classic corner view, so it only turns when it pays.
        const d = distFor(dir) * (1 + Math.abs(deg - 25) * 0.0015);
        if (!best || d < best.d) best = { d, dir };
      }
      view.dir = best.dir;
      const d = distFor(best.dir);
      target.copy(sphere.center);
      camGoal.copy(sphere.center).addScaledVector(view.dir, d);
      controls.maxDistance = Math.max(900, d * 1.6);
      if (instant) {
        camera.position.copy(camGoal);
        controls.target.copy(target);
        gliding = false;
      } else gliding = true;
    };

    // ---------- Sizing and the frame loop ----------
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      for (const m of fatMaterials) m.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
      // Badges keep one size on screen, about 28 px.
      const k = 26 / (1.65 * Math.max(200, h));
      for (const f of floors.values()) f.label.scale.set(k, k, 1);
      fit(true);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    let last = performance.now();
    let travelled = 0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      controls.target.lerp(target, gliding ? 0.1 : 0.08);
      if (gliding) {
        camera.position.lerp(camGoal, 0.1);
        if (camera.position.distanceTo(camGoal) < 0.5) gliding = false;
      }
      controls.update();
      if (routePath && routeLine.visible) {
        travelled = (travelled + dt * Math.max(18, routePath.total / 9)) % (routePath.total + 20);
        const d = Math.min(travelled, routePath.total);
        let k = 1;
        while (k < routePath.cum.length - 1 && routePath.cum[k] < d) k++;
        const t = (d - routePath.cum[k - 1]) / (routePath.cum[k] - routePath.cum[k - 1] || 1);
        runner.position.lerpVectors(routePath.pts[k - 1], routePath.pts[k], t);
        halo.scale.setScalar(1 + 0.25 * Math.sin(now / 180));
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    const home = () => fit();
    raf = requestAnimationFrame(tick);

    api.current = {
      layout({ focusId: fid, gap: g, show: s }, first = false) {
        if (fid && !floors.has(fid)) fid = null;
        const box = new THREE.Box3();
        for (const [id, f] of floors) {
          f.group.position.y = f.rank * g;
          f.group.visible = !fid || id === fid;
          if (f.group.visible) {
            box.union(f.box.clone().translate(new THREE.Vector3(0, f.rank * g, 0)));
            f.label.visible = !fid;
          }
          for (const o of f.parts.plan) o.visible = s.plan;
          for (const o of f.parts.walls) o.visible = s.walls;
          for (const o of f.parts.paths) o.visible = s.paths;
        }
        // Links follow the floors' heights.
        const y = (levelId) => floors.get(levelId).rank * g;
        for (const kind of Object.keys(linkObjects)) {
          const pos = [];
          for (const l of linkEnds) {
            if (l.kind !== kind) continue;
            const a = P(l.a, y(l.la) + 0.3);
            const b = P(l.b, y(l.lb) + 0.3);
            pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
          const obj = linkObjects[kind];
          obj.geometry.dispose();
          obj.geometry = new LineSegmentsGeometry().setPositions(pos.length ? pos : [0, 0, 0, 0, 0, 0]);
          obj.computeLineDistances();
          obj.visible = s.links && pos.length > 0 && !fid;
        }
        plate.position.y = fid ? floors.get(fid).rank * g : 0;
        if (!fid) box.expandByPoint(new THREE.Vector3(x0, 0, z0)).expandByPoint(new THREE.Vector3(x1, 0, z1));
        // A chosen floor is seen more from above, like a plan; the whole building from the corner.
        view = { box, elevation: ((fid ? 62 : 36) * Math.PI) / 180 };
        fit(first);
      },
      setRoute(r, g, visible, fid) {
        if (!r) {
          routePath = null;
          routeLine.visible = runner.visible = startMark.visible = endMark.visible = false;
          return;
        }
        const y = (levelId) => floors.get(levelId).rank * g + 0.6;
        const pts = [];
        // With one floor chosen, only the part of the route on it.
        for (const leg of r.legs) if (!fid || leg.levelId === fid) for (const c of leg.coordinates) pts.push(P(c, y(leg.levelId)));
        if (pts.length < 2) {
          routePath = null;
          routeLine.visible = runner.visible = startMark.visible = endMark.visible = false;
          return;
        }
        const segs = [];
        for (let k = 1; k < pts.length; k++) segs.push(...pts[k - 1].toArray(), ...pts[k].toArray());
        routeLine.geometry.dispose();
        routeLine.geometry = new LineSegmentsGeometry().setPositions(segs);
        const cum = [0];
        for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
        routePath = { pts, cum, total: cum[cum.length - 1] };
        startMark.position.copy(pts[0]);
        endMark.position.copy(pts[pts.length - 1]);
        routeLine.visible = runner.visible = visible;
        startMark.visible = visible && (!fid || r.legs[0].levelId === fid);
        endMark.visible = visible && (!fid || r.legs[r.legs.length - 1].levelId === fid);
      },
      home,
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          o.material.uniforms?.map?.value?.dispose();
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
      api.current = null;
    };
  }, [imdf, router, plans, planBase]);

  const laidOut = useRef(false);
  useEffect(() => {
    if (!api.current) return;
    api.current.layout({ focusId, gap, show }, !laidOut.current);
    laidOut.current = true;
    api.current.setRoute(route, gap, show.route, focusId);
  }, [focusId, gap, show, route, plans]);

  return (
    <div className="blueprint-canvas" ref={el}>
      <button className="icon-btn blueprint-home" type="button" onClick={() => api.current?.home()} aria-label="Reset view">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>
    </div>
  );
}

function textSprite(short) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ff7a52';
  x.beginPath();
  x.arc(64, 64, 58, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#140d09';
  x.lineWidth = 6;
  x.stroke();
  x.fillStyle = '#140d09';
  x.font = `800 ${short.length > 1 ? 52 : 64}px system-ui, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(short, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, fog: false }));
  s.center.set(1, 0.5);
  s.renderOrder = 5;
  return s;
}

function northSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#f4dcc4';
  x.lineWidth = 4;
  x.beginPath();
  x.arc(64, 64, 58, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#ff7a52';
  x.beginPath();
  x.moveTo(64, 14);
  x.lineTo(84, 70);
  x.lineTo(64, 60);
  x.lineTo(44, 70);
  x.closePath();
  x.fill();
  x.fillStyle = '#faf3ec';
  x.font = '800 34px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('N', 64, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(12, 12, 1);
  return s;
}

function ring3(color) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(3, 0.6, 10, 40), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 11;
  m.visible = false;
  return m;
}
