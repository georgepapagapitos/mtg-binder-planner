import { useEffect, useState } from 'react';

/**
 * Tracks whether the viewport matches the playtest mobile layout breakpoint
 * (≤1023px). MUST agree with playtest.css's `@media (max-width: 1023px)`
 * tier: at exactly 1024px the old ≤1024 default unmounted the desktop piles
 * (JS said narrow) while the CSS still hid the Zones tab (CSS said desktop),
 * so an iPad-landscape board had no way to reach any zone.
 */
export function useNarrowViewport(maxWidth = 1023): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [maxWidth]);

  return narrow;
}
