import { useEffect, useState } from 'react';
import { loadImdf } from '@imdf/imdf.js';
import { createRouter } from '@imdf/route.js';

// One load per venue per session: the IMDF archive, card content and a router built on them.
const cache = new Map();

export function loadVenue(venue) {
  if (!cache.has(venue.id)) {
    const p = loadImdf(`${venue.base}imdf/`, `${venue.base}content/places.json`).then((imdf) => {
      // Card photos are stored relative to the venue folder.
      for (const poi of imdf.pois) {
        const photo = poi.content?.photo;
        if (photo && !photo.src.startsWith('http') && !photo.src.startsWith('./venues')) photo.src = venue.base + photo.src;
      }
      if (imdf.venueContent?.photo) imdf.venueContent.photo.src = venue.base + imdf.venueContent.photo.src;
      return { imdf, router: createRouter(imdf) };
    });
    p.catch(() => cache.delete(venue.id));
    cache.set(venue.id, p);
  }
  return cache.get(venue.id);
}

export function useVenueData(venue) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    if (!venue || venue.status !== 'live') return undefined;
    let alive = true;
    loadVenue(venue).then(
      (data) => alive && setState({ data, error: null }),
      (e) => alive && setState({ data: null, error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [venue]);
  return state;
}

/** Find a place by id, or by exact name as a fallback (used for default routes). */
export function findPoi(imdf, key) {
  if (!key) return null;
  return imdf.pois.find((p) => p.id === key) || imdf.pois.find((p) => p.name === key) || null;
}
