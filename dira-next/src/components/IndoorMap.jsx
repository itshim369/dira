import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { addImdfLayers, baseStyle, showLevel } from '@imdf/mapLayers.js';
import { addBuildingLayers, addFloorLabels, arrivalLabel, arrivalPoint, highlightFloor, levelHeights, showBuilding, showFloorLabels, updateFloorLabels } from '../buildingLayers.js';
import { applyMapTheme } from '../mapTheme.js';
import { addGuideLayers, beamFeatures, buildTrack, distanceToTurn, poseAt, setGuideTheme, showGuideLevel, splitRoute, turnFeatures } from '../guide.js';
import ViewStick from './ViewStick.jsx';
import { Icon } from './Icons.jsx';
import { markerIcon, initials, placeName } from '../places.js';
import { tr, usePrefs } from '../prefs.js';

// MapLibre finds its worker next to its own file, which bundling moves; point at it directly.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const PIN =
  '<svg viewBox="0 0 40 52" width="40" height="52"><path d="M20 50s16-15.5 16-29A16 16 0 0 0 4 21c0 13.5 16 29 16 29Z" fill="#C8553D" stroke="#fff" stroke-width="3"/><circle cx="20" cy="20" r="6.5" fill="#fff"/></svg>';

function bboxOf(coords) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

function pointAlong(coords, t) {
  const seg = [];
  let total = 0;
  for (let k = 1; k < coords.length; k++) {
    const d = Math.hypot(coords[k][0] - coords[k - 1][0], coords[k][1] - coords[k - 1][1]);
    seg.push(d);
    total += d;
  }
  if (!total) return coords[0];
  let target = t * total;
  for (let k = 0; k < seg.length; k++) {
    if (target <= seg[k] || k === seg.length - 1) {
      const f = seg[k] ? Math.min(1, target / seg[k]) : 0;
      return [coords[k][0] + (coords[k + 1][0] - coords[k][0]) * f, coords[k][1] + (coords[k + 1][1] - coords[k][1]) * f];
    }
    target -= seg[k];
  }
  return coords[coords.length - 1];
}

const PADDING = { top: 70, bottom: 60, left: 60, right: 80 };
const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };
const FLOOR_LAYERS = ['level-fill', 'unit-floor', 'unit-selected', 'walls', 'route-casing', 'route-line'];
// Whole-building cameras: a bird's-eye three-quarter view and a street-level side view.
const BUILDING_CAMERA = { aerial: { pitch: 56, bearing: -32 }, side: { pitch: 78, bearing: -12 } };
const ARRIVAL_ZOOM = 20.1;
// The guided walk's follow camera: behind and above the walking figure, facing where it walks.
const FOLLOW = { zoom: 20.55, pitch: 60, wideAtCorner: 0.45 };
const WALK_SPEED = 5; // metres a second on screen
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const turnToward = (from, to, k) => from + (((to - from + 540) % 360) - 180) * k;
const FIGURE =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-7 2.5 3v4M8 11l3-3.5 3.5 1L17 12M11 7.5 9.5 13"/></svg>';
const FLOOR_ARROW =
  '<svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true"><ellipse cx="30" cy="30" rx="22" ry="22" fill="rgba(59,36,24,.22)"/><path d="M30 9 44 34H16Z" fill="#C8553D" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';

/**
 * The 3D indoor map of one venue, one floor at a time.
 * Markers are DOM elements so they use the brand fonts; overlapping ones hide by priority.
 * With `buildingView` ('aerial' or 'side') it shows the whole building, floors stacked; picking
 * a floor (`onPickFloor`) flies in to that floor, arriving at its stairs and lift.
 */
export default function IndoorMap({ imdf, levelId, route, steps = [], guideStep = null, startId, destId, selectedId, group, focus, fitKey, walker = true, buildingEnabled = false, buildingView = null, onBuilding, onPickFloor, onSelect, onLevel, children }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef(new Map());
  const extras = useRef({ dest: null, callouts: [], walker: null, arrival: null, figure: null, floorArrow: null });
  const [ready, setReady] = useState(false);
  const [pitched, setPitched] = useState(true);
  const { lang, theme } = usePrefs();
  const state = useRef({});
  const guiding = guideStep != null && !!route;
  const landmarkId = guiding ? steps[guideStep]?.landmarkId || null : null;
  state.current = { levelId, startId, destId, selectedId, group, route, buildingView, landmarkId };
  const handlers = useRef({});
  handlers.current = { onSelect, onLevel, onPickFloor };

  const layout = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const { levelId: lv, startId: s, destId: d, selectedId: sel, group: g, route: r, buildingView: bv, landmarkId: lm } = state.current;
    const items = [];
    for (const { poi, node } of markers.current.values()) {
      if (poi.levelId !== lv || bv) {
        node.classList.add('is-hidden');
        continue;
      }
      const pinned = poi.id === sel || poi.id === s || poi.id === d || poi.id === lm;
      let want;
      if (pinned) want = 3;
      else if (g) want = poi.group === g ? 2 : 0;
      else if (r) want = poi.kind === 'amenity' ? (z > 18.6 ? 1 : 0) : z > 18.9 ? 1 : 0;
      else if (poi.kind === 'unnamed') want = 0;
      else if (poi.kind === 'amenity') want = poi.category === 'entry' || poi.category === 'parking' ? (z > 16.8 ? 1 : 0) : z > 17.8 ? 1 : 0;
      else want = poi.area > 450 ? 1 : z > 17.9 ? 1 : 0;
      const withLabel = poi.kind === 'occupant' ? z > 17.2 || poi.area > 450 : z > 19.2 || g === poi.group || pinned;
      items.push({ poi, node, want, withLabel, p: map.project(poi.point) });
    }
    items.sort((a, b) => b.want - a.want || b.poi.area - a.poi.area);
    const placed = [];
    for (const it of items) {
      const textW = it.poi.name.length * 6.6;
      const w = it.withLabel ? Math.max(36, Math.min(148, textW)) : 36;
      const lines = it.withLabel ? Math.ceil(textW / 140) : 0;
      const box = [it.p.x - w / 2, it.p.y - 19, it.p.x + w / 2, it.p.y + 19 + lines * 15];
      const collides = placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      const show = it.want > 0 && (it.want >= 3 || !collides);
      it.node.classList.toggle('is-hidden', !show);
      it.node.classList.toggle('no-label', !it.withLabel);
      it.node.classList.toggle('is-selected', it.poi.id === sel || it.poi.id === d);
      it.node.classList.toggle('is-start', it.poi.id === s);
      it.node.classList.toggle('is-landmark', it.poi.id === lm);
      if (show) placed.push(box);
    }
  }, []);

  // ---------- Create the map once ----------
  useEffect(() => {
    const level = imdf.levelById.get(levelId) || imdf.levels[0];
    const bounds = bboxOf(imdf.venue.geometry.coordinates[0]);
    const map = new maplibregl.Map({
      container: el.current,
      style: baseStyle(),
      bounds: bboxOf(level.feature.geometry.coordinates[0]),
      fitBoundsOptions: { padding: PADDING },
      pitch: 45,
      bearing: -14,
      maxPitch: buildingEnabled ? 85 : 65,
      minZoom: 15.5,
      maxZoom: 21.5,
      maxBounds: [
        [bounds[0][0] - 0.003, bounds[0][1] - 0.003],
        [bounds[1][0] + 0.003, bounds[1][1] + 0.003],
      ],
      attributionControl: false,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__diraMap = map; // for local checks only
    map.on('load', () => {
      addImdfLayers(map, imdf, state.current.levelId);
      addGuideLayers(map, 'walls');
      if (buildingEnabled) {
        addBuildingLayers(map, imdf);
        addFloorLabels(map, imdf, tr, document.documentElement.dataset.theme === 'dark');
        for (const id of ['bld-slab', 'bld-units', 'bld-walls', 'bld-pick']) {
          map.on('click', id, (e) => {
            if (!state.current.buildingView) return;
            // Extruded features under the tap come back nearest first.
            const level = e.features[0]?.properties.level;
            if (level) handlers.current.onPickFloor?.(level);
          });
          map.on('mouseenter', id, () => {
            if (state.current.buildingView) map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
        }
      }
      map.on('click', 'unit-floor', (e) => {
        if (state.current.buildingView) return;
        const poi = imdf.poiByUnit.get(e.features[0]?.properties.uid);
        if (poi) handlers.current.onSelect?.(poi);
      });
      map.on('mouseenter', 'unit-floor', (e) => {
        if (imdf.poiByUnit.get(e.features[0]?.properties.uid)) map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'unit-floor', () => (map.getCanvas().style.cursor = ''));
      for (const poi of imdf.pois) {
        if (poi.kind === 'unnamed') continue;
        const node = document.createElement('button');
        node.type = 'button';
        node.className = `poi poi-${poi.kind}`;
        node.innerHTML = `<span class="poi-tile">${poi.kind === 'amenity' ? markerIcon(poi.category) : initials(poi.name)}</span><span class="poi-label"></span>`;
        node.querySelector('.poi-label').textContent = placeName(poi);
        node.setAttribute('aria-label', placeName(poi));
        node.addEventListener('click', (ev) => {
          ev.stopPropagation();
          handlers.current.onSelect?.(poi);
        });
        const marker = new maplibregl.Marker({ element: node, anchor: 'top', offset: [0, -17] }).setLngLat(poi.point).addTo(map);
        markers.current.set(poi.id, { poi, node, marker });
      }
      setReady(true);
      layout();
    });
    let frame = 0;
    map.on('move', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      markers.current.clear();
    };
  }, [imdf]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Light or dark, and the floor labels' language ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyMapTheme(map, imdf, theme === 'dark');
    setGuideTheme(map, theme === 'dark');
    if (buildingEnabled) updateFloorLabels(map, imdf, tr, theme === 'dark');
    // Marker labels are DOM nodes made once; rename them in the new language.
    for (const { poi, node } of markers.current.values()) {
      node.querySelector('.poi-label').textContent = placeName(poi);
      node.setAttribute('aria-label', placeName(poi));
    }
  }, [ready, theme, lang, imdf, buildingEnabled]);

  // ---------- Floor, selection, destination pin ----------
  const highlightUnit = (selectedId && imdf.pois.find((p) => p.id === selectedId)?.unitId) || (destId && imdf.pois.find((p) => p.id === destId)?.unitId) || '';
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    showLevel(map, levelId, highlightUnit);
    layout();
    const ex = extras.current;
    ex.dest?.remove();
    ex.dest = null;
    const dest = destId && imdf.pois.find((p) => p.id === destId);
    if (dest && dest.levelId === levelId) {
      const node = document.createElement('div');
      node.className = 'dest-pin';
      node.innerHTML = PIN;
      ex.dest = new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat(dest.point).addTo(map);
    }
  }, [ready, levelId, highlightUnit, destId, startId, selectedId, group, imdf, layout]);

  // ---------- Route line, floor-change tags, walking figure ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return undefined;
    const ex = extras.current;
    for (const c of ex.callouts) c.remove();
    ex.callouts = [];
    ex.walker?.remove();
    ex.walker = null;
    map.getSource('route').setData({
      type: 'FeatureCollection',
      features: (route?.legs || []).map((leg) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: leg.coordinates }, properties: { level: leg.levelId } })),
    });
    if (!route) return undefined;
    route.legs.forEach((leg, i) => {
      if (leg.levelId !== levelId) return;
      const add = (lngLat, text, goTo, light) => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = `callout${light ? ' callout-light' : ''}`;
        node.textContent = text;
        node.addEventListener('click', (ev) => {
          ev.stopPropagation();
          handlers.current.onLevel?.(goTo);
        });
        ex.callouts.push(new maplibregl.Marker({ element: node, anchor: 'bottom', offset: [0, -14] }).setLngLat(lngLat).addTo(map));
      };
      const out = route.transitions[i];
      const back = route.transitions[i - 1];
      if (out) {
        const to = imdf.levelById.get(out.toLevelId);
        const up = to.ordinal > imdf.levelById.get(out.fromLevelId).ordinal;
        add(leg.coordinates[leg.coordinates.length - 1], tr(up ? 'Up to {floor}' : 'Down to {floor}', { floor: to.short }), out.toLevelId, false);
      }
      if (back) add(leg.coordinates[0], tr('From {floor}', { floor: imdf.levelById.get(back.fromLevelId).short }), back.fromLevelId, true);
    });
    const leg = route.legs.find((l) => l.levelId === levelId);
    if (!leg || !walker || guiding) return undefined;
    const node = document.createElement('div');
    node.className = 'walker';
    node.innerHTML = markerIcon('walk');
    const m = new maplibregl.Marker({ element: node }).setLngLat(leg.coordinates[0]).addTo(map);
    ex.walker = m;
    let start = performance.now();
    let raf = 0;
    const tick = (now) => {
      let t = (now - start) / 9000;
      if (t > 1.2) {
        start = now;
        t = 0;
      }
      m.setLngLat(pointAlong(leg.coordinates, Math.min(1, t)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, route, levelId, walker, imdf, lang, guiding]);

  // ---------- Whole building ----------
  const wasBuilding = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !buildingEnabled) return;
    if (!buildingView) {
      showBuilding(map, false, FLOOR_LAYERS);
      showFloorLabels(map, false);
      wasBuilding.current = null;
      layout();
      return;
    }
    showBuilding(map, true, FLOOR_LAYERS);
    showFloorLabels(map, buildingView === 'side');
    highlightFloor(map, levelId);
    layout();
    const cam = BUILDING_CAMERA[buildingView] || BUILDING_CAMERA.aerial;
    const { z } = levelHeights(imdf);
    const stack = Math.max(...z.values()) + 6;
    // Frame the footprint, then step back for the height of the stack.
    const fit = map.cameraForBounds(bboxOf(imdf.levels.at(-1).feature.geometry.coordinates[0]), { padding: 90 });
    const narrow = map.getContainer().clientWidth < 600;
    const zoom = (fit?.zoom ?? 18.5) - (buildingView === 'side' ? 0.15 + stack / 110 : narrow ? 0.1 : 0.7) + (narrow ? 0.35 : 0);
    map.easeTo({
      center: imdf.venue.properties.display_point.coordinates,
      zoom,
      ...cam,
      // Side on, the stack rises above its footprint: put the footprint low in the frame.
      // On a phone, the side view's floor labels need room on the left.
      padding: { ...NO_PADDING, top: Math.round(map.getContainer().clientHeight * (buildingView === 'side' ? 0.5 : 0.18)), left: buildingView === 'side' ? (narrow ? 150 : 240) : 0 },
      duration: wasBuilding.current ? 900 : 1200,
    });
    wasBuilding.current = buildingView;
  }, [ready, buildingView, levelId, buildingEnabled, imdf, layout]);

  // ---------- Arriving on a floor: close in on its stairs and lift ----------
  const arrivalKey = buildingEnabled && !buildingView && !route && !focus ? levelId : '';
  useEffect(() => {
    const map = mapRef.current;
    const ex = extras.current;
    ex.arrival?.remove();
    ex.arrival = null;
    if (!ready || !map || !arrivalKey) return;
    const at = arrivalPoint(imdf, arrivalKey);
    if (!at) return;
    map.flyTo({ center: at, zoom: ARRIVAL_ZOOM, pitch: 52, bearing: -18, padding: NO_PADDING, duration: 2200, essential: true });
    const node = document.createElement('div');
    node.className = 'arrival-chip';
    node.innerHTML = `${markerIcon('walk')}<span></span>`;
    node.querySelector('span').textContent = `${tr('You arrive here')} · ${tr(arrivalLabel(imdf, arrivalKey) || 'Entrance')}`;
    // Below the doors, so the Stairs and Lift markers stay readable.
    ex.arrival = new maplibregl.Marker({ element: node, anchor: 'top', offset: [0, 22] }).setLngLat(at).addTo(map);
  }, [ready, arrivalKey, imdf, lang]);

  // ---------- Camera ----------
  const focusKey = focus ? focus.join(',') : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || buildingView || arrivalKey || guiding) return;
    if (focus) {
      map.easeTo({ center: focus, zoom: Math.max(map.getZoom(), 18.8), duration: 700 });
      return;
    }
    const leg = route?.legs.find((l) => l.levelId === levelId);
    const coords = leg ? leg.coordinates : imdf.levelById.get(levelId).feature.geometry.coordinates[0];
    if (buildingEnabled) {
      // A small building: closer in, and back from the building view's tilt and framing.
      map.setPadding(NO_PADDING);
      const camera = map.cameraForBounds(bboxOf(coords), { padding: PADDING, maxZoom: leg ? 20.4 : 19.8 });
      if (camera) map.easeTo({ ...camera, pitch: pitched ? 50 : 0, duration: 800 });
      return;
    }
    map.fitBounds(bboxOf(coords), { padding: PADDING, maxZoom: leg ? 19.3 : 18.5, duration: 700 });
  }, [ready, fitKey, levelId, focusKey, buildingView, guiding]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Route styling: walked and ahead, turn arrows, beam, landmark ----------
  const track = useMemo(() => (route && steps.length ? buildTrack(route, steps) : null), [route, steps]);
  const dest = destId ? imdf.pois.find((p) => p.id === destId) : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const empty = { type: 'FeatureCollection', features: [] };
    map.getSource('guide-turns').setData(track ? turnFeatures(track, steps) : empty);
    map.getSource('guide-beam').setData(track && dest ? beamFeatures(track, dest.point) : empty);
    if (!guiding) {
      const parts = track ? splitRoute(track, null) : { done: empty, ahead: empty };
      map.getSource('guide-done').setData(parts.done);
      map.getSource('guide-ahead').setData(parts.ahead);
    }
    const lmUnit = landmarkId && imdf.pois.find((p) => p.id === landmarkId)?.unitId;
    const unit = lmUnit && imdf.unitById.get(lmUnit);
    map.getSource('guide-landmark').setData(unit ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { level: unit.properties.level_id }, geometry: unit.geometry }] } : empty);
    showGuideLevel(map, levelId);
    layout();
  }, [ready, track, steps, dest, guiding, landmarkId, levelId, imdf, layout]);

  // ---------- The guided walk: the figure walks each step, the camera follows ----------
  const walkAt = useRef(null); // where the figure stands: { leg, s }
  useEffect(() => {
    const map = mapRef.current;
    const ex = extras.current;
    if (!ready || !map) return undefined;
    if (!guiding || !track) {
      ex.figure?.remove();
      ex.floorArrow?.remove();
      ex.figure = ex.floorArrow = null;
      walkAt.current = null;
      if (map.getLayer('walls')) map.setPaintProperty('walls', 'fill-extrusion-height', ['get', 'h']);
      return undefined;
    }
    // Lower the walls while walking, so they never hide the figure.
    map.setPaintProperty('walls', 'fill-extrusion-height', ['*', ['get', 'h'], 0.5]);
    if (!ex.figure) {
      const fig = document.createElement('div');
      fig.className = 'guide-figure';
      fig.innerHTML = FIGURE;
      const floor = document.createElement('div');
      floor.className = 'guide-floor';
      floor.innerHTML = FLOOR_ARROW;
      ex.floorArrow = new maplibregl.Marker({ element: floor, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(route.legs[0].coordinates[0]).addTo(map);
      ex.figure = new maplibregl.Marker({ element: fig, anchor: 'bottom', offset: [0, -6] }).setLngLat(route.legs[0].coordinates[0]).addTo(map);
    }
    // The figure waits at the start of the step being read (at the corner, at the lift), and
    // walks that stretch when the visitor moves on. A step on a new floor starts where the ride
    // lands.
    const g = Math.min(guideStep, track.stops.length - 1);
    let target = g === 0 ? track.stops[0] : track.stops[g - 1].leg === track.stops[g].leg ? track.stops[g - 1] : { leg: track.stops[g].leg, s: 0 };
    // Before a turn, wait a few metres short of the corner, with its painted arrow just ahead.
    if (g > 0 && ['left', 'right', 'around'].includes(steps[g]?.kind)) {
      const floorStart = g > 1 && track.stops[g - 2].leg === target.leg ? track.stops[g - 2].s : 0;
      target = { leg: target.leg, s: Math.max(floorStart, target.s - 6) };
    }
    const prev = walkAt.current;
    const card = map.getContainer().parentElement?.querySelector('.guide-bar');
    const padding = { ...NO_PADDING, top: Math.round(map.getContainer().clientHeight * 0.28), bottom: (card?.offsetHeight || 0) + 24 };
    let bearing = prev ? map.getBearing() : null;
    let raf = 0;
    const place = (li, s, smooth, dt) => {
      const pose = poseAt(track, li, s);
      const facing = poseAt(track, li, s, 6).heading;
      bearing = bearing == null || !smooth ? facing : turnToward(bearing, facing, Math.min(1, dt * 3.2));
      const corner = distanceToTurn(track, li, s);
      const zoom = FOLLOW.zoom - (corner < 8 ? FOLLOW.wideAtCorner * (1 - corner / 8) : 0);
      ex.figure.setLngLat(pose.ll);
      ex.floorArrow.setLngLat(pose.ll).setRotation(pose.heading);
      const parts = splitRoute(track, { leg: li, s });
      map.getSource('guide-done').setData(parts.done);
      map.getSource('guide-ahead').setData(parts.ahead);
      walkAt.current = { leg: li, s };
      return { center: poseAt(track, li, s, 2.5).aheadLL, bearing, zoom, pitch: FOLLOW.pitch, padding };
    };
    const sameLeg = prev && prev.leg === target.leg && guideStep > 0 && !reducedMotion();
    if (!sameLeg || target.s <= prev.s + 0.05) {
      // First step, a new floor, going back, or reduced motion: fly (or cut) straight there.
      const cam = place(target.leg, target.s, false, 0);
      if (reducedMotion()) map.jumpTo(cam);
      else map.flyTo({ ...cam, duration: prev ? 900 : 1600, essential: true });
      return undefined;
    }
    const from = prev.s;
    const dur = Math.max(900, Math.min(4500, ((target.s - from) / WALK_SPEED) * 1000));
    const t0 = performance.now();
    let last = t0;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      map.jumpTo(place(target.leg, from + (target.s - from) * ease, true, (now - last) / 1000));
      last = now;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, guiding, guideStep, track]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the guide: back to the usual framing.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || guiding || !route) return;
    map.setPadding(NO_PADDING);
  }, [ready, guiding, route]);

  const zoom = (d) => (d > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut());
  const togglePitch = () => {
    const next = !pitched;
    setPitched(next);
    const pitch = buildingView ? (BUILDING_CAMERA[buildingView] || BUILDING_CAMERA.aerial).pitch : 45;
    mapRef.current?.easeTo({ pitch: next ? pitch : 0, duration: 500 });
  };
  const fitAll = () => {
    if (buildingView) return onBuilding?.(buildingView);
    if (buildingEnabled && !route) {
      const at = arrivalPoint(imdf, levelId);
      if (at) return mapRef.current?.flyTo({ center: at, zoom: ARRIVAL_ZOOM, pitch: 52, padding: NO_PADDING, duration: 900 });
    }
    const leg = route?.legs.find((l) => l.levelId === levelId);
    const coords = leg ? leg.coordinates : imdf.levelById.get(levelId).feature.geometry.coordinates[0];
    mapRef.current?.fitBounds(bboxOf(coords), { padding: PADDING, maxZoom: 19.3, duration: 600 });
  };

  return (
    <div className="map-card indoor-map">
      <div ref={el} className="map-canvas" />
      <div className="zoom">
        <button className="icon-btn" type="button" onClick={() => zoom(1)} aria-label={tr('Zoom in')}>
          <Icon name="plus" />
        </button>
        <button className="icon-btn" type="button" onClick={() => zoom(-1)} aria-label={tr('Zoom out')}>
          <Icon name="minus" />
        </button>
        <button className="icon-btn" type="button" onClick={fitAll} aria-label={route ? tr('Show the route on this floor') : tr('Show the whole floor')}>
          <Icon name="target" />
        </button>
        <button className="icon-btn" type="button" onClick={togglePitch} aria-label={pitched ? tr('Switch to 2D') : tr('Switch to 3D')}>
          <span className="ctrl-text">{pitched ? '2D' : '3D'}</span>
        </button>
        {buildingEnabled && (
          <button className="icon-btn" type="button" onClick={() => onBuilding?.()} aria-pressed={!!buildingView} aria-label={tr('Show the whole building')}>
            <Icon name="building" />
          </button>
        )}
      </div>
      {ready && (
        <ViewStick
          mapRef={mapRef}
          maxPitch={buildingEnabled ? 85 : 65}
          home={buildingView ? BUILDING_CAMERA[buildingView] || BUILDING_CAMERA.aerial : { pitch: 45, bearing: -14 }}
          onTilt={(p) => setPitched(p > 2)}
          className={buildingView ? 'is-raised' : ''}
        />
      )}
      {!ready && <div className="map-loading">{tr('Loading the map…')}</div>}
      {children}
    </div>
  );
}
