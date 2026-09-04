/**
 * Deploy-race protection for /assets/*.
 *
 * Pages serves static assets directly, but our SPA fallback (`/* → /index.html 200`
 * in _redirects) means a *missing* hashed asset would otherwise return index.html
 * with a 200 — and the custom domain caches that HTML under the asset's URL for
 * hours. During a deploy there is a window where the new index.html references a
 * hashed JS/CSS file that has not propagated yet; a visitor in that window would
 * fetch HTML for the JS URL and get a blank page.
 *
 * Selected for /assets/* by Pages' file-based routing — this file's directory,
 * not _routes.json. That file is include "/*", so every request enters
 * Functions processing and routing picks the Function whose path matches;
 * whatever the request is, this one only ever sees /assets/* (audit5 M9). The
 * content-type check is not the scoping mechanism: it runs after that
 * selection and decides whether what came back is a real asset or the SPA
 * fallback. The Function re-fetches the requested asset through the ASSETS
 * binding — the fetch that also applies public/_headers to the response, which
 * is why the returned asset carries the security set: a real asset returns its actual content-type
 * (application/javascript / text/css) and is passed through untouched; a missing
 * asset either 404s directly or falls through the SPA fallback as text/html —
 * both are treated as "not a real asset" and answered with a clean 404.
 */
import { notFoundResponse } from '../../src/lib/http-errors';

export async function onRequest(context) {
  const asset = await context.env.ASSETS.fetch(context.request);
  const contentType = (asset.headers.get('content-type') || '').toLowerCase();
  const isSpaFallback = asset.status === 404 || contentType.includes('text/html');
  if (isSpaFallback) {
    return notFoundResponse('Not found', {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
  }
  return asset;
}
