/**
 * Danish station routes: /da/station/{slug}.
 *
 * The per-station page is the one archive family that localizes (audit3 C1) —
 * station queries are entity + intent ("kastrup afgange"), so the
 * page a Danish searcher lands on must be in Danish. Same dispatch as the
 * English station Function: handleArchiveRequest strips the /da prefix, renders
 * in Danish and points canonical/hreflang/sibling links at the /da routes.
 * Unknown stations answer the branded Danish 404 (audit6 L10) — this twin
 * used to answer in English while its history siblings were localized.
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
