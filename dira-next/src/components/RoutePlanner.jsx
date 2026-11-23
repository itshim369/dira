import { useMemo, useState } from 'react';
import { categoryText } from '@imdf/imdf.js';
import { Icon } from './Icons.jsx';
import { PlaceTile } from './PlacePicker.jsx';
import { SHORTCUTS, placeName, nearestOf } from '../places.js';
import { store } from '../lib.js';
import { useT } from '../prefs.js';

// Choosing a route, one question at a time, destination first as people think of it:
// "Where to?", then "Where are you?". The first offers one-tap "nearest" tiles (food, bank,
// washroom, exit), recent and popular places and every store by floor. A "nearest" tile picked
// before we know where you are is kept as a wish (`want`) and settled once you say where you are.
// The second question leads with the entrances, for people who have just walked in.

const LANDMARK = new Set(['elevator', 'escalator', 'stairs']);
const NEAREST = { food: 'Nearest food', money: 'Nearest bank or ATM', help: 'Nearest washroom', exits: 'Nearest exit' };

export default function RoutePlanner({ imdf, venueId, step, from, to, want, initialQuery = '', inline = false, onPick, onWant, onStep, onClose }) {
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  const [floor, setFloor] = useState(from?.levelId || imdf.levels.find((l) => l.ordinal === 0)?.id || imdf.levels[0].id);
  const recentKey = `recent-${venueId}`;
  const recent = (store.get(recentKey, []) || []).map((id) => imdf.pois.find((p) => p.id === id)).filter(Boolean);
  const levels = useMemo(() => [...imdf.levels].sort((a, b) => a.ordinal - b.ordinal), [imdf]);
  const levelShort = (id) => imdf.levelById.get(id)?.short || '';
  const exclude = step === 'from' ? to?.id : from?.id;
  const places = useMemo(() => imdf.pois.filter((p) => p.kind !== 'unnamed' && p.levelId), [imdf]);
  const wantLabel = want && SHORTCUTS.find((s) => s.id === want);

  const pick = (poi) => {
    store.set(recentKey, [poi.id, ...(store.get(recentKey, []) || []).filter((id) => id !== poi.id)].slice(0, 6));
    setQuery('');
    onPick(step, poi);
  };

  const q = query.trim().toLowerCase();
  const results = q
    ? places
        .filter((p) => p.id !== exclude && (placeName(p).toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || t(categoryText(p.category)).toLowerCase().includes(q)))
        .sort((a, b) => (placeName(a).toLowerCase().startsWith(q) ? 0 : 1) - (placeName(b).toLowerCase().startsWith(q) ? 0 : 1) || b.area - a.area)
        .slice(0, 40)
    : [];
  const entrances = places.filter((p) => p.kind === 'amenity' && p.category === 'entry' && p.id !== exclude);
  const landmarks = places.filter((p) => p.kind === 'amenity' && (LANDMARK.has(p.category) || p.category === 'parking') && p.levelId === floor);
  const shopsHere = places.filter((p) => p.kind === 'occupant' && p.levelId === floor && p.id !== exclude).sort((a, b) => placeName(a).localeCompare(placeName(b)));
  const popular = places.filter((p) => p.kind === 'occupant' && p.id !== exclude).sort((a, b) => b.area - a.area).slice(0, 8);
  const recentHere = recent.filter((p) => p.id !== exclude);
  const stepNo = step === 'to' ? 1 : 2;

  const Row = ({ poi }) => (
    <button type="button" className="plan-row" onClick={() => pick(poi)}>
      <PlaceTile poi={poi} />
      <span>
        <strong>{placeName(poi)}</strong>
        <small>
          {t(imdf.levelById.get(poi.levelId)?.name || '')} · {t(categoryText(poi.category))}
        </small>
      </span>
      <Icon name="arrowRight" />
    </button>
  );
  const Tile = ({ poi }) => (
    <button type="button" className="plan-tile" onClick={() => pick(poi)}>
      <PlaceTile poi={poi} />
      <strong>{placeName(poi)}</strong>
    </button>
  );
  const back = inline ? step === 'from' : true;

  return (
    <div className={`planner ${inline ? 'is-inline' : 'is-overlay'}`} role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true} aria-label={step === 'from' ? t('Where are you?') : t('Where to?')}>
      <div className="plan-top">
        {back && (
          <button className="icon-btn plain" type="button" onClick={() => (inline ? onStep('to') : onClose?.())} aria-label={inline ? t('Back') : t('Close')}>
            <Icon name={inline ? 'arrowLeft' : 'close'} strokeWidth={2.6} />
          </button>
        )}
        {(inline || !from || !to) && (
          <>
            <div className="plan-progress" aria-hidden="true">
              <span className="is-on" />
              <span className={stepNo === 2 ? 'is-on' : ''} />
            </div>
            <span className="plan-count">{t('Step {n} of {total}', { n: stepNo, total: 2 })}</span>
          </>
        )}
      </div>

      <div className="plan-body" key={step}>
        {step === 'from' && (to || wantLabel) && (
          <button type="button" className="plan-from is-to" onClick={() => onStep('to')}>
            <Icon name="pin" />
            <span>
              {t('Going to')} <strong>{to ? placeName(to) : t(NEAREST[want])}</strong>
              {to && <> · {levelShort(to.levelId)}</>}
            </span>
            <span className="plan-change">{t('Change')}</span>
          </button>
        )}
        <h2>{step === 'from' ? t('Where are you?') : t('Where to?')}</h2>
        <p className="plan-sub">
          {step === 'from' ? t('Pick the shop, sign or entrance closest to you. No GPS needed.') : t('Search for a shop, or tap what you need.')}
        </p>

        <label className="plan-search">
          <Icon name="search" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={step === 'from' ? t('Shop or sign next to you…') : t('Search shops, banks, washrooms…')} enterKeyHint="search" />
          {query && (
            <button type="button" className="plan-clear" onClick={() => setQuery('')} aria-label={t('Clear')}>
              <Icon name="close" />
            </button>
          )}
        </label>

        {q ? (
          <div className="plan-list">{results.length ? results.map((p) => <Row key={p.id} poi={p} />) : <p className="plan-empty">{t('Nothing found. Try another name.')}</p>}</div>
        ) : step === 'to' ? (
          <>
            <section>
              <h3>{from ? t('Nearest to you') : t('What do you need?')}</h3>
              <div className="plan-quick">
                {SHORTCUTS.map((s) => {
                  const near = from ? nearestOf(imdf, s.id, from) : null;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="plan-quick-tile"
                      aria-pressed={want === s.id}
                      onClick={() => (near ? pick(near) : onWant(s.id))}
                    >
                      <Icon name={s.icon} />
                      <strong>{t(NEAREST[s.id])}</strong>
                      <small>{near ? `${placeName(near)} · ${levelShort(near.levelId)}` : t('Closest to where you are')}</small>
                    </button>
                  );
                })}
              </div>
            </section>
            {recentHere.length > 0 && (
              <section>
                <h3>{t('Recent')}</h3>
                <div className="plan-list">
                  {recentHere.slice(0, 3).map((p) => (
                    <Row key={p.id} poi={p} />
                  ))}
                </div>
              </section>
            )}
            <section>
              <h3>{t('Popular')}</h3>
              <div className="plan-grid">
                {popular.map((p) => (
                  <Tile key={p.id} poi={p} />
                ))}
              </div>
            </section>
            {floorSection(t('Everything on a floor'))}
          </>
        ) : (
          <>
            {entrances.length > 0 && (
              <section>
                <h3>{t('Just walked in?')}</h3>
                <div className="plan-list">
                  {entrances.map((p) => (
                    <Row key={p.id} poi={p} />
                  ))}
                </div>
              </section>
            )}
            {recentHere.length > 0 && (
              <section>
                <h3>{t('Recent')}</h3>
                <div className="plan-chips">
                  {recentHere.map((p) => (
                    <button key={p.id} type="button" onClick={() => pick(p)}>
                      <Icon name="clock" /> {placeName(p)}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {floorSection(t('Or by floor: what is next to you?'), true)}
          </>
        )}
      </div>
    </div>
  );

  function floorSection(title, landmarksToo = false) {
    return (
      <section>
        <h3>{title}</h3>
        <div className="plan-floors" role="tablist" aria-label={t('Floors')}>
          {levels.map((l) => (
            <button key={l.id} type="button" role="tab" aria-selected={floor === l.id} onClick={() => setFloor(l.id)}>
              {l.short}
            </button>
          ))}
        </div>
        {landmarksToo && landmarks.length > 0 && (
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
    );
  }
}
