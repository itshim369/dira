import { Icon } from './Icons.jsx';
import { href } from '../lib.js';
import { useT } from '../prefs.js';

// The views of one venue, as tabs: directions on the map, the written steps, the walk in first
// person and the blueprint of every floor. The chosen route travels with you between them.
const TABS = [
  ['map', 'Directions', 'pin', ''],
  ['steps', 'Steps', 'flag', '/steps'],
  ['walk', 'Walk view', 'walk', '/walk'],
  ['blueprint', 'Blueprint', 'cube', '/blueprint'],
];

export default function VenueNav({ venue, current, from, to, mode }) {
  const t = useT();
  const hasRoute = !!(from && to);
  return (
    <nav className="venue-nav" aria-label={t('Views of this venue')}>
      {TABS.map(([id, label, icon, path]) => {
        const needsRoute = id === 'steps' || id === 'walk';
        const off = needsRoute && !hasRoute;
        return (
          <a
            key={id}
            className={`venue-tab${current === id ? ' is-on' : ''}${off ? ' is-off' : ''}`}
            href={off ? undefined : href(`/venue/${venue.id}${path}`, { from, to, mode: mode === 'fastest' ? undefined : mode })}
            aria-current={current === id ? 'page' : undefined}
            aria-disabled={off || undefined}
            title={off ? t('Choose where you are and where you are going first') : undefined}
          >
            <Icon name={icon} />
            <span>{t(label)}</span>
          </a>
        );
      })}
    </nav>
  );
}
