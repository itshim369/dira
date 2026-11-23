import { useMemo, useState } from 'react';
import { categoryText } from '@imdf/imdf.js';
import { Icon } from './Icons.jsx';
import { PlaceTile } from './PlacePicker.jsx';
import { SHORTCUTS, placeName } from '../places.js';
import { store } from '../lib.js';
import { useT } from '../prefs.js';

// Choosing a route, one question at a time: "Where are you?", then "Where to?". The first offers
// recent places, entrances and landmarks and every store by floor; the second offers one-tap
// tiles that pick the nearest food, bank, washroom or exit, then popular places. Search is there
// for anything else. Used as the page itself before a route, and over the map to change an end.

const GROUP_OF = { food: 'food', money: 'money', help: 'help', exits: 'exits' };
const LANDMARK = new Set(['elevator', 'escalator', 'stairs']);

export default function RoutePlanner({ imdf, venueId, step, from, to, inline = false, onPick, onStep, onClose }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [floor, setFloor] = useState(from?.levelId || imdf.levels.find((l) => l.ordinal === 0)?.id || imdf.levels[0].id);
  const recentKey = `recent-${venueId}`;
  const recent = (store.get(recentKey, []) || []).map((id) => imdf.pois.find((p) => p.id === id)).filter(Boolean);
  const levels = useMemo(() => [...imdf.levels].sort((a, b) => a.ordinal - b.ordinal), [imdf]);
  const levelShort = (id) => imdf.levelById.get(id)?.short || '';
  const exclude = step === 'from' ? to?.id : from?.id;
  const places = useMemo(() => imdf.pois.filter((p) => p.kind !== 'unnamed' && p.levelId), [imdf]);

  const pick = (poi) => {
    store.set(recentKey, [poi.id, ...(store.get(recentKey, []) || []).filter((id) => id !== poi.id)].slice(0, 6));
    setQuery('');
    onPick(step, poi);
  };

  // The nearest place of a kind to where you are: straight-line distance, a floor counts as 45 m.
  const nearest = (group) => {
    const ord = (p) => imdf.levelById.get(p.levelId)?.ordinal ?? 0;
    const here = from || to;
    const M = 111000;
    const cands = places.filter((p) => p.group === GROUP_OF[group] && p.id !== here?.id);
    if (!here) return cands[0] || null;
    let best = null;
    for (const p of cands) {
      const d = Math.hypot((p.point[0] - here.point[0]) * M, (p.point[1] - here.point[1]) * M) + Math.abs(ord(p) - ord(here)) * 45;
      if (!best || d < best.d) best = { p, d };
    }
    return best?.p || null;
  };

  const q = query.trim().toLowerCase();
  const results = q
    ? places
        .filter((p) => p.id !== exclude && (placeName(p).toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || t(categoryText(p.category)).toLowerCase().includes(q)))
        .sort((a, b) => (placeName(a).toLowerCase().startsWith(q) ? 0 : 1) - (placeName(b).toLowerCase().startsWith(q) ? 0 : 1) || b.area - a.area)
        .slice(0, 40)
    : [];
  const landmarks = places.filter((p) => p.group === 'exits' || (p.kind === 'amenity' && LANDMARK.has(p.category))).filter((p) => p.levelId === floor);
  const shopsHere = places.filter((p) => p.kind === 'occupant' && p.levelId === floor && p.id !== exclude).sort((a, b) => placeName(a).localeCompare(placeName(b)));
  const popular = places.filter((p) => p.kind === 'occupant' && p.id !== exclude).sort((a, b) => b.area - a.area).slice(0, 8);

  const Row = ({ poi }) => (
    <button type="button" className="plan-row" onClick={() => pick(poi)}>
      <PlaceTile poi={poi} />
      <span>
        <strong>{placeName(poi)}</strong>
        <small>
          {t(imdf.levelById.get(poi.levelId)?.name || '')} · {t(categoryText(poi.category))}
        </small>
      </span>
    </button>
  );
  const Tile = ({ poi }) => (
    <button type="button" className="plan-tile" onClick={() => pick(poi)}>
      <PlaceTile poi={poi} />
      <strong>{placeName(poi)}</strong>
    </button>
  );

  return (
    <div className={`planner ${inline ? 'is-inline' : 'is-overlay'}`} role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true} aria-label={step === 'from' ? t('Where are you?') : t('Where to?')}>
      <div className="plan-top">
        {(!inline || step === 'to') && (
          <button className="icon-btn plain" type="button" onClick={() => (step === 'to' && inline ? onStep('from') : onClose?.())} aria-label={step === 'to' && inline ? t('Back') : t('Close')}>
            <Icon name={step === 'to' && inline ? 'arrowLeft' : 'close'} strokeWidth={2.6} />
          </button>
        )}
        <div className="plan-progress" aria-label={t('Step {n} of {total}', { n: step === 'from' ? 1 : 2, total: 2 })}>
          <span className="is-on" />
          <span className={step === 'to' ? 'is-on' : ''} />
        </div>
      </div>

      <div className="plan-body" key={step}>
        <h2>{step === 'from' ? t('Where are you?') : t('Where to?')}</h2>
        {step === 'from' ? (
          <p className="plan-sub">{t('Pick the shop, sign or entrance closest to you.')}</p>
        ) : (
          from && (
            <button type="button" className="plan-from" onClick={() => onStep('from')}>
              <span className="dot" aria-hidden="true" />
              <span>
                {t('From')} <strong>{placeName(from)}</strong> · {levelShort(from.levelId)}
              </span>
              <span className="plan-change">{t('Change')}</span>
            </button>
          )
        )}

        <label className="plan-search">
          <Icon name="search" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search shops, banks, washrooms…')} enterKeyHint="search" />
          {query && (
            <button type="button" className="plan-clear" onClick={() => setQuery('')} aria-label={t('Clear')}>
              <Icon name="close" />
            </button>
          )}
        </label>

        {q ? (
          <div className="plan-list">{results.length ? results.map((p) => <Row key={p.id} poi={p} />) : <p className="plan-empty">{t('Nothing found. Try another name.')}</p>}</div>
        ) : (
          <>
            {step === 'to' && (
              <section>
                <h3>{t('Nearest to you')}</h3>
                <div className="plan-quick">
                  {SHORTCUTS.map((s) => {
                    const near = nearest(s.id);
                    return (
                      <button key={s.id} type="button" className="plan-quick-tile" disabled={!near} onClick={() => near && pick(near)}>
                        <Icon name={s.icon} />
                        <strong>{t(s.label)}</strong>
                        <small>{near ? placeName(near) : '—'}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {recent.filter((p) => p.id !== exclude).length > 0 && (
              <section>
                <h3>{t('Recent')}</h3>
                <div className="plan-chips">
                  {recent
                    .filter((p) => p.id !== exclude)
                    .map((p) => (
                      <button key={p.id} type="button" onClick={() => pick(p)}>
                        <Icon name="clock" /> {placeName(p)}
                      </button>
                    ))}
                </div>
              </section>
            )}
            {step === 'to' && (
              <section>
                <h3>{t('Popular')}</h3>
                <div className="plan-grid">
                  {popular.map((p) => (
                    <Tile key={p.id} poi={p} />
                  ))}
                </div>
              </section>
            )}
            <section>
              <h3>{step === 'from' ? t('Stores on this floor') : t('Everything on a floor')}</h3>
              <div className="plan-floors" role="tablist" aria-label={t('Floors')}>
                {levels.map((l) => (
                  <button key={l.id} type="button" role="tab" aria-selected={floor === l.id} onClick={() => setFloor(l.id)}>
                    {l.short}
                  </button>
                ))}
              </div>
              {step === 'from' && landmarks.length > 0 && (
                <div className="plan-chips is-landmarks">
                  {landmarks.map((p) => (
                    <button key={p.id} type="button" onClick={() => pick(p)}>
                      <PlaceTile poi={p} /> {placeName(p)}
                    </button>
                  ))}
                </div>
              )}
              <div className="plan-grid">
                {shopsHere.map((p) => (
                  <Tile key={p.id} poi={p} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
