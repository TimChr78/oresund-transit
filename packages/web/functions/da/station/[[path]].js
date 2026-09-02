/**
 * Danish station routes: /da/station/{slug}.
 *
 * The per-station page is the one archive family that localizes (audit3 C1) —
 * station queries are entity + intent ("kastrup afgange"), so the
 * page a Danish searcher lands on must be in Danish. Same dispatch as the
 * English station Function: handleArchiveRequest strips the /da prefix, renders
 * in Danish and points canonical/hreflang/sibling links at the /da routes.
 * Unknown stations still return a clean 404 (the collector 404s).
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
