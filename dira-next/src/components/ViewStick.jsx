import { useEffect, useRef, useState } from 'react';
import { tr } from '../prefs.js';

const RADIUS = 34; // how far the knob travels, px
const SPIN = 120; // degrees a second at full left or right
const TILT = 60; // degrees a second at full up or down

/**
 * A thumb stick for the map's camera. Push left or right to turn the map, up or down to tilt
 * between flat 2D and full 3D; the further the push, the faster. A quick tap without moving
 * returns to the default angle. Arrow keys do the same in steps.
 */
export default function ViewStick({ mapRef, maxPitch, home, onTilt, className = '' }) {
  const [knob, setKnob] = useState([0, 0]);
  const drag = useRef(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const apply = (dBearing, dPitch) => {
    const map = mapRef.current;
    if (!map) return;
    const pitch = Math.max(0, Math.min(maxPitch, map.getPitch() + dPitch));
    map.jumpTo({ bearing: map.getBearing() + dBearing, pitch });
    onTilt?.(pitch);
  };

  const loop = (prev) => (now) => {
    const d = drag.current;
    if (!d) return;
    const dt = Math.min(0.05, (now - prev) / 1000);
    const [x, y] = d.vec;
    apply((x / RADIUS) * SPIN * dt, (-y / RADIUS) * TILT * dt);
    raf.current = requestAnimationFrame(loop(now));
  };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    let x = e.clientX - d.cx;
    let y = e.clientY - d.cy;
    const len = Math.hypot(x, y);
    if (len > RADIUS) {
      x = (x / len) * RADIUS;
      y = (y / len) * RADIUS;
    }
    if (len > 4) d.moved = true;
    d.vec = [x, y];
    setKnob([x, y]);
  };

  const start = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, vec: [0, 0], moved: false };
    move(e);
    raf.current = requestAnimationFrame(loop(performance.now()));
  };

  const end = () => {
    const d = drag.current;
    drag.current = null;
    cancelAnimationFrame(raf.current);
    setKnob([0, 0]);
    if (d && !d.moved) {
      mapRef.current?.easeTo({ ...home, duration: 600 });
      onTilt?.(home.pitch);
    }
  };

  const onKey = (e) => {
    const step = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }[e.key];
    if (!step) return;
    e.preventDefault();
    apply(step[0], step[1]);
  };

  return (
    <div
      className={`view-stick ${className}`}
      role="slider"
      tabIndex={0}
      aria-label={tr('Turn and tilt the map')}
      aria-valuetext={tr('Drag to turn and tilt')}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKey}
    >
      <span className="view-stick-arrows" aria-hidden="true">
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <path d="M50 8l7 9H43zM50 92l-7-9h14zM8 50l9-7v14zM92 50l-9 7V43z" fill="currentColor" />
        </svg>
      </span>
      <span className="view-stick-knob" style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} aria-hidden="true" />
    </div>
  );
}
