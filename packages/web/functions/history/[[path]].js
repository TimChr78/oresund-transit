/**
 * Archive routes: paths under /history/* are served by this Pages Function.
 * Each archive page is server-rendered at request time from the collector
 * Worker (dynamic data) — see src/lib/archive-http.ts for the dispatch +
 * render logic and src/lib/archive.ts for the pure renderers.
 *
 * /history is the aggregate hub — the whole corridor's numbers for the default
 * 30-day window, plus the links into every window, station and line archive;
 * the {days} pages carry the day-by-day tables.
 *
 * NOT scoped by _routes.json, whatever the old comment claimed (audit5 M9):
 * public/_routes.json is include "/*", so this Function runs on every request.
 * What bounds it to /history/* is the URL matching inside handleArchiveRequest —
 * anything else falls through to its 404 — and static files are re-fetched
 * through env.ASSETS.fetch(), which is where Cloudflare applies _headers.
 */
import { handleArchiveRequest } from '../../src/lib/archive-http';
import { notFoundPageResponse } from '../../src/lib/http-errors';

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  const result = await handleArchiveRequest(
    pathname,
    undefined,
    // Passed through for the branded 502 page (audit4 N-H4): an unprefixed
    // route negotiates its error-page language, a /sv or /da route keeps its own.
    context.request.headers.get('accept-language'),
  );
  if (result) {
    return result;
  }
  return notFoundPageResponse(pathname);
}
