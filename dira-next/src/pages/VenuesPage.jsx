import { useState } from 'react';
import { Icon } from '../components/Icons.jsx';
import { Logo } from '../components/Logo.jsx';
import { TYPE_LABEL, venues } from '../venues.js';
import { href, navigate } from '../lib.js';
import SiteFooter from '../components/SiteFooter.jsx';
import VenueLogo from '../components/VenueLogo.jsx';
import PrefsControls from '../components/PrefsControls.jsx';
import { useT } from '../prefs.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'mall', label: 'Malls' },
  { id: 'business', label: 'Business centres' },
  { id: 'hospital', label: 'Hospitals' },
  { id: 'event', label: 'Events' },
];

export default function VenuesPage() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [manageOpen, setManageOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = venues.filter((v) => (filter === 'all' || v.type === filter) && (!q || `${v.name} ${v.area || ''} ${TYPE_LABEL[v.type]}`.toLowerCase().includes(q)));
  const live = shown.filter((v) => v.status === 'live');
  const soon = shown.filter((v) => v.status !== 'live');

  return (
    <div className="page">
      <header className="top-bar">
        <a className="icon-btn plain" href={href('/')} aria-label={t('Back to home')}>
          <Icon name="arrowLeft" strokeWidth={2.75} />
        </a>
        <a className="logo-link" href={href('/')} aria-label={t('Dira home')}>
          <Logo height={34} />
        </a>
        <PrefsControls compact />
      </header>
      <main>
        <div className="venues-head">
          <div>
            <h1 className="display">{t('Where are you today?')}</h1>
            <p>{t('Choose a venue to open its map.')}</p>
          </div>
          <label className="search plain">
            <Icon name="search" strokeWidth={2.75} />
            <span className="sr-only">{t('Search venues')}</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search malls, hospitals, events')} />
          </label>
        </div>
        <div className="chip-row" role="group" aria-label={t('Venue type')}>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {t(f.label)}
            </button>
          ))}
        </div>

        {live.length > 0 && (
          <>
            <div className="section-label">
              <span className="eyebrow">{t('Live map')}</span>
            </div>
            {live.map((v) => (
              <div
                key={v.id}
                className="featured"
                role="link"
                tabIndex={0}
                aria-label={t('Open the {name} map', { name: v.name })}
                onClick={() => navigate(`/venue/${v.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/venue/${v.id}`)}
              >
                <div className="featured-preview">
                  <span className="tag tag-terracotta">
                    <span className="live-dot" /> {t('Live')}
                  </span>
                  <VenueLogo id={v.id} src={v.logo} alt={t('{name} logo', { name: v.name })} />
                </div>
                <div className="featured-body">
                  <h2 className="display">{v.name}</h2>
                  <p className="meta">
                    {t(v.area)} · {t(TYPE_LABEL[v.type])}
                  </p>
                  <div className="facts">
                    {v.facts.map((f) => (
                      <span key={f} className="fact">
                        {t(f)}
                      </span>
                    ))}
                    <span className="fact">{t('3D map')}</span>
                  </div>
                  <a className="btn btn-primary btn-lg" href={href(`/venue/${v.id}`)} onClick={(e) => e.stopPropagation()}>
                    {t('Open map')} <Icon name="arrowRight" />
                  </a>
                </div>
              </div>
            ))}
          </>
        )}

        {soon.length > 0 && (
          <>
            <div className="section-label">
              <span className="eyebrow">{t('Coming soon')}</span>
            </div>
            <div className="soon-grid">
              {soon.map((v) => (
                <article key={v.id} className="featured is-disabled" aria-disabled="true">
                  <div className="featured-preview">
                    <Icon name={v.icon} className="venue-icon" strokeWidth={1.6} />
                  </div>
                  <div className="featured-body">
                    <h2 className="display">{v.name}</h2>
                    <p className="meta">{t(TYPE_LABEL[v.type])}</p>
                    <div className="facts">
                      {v.facts.map((f) => (
                        <span key={f} className="fact">
                          {t(f)}
                        </span>
                      ))}
                    </div>
                    <button className="btn btn-lg btn-disabled" type="button" disabled>
                      {t('Map coming soon')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {!shown.length && <p className="empty">{t('No venues match “{query}”. Try Sarit, mall or hospital.', { query })}</p>}

        <section className="manage">
          <div>
            <h3>{t('Manage a venue?')}</h3>
            <p>{t('Send us your floor plans and we will map every shop, lift and washroom in 3D, in the IMDF standard.')}</p>
            {manageOpen && (
              <ol>
                <li>{t('Share your floor plans, one per floor (PDF or image).')}</li>
                <li>{t('We trace every shop, room, entrance and connector into an IMDF archive.')}</li>
                <li>{t('You review the map and tenant details, then it goes live for your visitors.')}</li>
              </ol>
            )}
          </div>
          <button className="btn btn-dark" type="button" aria-expanded={manageOpen} onClick={() => setManageOpen((o) => !o)}>
            {manageOpen ? t('Hide steps') : t('How it works')}
          </button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
