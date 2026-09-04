/**
 * Swedish history hub: /sv/history.
 *
 * The aggregate hub is, with the per-station pages, the one archive family
 * that localizes (audit3 C1) — "störningshistorik" is a head term a Swedish
 * searcher lands on, so the page they land on must be Swedish. Same dispatch
 * as the English history Function: handleArchiveRequest strips the /sv prefix,
 * renders in Swedish and points canonical/hreflang/sibling links at the /sv
 * route. The window pages /sv/history/{7|14|30|90} have no localized twins and
 * still answer 404 here — the branded Swedish page, not a bare text line
 * (audit6 M13): this Function claims the whole /sv/history prefix, so its 404
 * is the page a Swedish reader actually sees.
 */
import { handleArchiveRequest } from '../../../src/lib/archive-http';
import { notFoundPageResponse } from '../../../src/lib/http-errors';

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
