import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { poseAt } from '../guide.js';
import { initials, placeName } from '../places.js';

// The walk view: the route seen from eye height, in the blueprint look. Walls are glowing planes
// raised from the trace, the floor carries the plan drawing and the painted arrows, every store
// has a signboard over it (lit while you pass it), and a beacon stands over the destination.
// The camera stands where the current step starts and walks the stretch when you move on.

const EYE_M = 1.6;
const WALL_M = 3;
const SPEED = 1.8; // metres a second
const C = {
  bg: '#140d09',
  wall: '#3a2a20',
  edge: '#f4dcc4',
  floor: '#1f150f',
  plan: '#e9c9a8',
  route: '#ff7a52',
  arrow: '#e0673f',
  arrowLit: '#ff8a4c',
  keep: '#e9c9a8',
  beacon: '#ff6b3d',
};

export default function WalkView3D({ imdf, network, plans, planBase, track, steps, step, passing, arrows, destPoint, destLevelId, mapHref }) {
  const mini = useRef(null);
  const el = useRef(null);
  const api = useRef(null);

  // ---------- Scene, once per route ----------
  useEffect(() => {
    const host = el.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(C.bg);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(C.bg, 14, 85);
    const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400);
    const [lon0, lat0] = imdf.venue.properties.display_point.coordinates;
    const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
    const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
    const P = ([lon, lat], y = 0) => new THREE.Vector3((lon - lon0) * mLon, y, -(lat - lat0) * mLat);
    const fatMats = [];

    // One group per floor on the route; only the floor you are on is shown.
    const levelIds = [...new Set(track.legs.map((l) => l.levelId))];
    const floors = new Map();
    const loader = new THREE.TextureLoader();
    for (const levelId of levelIds) {
      const g = new THREE.Group();
      const level = imdf.levelById.get(levelId);
      const outer = level.feature.geometry.coordinates[0];
      const shape = new THREE.Shape(outer.map(([lon, lat]) => new THREE.Vector2((lon - lon0) * mLon, (lat - lat0) * mLat)));
      const slab = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.floor }));
      g.add(slab);
      // The plan drawing on the floor.
      const plan = plans?.[levelId];
      if (plan?.lines) {
        const [tl, tr, br, bl] = plan.corners.map((c) => P(c, 0.01));
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([tl, tr, br, bl].flatMap((v) => v.toArray()), 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
        geo.setIndex([0, 3, 1, 1, 3, 2]);
        const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, color: C.plan });
        loader.load(planBase + plan.lines, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mat.map = tex;
          mat.needsUpdate = true;
        });
        g.add(new THREE.Mesh(geo, mat));
      }
      // Walls: translucent planes along every room's outline, edges drawn in light.
      const quads = [];
      const edges = [];
      for (const u of imdf.units) {
        if (u.properties.level_id !== levelId || u.properties.category === 'walkway') continue;
        for (const ring of u.geometry.coordinates) {
          for (let k = 1; k < ring.length; k++) {
            const a = P(ring[k - 1]);
            const b = P(ring[k]);
            quads.push(a.x, 0, a.z, b.x, 0, b.z, b.x, WALL_M, b.z, a.x, 0, a.z, b.x, WALL_M, b.z, a.x, WALL_M, a.z);
            edges.push(a.x, WALL_M, a.z, b.x, WALL_M, b.z, a.x, 0.02, a.z, b.x, 0.02, b.z, a.x, 0, a.z, a.x, WALL_M, a.z);
          }
        }
      }
      const wallGeo = new THREE.BufferGeometry();
      wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(quads, 3));
      g.add(new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: C.wall, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false })));
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
      g.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: C.edge, transparent: true, opacity: 0.55 })));
      // The route on this floor: a glowing line on the floor.
      const segs = [];
      for (const leg of track.legs) {
        if (leg.levelId !== levelId) continue;
        for (let k = 1; k < leg.coords.length; k++) segs.push(...P(leg.coords[k - 1], 0.06).toArray(), ...P(leg.coords[k], 0.06).toArray());
      }
      if (segs.length) {
        const mat = new LineMaterial({ color: C.route, linewidth: 5, transparent: true, opacity: 0.9 });
        fatMats.push(mat);
        g.add(new LineSegments2(new LineSegmentsGeometry().setPositions(segs), mat));
      }
      // Shop signs on the shopfronts: on the edge of each shop that faces the walkways (the
      // corridor network), at fascia height, facing out.
      const signs = new Map();
      const net = network?.find((n) => n.levelId === levelId);
      const corridor = net ? net.edges.flatMap((e) => e.coords.map((c) => P(c))) : [];
      for (const poi of imdf.pois) {
        if (poi.kind !== 'occupant' || poi.levelId !== levelId) continue;
        const unit = imdf.unitById.get(poi.unitId);
        const front = unit && shopFront(unit.geometry.coordinates[0].map((c) => P(c)), corridor);
        const sign = shopSign(poi, front, P(poi.point));
        g.add(sign.group);
        signs.set(poi.id, sign);
      }
      // A ceiling grid, so the corridor reads as indoors.
      const ceil = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: gridTexture(), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
      ceil.position.y = WALL_M + 1.6;
      g.add(ceil);
      // The destination: a beacon you can see from afar.
      if (destLevelId === levelId && destPoint) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: C.beacon, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        beam.position.copy(P(destPoint, 7));
        g.add(beam);
      }
      g.visible = false;
      scene.add(g);
      floors.set(levelId, { group: g, signs, arrows: null });
    }

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // About 90° across on any screen: a tall phone gets a taller view, not a narrower one.
      camera.fov = Math.min(105, (2 * Math.atan(Math.tan(Math.PI / 4) / camera.aspect) * 180) / Math.PI);
      camera.updateProjectionMatrix();
      for (const m of fatMats) m.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // ---------- Walking and looking ----------
    const at = { leg: 0, s: 0 };
    let walk = null; // { leg, from, to, t0, dur }
    let yaw = null;
    let look = 0; // extra yaw while dragging to look around
    let dragging = false;
    let lastX = 0;
    // Face down the corridor, not at the next metre: look well ahead along the route.
    const headingAt = (leg, s) => poseAt(track, leg, s, 12).heading;
    const posAt = (leg, s) => P(poseAt(track, leg, s, 0).ll, EYE_M);
    const onDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging) return;
      look = Math.max(-150, Math.min(150, look - (e.clientX - lastX) * 0.35));
      lastX = e.clientX;
    };
    const onUp = () => {
      dragging = false;
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (walk) {
        const k = Math.min(1, (now - walk.t0) / walk.dur);
        const e = k < 0.15 ? (k / 0.15) ** 2 * 0.075 : k > 0.85 ? 1 - ((1 - k) / 0.15) ** 2 * 0.075 : 0.075 + ((k - 0.15) / 0.7) * 0.85;
        at.leg = walk.leg;
        at.s = walk.from + (walk.to - walk.from) * e;
        if (k >= 1) walk = null;
      }
      const target = headingAt(at.leg, at.s);
      yaw = yaw == null ? target : yaw + ((((target - yaw + 540) % 360) - 180) * Math.min(1, dt * 2.2));
      if (!dragging) look *= Math.pow(0.15, dt);
      const pos = posAt(at.leg, at.s);
      camera.position.copy(pos);
      // A gentle step bob while walking.
      if (walk) camera.position.y += Math.sin(now / 170) * 0.025;
      const h = ((yaw + look) * Math.PI) / 180;
      camera.lookAt(pos.x + Math.sin(h) * 10, EYE_M - 1.1, pos.z - Math.cos(h) * 10);
      renderer.render(scene, camera);
      drawMini(at, ((yaw + look) * Math.PI) / 180);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // The corner map: this floor from above, the route, and you with the way you face.
    const miniData = new Map(
      levelIds.map((id) => [
        id,
        {
          ring: imdf.levelById.get(id).feature.geometry.coordinates[0].map((c) => P(c)),
          route: track.legs.filter((l) => l.levelId === id).map((l) => l.coords.map((c) => P(c))),
        },
      ]),
    );
    const drawMini = (pos, heading) => {
      const cv = mini.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      const W = cv.width;
      const d = miniData.get(track.legs[pos.leg].levelId);
      const me = P(poseAt(track, pos.leg, pos.s, 0).ll);
      const k = W / 70; // 70 m across
      const X = (v) => W / 2 + (v.x - me.x) * k;
      const Y = (v) => W / 2 + (v.z - me.z) * k;
      ctx.clearRect(0, 0, W, W);
      ctx.fillStyle = 'rgba(20,13,9,0.9)';
      ctx.fillRect(0, 0, W, W);
      ctx.strokeStyle = 'rgba(244,220,196,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      d.ring.forEach((v, i) => (i ? ctx.lineTo(X(v), Y(v)) : ctx.moveTo(X(v), Y(v))));
      ctx.stroke();
      ctx.strokeStyle = '#ff7a52';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (const line of d.route) {
        ctx.beginPath();
        line.forEach((v, i) => (i ? ctx.lineTo(X(v), Y(v)) : ctx.moveTo(X(v), Y(v))));
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(W / 2, W / 2);
      ctx.rotate(heading);
      ctx.fillStyle = '#faf3ec';
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(9, 9);
      ctx.lineTo(0, 4);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const showLevel = (levelId) => {
      for (const [id, f] of floors) f.group.visible = id === levelId;
    };

    api.current = {
      /** Go to { leg, s }: walk there on the same floor, else appear there (after a ride). */
      goTo(target, animate) {
        showLevel(track.legs[target.leg].levelId);
        if (animate && target.leg === at.leg && target.s > at.s + 0.2) {
          walk = { leg: target.leg, from: at.s, to: target.s, t0: performance.now(), dur: Math.max(1200, Math.min(25000, ((target.s - at.s) / SPEED) * 1000)) };
        } else {
          walk = null;
          at.leg = target.leg;
          at.s = target.s;
          yaw = null;
        }
      },
      /** Signs of the stores passed on this stretch lit, the rest dim. */
      highlight(ids) {
        for (const f of floors.values())
          for (const [id, sign] of f.signs) {
            const on = ids.has(id);
            sign.fascia.material.opacity = on ? 1 : 0.55;
            sign.blade.visible = on;
          }
      },
      /** The painted floor arrows (polygons from turnFeatures). */
      arrows(fcArrows) {
        for (const [levelId, f] of floors) {
          if (f.arrows) {
            f.group.remove(f.arrows);
            f.arrows.traverse((o) => {
              o.geometry?.dispose();
              o.material?.dispose();
            });
          }
          const grp = new THREE.Group();
          for (const feat of fcArrows.features) {
            if (feat.properties.level !== levelId) continue;
            const ring = feat.geometry.coordinates[0];
            const shp = new THREE.Shape(ring.map(([lon, lat]) => new THREE.Vector2((lon - lon0) * mLon, (lat - lat0) * mLat)));
            const color = feat.properties.current ? C.arrowLit : feat.properties.kind === 'keep' ? C.keep : C.arrow;
            const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shp).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: feat.properties.current ? 1 : 0.8, depthWrite: false }));
            mesh.position.y = 0.04;
            grp.add(mesh);
          }
          f.group.add(grp);
          f.arrows = grp;
        }
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
      api.current = null;
    };
  }, [imdf, network, plans, planBase, track, destPoint, destLevelId]);

  // ---------- Follow the step ----------
  const shown = useRef(null);
  useEffect(() => {
    if (!api.current) return;
    const g = Math.min(step, track.stops.length - 1);
    const target = g === 0 ? track.stops[0] : track.stops[g - 1].leg === track.stops[g].leg ? track.stops[g - 1] : { leg: track.stops[g].leg, s: 0 };
    const prev = shown.current;
    api.current.goTo(target, prev != null && step === prev + 1);
    shown.current = step;
  }, [step, track]);
  useEffect(() => {
    api.current?.highlight(new Set((passing || []).map((p) => p.poi.id)));
  }, [passing, track]);
  useEffect(() => {
    if (arrows) api.current?.arrows(arrows);
  }, [arrows, track]);

  return (
    <>
      <div className="walk-canvas" ref={el} />
      <a className="walk-mini" href={mapHref} aria-label="Map">
        <canvas ref={mini} width="220" height="220" />
      </a>
    </>
  );
}

/** The edge of a shop (ring in scene metres) nearest the corridor network: { a, b, mid, out, len }. */
function shopFront(ring, corridor) {
  let best = null;
  for (let k = 1; k < ring.length; k++) {
    const a = ring[k - 1];
    const b = ring[k];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1.2) continue;
    const mid = new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    let d = Infinity;
    let near = null;
    for (const c of corridor) {
      const dd = Math.hypot(c.x - mid.x, c.z - mid.z);
      if (dd < d) {
        d = dd;
        near = c;
      }
    }
    if (!near) continue;
    if (!best || d < best.d) {
      let out = new THREE.Vector3(-(b.z - a.z) / len, 0, (b.x - a.x) / len);
      if (out.x * (near.x - mid.x) + out.z * (near.z - mid.z) < 0) out = out.negate();
      best = { a, b, mid, out, len, d };
    }
  }
  return best;
}

function signCanvas(poi) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(20,13,9,0.94)';
  x.strokeStyle = '#ffb27a';
  x.lineWidth = 5;
  x.beginPath();
  x.roundRect(4, 4, 504, 120, 18);
  x.fill();
  x.stroke();
  x.fillStyle = '#ec6a44';
  x.beginPath();
  x.roundRect(18, 18, 92, 92, 16);
  x.fill();
  x.fillStyle = '#140d09';
  x.font = '800 40px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(initials(poi.name), 64, 66);
  x.fillStyle = '#faf3ec';
  x.textAlign = 'left';
  let size = 44;
  const name = placeName(poi);
  do {
    x.font = `700 ${size}px system-ui, sans-serif`;
    size -= 2;
  } while (x.measureText(name).width > 370 && size > 22);
  x.fillText(name, 128, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * A shop's signs: a fascia on its shopfront, facing the corridor, and a blade sign standing out
 * from the wall (readable looking down the corridor), shown while you pass the shop.
 */
function shopSign(poi, front, centre) {
  const tex = signCanvas(poi);
  const group = new THREE.Group();
  const w = front ? Math.min(5, Math.max(2.4, front.len * 0.8)) : 4;
  const fascia = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55 }));
  const blade = new THREE.Group();
  const bw = 2.2;
  for (const flip of [0, Math.PI]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    face.rotation.y = flip;
    face.position.z = flip ? -0.01 : 0.01;
    blade.add(face);
  }
  blade.visible = false;
  if (front) {
    const yaw = Math.atan2(front.out.x, front.out.z);
    fascia.position.set(front.mid.x + front.out.x * 0.06, WALL_M - 0.55, front.mid.z + front.out.z * 0.06);
    fascia.rotation.y = yaw;
    // The blade hangs out from the shopfront, square to it.
    blade.position.set(front.mid.x + front.out.x * (bw / 2 + 0.1), WALL_M - 0.3, front.mid.z + front.out.z * (bw / 2 + 0.1));
    blade.rotation.y = yaw + Math.PI / 2;
  } else {
    fascia.position.set(centre.x, WALL_M + 1.2, centre.z);
  }
  group.add(fascia, blade);
  return { group, fascia, blade };
}

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(244,220,196,0.22)';
  x.lineWidth = 2;
  x.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 4, 1 / 4); // a line every 4 m
  return tex;
}
