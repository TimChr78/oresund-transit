/**
 * Archive routes: paths under /station/* are served by this Pages Function.
 * Each archive page is server-rendered at request time from the collector
 * Worker (dynamic data) — see src/lib/archive-http.ts for the dispatch +
 * render logic and src/lib/archive.ts for the pure renderers.
 *
 * This file serves the English (unprefixed) station pages; the localized twins
 * live in functions/{sv,da}/station/[[path]].js and render the same page in
 * Swedish and Danish (audit3 C1). Unknown stations return a clean 404 (the
 * collector 404s). Bounded to /station/* by handleArchiveRequest's URL
 * matching — _routes.json is include "/*" and scopes nothing (audit5 M9).
 */
import { handleArchiveRequest } from '../../src/lib/archive-http';
import { notFoundResponse } from '../../src/lib/http-errors';

export async function onRequest(context) {
  const result = await handleArchiveRequest(
    new URL(context.request.url).pathname,
    undefined,
    // Passed through for the branded 502 page (audit4 N-H4): an unprefixed
    // route negotiates its error-page language, a /sv or /da route keeps its own.
    context.request.headers.get('accept-language'),
  );
  if (result) {
    return result;
  }
  return notFoundResponse('Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
}
