// Venue logos on the venue cards. Their lettering takes the theme's colour, so it reads on the
// card in light and dark mode: the Sarit artwork is used as a mask over the theme colour, and
// the Nisake logo is drawn inline with its words in the theme colours.

function NisakeLogo({ label }) {
  return (
    <svg className="venue-logo nisake-logo" viewBox="0 0 520 200" role="img" aria-label={label}>
      <rect x="14" y="30" width="120" height="140" rx="22" fill="#C8553D" />
      <g fill="#FAF3EC">
        <rect x="38" y="52" width="72" height="16" rx="4" />
        <rect x="38" y="76" width="72" height="16" rx="4" />
        <rect x="38" y="100" width="72" height="16" rx="4" />
        <rect x="38" y="124" width="22" height="30" rx="4" />
        <rect x="66" y="124" width="16" height="30" rx="4" fill="#3B2418" />
        <rect x="88" y="124" width="22" height="30" rx="4" />
      </g>
      <text x="156" y="108" fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize="66" letterSpacing="2" fill="var(--cream)">
        NISAKE
      </text>
      <text x="159" y="146" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="24" letterSpacing="5.2" fill="var(--terracotta)">
        COMMERCIAL CENTRE
      </text>
    </svg>
  );
}

export default function VenueLogo({ id, src, alt, ratio = 333 / 226 }) {
  if (id === 'nisake') return <NisakeLogo label={alt} />;
  const mask = `url("${src}") center / contain no-repeat`;
  return <span className="venue-logo venue-logo-mask" role="img" aria-label={alt} style={{ aspectRatio: ratio, WebkitMask: mask, mask }} />;
}
