import { useState } from 'react';
import { categoryText } from './imdf.js';
import { hoursStatus } from './hours.js';
import { AMENITY_ICON, Icon, initials } from './icons.jsx';

export function PoiTile({ poi, large }) {
  const icon = poi.kind === 'amenity' ? AMENITY_ICON[poi.category] || 'info' : poi.kind === 'unnamed' ? 'search' : null;
  const photo = poi.content?.photo;
  if (photo && large) {
    return <img className="tile tile-lg tile-photo" src={photo.src} alt="" />;
  }
  return (
    <span className={`tile${large ? ' tile-lg' : ''}${poi.kind === 'amenity' ? ' tile-amenity' : ''}${poi.kind === 'unnamed' ? ' tile-unnamed' : ''}`}>
      {icon ? <Icon name={icon} size={large ? 26 : 20} /> : initials(poi.name)}
    </span>
  );
}

function HoursBlock({ content }) {
  const [open, setOpen] = useState(false);
  const status = hoursStatus(content.hours);
  return (
    <section className="card-section">
      <h3>Opening hours</h3>
      <button type="button" className="hours-pill" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`status ${status.open ? 'is-open' : 'is-closed'}`}>{status.open ? 'Open' : 'Closed'}</span>
        <span className="hours-text">{status.text}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
      </button>
      {open && (
        <table className="hours-table">
          <tbody>
            {status.rows.map((r, i) => (
              <tr key={r.day} className={i === status.today ? 'is-today' : ''}>
                <th scope="row">{r.day}</th>
                <td>{r.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {content.hours_status === 'estimate' && <p className="fine">Estimated for this type of business. Not yet confirmed by the store.</p>}
    </section>
  );
}

/** The place card, after Pointr's: header, status, Go, photo, description, hours, product types. */
export default function PlaceCard({ poi, levelName, onClose, onGo }) {
  const c = poi.content || {};
  const status = c.hours ? hoursStatus(c.hours) : null;
  const isUnnamed = poi.kind === 'unnamed';

  return (
    <div className="place">
      <header>
        <PoiTile poi={poi} large />
        <h2>{poi.name}</h2>
        <button type="button" className="icon-plain icon-ring" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
      </header>
      <div className="place-meta">
        <span>{levelName} / Sarit Centre</span>
        {status && status.open !== null && <span className={status.open ? 'meta-open' : 'meta-closed'}>{status.open ? 'Open' : 'Closed'}</span>}
      </div>
      <div className="place-actions">
        <button type="button" className="btn btn-primary btn-go" onClick={onGo}>
          <Icon name="navigate" size={20} /> Go
        </button>
        <span className="chip">{categoryText(poi.category)}</span>
      </div>

      {isUnnamed ? (
        <div className="review-note">
          <strong>Name to confirm</strong>
          <p>
            This unit’s name is too small to read on the floor plan. It is <b>{poi.reviewRef}</b> in REVIEW.md and on the numbered map in
            review/overlay-{poi.reviewRef?.split(' ')[0]}.jpg.
          </p>
        </div>
      ) : (
        <>
          {poi.kind === 'occupant' &&
            (c.photo ? (
              <figure className="place-photo">
                <div className="photo-frame">
                  <img src={c.photo.src} alt={c.photo.caption} />
                  {c.photo.sample && <span className="sample-badge">Sample photo</span>}
                </div>
                <figcaption>
                  {c.photo.caption}. Photo: <a href={c.photo.source}>{c.photo.credit}</a>
                </figcaption>
              </figure>
            ) : (
              <div className="photo-needed" role="img" aria-label="No photo yet">
                <Icon name="camera" size={26} />
                <span>Photo needed</span>
                <small>Ask the store for a photo they are happy to publish.</small>
              </div>
            ))}
          {c.description && <p className="place-desc">{c.description}</p>}
          {c.flags?.includes('name-to-verify') && <p className="flag">Name read from a low-resolution plan. Please confirm on site.</p>}
          {c.hours && <HoursBlock content={c} />}
          {c.tags?.length > 0 && (
            <section className="card-section">
              <h3>{poi.kind === 'occupant' ? 'Product types' : 'Features'}</h3>
              <div className="tags">
                {c.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}
          {c.website && (
            <a className="website" href={c.website} target="_blank" rel="noreferrer">
              <Icon name="globe" size={18} /> {c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          )}
        </>
      )}
    </div>
  );
}
