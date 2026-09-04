/**
 * Soft-404 catch-all.
 *
 * Unknown routes currently fall through the SPA shell (`/* → /index.html 200`
 * in _redirects) and answer 200 with homepage content — Google treats that as
 * a soft-404. This root catch-all, scoped via "/*" in _routes.json, intercepts
 * any path not claimed by a more-specific Function (the archive routes
 * /line/*, /station/*, /history/* and the assets/sitemap/feed Functions win by
 * route specificity and never reach here) and answers a real 404 for paths
 * that are neither a real static asset nor a known prerendered page.
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
import { localizedPath } from '../src/lib/seo';
import { notFoundResponse } from '../src/lib/http-errors';

const SPA_PAGES = new Set(['/index.html', ...STATIC_PAGE_PATHS]);

const NOT_FOUND_I18N = {
  en: { h1: 'Page not found', body: 'The page you\u2019re looking for doesn\u2019t exist or has moved.', nav: 'Site sections', home: 'Live board', history: 'Disruption history', lines: 'Line archives', stations: 'Station archives' },
  sv: { h1: 'Sidan hittades inte', body: 'Sidan du letar efter finns inte eller har flyttats.', nav: 'Webbplatsavdelningar', home: 'Livetavla', history: 'St\u00f6rningshistorik', lines: 'Linjearkiv', stations: 'Stationsarkiv' },
  da: { h1: 'Side ikke fundet', body: 'Siden du leder efter findes ikke eller er flyttet.', nav: 'Sektioner p\u00e5 webstedet', home: 'Live-tavle', history: 'Forstyrrelseshistorik', lines: 'Linjearkiv', stations: 'Stationsarkiver' },
};

function notFoundHtml(pathname) {
  const lang = pathname.startsWith('/sv/') ? 'sv' : pathname.startsWith('/da/') ? 'da' : 'en';
  const t = NOT_FOUND_I18N[lang];
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t.h1} — Øresund.live</title>
    <meta name="robots" content="noindex" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0c10; color: #e7eaf0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.55; }
      main { max-width: 560px; padding: 2rem 1.25rem; text-align: center; }
      h1 { font-size: 1.5rem; margin: 0 0 .4rem; }
      p { color: #8b93a7; margin: 0 0 1.4rem; }
      .brand { color: #10b981; font-weight: 700; font-size: .95rem; text-decoration: none; letter-spacing: .02em; display: inline-block; margin-bottom: 1.6rem; }
      nav { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem 1.1rem; font-size: .9rem; }
      nav a { color: #9fc9ff; text-decoration: none; }
      nav a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <a class="brand" href="${localizedPath('/', lang)}">Øresund.live</a>
      <h1>${t.h1}</h1>
      <p>${t.body}</p>
      <nav aria-label="${t.nav}">
        <a href="${localizedPath('/', lang)}">${t.home}</a>
        <a href="${localizedPath('/history', lang)}">${t.history}</a>
        <a href="/line" lang="en" hreflang="en">${t.lines}</a>
        <a href="/station" lang="en" hreflang="en">${t.stations}</a>
      </nav>
    </main>
  </body>
</html>`;
}

const NOT_FOUND_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  const asset = await context.env.ASSETS.fetch(context.request);
  const contentType = (asset.headers.get('content-type') || '').toLowerCase();
  const isSpaFallback = asset.status === 404 || (contentType.includes('text/html') && !SPA_PAGES.has(pathname));
  if (isSpaFallback) {
    // audit5 H5: this was the one HTML response in the tree with no CSP and no
    // X-Frame-Options — framable and HSTS-free on the paths bots probe first.
    return notFoundResponse(notFoundHtml(pathname), NOT_FOUND_HEADERS);
  }
  return asset;
}
