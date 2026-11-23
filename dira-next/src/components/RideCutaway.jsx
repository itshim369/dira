import { useT } from '../prefs.js';

// The building in cross-section while you ride between floors: every floor as a slab, the floors
// of the ride marked, and the lift car (or escalator step) carrying you from one to the other.
const NAME = { elevator: 'Lift', escalator: 'Escalator', stairs: 'Stairs' };

export default function RideCutaway({ imdf, kind, fromLevelId, toLevelId }) {
  const t = useT();
  const levels = [...imdf.levels].sort((a, b) => b.ordinal - a.ordinal);
  const row = 26;
  const H = levels.length * row + 20;
  const y = (id) => 10 + levels.findIndex((l) => l.id === id) * row + row / 2;
  const y0 = y(fromLevelId);
  const y1 = y(toLevelId);
  const up = y1 < y0;
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  const shaftX = kind === 'elevator' ? 150 : 120;
  return (
    <div className="ride-cut" role="status" aria-live="polite">
      <span className="ride-cut-title">
        {up ? '▲' : '▼'} {t(NAME[kind] || 'Lift')} · {t(imdf.levelById.get(toLevelId).name)}
      </span>
      <svg viewBox={`0 0 240 ${H}`} width="240" height={H} aria-hidden="true">
        {levels.map((l) => {
          const yy = y(l.id);
          const on = l.id === fromLevelId || l.id === toLevelId;
          const inRide = yy >= lo && yy <= hi;
          return (
            <g key={l.id}>
              <rect x="40" y={yy + 7} width="190" height="4" rx="2" className={on ? 'slab is-on' : inRide ? 'slab is-ride' : 'slab'} />
              <text x="30" y={yy + 11} textAnchor="end" className={on ? 'lab is-on' : 'lab'}>
                {l.short}
              </text>
            </g>
          );
        })}
        {kind === 'elevator' ? (
          <>
            <rect x={shaftX - 9} y={lo - 4} width="18" height={hi - lo + 16} className="shaft" />
            <rect x={shaftX - 7} width="14" height="16" rx="2" className="car" style={{ '--y0': `${y0 - 7}px`, '--y1': `${y1 - 7}px` }} />
          </>
        ) : (
          <>
            <line x1={up ? 70 : 200} y1={y0 + 8} x2={up ? 200 : 70} y2={y1 + 8} className="incline" />
            <circle r="7" className="car" style={{ '--x0': `${up ? 70 : 200}px`, '--x1': `${up ? 200 : 70}px`, '--y0': `${y0 + 1}px`, '--y1': `${y1 + 1}px` }} />
          </>
        )}
      </svg>
    </div>
  );
}
