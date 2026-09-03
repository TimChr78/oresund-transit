/**
 * Archive routes: paths under /history/* (/history, /history/{7|14|30|90})
 * are served by this Pages Function, server-rendered at request time from the
 * collector Worker (dynamic data). /history is the aggregate hub — the whole
 * corridor's numbers for the default 30-day window, plus the links into every
 * window, station and line archive; the {days} pages carry the day-by-day
 * tables. The localized twins /sv/history and /da/history are served by
 * functions/{sv,da}/history/[[path]].js. See src/lib/archive-http.ts for
 * dispatch + render logic and src/lib/archive.ts for the pure renderers.
 *
 * Scoped to /history/* via _routes.json so every other route stays on the
 * free static tier.
 */
import { handleArchiveRequest } from '../../src/lib/archive-http';

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
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
