import { useEffect, useState } from 'react';
import { categoryText } from '@imdf/imdf.js';
import { hoursStatus } from '@imdf/hours.js';
import { Icon } from './Icons.jsx';
import { PlaceTile } from './PlacePicker.jsx';
import { placeName } from '../places.js';
import { store } from '../lib.js';
import { tr, useT } from '../prefs.js';

// Opening-hours text from hours.js, in the viewer's language.
const DAY_RE = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/;
function hoursText(text) {
  let m;
  if ((m = text.match(/^Closes (\d\d:\d\d)$/))) return tr('Closes {time}', { time: m[1] });
  if ((m = text.match(/^Opens (\d\d:\d\d) today$/))) return tr('Opens {time} today', { time: m[1] });
  if ((m = text.match(/^Opens (\d\d:\d\d) tomorrow$/))) return tr('Opens {time} tomorrow', { time: m[1] });
  if ((m = text.match(/^Opens (\d\d:\d\d) (\w+)$/)) && DAY_RE.test(m[2])) return tr('Opens {time} on {day}', { time: m[1], day: tr(m[2]) });
  if ((m = text.match(/^(\d\d:\d\d) to (\d\d:\d\d)$/))) return tr('{a} to {b}', { a: m[1], b: m[2] });
  return tr(text);
}

function ReportForm({ venueId, poi, onDone }) {
  const t = useT();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <p className="note">
        <strong>{t('Thanks.')}</strong> {t('Your note is saved on this device and goes to the venue team once reporting is switched on.')}
      </p>
    );
  }
  return (
    <form
      className="report"
      onSubmit={(e) => {
        e.preventDefault();
        const reports = store.get('reports', []);
        reports.push({ venue: venueId, place: poi.id, name: poi.name, note: text.trim(), at: new Date().toISOString() });
        store.set('reports', reports);
        setSent(true);
      }}
    >
      <label className="sr-only" htmlFor="report-text">
        {t('What is wrong?')}
      </label>
      <textarea id="report-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('For example: this shop has moved, or the name is wrong')} required />
      <div className="row">
        <button className="btn btn-dark" type="submit">
          {t('Save report')}
        </button>
        <button className="btn btn-outline" type="button" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

/** Place card over the map: photo, open now, description, hours, product types, start or go. */
export default function PlaceSheet({ venueId, poi, levelName, onClose, onStart, onGo }) {
  const t = useT();
  const [reporting, setReporting] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  useEffect(() => {
    setReporting(false);
    setHoursOpen(false);
  }, [poi.id]);
  const c = poi.content || {};
  const status = c.hours ? hoursStatus(c.hours) : null;
  const connector = ['escalator', 'elevator', 'stairs'].includes(poi.category);

  return (
    <div className="place-sheet rich" role="dialog" aria-label={placeName(poi)}>
      <header>
        <PlaceTile poi={poi} large />
        <div>
          <h3>{placeName(poi)}</h3>
          <p>
            {t(categoryText(poi.category))} · {levelName}
            {status && status.open !== null && <span className={status.open ? 'is-open' : 'is-closed'}> · {status.open ? t('Open now') : t('Closed')}</span>}
          </p>
        </div>
        <button className="icon-btn close plain" type="button" onClick={onClose} aria-label={t('Close')}>
          <Icon name="close" strokeWidth={2.75} />
        </button>
      </header>
      {!connector && (
        <div className="actions">
          <button className="btn btn-outline" type="button" onClick={onStart}>
            {t('I am here')}
          </button>
          <button className="btn btn-primary" type="button" onClick={onGo}>
            {t('Go here')}
          </button>
        </div>
      )}
      <div className="sheet-body">
        {c.photo && (
          <figure className="sheet-photo">
            <div className="photo-frame">
              <img src={c.photo.src} alt={c.photo.caption} />
              {c.photo.sample && <span className="sample-badge">{t('Sample photo')}</span>}
            </div>
            <figcaption>
              {t(c.photo.caption)}. {t('Photo:')} <a href={c.photo.source}>{c.photo.credit}</a>
            </figcaption>
          </figure>
        )}
        {c.description && <p className="sheet-desc">{c.description}</p>}
        {c.flags?.includes('name-to-verify') && <p className="flag">{t('Name read from a low-resolution plan. Please confirm on site.')}</p>}
        {status && status.open !== null && (
          <div className="sheet-hours">
            <button type="button" className="hours-pill" aria-expanded={hoursOpen} onClick={() => setHoursOpen((o) => !o)}>
              <span className={`status ${status.open ? 'is-open' : 'is-closed'}`}>{status.open ? t('Open') : t('Closed')}</span>
              <span className="hours-text">{hoursText(status.text)}</span>
              <Icon name={hoursOpen ? 'chevronUp' : 'chevronDown'} />
            </button>
            {hoursOpen && (
              <table className="hours-table">
                <tbody>
                  {status.rows.map((r, i) => (
                    <tr key={r.day} className={i === status.today ? 'is-today' : ''}>
                      <th scope="row">{t(r.day)}</th>
                      <td>{hoursText(r.text)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {c.hours_status === 'estimate' && <p className="fine">{t('Estimated for this type of business, not yet confirmed by the store.')}</p>}
          </div>
        )}
        {c.tags?.length > 0 && (
          <div className="sheet-tags">
            {c.tags.map((t) => (
              <span key={t} className="fact">
                {t}
              </span>
            ))}
          </div>
        )}
        {c.website && (
          <a className="website" href={c.website} target="_blank" rel="noreferrer">
            <Icon name="globe" /> {c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          </a>
        )}
        {reporting ? (
          <ReportForm venueId={venueId} poi={poi} onDone={() => setReporting(false)} />
        ) : (
          <button className="link-btn" type="button" onClick={() => setReporting(true)}>
            <Icon name="flag" />
            {t('Report a wrong shop')}
          </button>
        )}
      </div>
    </div>
  );
}
