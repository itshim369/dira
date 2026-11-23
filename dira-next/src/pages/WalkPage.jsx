import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Icon, StepTile } from '../components/Icons.jsx';
import { networkOf, usePlans, useVenueData } from '../data.js';
import { buildTrack, passingShops, stretchOf, turnFeatures } from '../guide.js';
import { placeName } from '../places.js';
import { href, navigate } from '../lib.js';
import { useT } from '../prefs.js';
import NotFound from './NotFound.jsx';
import { STEP_KIND, useRouteState } from './MapPage.jsx';

// three.js only loads on this page.
const WalkView3D = lazy(() => import('../components/WalkView3D.jsx'));

const RIDE_MS = 2600;
const RIDE_NAME = { elevator: 'Lift', escalator: 'Escalator', stairs: 'Stairs' };

/** The route walked in first person, one step per Next. */
export default function WalkPage({ venue, params }) {
  const t = useT();
  const { data, error } = useVenueData(venue);
  const { imdf, fromPoi, toPoi, route, steps } = useRouteState(venue, params, data);
  const plans = usePlans(venue);
  const [step, setStep] = useState(0);
  const [ride, setRide] = useState(null); // the floor change being ridden: { kind, floors: [short], up }
  const track = useMemo(() => (route && steps.length ? buildTrack(route, steps) : null), [route, steps]);
  const passing = useMemo(() => {
    if (!track) return [];
    const stretch = stretchOf(track, steps, step === 0 ? 1 : step);
    return stretch ? passingShops(track, imdf, stretch.leg, stretch.s0, stretch.s1).filter((p) => p.poi.id !== fromPoi?.id) : [];
  }, [track, steps, step, imdf, fromPoi]);
  const arrows = useMemo(() => (track ? turnFeatures(track, steps, networkOf(data), step) : null), [track, steps, data, step]);

  useEffect(() => {
    if (!ride) return undefined;
    const id = setTimeout(() => setRide(null), RIDE_MS);
    return () => clearTimeout(id);
  }, [ride]);

  if (!venue || venue.status !== 'live') return <NotFound />;
  if (error) return <NotFound message={t('The map could not load: {error}', { error })} />;
  const mapHref = href(`/venue/${venue.id}`, { from: fromPoi?.id, to: toPoi?.id, mode: params.mode });
  if (imdf && !route) return <NotFound message={t('Pick your start and destination')} />;

  const current = steps[step];
  const next = () => {
    // Leaving a lift or escalator step: ride it to the next floor first.
    if (current?.toLevelId) {
      const a = imdf.levelById.get(current.levelId).ordinal;
      const b = imdf.levelById.get(current.toLevelId).ordinal;
      const floors = [...imdf.levels].filter((l) => l.ordinal >= Math.min(a, b) && l.ordinal <= Math.max(a, b)).sort((x, y) => (b > a ? x.ordinal - y.ordinal : y.ordinal - x.ordinal)).map((l) => l.short);
      setRide({ kind: current.kind, floors, up: b > a });
    }
    setStep(step + 1);
  };
  const finish = () => navigate(`/venue/${venue.id}`, {}, { replace: true });
  const sides = { left: passing.filter((p) => p.side === 'left'), right: passing.filter((p) => p.side === 'right') };

  return (
    <div className="walk-page">
      {track && plans ? (
        <Suspense fallback={<div className="blueprint-loading">{t('Building the walk…')}</div>}>
          <WalkView3D
            imdf={imdf}
            plans={plans}
            planBase={`${venue.base}plans/`}
            track={track}
            steps={steps}
            step={step}
            passing={passing}
            arrows={arrows}
            destPoint={toPoi?.point}
            destLevelId={toPoi?.levelId}
          />
        </Suspense>
      ) : (
        <div className="blueprint-loading">{t('Loading the map…')}</div>
      )}

      <header className="walk-top">
        <a className="icon-btn" href={mapHref} aria-label={t('Back to the map')}>
          <Icon name="arrowLeft" strokeWidth={2.75} />
        </a>
        <div className="walk-title">
          <span>{t('Walk view')}</span>
          <strong>
            {fromPoi && placeName(fromPoi)} → {toPoi && placeName(toPoi)}
          </strong>
        </div>
      </header>
      <p className="walk-look">{t('Drag to look around')}</p>

      {ride && (
        <div className={`ride-overlay is-${ride.kind}`} aria-live="polite">
          {ride.kind === 'elevator' && (
            <>
              <span className="ride-door is-left" />
              <span className="ride-door is-right" />
            </>
          )}
          <div className="ride-panel">
            <span className="ride-kind">
              {ride.up ? '▲' : '▼'} {t(RIDE_NAME[ride.kind])}
            </span>
            <div className="ride-floors">
              {ride.floors.map((f, i) => (
                <span key={f} style={{ animationDelay: `${0.5 + (i * 1.4) / Math.max(1, ride.floors.length - 1)}s` }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {current && (
        <section className="walk-card" aria-live="polite">
          <div className="guide-progress" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} />
            ))}
          </div>
          <div className="guide-step">
            <StepTile kind={STEP_KIND[current.kind] || current.kind} emphasis />
            <div>
              <span className="guide-count">{t('Step {n} of {total}', { n: step + 1, total: steps.length })}</span>
              <strong>{current.title}</strong>
              <span>{current.detail}</span>
            </div>
          </div>
          {passing.length > 0 && (
            <div className="pass-rail" aria-label={t('Stores you pass')}>
              {['left', 'right'].map((side) => (
                <div key={side} className={`pass-side is-${side}`}>
                  <span className="pass-head">{side === 'left' ? t('On your left') : t('On your right')}</span>
                  <div className="pass-list">
                    {sides[side].length ? sides[side].map(({ poi }) => <span key={poi.id}>{placeName(poi)}</span>) : <span className="pass-none">—</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="walk-controls">
            <button className="icon-btn" type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || !!ride} aria-label={t('Back')}>
              <Icon name="arrowLeft" strokeWidth={2.6} />
            </button>
            {step < steps.length - 1 ? (
              <button className="btn btn-primary walk-next" type="button" onClick={next} disabled={!!ride}>
                {current.toLevelId ? t('Ride') : t('Next')} <Icon name="arrowRight" />
              </button>
            ) : (
              <button className="btn btn-primary walk-next" type="button" onClick={finish}>
                {t('Done')} <Icon name="check" />
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
