import { useEffect } from 'react';
import Landing from './pages/Landing.jsx';
import VenuesPage from './pages/VenuesPage.jsx';
import MapPage from './pages/MapPage.jsx';
import StepsPage from './pages/StepsPage.jsx';
import NotFound from './pages/NotFound.jsx';
import ContactPage from './pages/ContactPage.jsx';
import { getVenue } from './venues.js';
import { useHashRoute } from './lib.js';

const TITLES = { '/': 'Dira | Indoor navigation', '/venues': 'Choose a venue | Dira', '/contact': 'Book a viewing | Dira' };

export default function App() {
  const { path, params } = useHashRoute();
  const parts = path.split('/').filter(Boolean);
  const found = parts[0] === 'venue' ? getVenue(parts[1]) : null;
  const venue = found?.status === 'live' ? found : null;

  useEffect(() => {
    document.title = venue ? `${venue.name} | Dira` : TITLES[path] || 'Dira';
  }, [path, venue]);

  if (path === '/') return <Landing />;
  if (path === '/venues') return <VenuesPage />;
  if (path === '/contact') return <ContactPage />;
  if (parts[0] === 'venue' && parts.length === 2) return <MapPage key={parts[1]} venue={venue} params={params} />;
  if (parts[0] === 'venue' && parts[2] === 'steps') return <StepsPage venue={venue} params={params} />;
  return <NotFound />;
}
