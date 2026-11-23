import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import PlacePicker from '../components/PlacePicker.jsx';
import { Icon } from '../components/Icons.jsx';
import { useVenueData } from '../data.js';
import { placeName } from '../places.js';
import { formatMinutes, href, navigate } from '../lib.js';
import { useT } from '../prefs.js';
import NotFound from './NotFound.jsx';
import VenueNav from '../components/VenueNav.jsx';
import { useRouteState } from './MapPage.jsx';

// three.js only loads on this page.
const Blueprint3D = lazy(() => import('../components/Blueprint3D.jsx'));

const TOGGLES = [
  ['plan', 'Floor plan'],
  ['walls', 'Walls'],
  ['paths', 'Walkways'],
  ['links', 'Lifts and stairs'],
  ['route', 'Route'],
];

export default function BlueprintPage({ venue, params }) {
  const t = useT();
  const { data, error } = useVenueData(venue);
  const { imdf, fromPoi, toPoi, mode, route } = useRouteState(venue, params, data);
  const [plans, setPlans] = useState(null);
  // Tall phone screens have room to spread the floors further apart.
  const [gap, setGap] = useState(() => (window.innerHeight > window.innerWidth * 1.3 ? 24 : 16));
  const [show, setShow] = useState({ plan: true, walls: true, paths: true, links: true, route: true });
  const [picker, setPicker] = useState(null);
  const [panel, setPanel] = useState(() => window.innerWidth > 600);
  const pushed = useRef(false);

  useEffect(() => {
    if (!venue) return undefined;
    let alive = true;
    fetch(`${venue.base}plans/plans.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((p) => alive && setPlans(p));
    return () => {
      alive = false;
    };
  }, [venue]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && params.floor) navigate(`/venue/${venue.id}/blueprint`, { ...params, floor: undefined }, { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [venue, params]);

  if (!venue || venue.status !== 'live') return <NotFound />;
  if (error) return <NotFound message={t('The map could not load: {error}', { error })} />;

  // The chosen floor lives in the address, so the phone's Back button returns to the whole building.
  const focusId = imdf && params.floor && imdf.levelById.has(params.floor) ? params.floor : null;
  const setFocusId = (id) => {
    const push = !!id && !focusId;
    pushed.current = push;
    navigate(`/venue/${venue.id}/blueprint`, { from: fromPoi?.id, to: toPoi?.id, mode: mode === 'fastest' ? undefined : mode, floor: id || undefined }, { replace: !push });
  };
  // Back to the whole building: undo our own step in the history when we made one.
  const allFloors = () => {
    if (focusId && pushed.current) {
      pushed.current = false;
      window.history.back();
    } else setFocusId(null);
  };
  const focusLevel = focusId ? imdf.levelById.get(focusId) : null;
  const update = (changes) => navigate(`/venue/${venue.id}/blueprint`, { from: fromPoi?.id, to: toPoi?.id, mode: mode === 'fastest' ? undefined : mode, floor: focusId || undefined, ...changes }, { replace: true });
  const levels = imdf ? [...imdf.levels].sort((a, b) => b.ordinal - a.ordinal) : [];
  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="blueprint-page">
      <header className="blueprint-top">
        <a className="icon-btn" href={href(`/venue/${venue.id}`, { from: fromPoi?.id, to: toPoi?.id })} aria-label={t('Back to the map')}>
          <Icon name="arrowLeft" strokeWidth={2.75} />
        </a>
        <div className="blueprint-title">
          <h1>{t('Blueprint')}</h1>
          <p>
            {venue.name} · {t('{n} floors', { n: imdf?.levels.length ?? '…' })}
          </p>
        </div>
        <button className="icon-btn" type="button" onClick={() => setPanel(!panel)} aria-expanded={panel} aria-label={t('Layers')}>
          <Icon name="layers" />
        </button>
      </header>
      <div className="venue-nav-float">
        <VenueNav venue={venue} current="blueprint" from={fromPoi?.id} to={toPoi?.id} mode={mode} />
      </div>

      {imdf && plans ? (
        <Suspense fallback={<div className="blueprint-loading">{t('Building the blueprint…')}</div>}>
          <Blueprint3D imdf={imdf} router={data.router} plans={plans} planBase={`${venue.base}plans/`} focusId={focusId} gap={gap} show={show} route={route} />
        </Suspense>
      ) : (
        <div className="blueprint-loading">{t('Loading the map…')}</div>
      )}

      {focusLevel && (
        <div className="blueprint-focus" role="status">
          <button className="blueprint-back" type="button" onClick={allFloors}>
            <Icon name="arrowLeft" strokeWidth={2.6} /> {t('All floors')}
          </button>
          <span>
            <b>{focusLevel.short}</b> {t(focusLevel.name)}
          </span>
        </div>
      )}

      <nav className="blueprint-floors" aria-label={t('Floors')}>
        <button type="button" aria-pressed={!focusId} onClick={allFloors}>
          {t('All')}
        </button>
        {levels.map((l) => (
          <button key={l.id} type="button" aria-pressed={focusId === l.id} onClick={() => (focusId === l.id ? allFloors() : setFocusId(l.id))} title={t(l.name)}>
            {l.short}
          </button>
        ))}
      </nav>

      {panel && (
        <aside className="blueprint-panel">
          <div className="blueprint-route">
            <button type="button" onClick={() => setPicker('from')}>
              <span className="dot" aria-hidden="true" />
              <span>{fromPoi ? placeName(fromPoi) : t('From…')}</span>
            </button>
            <button type="button" onClick={() => setPicker('to')}>
              <span className="dot is-to" aria-hidden="true" />
              <span>{toPoi ? placeName(toPoi) : t('To…')}</span>
            </button>
            {route && (
              <p>
                {formatMinutes(route.seconds)} · {Math.round(route.metres)} m
              </p>
            )}
          </div>
          <div className="blueprint-toggles" role="group" aria-label={t('Layers')}>
            {TOGGLES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={show[k]} onClick={() => toggle(k)} disabled={k === 'route' && !route}>
                <span className={`swatch swatch-${k}`} aria-hidden="true" />
                {t(label)}
              </button>
            ))}
          </div>
          <label className="blueprint-gap">
            <span>{t('Spread the floors')}</span>
            <input type="range" min="4" max="40" step="1" value={gap} onChange={(e) => setGap(Number(e.target.value))} />
          </label>
          <p className="blueprint-hint">{t('Drag to turn · pinch or scroll to zoom · two fingers to move')}</p>
        </aside>
      )}

      {picker && imdf && (
        <PlacePicker
          imdf={imdf}
          role={picker}
          initialFilter="all"
          currentLevelId={focusId || imdf.levels[0].id}
          onClose={() => setPicker(null)}
          onPick={(p) => {
            setPicker(null);
            update(picker === 'from' ? { from: p.id } : { to: p.id });
          }}
        />
      )}
    </div>
  );
}
