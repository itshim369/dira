import { Icon } from '../components/Icons.jsx';
import { Logo } from '../components/Logo.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import { SHORTCUTS } from '../places.js';
import { href, navigate } from '../lib.js';
import { useT } from '../prefs.js';
import PrefsControls from '../components/PrefsControls.jsx';

// Home, built for the phone: the pilot venue first with one clear way in, quick tiles for what
// people come for, how it works as swipeable cards, and what Dira does as short rows.

const STEPS = [
  ['01', 'Tap where you are', 'Pick the shop or sign in front of you. No GPS needed, it works in basements and car parks.'],
  ['02', 'Choose where to go', 'Search, or one tap for the nearest food, bank, washroom or exit.'],
  ['03', 'Follow the line', 'The route is drawn on every floor you pass, with a written step for each turn, escalator and lift.'],
];

const FEATURES = [
  ['cube', 'Every floor in 3D', 'Walls, shops and lifts drawn from the building’s own floor plans, in the open IMDF indoor map standard.'],
  ['walk', 'Walk it first', 'See the route at eye level, store by store, before you set off.'],
  ['lift', 'Escalator, lift or stairs', 'Choose how you change floors. Lift only routes are step free.'],
  ['wifiOff', 'Works offline', 'The map is saved on your phone after your first visit.'],
];

export default function Landing() {
  const t = useT();
  return (
    <div className="page home">
      <header className="home-top">
        <a className="logo-link" href={href('/')} aria-label={t('Dira home')}>
          <Logo height={32} />
        </a>
        <PrefsControls compact />
      </header>

      <main className="home-main">
        <section className="home-hero">
          <h1 className="display">{t('Never get lost inside a building again.')}</h1>
          <form
            className="home-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get('q')?.toString().trim();
              navigate('/venue/sarit', q ? { q } : {});
            }}
          >
            <Icon name="search" />
            <input name="q" type="search" placeholder={t('Where to in Sarit Centre?')} aria-label={t('Search Sarit Centre')} enterKeyHint="go" />
            <button className="btn btn-primary" type="submit" aria-label={t('Go')}>
              <Icon name="arrowRight" />
            </button>
          </form>
          <a className="home-pilot" href={href('/venue/sarit')} aria-label={t('Open the Sarit Centre map')}>
            <span className="home-pilot-pic">
              <img className="hero-light" src="./brand/hero-3d.jpg" alt="" />
              <img className="hero-dark" src="./brand/hero-blueprint.webp" alt="" />
              <span className="tag tag-terracotta">
                <span className="live-dot" /> {t('Live')}
              </span>
            </span>
            <span className="home-pilot-body">
              <span>
                <strong>Sarit Centre</strong>
                <small>
                  {t('Westlands')} · {t('8 floors')} · {t('Pilot')}
                </small>
              </span>
              <span className="btn btn-primary">
                {t('Find your way')} <Icon name="arrowRight" />
              </span>
            </span>
          </a>
        </section>

        <section className="home-section" aria-labelledby="need-title">
          <h2 id="need-title">{t('What do you need?')}</h2>
          <div className="home-quick">
            {SHORTCUTS.map((s) => (
              <a key={s.id} className="home-quick-tile" href={href('/venue/sarit', { want: s.id })}>
                <Icon name={s.icon} />
                <span>{t(s.label)}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="home-section" id="how" aria-labelledby="how-title">
          <h2 id="how-title">{t('Three taps to anywhere')}</h2>
          <div className="home-steps">
            {STEPS.map(([n, title, d]) => (
              <article key={n}>
                <span className="num">{n}</span>
                <h3>{t(title)}</h3>
                <p>{t(d)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section" aria-labelledby="does-title">
          <h2 id="does-title">{t('What Dira does')}</h2>
          <ul className="home-features">
            {FEATURES.map(([icon, title, d]) => (
              <li key={title}>
                <span className="tile">
                  <Icon name={icon} />
                </span>
                <span>
                  <strong>{t(title)}</strong>
                  <small>{t(d)}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <a className="home-more" href={href('/venues')}>
          <span>
            <strong>{t('Other venues')}</strong>
            <small>{t('Nisake Commercial Centre is live. More malls, hospitals and event grounds are on the way.')}</small>
          </span>
          <Icon name="arrowRight" />
        </a>
      </main>

      <SiteFooter />
    </div>
  );
}
