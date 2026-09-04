/**
 * Archive routes: paths under /line/* are served by this Pages Function.
 * Each archive page is server-rendered at request time from the collector
 * Worker (dynamic data) — see src/lib/archive-http.ts for the dispatch +
 * render logic and src/lib/archive.ts for the pure renderers.
 *
 * Bounded to /line/* by the URL matching inside handleArchiveRequest, not by
 * _routes.json — that file is include "/*", so this Function runs on every
 * request (audit5 M9). A path outside the archive namespace returns a clean
 * 404 instead of the SPA shell, and so does an unknown line (audit6 H1): the
 * collector answers 200 with an empty archive for any string, so the route
 * checks the canonical and discovered sets itself before rendering.
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
