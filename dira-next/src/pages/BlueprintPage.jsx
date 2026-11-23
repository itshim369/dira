import { lazy, Suspense, useEffect, useState } from 'react';
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
  const [focusId, setFocusId] = useState(null);
  const [gap, setGap] = useState(16);
  const [show, setShow] = useState({ plan: true, walls: true, paths: true, links: true, route: true });
  const [picker, setPicker] = useState(null);
  const [panel, setPanel] = useState(() => window.innerWidth > 600);

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

  if (!venue || venue.status !== 'live') return <NotFound />;
  if (error) return <NotFound message={t('The map could not load: {error}', { error })} />;

  const update = (changes) => navigate(`/venue/${venue.id}/blueprint`, { from: fromPoi?.id, to: toPoi?.id, mode: mode === 'fastest' ? undefined : mode, ...changes }, { replace: true });
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

      <nav className="blueprint-floors" aria-label={t('Floors')}>
        <button type="button" aria-pressed={!focusId} onClick={() => setFocusId(null)}>
          {t('All')}
        </button>
        {levels.map((l) => (
          <button key={l.id} type="button" aria-pressed={focusId === l.id} onClick={() => setFocusId(focusId === l.id ? null : l.id)} title={t(l.name)}>
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
