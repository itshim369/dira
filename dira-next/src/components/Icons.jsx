// Line-drawn icons, 24px grid, stroke uses currentColor.

const paths = {
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  swap: <path d="M8 4v16m0-16L4 8m4-4 4 4m4 12V4m0 16-4-4m4 4 4-4" />,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  wifiOff: <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.7-1.9M2 9.5a15 15 0 0 1 4.3-2.8M22 9.5A15 15 0 0 0 11 5.3M12 20h.01" />,
  escalator: <path d="M3 18h4.5L16 7h5" />,
  lift: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="m9 10 3-3 3 3m-6 4 3 3 3-3" />
    </>
  ),
  stairs: <path d="M3 20h5v-5h5v-5h5V5h3" />,
  walkway: <path d="M4 12h16m-4-4 4 4-4 4M8 8l-4 4 4 4" />,
  turnLeft: <path d="M16 20v-7a3 3 0 0 0-3-3H6m4-4-4 4 4 4" />,
  turnRight: <path d="M8 20v-7a3 3 0 0 1 3-3h7m-4-4 4 4-4 4" />,
  uTurn: <path d="M8 20V9a4 4 0 0 1 8 0v4m-4-1 4 4 4-4" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  car: <path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v3M19 16v3M5 11h14M8 13.5h.01M16 13.5h.01" />,
  door: <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01" />,
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  building: <path d="M4 21V5l8-3 8 3v16M4 21h16M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-4h4v4" />,
  hospital: <path d="M4 21V7h16v14M2 21h20M12 10v6m-3-3h6M9 4h6v3H9z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M9 3v4m6-4v4" />
    </>
  ),
  bag: <path d="M5 8h14l-1 13H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2" />,
  food: <path d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10m10-18c-2 0-3 2.5-3 6s1.5 4 3 4v8" />,
  wc: <path d="M7 6a1.5 1.5 0 1 0 0-.01M17 6a1.5 1.5 0 1 0 0-.01M5 21v-6H4l1.5-6h3L10 15H9v6M15 9h4v6h-1v6h-2v-6h-1V9Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  sparkle: <path d="M12 4v4m0 8v4M4 12h4m8 0h4" />,
  money: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  atm: <path d="M3 5h18v11H3zM7 20h10M12 16v4M8 10.5h8" />,
  parking: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3" />
    </>
  ),
  exit: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="m9 21 2.5-7 2.5 3v4M8 11l3-3.5 3.5 1L17 12M11 7.5 9.5 13" />
    </>
  ),
  cube: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  share: <path d="M12 3v12m-4-8 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />,
  prayer: <path d="M12 3v4m-2-2h4M6 21V11l6-4 6 4v10M10 21v-5h4v5" />,
  download: <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
};

export function Icon({ name, size, className, strokeWidth = 2, title, ...rest }) {
  return (
    <svg
      {...rest}
      className={className}
      viewBox="0 0 24 24"
      width={size ?? rest.width}
      height={size ?? rest.height}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {paths[name]}
    </svg>
  );
}

const STEP_ICONS = {
  start: 'target',
  left: 'turnLeft',
  right: 'turnRight',
  around: 'uTurn',
  straight: 'arrowUp',
  walk: 'arrowUp',
  escalator: 'escalator',
  lift: 'lift',
  stairs: 'stairs',
  walkway: 'walkway',
  arrive: 'pin',
};

/** The rounded tile for a step, coloured by kind like the design review. */
export function StepTile({ kind, emphasis = false }) {
  const tone =
    kind === 'start' || kind === 'arrive'
      ? 'tile-dark'
      : ['escalator', 'lift', 'stairs', 'walkway'].includes(kind) || emphasis
        ? 'tile-accent'
        : '';
  return (
    <span className={`tile ${tone}`} style={tone ? undefined : { color: 'var(--espresso)' }}>
      <Icon name={STEP_ICONS[kind] || 'arrowUp'} />
    </span>
  );
}
