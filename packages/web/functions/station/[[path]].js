/**
 * Archive routes: paths under /station/* are served by this Pages Function.
 * Each archive page is server-rendered at request time from the collector
 * Worker (dynamic data) — see src/lib/archive-http.ts for the dispatch +
 * render logic and src/lib/archive.ts for the pure renderers.
 *
 * Scoped to /station/* via _routes.json so every other route stays on the
 * free static tier. Unknown stations return a clean 404 (the collector 404s).
 */
import { handleArchiveRequest } from '../../src/lib/archive-http';

export async function onRequest(context) {
  const result = await handleArchiveRequest(new URL(context.request.url).pathname);
  if (result) {
    return result;
  }
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
