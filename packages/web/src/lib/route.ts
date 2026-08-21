import type { Lang } from '../i18n';

/** Client-side routes of the static site (no router library — path check only). */
export type Route = 'dashboard' | 'privacy' | 'methodology';

/** The language prefix of a localized static path, or null for unprefixed (en) routes. */
export function langFromPath(pathname: string): Lang | null {
  if (pathname.startsWith('/sv/')) return 'sv';
  if (pathname.startsWith('/da/')) return 'da';
  return null;
}

/**
 * Map a `location.pathname` to a route. `/privacy` (and `/privacy/`) and
 * `/methodology` (and `/methodology/`) render their static pages; everything
 * else (including `/`, `/index.html`, unknown paths) stays on the dashboard.
 * The localized /sv/* and /da/* paths map to the same page (the language is
 * read separately via `langFromPath`); unknown paths stay on the dashboard.
 */
export function routePath(pathname: string): Route {
  const stripped = langFromPath(pathname) ? pathname.slice(3) : pathname;
  if (stripped === '/privacy' || stripped === '/privacy/') return 'privacy';
  if (stripped === '/methodology' || stripped === '/methodology/') return 'methodology';
  return 'dashboard';
}
