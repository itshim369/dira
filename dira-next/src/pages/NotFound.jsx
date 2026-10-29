import { href } from '../lib.js';
import { useT } from '../prefs.js';

export default function NotFound({ message }) {
  const t = useT();
  return (
    <div className="page" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <h1 className="display" style={{ fontSize: 'clamp(32px, 5vw, 56px)' }}>
        {t('This page took a wrong turn.')}
      </h1>
      <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: 18 }}>{message || t('The venue or page you asked for is not here.')}</p>
      <a className="btn btn-primary btn-lg" href={href('/venues')} style={{ marginTop: 28 }}>
        {t('Choose a venue')}
      </a>
    </div>
  );
}
