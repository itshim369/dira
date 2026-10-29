import { SOCIALS } from '../contact.js';
import { Wordmark } from './Logo.jsx';
import { href } from '../lib.js';
import { useT } from '../prefs.js';

// Simple outline marks, drawn on the 24px icon grid used across the app.
const SOCIAL_ICON = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.5 5 4.8" />,
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10.5V17M8 7.5h.01M12 17v-6.5M12 13.5c0-2 1.2-3 2.6-3S17 11.4 17 13v4" />
    </>
  ),
};

/** Contact block and footer: Dira's social accounts. `#contact` is where "Contact us" scrolls. */
export default function SiteFooter() {
  const t = useT();
  return (
    <footer className="site-footer-wrap" id="contact" aria-labelledby="contact-title">
      <div className="contact-card">
        <div>
          <span className="eyebrow">{t('Contact us')}</span>
          <h2 className="display" id="contact-title">
            {t('Talk to the Dira team')}
          </h2>
          <p>{t('Want your mall, hospital or event mapped? Book a free viewing, or find us here.')}</p>
          <a className="btn btn-primary" href={href('/contact')}>
            {t('Book a viewing')}
          </a>
        </div>
        <ul className="socials">
          {SOCIALS.map((s) => {
            const icon = (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {SOCIAL_ICON[s.id]}
              </svg>
            );
            const text = (
              <span>
                <strong>{s.name}</strong>
                <small>{s.url ? s.handle : t('Coming soon')}</small>
              </span>
            );
            return (
              <li key={s.id}>
                {s.url ? (
                  <a className="social" href={s.url} target="_blank" rel="noopener noreferrer" aria-label={t('Dira on {network}, {handle}', { network: s.name, handle: s.handle })}>
                    {icon}
                    {text}
                  </a>
                ) : (
                  <span className="social is-soon" aria-label={t('Dira on {network}, coming soon', { network: s.name })}>
                    {icon}
                    {text}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="site-footer">
        <Wordmark height={18} />
        <span>{t('Prototype · Nairobi')}</span>
      </div>
    </footer>
  );
}
