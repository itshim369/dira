import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadImdf, categoryText, label } from './imdf.js';
import { createRouter } from './route.js';
import { addImdfLayers, baseStyle, showLevel } from './mapLayers.js';
import { AMENITY_ICON, Icon, iconSvg, initials } from './icons.jsx';
import PlaceCard, { PoiTile } from './PlaceCard.jsx';

// MapLibre finds its worker next to its own file, which bundling moves; point at it directly.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const SHORTCUTS = [
  { id: 'food', label: 'Food and drink', icon: 'food' },
  { id: 'money', label: 'Banks and ATMs', icon: 'money' },
  { id: 'help', label: 'Washrooms', icon: 'help' },
  { id: 'exits', label: 'Exits', icon: 'exit' },
];
const RIDE = { elevator: 'lift', escalator: 'escalator', stairs: 'stairs' };
const RIDE_ICON = { elevator: 'elevator', escalator: 'escalator', stairs: 'stairs' };
const DIRA_APP = 'http://localhost:5173/#/venue/sarit';

const isMobile = () => window.matchMedia('(max-width: 720px)').matches;
const cardPadding = () => (isMobile() ? { top: 300, bottom: 40, left: 30, right: 70 } : { top: 70, bottom: 70, left: 460, right: 110 });

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

function clockIn(seconds) {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

/** Point a given fraction along a polyline, in lon/lat. */
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

function PlaceSearch({ pois, levelName, value, onChange, onPick, placeholder, autoFocus, exclude }) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const results = q
    ? pois.filter((p) => p.kind !== 'unnamed' && p.id !== exclude && (p.name.toLowerCase().includes(q) || categoryText(p.category).toLowerCase().includes(q))).slice(0, 8)
    : [];
  return (
    <div className="place-search">
      <input
        className="field"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="dropdown" role="listbox">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(p), setOpen(false))}>
                <strong>{p.name}</strong>
                <span>Sarit Centre / {levelName(p.levelId)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const calloutsRef = useRef([]);
  const walkerRef = useRef(null);
  const destRef = useRef(null);
  const [imdf, setImdf] = useState(null);
  const [error, setError] = useState(null);
  const [levelId, setLevelId] = useState(null);
  const [floorsOpen, setFloorsOpen] = useState(false);
  const [mode, setMode] = useState('home');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [fromId, setFromId] = useState(null);
  const [toId, setToId] = useState(null);
  const [fromText, setFromText] = useState('');
  const [route, setRoute] = useState(null);
  const [stepFree, setStepFree] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pitched, setPitched] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

  const router = useMemo(() => (imdf ? createRouter(imdf) : null), [imdf]);
  const poiById = useMemo(() => new Map((imdf?.pois || []).map((p) => [p.id, p])), [imdf]);
  const level = levelId ? imdf?.levelById.get(levelId) : null;
  const levelName = useCallback((id) => imdf?.levelById.get(id)?.name || '', [imdf]);
  const selected = selectedId ? poiById.get(selectedId) : null;
  const fromPoi = fromId ? poiById.get(fromId) : null;
  const toPoi = toId ? poiById.get(toId) : null;

  useEffect(() => {
    loadImdf().then(
      (data) => {
        setImdf(data);
        setLevelId(data.levels.find((l) => l.ordinal === -1)?.id || data.levels[0].id);
      },
      (e) => setError(e.message),
    );
  }, []);

  // ---------- Map set-up ----------
  useEffect(() => {
    if (!imdf || !levelId || mapRef.current) return undefined;
    const bounds = bboxOf(imdf.venue.geometry.coordinates[0]);
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: baseStyle(),
      bounds: bboxOf(imdf.levelById.get(levelId).feature.geometry.coordinates[0]),
      fitBoundsOptions: { padding: cardPadding() },
      pitch: 48,
      bearing: -14,
      maxPitch: 65,
      minZoom: 16,
      maxZoom: 21.5,
      maxBounds: [
        [bounds[0][0] - 0.0025, bounds[0][1] - 0.0025],
        [bounds[1][0] + 0.0025, bounds[1][1] + 0.0025],
      ],
      attributionControl: false,
    });
    mapRef.current = map;
    map.on('load', () => {
      addImdfLayers(map, imdf, stateRef.current.levelId);
      map.on('click', 'unit-floor', (e) => {
        const poi = imdf.poiByUnit.get(e.features[0]?.properties.uid);
        if (poi) window.dispatchEvent(new CustomEvent('dira:select', { detail: poi.id }));
      });
      map.on('mouseenter', 'unit-floor', (e) => {
        if (imdf.poiByUnit.get(e.features[0]?.properties.uid)) map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'unit-floor', () => (map.getCanvas().style.cursor = ''));
      buildMarkers(map, imdf);
      layoutMarkers();
      window.dispatchEvent(new Event('dira:mapready'));
    });
    let frame = 0;
    map.on('move', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layoutMarkers);
    });
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
    };
  }, [imdf, levelId === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onSelect = (e) => select(e.detail);
    window.addEventListener('dira:select', onSelect);
    return () => window.removeEventListener('dira:select', onSelect);
  });

  // ---------- Markers (DOM, so they use the brand fonts) ----------
  const stateRef = useRef({});
  stateRef.current = { group, selectedId, fromId, toId, mode, levelId };

  function buildMarkers(map, data) {
    for (const poi of data.pois) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `poi poi-${poi.kind}`;
      const icon = poi.kind === 'amenity' ? AMENITY_ICON[poi.category] || 'info' : null;
      const inner = poi.kind === 'unnamed' ? '?' : icon ? iconSvg(icon, 16) : initials(poi.name);
      el.innerHTML = `<span class="poi-tile">${inner}</span><span class="poi-label"></span>`;
      el.querySelector('.poi-label').textContent = poi.kind === 'unnamed' ? poi.reviewRef : poi.name;
      el.setAttribute('aria-label', poi.kind === 'unnamed' ? `Unnamed unit ${poi.reviewRef}` : poi.name);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        window.dispatchEvent(new CustomEvent('dira:select', { detail: poi.id }));
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, -17] }).setLngLat(poi.point).addTo(map);
      markersRef.current.set(poi.id, { poi, el, marker });
    }
  }

  const layoutMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const { group: g, selectedId: sel, fromId: f, toId: t, mode: m, levelId: lv } = stateRef.current;
    const navigating = m === 'nav';
    const items = [];
    for (const { poi, el } of markersRef.current.values()) {
      if (poi.levelId !== lv) {
        el.classList.add('is-hidden');
        continue;
      }
      const pinned = poi.id === sel || poi.id === f || poi.id === t;
      let want;
      if (pinned) want = 3;
      else if (g) want = poi.group === g ? 2 : 0;
      else if (navigating) want = poi.kind === 'amenity' && z > 18.6 ? 1 : 0;
      else if (poi.kind === 'unnamed') want = z > 18.8 ? 1 : 0;
      else if (poi.kind === 'amenity') want = poi.category === 'entry' || poi.category === 'parking' ? (z > 16.8 ? 1 : 0) : z > 17.8 ? 1 : 0;
      else want = poi.area > 450 ? 1 : z > 17.9 ? 1 : 0;
      const withLabel = poi.kind === 'occupant' ? z > 17.2 || poi.area > 450 : poi.kind === 'unnamed' ? z > 19.4 : z > 19.2 || g === poi.group || pinned;
      items.push({ poi, el, want, withLabel, p: map.project(poi.point) });
    }
    items.sort((a, b) => b.want - a.want || b.poi.area - a.poi.area);
    const placed = [];
    for (const it of items) {
      const textW = (it.poi.kind === 'unnamed' ? it.poi.reviewRef : it.poi.name).length * 6.6;
      const w = it.withLabel ? Math.max(36, Math.min(148, textW)) : 36;
      const lines = it.withLabel ? Math.ceil(textW / 140) : 0;
      const box = [it.p.x - w / 2, it.p.y - 19, it.p.x + w / 2, it.p.y + 19 + lines * 15];
      const collides = placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      const show = it.want > 0 && (it.want >= 3 || !collides);
      it.el.classList.toggle('is-hidden', !show);
      it.el.classList.toggle('no-label', !it.withLabel);
      it.el.classList.toggle('is-selected', it.poi.id === sel || it.poi.id === t);
      it.el.classList.toggle('is-start', it.poi.id === f && m === 'nav');
      if (show) placed.push(box);
    }
  }, []);

  useEffect(() => {
    layoutMarkers();
  }, [group, selectedId, fromId, toId, mode, levelId, layoutMarkers]);

  // Floor shown, selected unit and destination pin.
  const target = mode === 'nav' || mode === 'route' ? toPoi : selected;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !levelId) return undefined;
    const apply = () => {
      if (!map.getLayer('unit-selected')) return;
      showLevel(map, levelId, target?.unitId || '');
      if (destRef.current) destRef.current.remove();
      destRef.current = null;
      if (target && target.levelId === levelId) {
        const el = document.createElement('div');
        el.className = 'dest-pin';
        el.innerHTML =
          '<svg viewBox="0 0 40 52" width="40" height="52"><path d="M20 50s16-15.5 16-29A16 16 0 0 0 4 21c0 13.5 16 29 16 29Z" fill="#C8553D" stroke="#fff" stroke-width="3"/><circle cx="20" cy="20" r="6.5" fill="#fff"/></svg>';
        destRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(target.point).addTo(map);
      }
    };
    apply();
    window.addEventListener('dira:mapready', apply);
    return () => window.removeEventListener('dira:mapready', apply);
  }, [target, levelId]);

  // Route line, floor-change callouts and the walking figure on the floor being shown.
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource('route');
    for (const c of calloutsRef.current) c.remove();
    calloutsRef.current = [];
    if (walkerRef.current) walkerRef.current.remove();
    walkerRef.current = null;
    if (!src) return undefined;
    src.setData({
      type: 'FeatureCollection',
      features: (route?.legs || []).map((leg) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: leg.coordinates }, properties: { level: leg.levelId } })),
    });
    if (!route || mode !== 'nav') return undefined;

    route.legs.forEach((leg, i) => {
      if (leg.levelId !== levelId) return;
      const out = route.transitions[i];
      const back = route.transitions[i - 1];
      const addCallout = (lngLat, text, goTo, light) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `callout${light ? ' callout-light' : ''}`;
        el.textContent = text;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setLevelId(goTo);
        });
        calloutsRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat(lngLat).addTo(map));
      };
      if (out) {
        const to = imdf.levelById.get(out.toLevelId);
        const up = to.ordinal > imdf.levelById.get(out.fromLevelId).ordinal;
        addCallout(leg.coordinates[leg.coordinates.length - 1], `${up ? 'Up' : 'Down'} to ${to.short}`, out.toLevelId, false);
      }
      if (back) addCallout(leg.coordinates[0], `From ${imdf.levelById.get(back.fromLevelId).short}`, back.fromLevelId, true);
    });

    const legIndex = route.legs.findIndex((l) => l.levelId === levelId);
    if (legIndex < 0) return undefined;
    const coords = route.legs[legIndex].coordinates;
    map.fitBounds(bboxOf(coords), { padding: cardPadding(), maxZoom: 19.4, duration: 700 });
    const el = document.createElement('div');
    el.className = 'walker';
    el.innerHTML = iconSvg('walk', 18, 2.4);
    const marker = new maplibregl.Marker({ element: el }).setLngLat(coords[0]).addTo(map);
    walkerRef.current = marker;
    // Demo playback of this floor's part of the walk, looping.
    const duration = 9000;
    let start = performance.now();
    let raf = 0;
    const tick = (now) => {
      let t = (now - start) / duration;
      if (t > 1.2) {
        start = now;
        t = 0;
      }
      const f = Math.min(1, t);
      marker.setLngLat(pointAlong(coords, f));
      setProgress((legIndex + f) / route.legs.length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route, mode, levelId, imdf]);

  // ---------- Actions ----------
  function focusOn(poi) {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: poi.point, zoom: Math.max(map.getZoom(), 18.7), padding: cardPadding(), duration: 700 });
  }

  function select(id) {
    const poi = poiById.get(id);
    if (!poi) return;
    if (mode === 'route') {
      if (poi.kind === 'unnamed') return;
      setFromId(id);
      setFromText(poi.name);
      return;
    }
    if (mode === 'nav') return;
    setSelectedId(id);
    setMode('place');
    if (poi.levelId && poi.levelId !== levelId) setLevelId(poi.levelId);
    focusOn(poi);
  }

  function startRoute(destId) {
    setToId(destId);
    setFromId(null);
    setFromText('');
    setRoute(null);
    setMode('route');
  }

  function directions(f = fromPoi, t = toPoi, sf = stepFree) {
    if (!f || !t || !router) return;
    const r = router.route(f, t, { stepFree: sf });
    setRoute(r);
    setMode('nav');
    setGroup(null);
    setProgress(0);
    if (r) {
      setLevelId(r.legs[0].levelId);
      mapRef.current?.fitBounds(bboxOf(r.legs[0].coordinates.concat([f.point])), { padding: cardPadding(), duration: 900, maxZoom: 19.4 });
    }
  }

  function finish() {
    setRoute(null);
    setMode('home');
    setSelectedId(null);
    setFromId(null);
    setToId(null);
    setProgress(0);
  }

  function changeLevel(delta) {
    const i = imdf.levels.findIndex((l) => l.id === levelId);
    const next = imdf.levels[i + delta];
    if (next) setLevelId(next.id);
  }

  function resetView() {
    mapRef.current?.fitBounds(bboxOf(level.feature.geometry.coordinates[0]), { padding: cardPadding(), pitch: pitched ? 48 : 0, bearing: -14, duration: 800 });
  }

  function togglePitch() {
    const next = !pitched;
    setPitched(next);
    mapRef.current?.easeTo({ pitch: next ? 48 : 0, duration: 600 });
  }

  // ---------- Card contents ----------
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!imdf) return [];
    let list = imdf.pois.filter((p) => p.kind !== 'unnamed');
    if (group) list = list.filter((p) => p.group === group);
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || categoryText(p.category).toLowerCase().includes(q));
    if (!group && !q) return [];
    const ord = (p) => imdf.levelById.get(p.levelId)?.ordinal ?? 99;
    // This floor first, then the other floors from the bottom up, then by name.
    return [...list]
      .sort((a, b) => (b.levelId === levelId) - (a.levelId === levelId) || ord(a) - ord(b) || a.name.localeCompare(b.name, undefined, { numeric: true }))
      .slice(0, 80);
  }, [imdf, group, q, levelId]);

  let card = null;
  if (mode === 'home') {
    card = (
      <>
        <label className="search">
          <Icon name="search" size={20} strokeWidth={2.6} />
          <span className="sr-only">Search Sarit Centre</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shops, banks, washrooms" />
          {query && (
            <button type="button" className="icon-plain" onClick={() => setQuery('')} aria-label="Clear search">
              <Icon name="close" size={18} />
            </button>
          )}
        </label>
        <div className="shortcuts" role="group" aria-label="Browse by type">
          {SHORTCUTS.map((s) => (
            <button key={s.id} type="button" className="shortcut" aria-pressed={group === s.id} onClick={() => setGroup(group === s.id ? null : s.id)}>
              <span className="shortcut-icon">
                <Icon name={s.icon} size={22} />
              </span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        {results.length > 0 && (
          <ul className="results">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => select(p.id)}>
                  <PoiTile poi={p} />
                  <span className="text">
                    <strong>{p.name}</strong>
                    <span>
                      {categoryText(p.category)} · {levelName(p.levelId)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {(q || group) && results.length === 0 && <p className="empty">Nothing matches “{query}”.</p>}
      </>
    );
  } else if (mode === 'place' && selected) {
    card = (
      <PlaceCard
        poi={selected}
        levelName={levelName(selected.levelId)}
        onClose={() => (setMode('home'), setSelectedId(null))}
        onGo={() => startRoute(selected.id)}
      />
    );
  } else if (mode === 'route' && toPoi) {
    card = (
      <div className="route-setup">
        <header>
          <h2>Set a route</h2>
          <button type="button" className="icon-plain" onClick={() => (setMode(selectedId ? 'place' : 'home'), setToId(null))} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </header>
        <p className="hint">Search for the shop in front of you, or tap it on the map, as your starting point.</p>
        <div className="route-fields">
          <div className="rail" aria-hidden="true">
            <span className="dot" />
            <span className="bar" />
            <Icon name="pin" size={16} />
          </div>
          <div className="fields">
            <PlaceSearch
              pois={imdf.pois}
              levelName={levelName}
              value={fromText}
              exclude={toId}
              autoFocus={!isMobile()}
              placeholder="Starting point"
              onChange={(v) => (setFromText(v), setFromId(null))}
              onPick={(p) => (setFromId(p.id), setFromText(p.name))}
            />
            <div className="field field-static">
              <span>{toPoi.name}</span>
              <button type="button" className="icon-plain" onClick={() => (setMode('home'), setToId(null))} aria-label="Clear destination">
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="icon-plain swap"
            disabled={!fromPoi}
            onClick={() => {
              const f = fromId;
              setFromId(toId);
              setFromText(toPoi.name);
              setToId(f);
            }}
            aria-label="Swap start and destination"
          >
            <Icon name="swap" size={20} />
          </button>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={stepFree} onChange={(e) => setStepFree(e.target.checked)} />
          <span className="toggle-track" aria-hidden="true" />
          Step free (lifts only)
        </label>
        <button type="button" className="btn btn-primary btn-block" disabled={!fromPoi} onClick={() => directions()}>
          Get directions
        </button>
      </div>
    );
  } else if (mode === 'nav' && toPoi && fromPoi) {
    card = (
      <div className="nav">
        <header>
          <h2>{toPoi.name}</h2>
          <button type="button" className="btn btn-finish" onClick={finish}>
            Finish
          </button>
        </header>
        {route ? (
          <>
            <div className="nav-stats">
              <span className="big">{Math.max(1, Math.round(route.seconds / 60))} min</span>
              <span>{Math.round(route.metres / 5) * 5} m</span>
              <span className="arrive">
                <Icon name="clock" size={16} /> {clockIn(route.seconds)}
              </span>
            </div>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="empty">No route found{stepFree ? ' without stairs or escalators' : ''}.</p>
        )}
        <ol className="nav-steps">
          <li>
            <span className="label">From</span>
            <strong>
              {fromPoi.name}
              <small>{levelName(fromPoi.levelId)}</small>
            </strong>
            <button type="button" className="edit" onClick={() => setMode('route')}>
              Edit
            </button>
          </li>
          {(route?.legs || []).map((leg, i) => {
            const t = route.transitions[i];
            return (
              <li key={i} className={`follow${leg.levelId === levelId ? ' is-current' : ''}`}>
                <button type="button" className="step-btn" onClick={() => setLevelId(leg.levelId)}>
                  <span className="walk-icon">
                    <Icon name="walk" size={20} />
                  </span>
                  <strong>
                    Follow the line {t ? `to the ${RIDE[t.kind]}` : 'toward your destination'}
                    <small>{levelName(leg.levelId)}</small>
                  </strong>
                </button>
                {t && (
                  <button type="button" className="step-btn ride" onClick={() => setLevelId(t.toLevelId)}>
                    <span className="walk-icon ride-icon">
                      <Icon name={RIDE_ICON[t.kind]} size={20} />
                    </span>
                    <strong>
                      Take the {RIDE[t.kind]} {imdf.levelById.get(t.toLevelId).ordinal > imdf.levelById.get(t.fromLevelId).ordinal ? 'up' : 'down'} to the{' '}
                      {levelName(t.toLevelId)}
                      {t.levels > 1 && <small>{t.levels} floors</small>}
                    </strong>
                  </button>
                )}
              </li>
            );
          })}
          <li>
            <span className="label">To</span>
            <strong>
              {toPoi.name}
              <small>{levelName(toPoi.levelId)}</small>
            </strong>
            <button type="button" className="edit" onClick={() => setMode('home')}>
              Edit
            </button>
          </li>
        </ol>
        <label className="toggle toggle-nav">
          <input
            type="checkbox"
            checked={stepFree}
            onChange={(e) => {
              setStepFree(e.target.checked);
              directions(fromPoi, toPoi, e.target.checked);
            }}
          />
          <span className="toggle-track" aria-hidden="true" />
          Step free
        </label>
      </div>
    );
  }

  return (
    <div className="app">
      <div ref={mapEl} className="map" />
      {error && <div className="loading">Could not load the IMDF archive: {error}</div>}
      {!imdf && !error && <div className="loading">Loading Sarit Centre…</div>}

      {imdf && level && (
        <>
          <section className="card" aria-live="polite">
            {card}
          </section>

          {level.approximate && (
            <div className="approx" role="note">
              <Icon name="info" size={16} /> {level.name}: position on the map is approximate
            </div>
          )}

          <div className="top-right">
            <a className="btn btn-dark" href={DIRA_APP}>
              <Icon name="arrowLeft" size={18} strokeWidth={2.6} /> Back to Dira
            </a>
            <button type="button" className="ctrl" onClick={() => setInfoOpen(true)} aria-label="About this map">
              <Icon name="info" size={20} />
            </button>
          </div>

          <div className="controls">
            <div className="floors">
              <button type="button" className="ctrl" onClick={() => changeLevel(1)} disabled={level.id === imdf.levels.at(-1).id} aria-label="Floor up">
                <Icon name="chevronUp" size={18} />
              </button>
              <button type="button" className="floor-name" onClick={() => setFloorsOpen((o) => !o)} aria-expanded={floorsOpen} aria-label={`${level.name}. Choose a floor`}>
                {level.short}
              </button>
              <button type="button" className="ctrl" onClick={() => changeLevel(-1)} disabled={level.id === imdf.levels[0].id} aria-label="Floor down">
                <Icon name="chevronDown" size={18} />
              </button>
              {floorsOpen && (
                <ul className="floor-list">
                  {[...imdf.levels].reverse().map((l) => {
                    const onRoute = route?.legs.some((leg) => leg.levelId === l.id);
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          aria-current={l.id === levelId}
                          onClick={() => {
                            setLevelId(l.id);
                            setFloorsOpen(false);
                          }}
                        >
                          <span className="short">{l.short}</span>
                          {l.name}
                          {onRoute && <span className="on-route">Route</span>}
                          {l.approximate && <span className="approx-tag">Approx.</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button type="button" className="ctrl" onClick={togglePitch} aria-label={pitched ? 'Switch to 2D' : 'Switch to 3D'}>
              <span className="ctrl-text">{pitched ? '2D' : '3D'}</span>
            </button>
            <button type="button" className="ctrl" onClick={resetView} aria-label="Show the whole floor">
              <Icon name="target" size={20} />
            </button>
            <button type="button" className="ctrl" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">
              <Icon name="plus" size={20} />
            </button>
            <button type="button" className="ctrl" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">
              <Icon name="minus" size={20} />
            </button>
          </div>

          <div className="brand-foot">
            <svg viewBox="56 4 72 88" width="14" height="17" aria-hidden="true">
              <path d="M92 10c-17 0-30 13-30 30 0 22 30 46 30 46s30-24 30-46c0-17-13-30-30-30z M81 40a11 11 0 1 0 22 0a11 11 0 1 0 -22 0z" fill="#C8553D" fillRule="evenodd" />
            </svg>
            Dira · IMDF {imdf.manifest.version} · {level.name}
          </div>

          {infoOpen && (
            <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setInfoOpen(false)}>
              <div className="modal" role="dialog" aria-label="About this map">
                <header>
                  <h2>About this map</h2>
                  <button type="button" className="icon-plain" onClick={() => setInfoOpen(false)} aria-label="Close">
                    <Icon name="close" size={20} />
                  </button>
                </header>
                {imdf.venueContent?.photo && (
                  <figure className="place-photo">
                    <img src={imdf.venueContent.photo.src} alt={imdf.venueContent.photo.caption} />
                    <figcaption>
                      Photo: <a href={imdf.venueContent.photo.source}>{imdf.venueContent.photo.credit}</a>
                    </figcaption>
                  </figure>
                )}
                <p>
                  {label(imdf.venue.properties.name)}, all {imdf.counts.levels} levels, drawn entirely from an IMDF {imdf.manifest.version} archive (Indoor Mapping Data
                  Format, the OGC community standard used by Apple Maps).
                </p>
                <dl className="facts">
                  <div>
                    <dt>Floors</dt>
                    <dd>{imdf.counts.levels}</dd>
                  </div>
                  <div>
                    <dt>Places</dt>
                    <dd>{imdf.counts.occupants}</dd>
                  </div>
                  <div>
                    <dt>Amenities</dt>
                    <dd>{imdf.counts.amenities}</dd>
                  </div>
                  <div>
                    <dt>To name</dt>
                    <dd>{imdf.counts.unnamed}</dd>
                  </div>
                </dl>
                <p className="small">
                  Shapes were traced automatically from the Sarit Centre floor plan PDFs and the floors lined up using their lift shafts. Positions are approximate until
                  checked on site, the office tower floors (3 to 6) most of all. Opening hours on the cards are estimates. Units marked “?” have no readable name yet.
                </p>
                <a className="btn btn-primary" href="./imdf/sarit-imdf.zip" download>
                  <Icon name="download" size={18} /> Download IMDF archive
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
