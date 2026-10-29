import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryText } from '@imdf/imdf.js';
import { hoursStatus } from '@imdf/hours.js';
import { Icon } from './Icons.jsx';
import { AMENITY_ICON, PICKER_FILTERS, initials, placeName } from '../places.js';
import { useT } from '../prefs.js';

export function PlaceTile({ poi, large }) {
  const icon = poi.kind === 'amenity' ? AMENITY_ICON[poi.category] || 'info' : null;
  if (large && poi.content?.photo) return <img className="tile tile-lg-photo" src={poi.content.photo.src} alt="" />;
  return <span className={`tile${poi.kind === 'amenity' ? ' tile-dark' : ''}`}>{icon ? <Icon name={icon} /> : initials(poi.name)}</span>;
}

/** Searchable place list grouped by floor, with quick picks for the nearest amenity. */
export default function PlacePicker({ imdf, role, initialFilter = 'all', currentLevelId, onPick, onNearest, onClose }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const input = useRef(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = PICKER_FILTERS.find((f) => f.id === filter)?.match;
    const levels = [...imdf.levels].sort((a, b) => (b.id === currentLevelId) - (a.id === currentLevelId) || a.ordinal - b.ordinal);
    return levels
      .map((l) => ({
        level: l,
        places: imdf.pois
          .filter((p) => p.levelId === l.id && p.kind !== 'unnamed' && !['escalator', 'elevator', 'stairs'].includes(p.category))
          .filter((p) => !match || match(p))
          .filter((p) => !q || p.name.toLowerCase().includes(q) || placeName(p).toLowerCase().includes(q) || categoryText(p.category).toLowerCase().includes(q) || t(categoryText(p.category)).toLowerCase().includes(q))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      }))
      .filter((g) => g.places.length);
  }, [imdf, query, filter, currentLevelId, t]);

  const total = groups.reduce((s, g) => s + g.places.length, 0);
  const title = role === 'from' ? t('Where are you?') : t('Where to?');

  return (
    <div className="picker-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker" role="dialog" aria-modal="true" aria-label={title}>
        <div className="picker-head">
          <div className="row">
            <h2>{title}</h2>
            <button className="icon-btn plain" type="button" onClick={onClose} aria-label={t('Close')}>
              <Icon name="close" strokeWidth={2.75} />
            </button>
          </div>
          <label className="search plain">
            <Icon name="search" strokeWidth={2.75} />
            <span className="sr-only">{t('Search places')}</span>
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={role === 'from' ? t('Shop or sign in front of you') : t('Search shops, food, washrooms')}
            />
          </label>
          <div className="chip-row" role="group" aria-label={t('Filter places')}>
            {PICKER_FILTERS.map((f) => (
              <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {t(f.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="picker-list">
          {role === 'to' && onNearest && !query && (
            <div className="picker-group">
              <h3>{t('Nearest to you')}</h3>
              {[
                ['restroom', 'wc', 'Nearest washroom'],
                ['atm', 'atm', 'Nearest ATM'],
                ['entry', 'door', 'Nearest exit'],
              ].map(([cat, icon, label]) => (
                <button key={cat} type="button" className="picker-item special" onClick={() => onNearest(cat)}>
                  <span className="tile">
                    <Icon name={icon} />
                  </span>
                  <span className="text">
                    <strong>{t(label)}</strong>
                    <span>{t('Shortest walk from where you are')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {groups.map(({ level, places }) => (
            <div className="picker-group" key={level.id}>
              <h3>{t(level.name)}</h3>
              {places.map((p) => {
                const status = p.content?.hours ? hoursStatus(p.content.hours) : null;
                return (
                  <button key={p.id} type="button" className="picker-item" onClick={() => onPick(p)}>
                    <PlaceTile poi={p} />
                    <span className="text">
                      <strong>{placeName(p)}</strong>
                      <span>
                        {t(categoryText(p.category))}
                        {status && status.open !== null && <em className={status.open ? 'open-dot' : 'closed-dot'}> · {status.open ? t('Open') : t('Closed')}</em>}
                      </span>
                    </span>
                    <span className="tag tag-outline">{level.short}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!total && <p className="empty">{t('No places match “{query}”. Try a shop name, or a type like food or bank.', { query })}</p>}
        </div>
      </div>
    </div>
  );
}
