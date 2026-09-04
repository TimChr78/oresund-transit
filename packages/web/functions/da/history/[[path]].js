/**
 * Danish history hub: /da/history.
 *
 * The aggregate hub is, with the per-station pages, the one archive family
 * that localizes (audit3 C1) — "forstyrrelleshistorik" is a head term a Danish
 * searcher lands on, so the page they land on must be Danish. Same dispatch
 * as the English history Function: handleArchiveRequest strips the /da prefix,
 * renders in Danish and points canonical/hreflang/sibling links at the /da
 * route. The window pages /da/history/{7|14|30|90} have no localized twins and
 * still answer 404 here.
 */
import { handleArchiveRequest } from '../../../src/lib/archive-http';
import { notFoundResponse } from '../../../src/lib/http-errors';

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
  return notFoundResponse('Side ikke fundet', { 'Content-Type': 'text/plain; charset=utf-8' });
}
