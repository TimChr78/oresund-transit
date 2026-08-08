/** Client-side routes of the static site (no router library — path check only). */
export type Route = 'dashboard' | 'privacy' | 'methodology';

/**
 * Map a `location.pathname` to a route. `/privacy` (and `/privacy/`) and
 * `/methodology` (and `/methodology/`) render their static pages; everything
 * else (including `/`, `/index.html`, unknown paths) stays on the dashboard.
 * The language is client-side (localStorage), so every language shares the
 * same URL.
 */
export function routePath(pathname: string): Route {
  if (pathname === '/privacy' || pathname === '/privacy/') return 'privacy';
  if (pathname === '/methodology' || pathname === '/methodology/') return 'methodology';
  return 'dashboard';
}
