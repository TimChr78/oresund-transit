/**
 * Swedish station routes: /sv/station/{slug}.
 *
 * The per-station page is the one archive family that localizes (audit3 C1) —
 * station queries are entity + intent ("hyllie station avgångar"), so the
 * page a Swedish searcher lands on must be in Swedish. Same dispatch as the
 * English station Function: handleArchiveRequest strips the /sv prefix, renders
 * in Swedish and points canonical/hreflang/sibling links at the /sv routes.
 * Unknown stations still return a clean 404 (the collector 404s).
 */
import { handleArchiveRequest } from '../../../src/lib/archive-http';

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
