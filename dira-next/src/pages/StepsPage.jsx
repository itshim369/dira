import FloorPicker from '../components/FloorPicker.jsx';
import { Icon, StepTile } from '../components/Icons.jsx';
import { useVenueData } from '../data.js';
import { formatMinutes, href, roundMetres } from '../lib.js';
import { floorChanges, floorChangeText, STEP_KIND, useRouteState } from './MapPage.jsx';
import NotFound from './NotFound.jsx';
import { useT } from '../prefs.js';
import { placeName } from '../places.js';

export default function StepsPage({ venue, params }) {
  const t = useT();
  const { data, error } = useVenueData(venue);
  const { imdf, fromPoi, toPoi, mode, route, steps } = useRouteState(venue, params, data);
  if (!venue || venue.status !== 'live') return <NotFound />;
  if (error) return <NotFound message={t('The map could not load: {error}', { error })} />;
  if (!imdf) return <p className="page loading-line">{t('Loading…')}</p>;

  const base = { from: fromPoi?.id, to: toPoi?.id, mode: mode === 'fastest' ? undefined : mode };
  const mapHref = (extra = {}) => href(`/venue/${venue.id}`, { ...base, ...extra });
  const levelOf = (id) => imdf.levelById.get(id);

  if (!route) {
    return (
      <div className="page">
        <header className="steps-head">
          <a className="icon-btn plain" href={mapHref()} aria-label={t('Back to map')}>
            <Icon name="arrowLeft" strokeWidth={2.75} />
          </a>
          <h1>{t('No route to show')}</h1>
        </header>
        <p className="empty">{t('Go back to the map and choose where you are and where you are going.')}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="steps-head">
        <a className="icon-btn plain" href={mapHref()} aria-label={t('Back to map')}>
          <Icon name="arrowLeft" strokeWidth={2.75} />
        </a>
        <div>
          <p>
            {venue.name} · {t('{from} to', { from: placeName(fromPoi) })}
          </p>
          <h1>{placeName(toPoi)}</h1>
        </div>
      </header>

      <div className="steps-layout">
        <aside className="steps-aside">
          <section className="summary-dark">
            <div className="summary-top">
              <span className="summary-time">{formatMinutes(route.seconds)}</span>
              <span className="summary-meta">
                {roundMetres(route.metres)} m · {floorChangeText(floorChanges(route))}
              </span>
            </div>
            <div className="floor-path">
              {route.legs.map((leg, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  {i > 0 && <Icon name="arrowRight" />}
                  <a className={`floor-chip${i === 0 ? ' first' : ''}`} href={mapHref({ floor: leg.levelId })} style={{ textDecoration: 'none' }}>
                    {t(levelOf(leg.levelId).name)}
                  </a>
                </span>
              ))}
            </div>
          </section>
          <FloorPicker inline imdf={imdf} value={null} route={route} from={fromPoi} to={toPoi} onChange={(id) => (window.location.hash = mapHref({ floor: id }).slice(1))} />
        </aside>

        <ol className="card steps-list" aria-label={t('Steps')}>
          {steps.map((s, i) => (
            <li key={i}>
              <a
                className="step-row"
                href={mapHref({ floor: s.levelId, focus: s.point.map((v) => v.toFixed(6)).join(',') })}
                style={{ textDecoration: 'none' }}
                aria-label={`${s.title}. ${s.detail}. ${t('Show on the {floor} map', { floor: t(levelOf(s.levelId).name) })}`}
              >
                <StepTile kind={STEP_KIND[s.kind] || s.kind} />
                <span className="text">
                  <strong>{s.title}</strong>
                  <span>{s.detail}</span>
                </span>
                <span className="tag tag-outline">{levelOf(s.levelId).short}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
