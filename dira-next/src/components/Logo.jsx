// Dira logo, drawn from the supplied SVG files (images/dira-logo-*.svg).
// The pin's hollow centre is a real hole (evenodd), so it works on any background.

const TRAIL = 'M12 108 C 40 108 36 84 60 90 S 80 92 90 88';
const PIN =
  'M92 10c-17 0-30 13-30 30 0 22 30 46 30 46s30-24 30-46c0-17-13-30-30-30z M81 40a11 11 0 1 0 22 0a11 11 0 1 0 -22 0z';
const WORDMARK =
  'M79.92 -135.0Q103.86 -135.0 121.95 -126.63Q140.04 -118.26 150.03 -103.05Q160.02 -87.84 160.02 -67.5Q160.02 -47.16 150.03 -31.95Q140.04 -16.74 121.95 -8.37Q103.86 0.0 79.92 0.0H12.6V-135.0ZM49.68 -33.12H82.8Q94.86 -33.12 103.77 -37.35Q112.68 -41.58 117.54 -49.32Q122.4 -57.06 122.4 -67.5Q122.4 -78.12 117.54 -85.77Q112.68 -93.42 103.77 -97.65Q94.86 -101.88 82.8 -101.88H49.68Z M173.16 -104.4 191.7 -100.8 210.06 -104.4V0.0H173.16ZM191.52 -112.86Q181.98 -112.86 176.04 -117.63Q170.1 -122.4 170.1 -130.68Q170.1 -138.78 176.04 -143.64Q181.98 -148.5 191.52 -148.5Q201.42 -148.5 207.27 -143.64Q213.12 -138.78 213.12 -130.68Q213.12 -122.4 207.27 -117.63Q201.42 -112.86 191.52 -112.86Z M221.76 -102.78H259.2L263.7 -75.42Q266.4 -83.16 270.54 -89.46Q275.4 -97.02 282.78 -101.43Q290.16 -105.84 300.78 -105.84Q303.84 -105.84 307.08 -105.48Q310.32 -105.12 313.56 -104.4V-73.08Q308.16 -74.16 303.39 -74.61Q298.62 -75.06 294.66 -75.06Q286.74 -75.06 280.08 -71.91Q273.42 -68.76 269.37 -61.56Q265.32 -54.36 265.32 -42.3V0.0H228.6V-68.22Z M415.44 0.0 412.74 -20.88Q405.72 -10.08 395.28 -3.96Q383.76 2.88 369.18 2.88Q354.06 2.88 342.63 -3.87Q331.2 -10.62 324.72 -22.95Q318.24 -35.28 318.24 -51.3Q318.24 -67.68 324.72 -79.92Q331.2 -92.16 342.63 -99.0Q354.06 -105.84 369.18 -105.84Q383.76 -105.84 395.28 -99.18Q405.72 -92.88 412.92 -82.26L415.44 -102.78H453.6L447.12 -51.48L453.6 0.0ZM355.5 -51.3Q355.5 -43.74 358.65 -37.8Q361.8 -31.86 367.38 -28.53Q372.96 -25.2 380.16 -25.2Q387.72 -25.2 394.38 -28.53Q401.04 -31.86 406.08 -37.8Q411.12 -43.74 413.64 -51.3Q411.12 -59.04 406.08 -64.98Q401.04 -70.92 394.38 -74.34Q387.72 -77.76 380.16 -77.76Q372.96 -77.76 367.38 -74.34Q361.8 -70.92 358.65 -64.98Q355.5 -59.04 355.5 -51.3Z';

// Colours follow the theme (light and dark mode) through the CSS tokens.
const TONES = {
  light: { trail: 'var(--espresso)', word: 'var(--espresso)' },
  espresso: { trail: 'var(--sand)', word: 'var(--cream)' },
};

function MarkParts({ tone }) {
  const c = TONES[tone];
  return (
    <>
      <path d={TRAIL} fill="none" stroke={c.trail} strokeWidth="6" strokeLinecap="round" strokeDasharray="0.1 12" />
      <circle cx="12" cy="108" r="7" fill={c.trail} />
      <path d={PIN} fill="#C8553D" fillRule="evenodd" />
    </>
  );
}

/** The pin and trail on their own. */
export function LogoMark({ tone = 'light', className, size = 34 }) {
  return (
    <svg className={className} viewBox="2 4 124 114" width={size} height={size} aria-hidden="true">
      <MarkParts tone={tone} />
    </svg>
  );
}

/** Mark and wordmark side by side, for headers. */
export function Logo({ tone = 'light', height = 34, label = 'Dira' }) {
  const c = TONES[tone];
  return (
    <svg viewBox="0 0 640 160" height={height} width={(height * 640) / 160} role="img" aria-label={label}>
      <g transform="translate(0 2) scale(1.3)">
        <MarkParts tone={tone} />
      </g>
      <path d={WORDMARK} fill={c.word} transform="translate(178 152) scale(0.98)" />
    </svg>
  );
}

/** Wordmark only, for the footer. */
export function Wordmark({ tone = 'light', height = 20 }) {
  return (
    <svg viewBox="8 -152 450 158" height={height} width={(height * 450) / 158} role="img" aria-label="Dira">
      <path d={WORDMARK} fill={TONES[tone].word} />
    </svg>
  );
}

/** The full stacked logo, for feature sections. */
export function LogoStacked({ tone = 'espresso', className }) {
  return (
    <svg className={className} viewBox="170 56 465 475" role="img" aria-label="Dira">
      <g transform="translate(218 40) scale(2.6)">
        <MarkParts tone={tone} />
      </g>
      <path d={WORDMARK} fill={TONES[tone].word} transform="translate(169.42 521.6)" />
    </svg>
  );
}
