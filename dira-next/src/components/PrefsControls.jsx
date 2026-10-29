import { LANGUAGES, setLang, setTheme, usePrefs, tr } from '../prefs.js';

const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);
const MOON = <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />;
const GLOBE = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </>
);
const svg = (paths) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

/** Light/dark switch and language picker, for page headers. */
export default function PrefsControls({ compact = false }) {
  const { theme, lang } = usePrefs();
  const dark = theme === 'dark';
  return (
    <div className={`prefs${compact ? ' compact' : ''}`}>
      <label className="lang-pick">
        {svg(GLOBE)}
        <span className="sr-only">{tr('Language')}</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={tr('Language')}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {compact ? l.short : l.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="icon-btn plain theme-btn"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        aria-label={dark ? tr('Switch to light mode') : tr('Switch to dark mode')}
        title={dark ? tr('Switch to light mode') : tr('Switch to dark mode')}
      >
        {svg(dark ? SUN : MOON)}
      </button>
    </div>
  );
}
