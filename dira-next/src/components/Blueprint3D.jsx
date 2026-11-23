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
      parts.base.push(fat(edge, C.outline, 2.2, 0.9));

      // Plan image, vacuum-formed onto the slab: its ink becomes light, its paper transparent.
      const plan = plans?.[level.id];
      if (plan) {
        const [tl, tr, br, bl] = plan.corners.map((c) => P(c, 0.02));
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([tl, tr, br, bl].flatMap((v) => [v.x, v.y, v.z]), 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
        geo.setIndex([0, 3, 1, 1, 3, 2]);
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
        parts.paths.push(new THREE.Points(geo, new THREE.PointsMaterial({ color: C.junction, size: 6, sizeAttenuation: false, transparent: true, depthWrite: false })));
      }

      // Floor name, floating at the floor's west edge.
      const xs = outer.map((c) => P(c).x);
      const zs = outer.map((c) => P(c).z);
      const label = textSprite(level.short, level.name);
      label.position.set(Math.min(...xs) - 14, 2, (Math.min(...zs) + Math.max(...zs)) / 2);
      parts.base.push(label);

      for (const list of Object.values(parts)) for (const o of list) group.add(o);
      scene.add(group);
      floors.set(level.id, { group, parts, rank: level.ordinal - minOrdinal, label });
    }

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

    // ---------- Sizing and the frame loop ----------
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      for (const m of fatMaterials) m.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const target = new THREE.Vector3();
    let raf = 0;
    let last = performance.now();
    let travelled = 0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      controls.target.lerp(target, 0.08);
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

    // First view: from the south-east, above the stack.
    const all = new THREE.Box3();
    for (const f of floors.values()) all.expandByObject(f.parts.base[0]);
    const size = all.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    const home = () => {
      // Narrow (portrait) screens need to stand further back to fit the building's width.
      const d = span / Math.min(1, camera.aspect * 1.25);
      camera.position.set(d * 0.55, d * 0.75, d * 0.95);
      target.set(0, 0, 0);
      controls.target.copy(target);
    };
    home();
    raf = requestAnimationFrame(tick);

    api.current = {
      layout({ focusId: fid, gap: g, show: s }) {
        const focusRank = fid ? floors.get(fid)?.rank : null;
        for (const [id, f] of floors) {
          f.group.position.y = f.rank * g;
          const dim = !fid || id === fid ? 1 : 0.07;
          f.group.traverse((o) => {
            if (!o.material) return;
            if (o.material.userData.base == null) o.material.userData.base = o.material.uniforms?.opacity?.value ?? o.material.opacity;
            if (o.material.uniforms?.opacity) o.material.uniforms.opacity.value = o.material.userData.base * dim;
            else o.material.opacity = o.material.userData.base * dim;
          });
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
        target.set(0, focusRank != null ? focusRank * g : ((levels.length - 1) * g) / 2.6, 0);
      },
      setRoute(r, g, visible) {
        if (!r) {
          routePath = null;
          routeLine.visible = runner.visible = startMark.visible = endMark.visible = false;
          return;
        }
        const y = (levelId) => floors.get(levelId).rank * g + 0.6;
        const pts = [];
        for (const leg of r.legs) for (const c of leg.coordinates) pts.push(P(c, y(leg.levelId)));
        const segs = [];
        for (let k = 1; k < pts.length; k++) segs.push(...pts[k - 1].toArray(), ...pts[k].toArray());
        routeLine.geometry.dispose();
        routeLine.geometry = new LineSegmentsGeometry().setPositions(segs);
        const cum = [0];
        for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
        routePath = { pts, cum, total: cum[cum.length - 1] };
        startMark.position.copy(pts[0]);
        endMark.position.copy(pts[pts.length - 1]);
        routeLine.visible = runner.visible = startMark.visible = endMark.visible = visible;
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

  useEffect(() => {
    api.current?.layout({ focusId, gap, show });
    api.current?.setRoute(route, gap, show.route);
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

function textSprite(short, name) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(20,13,9,0.82)';
  x.beginPath();
  x.roundRect(4, 4, 504, 120, 60);
  x.fill();
  x.strokeStyle = '#f4dcc4';
  x.lineWidth = 4;
  x.stroke();
  x.fillStyle = '#ff7a52';
  x.beginPath();
  x.arc(64, 64, 42, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#140d09';
  x.font = '800 40px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(short, 64, 66);
  x.fillStyle = '#faf3ec';
  x.textAlign = 'left';
  x.font = '700 46px system-ui, sans-serif';
  x.fillText(name, 124, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(40, 10, 1);
  s.center.set(1, 0.5);
  s.renderOrder = 5;
  return s;
}

function ring3(color) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(3, 0.6, 10, 40), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 11;
  m.visible = false;
  return m;
}
