import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { tr, useT } from '../prefs.js';
import { placeName } from '../places.js';

const RIDE = { elevator: 'lift', escalator: 'escalator', stairs: 'stairs' };
const RIDE_ICON = { elevator: 'lift', escalator: 'escalator', stairs: 'stairs' };

/** What happens on each level of the route: start, dest, both, pass (ride past) or change (walk to the next ride). */
function levelRoles(imdf, route, from, to) {
  const roles = new Map();
  if (!route || !from || !to) return roles;
  const ord = (id) => imdf.levelById.get(id).ordinal;
  for (const t of route.transitions) {
    const lo = Math.min(ord(t.fromLevelId), ord(t.toLevelId));
    const hi = Math.max(ord(t.fromLevelId), ord(t.toLevelId));
    for (const l of imdf.levels) if (l.ordinal > lo && l.ordinal < hi) roles.set(l.id, { role: 'pass', kind: t.kind });
  }
  route.legs.forEach((leg, i) => {
    if (i > 0 && i < route.legs.length - 1) roles.set(leg.levelId, { role: 'change', kind: route.transitions[i]?.kind });
  });
  if (from.levelId === to.levelId) roles.set(from.levelId, { role: 'both' });
  else {
    roles.set(from.levelId, { role: 'start' });
    roles.set(to.levelId, { role: 'dest' });
  }
  return roles;
}

function summary(imdf, route, from, to) {
  if (!route || !from || !to) return null;
  const a = imdf.levelById.get(from.levelId);
  const b = imdf.levelById.get(to.levelId);
  if (a.id === b.id) return { icon: 'pin', title: tr('Your whole route is on the {floor}', { floor: tr(a.name) }), sub: tr('No floor changes') };
  const rides = [...new Set(route.transitions.map((t) => tr(RIDE[t.kind])))];
  const n = Math.abs(b.ordinal - a.ordinal);
  const up = b.ordinal > a.ordinal;
  const key = `${up ? 'Up' : 'Down'} ${n > 1 ? '{n} floors' : '1 floor'} by {rides}`;
  return { icon: up ? 'arrowUp' : 'chevronDown', title: tr(key, { n, rides: rides.join(tr(' and ')) }), sub: tr('{a} to {b}', { a: tr(a.name), b: tr(b.name) }) };
}

function rowText(info, from, to) {
  if (!info) return null;
  if (info.role === 'start') return tr('Start at {name}', { name: placeName(from) });
  if (info.role === 'dest') return tr('Arrive at {name}', { name: placeName(to) });
  if (info.role === 'both') return tr('{a} to {b}', { a: placeName(from), b: placeName(to) });
  if (info.role === 'pass') return tr(`Ride past on the ${RIDE[info.kind]}`);
  return tr(`Walk to the next ${RIDE[info.kind] || 'connector'}`);
}

function Node({ info }) {
  if (!info) return <span className="fp-node off" />;
  if (info.role === 'start') return <span className="fp-node start" />;
  if (info.role === 'dest' || info.role === 'both')
    return (
      <span className="fp-node dest">
        <Icon name="pin" strokeWidth={2.6} />
      </span>
    );
  return (
    <span className={`fp-node ride${info.role === 'change' ? ' change' : ''}`}>
      <Icon name={RIDE_ICON[info.kind] || 'arrowUp'} strokeWidth={2.6} />
    </span>
  );
}

function Panel({ imdf, value, onChange, route, from, to, inline, listId, overview }) {
  const t = useT();
  const roles = levelRoles(imdf, route, from, to);
  const sum = summary(imdf, route, from, to);
  const levels = [...imdf.levels].reverse(); // top floor first, like the building
  const startIdx = levels.findIndex((l) => ['start', 'both'].includes(roles.get(l.id)?.role));
  const destIdx = levels.findIndex((l) => roles.get(l.id)?.role === 'dest');
  const goingUp = destIdx >= 0 && destIdx < startIdx;
  const on = (i) => i >= 0 && i < levels.length && roles.has(levels[i].id);
  return (
    <div className={`fp-panel${inline ? ' inline' : ''}`}>
      {sum && (
        <div className="fp-summary">
          <span className="tile tile-accent">
            <Icon name={sum.icon} strokeWidth={2.6} />
          </span>
          <div>
            <strong>{sum.title}</strong>
            <span>{sum.sub}</span>
          </div>
        </div>
      )}
      <ul className="fp-list" role="listbox" id={listId} aria-label={t('Floors')}>
        {levels.map((l, i) => {
          const info = roles.get(l.id);
          const dist = startIdx >= 0 ? Math.abs(i - startIdx) : 0;
          return (
            <li key={l.id}>
              <button
                type="button"
                role="option"
                aria-selected={!overview && l.id === value}
                className={`fp-row${info ? ` is-${info.role}` : ''}`}
                onClick={() => onChange(l.id)}
                style={{ '--origin': goingUp ? 'bottom' : 'top', '--dt': `${dist * 90 + (goingUp ? 0 : -45)}ms`, '--db': `${dist * 90 + (goingUp ? -45 : 0)}ms` }}
              >
                <span className={`fp-rail${on(i) && on(i - 1) ? ' top-on' : ''}${on(i) && on(i + 1) ? ' bottom-on' : ''}`} aria-hidden="true">
                  <Node info={info} />
                </span>
                <span className="fp-text">
                  <strong>{t(l.name)}</strong>
                  {info ? <span>{rowText(info, from, to)}</span> : l.approximate ? <span>{t('Position approximate')}</span> : l.note && <span>{t(l.note)}</span>}
                </span>
                {!overview && l.id === value ? <span className="fp-viewing">{t('Viewing')}</span> : <span className="tag tag-outline">{l.short}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Floor dropdown drawn as a cross-section of the building. With `inline`, always open. */
export default function FloorPicker({ imdf, value, onChange, route, from, to, inline = false, overview = false }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (inline) return <Panel imdf={imdf} value={value} onChange={onChange} route={route} from={from} to={to} inline listId={listId} overview={overview} />;
  const current = imdf.levelById.get(value);
  const role = levelRoles(imdf, route, from, to).get(value)?.role;
  const badge = t({ start: 'You are here', dest: 'Destination', both: 'Your route', pass: 'On your route', change: 'On your route' }[role]);
  return (
    <div className="fp" ref={ref}>
      <button type="button" className="fp-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        <Icon name="layers" strokeWidth={2.4} />
        <span className="fp-trigger-text">
          <strong>{overview ? t('Whole building') : t(current.name)}</strong>
          {overview ? <small>{t('{n} floors · choose one', { n: imdf.levels.length })}</small> : badge && <small>{badge}</small>}
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} strokeWidth={2.6} />
      </button>
      {open && (
        <Panel
          imdf={imdf}
          value={value}
          route={route}
          from={from}
          to={to}
          listId={listId}
          overview={overview}
          onChange={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
