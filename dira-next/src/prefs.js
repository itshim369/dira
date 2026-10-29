import { useSyncExternalStore } from 'react';
import sw from './i18n/sw.js';
import fr from './i18n/fr.js';

// Viewer preferences: colour theme and language. Both are remembered on this device (a
// convenience only: storage can be blocked, so everything works without it). The theme
// follows the phone's setting until the viewer picks one; index.html applies it before paint.

export const LANGUAGES = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'sw', label: 'Kiswahili', short: 'SW' },
  { id: 'fr', label: 'Français', short: 'FR' },
];
const DICTIONARIES = { sw, fr };

const read = (key) => {
  try {
    return inBrowser ? window.localStorage.getItem(`dira:${key}`) : null;
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    window.localStorage.setItem(`dira:${key}`, value);
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
};

const inBrowser = typeof window !== 'undefined';
const systemDark = () => inBrowser && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const browserLang = () => {
  const l = ((typeof navigator !== 'undefined' && navigator.language) || 'en').slice(0, 2);
  return LANGUAGES.some((x) => x.id === l) ? l : 'en';
};

let state = {
  theme: read('theme') === 'dark' || read('theme') === 'light' ? read('theme') : systemDark() ? 'dark' : 'light',
  themeChosen: !!read('theme'),
  lang: LANGUAGES.some((x) => x.id === read('lang')) ? read('lang') : browserLang(),
};
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

function apply() {
  if (!inBrowser) return;
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  root.lang = state.lang === 'sw' ? 'sw-KE' : state.lang === 'fr' ? 'fr' : 'en-KE';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme === 'dark' ? '#1C120D' : '#FAF3EC');
}
apply();

// Follow the phone's setting while the viewer has not chosen.
if (inBrowser) window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
  if (state.themeChosen) return;
  state = { ...state, theme: e.matches ? 'dark' : 'light' };
  apply();
  emit();
});

export function setTheme(theme) {
  state = { ...state, theme, themeChosen: true };
  write('theme', theme);
  apply();
  emit();
}

export function setLang(lang) {
  state = { ...state, lang };
  write('lang', lang);
  apply();
  emit();
}

export function usePrefs() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** Translate an English string. `{name}` placeholders take values from `vars`; a string
 * with no translation stays in English. */
export function tr(text, vars) {
  if (text == null) return text;
  const dict = DICTIONARIES[state.lang];
  let out = (dict && dict[text]) || text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}

/** In components: re-renders when the language changes. */
export function useT() {
  usePrefs();
  return tr;
}

export const currentLang = () => state.lang;
