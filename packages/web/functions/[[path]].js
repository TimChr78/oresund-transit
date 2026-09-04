/**
 * Soft-404 catch-all.
 *
 * Unknown routes currently fall through the SPA shell (`/* → /index.html 200`
 * in _redirects) and answer 200 with homepage content — Google treats that as
 * a soft-404. This root catch-all answers a real 404 for paths that are
 * neither a real static asset nor a known prerendered page. Cloudflare routes
 * a request to the most specific Function — the archive routes (/line/*,
 * /station/*, /history/*) and the assets/sitemap/feed Functions win by URL
 * specificity and never reach here — while _routes.json (include "/*") only
 * decides that SOME Function runs on every request (audit5 M9).
 *
 * Determination is done through the ASSETS binding (which serves pretty paths
 * and applies header/redirect rules — see the assets Function for the same
 * pattern): a real asset (JS/CSS/PNG/XML/TXT…) returns a non-HTML content-type
 * and is passed through untouched; /, /methodology and /privacy (and their
 * localized /sv/ and /da/ variants) are the known HTML pages the SPA
 * legitimately serves, so those pass through too. Anything
 * else that comes back as 404, or as HTML for a path we don't own (the SPA
 * fallback), is an unknown path → a minimal branded 404 with `noindex` so it
 * never gets indexed or mistaken for the homepage. A 3xx from ASSETS (e.g. the
 * extension-less /index.html → / redirect) also passes through.
 *
 * The page localizes from the URL prefix: a /sv/… unknown path renders Swedish
 * copy and links its own twins (/sv/, /sv/history). /line and /station have no
 * localized twins, so those two anchors are annotated as English.
 */
import { STATIC_PAGE_PATHS } from '../src/lib/static-pages';
import { notFoundPageResponse, renderNotFoundPage } from '../src/lib/http-errors';

const SPA_PAGES = new Set(['/index.html', ...STATIC_PAGE_PATHS]);

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  const asset = await context.env.ASSETS.fetch(context.request);
  const contentType = (asset.headers.get('content-type') || '').toLowerCase();
  const isSpaFallback = asset.status === 404 || (contentType.includes('text/html') && !SPA_PAGES.has(pathname));
  if (isSpaFallback) {
    // audit5 H5: this was the one HTML response in the tree with no CSP and no
    // X-Frame-Options — framable and HSTS-free on the paths bots probe first.
    return notFoundPageResponse(pathname);
  }
  return asset;
}
