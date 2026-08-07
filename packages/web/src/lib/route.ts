/** Client-side routes of the static site (no router library — path check only). */
export type Route = 'dashboard' | 'privacy';

/**
 * Map a `location.pathname` to a route. `/privacy` and `/privacy/` render the
 * privacy page; everything else (including `/`, `/index.html`, unknown paths)
 * stays on the dashboard. The language is client-side (localStorage), so every
 * language shares the same URL.
 */
export function routePath(pathname: string): Route {
  return pathname === '/privacy' || pathname === '/privacy/' ? 'privacy' : 'dashboard';
}
