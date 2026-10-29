import { useCallback, useEffect, useMemo, useState } from 'react';
import IndoorMap from '../components/IndoorMap.jsx';
import FloorPicker from '../components/FloorPicker.jsx';
import PlacePicker from '../components/PlacePicker.jsx';
import PlaceSheet from '../components/PlaceSheet.jsx';
import { Icon, StepTile } from '../components/Icons.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { findPoi, useVenueData } from '../data.js';
import { buildSteps } from '../directions.js';
import { SHORTCUTS, placeName } from '../places.js';
import { formatMinutes, href, navigate, roundMetres } from '../lib.js';
import NotFound from './NotFound.jsx';
import PrefsControls from '../components/PrefsControls.jsx';
import { tr, useT, usePrefs } from '../prefs.js';

export const MODES = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'escalator', label: 'Escalator', icon: 'escalator' },
  { id: 'lift', label: 'Lift', icon: 'lift' },
  { id: 'stairs', label: 'Stairs', icon: 'stairs' },
];
export const STEP_KIND = { elevator: 'lift' };

/** Route state shared by the map and steps pages: everything lives in the URL. */
export function useRouteState(venue, params, data) {
  const imdf = data?.imdf;
  // Start and destination only come from the URL, so the map opens blank until the
  // visitor picks both (or opens a shared route link).
  const fromPoi = imdf ? findPoi(imdf, params.from) : null;
  const toPoi = imdf ? findPoi(imdf, params.to) : null;
  const mode = MODES.some((m) => m.id === params.mode) ? params.mode : 'fastest';
  const route = useMemo(() => {
    if (!data || !fromPoi || !toPoi || fromPoi.id === toPoi.id) return null;
    return data.router.route(fromPoi, toPoi, { mode });
  }, [data, fromPoi, toPoi, mode]);
  const { lang } = usePrefs();
  const steps = useMemo(() => (route ? buildSteps(imdf, route, fromPoi, toPoi) : []), [imdf, route, fromPoi, toPoi, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return { imdf, fromPoi, toPoi, mode, route, steps };
}

export function floorChanges(route) {
  return route ? route.transitions.reduce((s, t) => s + t.levels, 0) : 0;
}

export const floorChangeText = (n) => (n === 0 ? tr('same floor') : n === 1 ? tr('1 floor change') : tr('{n} floor changes', { n }));

export default function MapPage({ venue, params }) {
  const t = useT();
  const { data, error } = useVenueData(venue);
  const { imdf, fromPoi, toPoi, mode, route, steps } = useRouteState(venue, params, data);
  const [picker, setPicker] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [offline, setOffline] = useState(false);
  const [shared, setShared] = useState(false);
  // The guided walk: which written step the walking figure is on (null = not walking).
  const [guide, setGuide] = useState(null);
  useEffect(() => setGuide(null), [route]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(() => setOffline(true)).catch(() => {});
  }, []);

  const update = useCallback(
    (changes) => {
      const next = { from: fromPoi?.id, to: toPoi?.id, mode, floor: params.floor, ...changes };
      if (('from' in changes || 'to' in changes || 'mode' in changes) && !('floor' in changes)) delete next.floor;
      if (next.mode === 'fastest') delete next.mode;
      delete next.focus;
      if ('focus' in changes) next.focus = changes.focus;
      navigate(`/venue/${venue.id}`, next, { replace: true });
    },
    [venue, fromPoi, toPoi, mode, params.floor],
  );

  if (!venue || venue.status !== 'live') return <NotFound />;
  if (error) return <NotFound message={t('The map could not load: {error}', { error })} />;
  if (!imdf) {
    return (
      <div className="page map-screen">
        <p className="loading-line">{t('Loading {name}…', { name: venue.name })}</p>
      </div>
    );
  }

  // Venues with a building view open on it; picking a floor (or a route) goes inside.
  const buildingView = venue.building3d && (params.view === 'building' || (!params.floor && !params.from && !params.to && params.view !== 'floor')) ? (params.angle === 'side' ? 'side' : 'aerial') : null;
  const groundId = (imdf.levels.find((l) => l.ordinal === 0) || imdf.levels[0]).id;
  const guideStep = guide != null && route ? steps[guide] : null;
  const levelId = guideStep?.levelId || (params.floor && imdf.levelById.has(params.floor) && params.floor) || route?.legs[0].levelId || fromPoi?.levelId || (buildingView ? groundId : imdf.levels[0].id);
  const startWalk = () => {
    setSelectedId(null);
    setGuide(0);
  };
  const showBuilding = (angle = params.angle) =>
    navigate(`/venue/${venue.id}`, { from: fromPoi?.id, to: toPoi?.id, mode: mode === 'fastest' ? undefined : mode, floor: params.floor, view: 'building', angle: angle === 'side' ? 'side' : undefined }, { replace: true });
  const level = imdf.levelById.get(levelId);
  const selected = selectedId ? imdf.pois.find((p) => p.id === selectedId) : null;
  const focus = params.focus ? params.focus.split(',').map(Number) : null;
  const changes = floorChanges(route);
  const nextStep = steps[1];
  const group = params.group || null;

  function pickNearest(category) {
    if (!fromPoi) return;
    const P = (p) => [p[0] * 111000, p[1] * 111000];
    const ord = (p) => imdf.levelById.get(p.levelId)?.ordinal ?? 0;
    const here = P(fromPoi.point);
    const candidates = imdf.pois
      .filter((p) => p.category === category && p.id !== fromPoi.id && p.levelId)
      .map((p) => {
        const q = P(p.point);
        return { p, guess: Math.hypot(q[0] - here[0], q[1] - here[1]) + Math.abs(ord(p) - ord(fromPoi)) * 45 };
      })
      .sort((a, b) => a.guess - b.guess)
      .slice(0, 5);
    let best = null;
    for (const { p } of candidates) {
      const r = data.router.route(fromPoi, p, { mode });
      if (r && (!best || r.seconds < best.seconds)) best = { p, seconds: r.seconds };
    }
    setPicker(null);
    if (best) update({ to: best.p.id });
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: t('Route to {name}', { name: placeName(toPoi) }), url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      }
    } catch {
      /* share cancelled */
    }
  }

  const stepsHref = href(`/venue/${venue.id}/steps`, { from: fromPoi?.id, to: toPoi?.id, mode: mode === 'fastest' ? undefined : mode });
  // Picking from a place card: with only one end of the route chosen, stay on the floor being
  // viewed; once both ends are set, open on the start's floor so the journey begins where you are.
  const withFloor = (changes) => {
    const from = 'from' in changes ? changes.from : fromPoi?.id;
    const to = 'to' in changes ? changes.to : toPoi?.id;
    return from && to ? changes : { ...changes, floor: levelId };
  };
  // The map waits for a route, except at venues with a 3D building view (Nisake), whose map always shows.
  const showMap = !!route || !!venue.building3d;
  const floorPicker = <FloorPicker imdf={imdf} value={levelId} overview={!!buildingView} onChange={(f) => update({ floor: f })} route={route} from={fromPoi} to={toPoi} />;

  return (
    <div className={`map-screen page${guideStep ? ' is-guiding' : ''}`}>
      <header className="map-header">
        <a className="icon-btn plain" href={href('/venues')} aria-label={t('Back to venues')}>
          <Icon name="arrowLeft" strokeWidth={2.75} />
        </a>
        <div className="title">
          <LogoMark className="mark" />
          <div style={{ minWidth: 0 }}>
            <h1>{venue.name}</h1>
            <p className="status">
              {t('{n} floors', { n: imdf.levels.length })}
              <span className="status-extra"> · {offline ? t('offline map saved') : t('map ready on this device')}</span>
            </p>
          </div>
        </div>
        <div className="map-header-end">
          <PrefsControls compact />
          <button className="icon-btn plain search-btn" type="button" onClick={() => setPicker({ role: 'to' })} aria-label={t('Search places')}>
            <Icon name="search" strokeWidth={2.75} />
          </button>
        </div>
      </header>

      <div className={`map-layout${showMap ? '' : ' no-map'}`}>
        <aside className="map-panel">
          <div className="card route-card">
            <div className="route-rail" aria-hidden="true">
              <span className="dot" />
              <span className="bar" />
              <Icon name="pin" />
            </div>
            <div className="route-fields">
              <button type="button" className="route-field" onClick={() => setPicker({ role: 'from' })}>
                <span className="eyebrow">{t('You are at')}</span>
                <strong className={fromPoi ? '' : 'placeholder'}>{fromPoi ? placeName(fromPoi) : t('Choose where you are')}</strong>
              </button>
              <button type="button" className="route-field" onClick={() => setPicker({ role: 'to' })}>
                <span className="eyebrow">{t('Going to')}</span>
                <strong className={toPoi ? '' : 'placeholder'}>{toPoi ? placeName(toPoi) : t('Choose a destination')}</strong>
              </button>
            </div>
            <button className="icon-btn swap" type="button" onClick={() => update({ from: toPoi?.id, to: fromPoi?.id })} aria-label={t('Swap start and destination')}>
              <Icon name="swap" />
            </button>
          </div>

          {!route && (
          <div className="shortcut-row" role="group" aria-label={t('Find nearby')}>
            {SHORTCUTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="shortcut-chip"
                aria-pressed={group === s.id}
                onClick={() => {
                  navigate(`/venue/${venue.id}`, { ...params, group: group === s.id ? undefined : s.id }, { replace: true });
                  if (group !== s.id) setPicker({ role: 'to', filter: s.id });
                }}
              >
                <Icon name={s.icon} />
                {t(s.label)}
              </button>
            ))}
          </div>
          )}

          {showMap && <div className="desktop-only">{floorPicker}</div>}

          <div className="mode-row" role="group" aria-label={t('How to change floors')}>
            {MODES.map((m) => (
              <button key={m.id} type="button" className="chip chip-terracotta" aria-pressed={mode === m.id} onClick={() => update({ mode: m.id })}>
                {t(m.label)}
              </button>
            ))}
          </div>

          {route ? (
            <section className="card summary" aria-live="polite">
              <div className="summary-top">
                <span className="summary-time">{formatMinutes(route.seconds)}</span>
                <span className="summary-meta">
                  {roundMetres(route.metres)} m · {floorChangeText(changes)}
                </span>
              </div>
              {route.legs.length > 1 && (
                <div className="floor-path" aria-label={t('Floors on this route')}>
                  {route.legs.map((leg, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      {i > 0 && <Icon name="arrowRight" />}
                      <button
                        type="button"
                        className={`tag ${leg.levelId === levelId ? 'tag-terracotta' : 'tag-sand'}`}
                        style={{ border: 0, minHeight: 32, cursor: 'pointer' }}
                        onClick={() => update({ floor: leg.levelId })}
                      >
                        {t(imdf.levelById.get(leg.levelId).name)}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {nextStep && (
                <div className="next-step">
                  <StepTile kind={STEP_KIND[nextStep.kind] || nextStep.kind} emphasis />
                  <div>
                    <strong>{nextStep.title}</strong>
                    <span>{nextStep.detail}</span>
                  </div>
                </div>
              )}
              <button className="btn btn-primary btn-lg btn-block start-walk" type="button" onClick={startWalk}>
                <Icon name="walk" /> {t('Start walking')}
              </button>
              <div className="summary-actions">
                <a className="btn btn-dark btn-lg" href={stepsHref}>
                  {t('All steps')} <Icon name="arrowRight" />
                </a>
                <button className="btn btn-outline btn-lg" type="button" onClick={share}>
                  <Icon name={shared ? 'check' : 'share'} /> {shared ? t('Link copied') : t('Share')}
                </button>
              </div>
            </section>
          ) : (
            <section className="card notice" aria-live="polite">
              {!fromPoi || !toPoi ? (
                <>
                  <h3>{t('Pick your start and destination')}</h3>
                  <p>
                    {showMap
                      ? t('Tap a shop on the map, or use the fields above. Choose the shop or sign in front of you as your start.')
                      : t('Choose the shop or sign in front of you as your start, then where you want to go. The map opens with your route.')}
                  </p>
                </>
              ) : fromPoi.id === toPoi.id ? (
                <>
                  <h3>{t('You are already there')}</h3>
                  <p>{t('Your start and destination are the same place.')}</p>
                  <button className="btn btn-primary" type="button" onClick={() => setPicker({ role: 'to' })}>
                    {t('Choose a destination')}
                  </button>
                </>
              ) : (
                <>
                  <h3>{mode === 'lift' ? t('No step-free route') : t('No route found')}</h3>
                  <p>{mode === 'lift' ? t('There is no lift between these floors on the map.') : t('These two places are not connected on the map yet.')}</p>
                  <button className="btn btn-primary" type="button" onClick={() => update({ mode: 'fastest' })}>
                    {t('Show fastest route')}
                  </button>
                </>
              )}
            </section>
          )}
        </aside>

        {showMap && (
        <IndoorMap
          imdf={imdf}
          levelId={levelId}
          route={route}
          startId={fromPoi?.id}
          destId={toPoi?.id}
          selectedId={selectedId}
          group={group}
          focus={focus}
          fitKey={`${fromPoi?.id}>${toPoi?.id}:${mode}`}
          steps={steps}
          guideStep={guideStep ? guide : null}
          buildingEnabled={!!venue.building3d}
          buildingView={buildingView}
          onBuilding={showBuilding}
          onPickFloor={(f) => update({ floor: f })}
          onSelect={(p) => {
            setSelectedId(p.id);
            if (p.levelId !== levelId) update({ floor: p.levelId });
          }}
          onLevel={(f) => update({ floor: f })}
        >
          <div className="map-overlay-tl mobile-only">{floorPicker}</div>
          {guideStep && (
            <div className="guide-bar" role="region" aria-label={t('Walking directions')} aria-live="polite">
              <div className="guide-step">
                <StepTile kind={STEP_KIND[guideStep.kind] || guideStep.kind} emphasis />
                <div>
                  <span className="guide-count">{t('Step {n} of {total}', { n: guide + 1, total: steps.length })}</span>
                  <strong>{guideStep.title}</strong>
                  <span>{guideStep.detail}</span>
                </div>
              </div>
              <div className="guide-controls">
                <button className="icon-btn" type="button" onClick={() => setGuide(Math.max(0, guide - 1))} disabled={guide === 0} aria-label={t('Back')}>
                  <Icon name="arrowLeft" strokeWidth={2.6} />
                </button>
                {guide < steps.length - 1 ? (
                  <button className="btn btn-primary guide-next" type="button" onClick={() => setGuide(guide + 1)}>
                    {t('Next')} <Icon name="arrowRight" />
                  </button>
                ) : (
                  <button className="btn btn-primary guide-next" type="button" onClick={() => setGuide(null)}>
                    {t('Done')} <Icon name="check" />
                  </button>
                )}
                <button className="icon-btn" type="button" onClick={() => setGuide(null)} aria-label={t('Exit the walk')}>
                  <Icon name="close" strokeWidth={2.6} />
                </button>
              </div>
            </div>
          )}
          {buildingView && (
            <div className="building-bar" role="group" aria-label={t('Building view')}>
              <div className="building-bar-text">
                <strong>{t('Whole building')}</strong>
                <span>{t('Tap a floor to go in')}</span>
              </div>
              <div className="segmented">
                {[
                  ['aerial', 'Rooftop'],
                  ['side', 'Side'],
                ].map(([id, text]) => (
                  <button key={id} type="button" aria-pressed={buildingView === id} onClick={() => showBuilding(id)}>
                    {t(text)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {level.approximate && (
            <div className="approx-note" role="note">
              <Icon name="info" /> {t('{floor}: position approximate', { floor: t(level.name) })}
            </div>
          )}
          {selected && selected.levelId === levelId && (
            <PlaceSheet
              venueId={venue.id}
              poi={selected}
              levelName={t(imdf.levelById.get(selected.levelId).name)}
              onClose={() => setSelectedId(null)}
              onStart={() => {
                setSelectedId(null);
                const changes = selected.id === toPoi?.id ? { from: selected.id, to: fromPoi?.id } : { from: selected.id };
                update(withFloor(changes));
              }}
              onGo={() => {
                setSelectedId(null);
                const changes = selected.id === fromPoi?.id ? { to: selected.id, from: toPoi?.id } : { to: selected.id };
                update(withFloor(changes));
              }}
            />
          )}
        </IndoorMap>
        )}
      </div>

      {picker && (
        <PlacePicker
          imdf={imdf}
          role={picker.role}
          initialFilter={picker.filter || 'all'}
          currentLevelId={levelId}
          onClose={() => setPicker(null)}
          onNearest={fromPoi ? pickNearest : undefined}
          onPick={(p) => {
            setPicker(null);
            if (picker.role === 'from') update(p.id === toPoi?.id ? { from: p.id, to: fromPoi?.id } : { from: p.id });
            else update(p.id === fromPoi?.id ? { to: p.id, from: toPoi?.id } : { to: p.id });
          }}
        />
      )}
    </div>
  );
}
