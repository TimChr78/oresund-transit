/**
 * Swedish history hub: /sv/history.
 *
 * The aggregate hub is, with the per-station pages, the one archive family
 * that localizes (audit3 C1) — "störningshistorik" is a head term a Swedish
 * searcher lands on, so the page they land on must be Swedish. Same dispatch
 * as the English history Function: handleArchiveRequest strips the /sv prefix,
 * renders in Swedish and points canonical/hreflang/sibling links at the /sv
 * route. The window pages /sv/history/{7|14|30|90} have no localized twins and
 * still answer 404 here.
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
