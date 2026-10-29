import { useSyncExternalStore } from 'react';
import { tr } from './prefs.js';

// ---------- Hash router ----------
// Routes: #/  #/venues  #/venue/:id?from=&to=&mode=&floor=  #/venue/:id/steps?...

function readHash() {
  const raw = window.location.hash.slice(1) || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', params: Object.fromEntries(new URLSearchParams(qs)) };
}

let current = readHash();
const listeners = new Set();
window.addEventListener('hashchange', () => {
  const prevPath = current.path;
  current = readHash();
  if (prevPath !== current.path) window.scrollTo(0, 0);
  listeners.forEach((l) => l());
});

export function useHashRoute() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function href(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(path, params = {}, { replace = false } = {}) {
  const next = href(path, params);
  if (replace) {
    window.history.replaceState(null, '', next);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = next.slice(1);
  }
}

// ---------- Device storage (per-viewer conveniences only) ----------
export const store = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(`dira-next:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(`dira-next:${key}`, JSON.stringify(value));
    } catch {
      /* storage blocked: nothing to do */
    }
  },
};

export const isPhone = () => window.matchMedia('(max-width: 959px)').matches;

export function formatMinutes(seconds) {
  return tr('{n} min', { n: Math.max(1, Math.round(seconds / 60)) });
}

export function roundMetres(m) {
  return Math.max(5, Math.round(m / 5) * 5);
}
