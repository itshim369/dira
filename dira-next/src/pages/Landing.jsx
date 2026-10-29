import { Icon } from '../components/Icons.jsx';
import { Logo, LogoStacked } from '../components/Logo.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import { href } from '../lib.js';
import { useT } from '../prefs.js';
import PrefsControls from '../components/PrefsControls.jsx';

const STEPS = [
  ['01', 'Choose your venue', 'Sarit Centre and Nisake Commercial Centre are live. More malls, hospitals and event grounds are on the way.'],
  ['02', 'Tap where you are', 'Pick the shop or sign in front of you. No GPS needed, it works in basements and car parks.'],
  ['03', 'Follow the line', 'The route is drawn on every floor you pass, with a written step for each turn, escalator and lift.'],
];

const FEATURES = [
  ['cube', 'Every floor in 3D', 'Walls, shops and lifts drawn from the building’s own floor plans, in the open IMDF indoor map standard.'],
  ['clock', 'Know what’s open', 'Each place has a card with its photo, opening hours and what it sells.'],
  ['lift', 'Escalator, lift or stairs', 'Choose how you change floors. Lift only routes are step free.'],
  ['wifiOff', 'Works offline', 'The map is saved on your phone after your first visit.'],
  ['wc', 'The nearest washroom', 'One tap finds the closest washroom, ATM or exit from where you stand.'],
  ['share', 'Share a route', 'Send a friend the exact route to meet you, as a link.'],
];

export default function Landing() {
  const t = useT();
  return (
    <div className="page">
      <header className="site-header">
        <a className="logo-link" href={href('/')} aria-label={t('Dira home')}>
          <Logo height={36} />
        </a>
        <nav>
          <a className="nav-link" href={href('/venues')}>
            {t('Venues')}
          </a>
          <a className="btn btn-dark nav-cta" href={href('/contact')}>
            {t('Contact us')}
          </a>
          <PrefsControls compact />
        </nav>
      </header>

      <main>
        <section className="hero">
          <div>
            <span className="pill-eyebrow">{t('Indoor navigation')}</span>
            <h1 className="display">{t('Never get lost inside a building again.')}</h1>
            <p className="hero-lede">
              {t('Pick a venue, tap where you are and where you want to go. Dira shows every floor in 3D and draws your route, floor by floor, even without internet.')}
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary btn-lg" href={href('/venues')}>
                {t('Get started')} <Icon name="arrowRight" />
              </a>
              <a className="btn btn-outline btn-lg" href="#how" onClick={(e) => (e.preventDefault(), document.getElementById('how')?.scrollIntoView())}>
                {t('How it works')}
              </a>
            </div>
          </div>
          <a className="card hero-shot" href={href('/venue/sarit')} aria-label={t('Open the Sarit Centre map')}>
            <img src="./brand/hero-3d.jpg" alt={t('Dira’s 3D map of Sarit Centre’s Lower Ground floor with a route to the escalator')} />
            <span className="hero-shot-bar">
              <span>
                <span className="eyebrow">{t('Live now')}</span>
                <strong>{t('Sarit Centre, all 8 floors')}</strong>
              </span>
              <Icon name="arrowRight" />
            </span>
          </a>
        </section>

        <div className="made-for">
          <span>{t('Made for')}</span>
          {['Malls', 'Hospitals', 'Conferences', 'Events'].map((m) => (
            <span key={m} className="fact">
              {t(m)}
            </span>
          ))}
        </div>

        <section className="section" id="how" aria-labelledby="how-title">
          <h2 className="display" id="how-title">
            {t('Three taps to anywhere')}
          </h2>
          <div className="steps3">
            {STEPS.map(([n, title, d]) => (
              <article key={n}>
                <span className="num">{n}</span>
                <div>
                  <h3>{t(title)}</h3>
                  <p>{t(d)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section features" aria-label={t('Features')}>
          {FEATURES.map(([icon, title, d]) => (
            <article key={title} className="card">
              <span className="tile">
                <Icon name={icon} />
              </span>
              <div>
                <h3>{t(title)}</h3>
                <p>{t(d)}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="section">
          <div className="closing">
            <div>
              <span className="eyebrow">{t('Now live')}</span>
              <h2 className="display">{t('Start with Sarit Centre')}</h2>
              <p>{t('Eight floors, from the Lower Ground car parks to the sixth floor courts, mapped in 3D and ready.')}</p>
              <a className="btn btn-primary btn-lg" href={href('/venue/sarit')}>
                {t('Open the map')} <Icon name="arrowRight" />
              </a>
            </div>
            <LogoStacked className="closing-logo" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
