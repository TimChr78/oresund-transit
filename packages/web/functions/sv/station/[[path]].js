/**
 * Swedish station routes: /sv/station/{slug}.
 *
 * The per-station page is the one archive family that localizes (audit3 C1) —
 * station queries are entity + intent ("hyllie station avgångar"), so the
 * page a Swedish searcher lands on must be in Swedish. Same dispatch as the
 * English station Function: handleArchiveRequest strips the /sv prefix, renders
 * in Swedish and points canonical/hreflang/sibling links at the /sv routes.
 * Unknown stations answer the branded Swedish 404 (audit6 L10) — this twin
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
