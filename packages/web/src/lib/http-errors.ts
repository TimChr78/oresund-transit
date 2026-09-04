/**
 * Error responses the Pages Functions answer with, and the security header set
 * they must all carry.
 *
 * Two problems live here:
 *
 * N-C2 (audit4) — Cloudflare applies public/_headers only to files it serves
 * from dist/, never to a Function's Response. Every URL a Function renders
 * therefore shipped with no HSTS, CSP, nosniff, frame or referrer policy at
 * all. SECURITY_HEADERS is the same set the _headers file applies, built once
 * here and merged into every error response this module builds;
 * test/security-headers.test.ts asserts the file and this object never drift.
 * The archive routes' 200 and 502 responses merge it too (archive-http.ts), and
 * every 404 goes through notFoundResponse() below. There is no 301 in the tree
 * to worry about: the /history → /history/30 redirect that comment used to
 * describe was removed when the hub became a real page (audit4).
 *
 * N-H4 (audit4) — a collector outage used to answer every archive route with
 * a bare `502 text/plain` line. That is correct HTTP but a dead end for the
 * reader: no branding, no hint that it is usually brief, and no way back.
 * serviceUnavailableResponse() renders the branded, localized page instead.
 * The status code is unchanged — crawlers and feed readers still see 502 —
 * only the body became something a human can act on.
 */
import { esc } from './html';
import { BRAND_NAME, translate, type Lang } from '../i18n';
import { localizedPath } from './seo';

/**
 * The security header set public/_headers applies to static assets. Exported
 * so the test suite can prove the file and this object stay in sync.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://analytics.martechsignal.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://analytics.martechsignal.com; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

/** Merge the security set under a response's own headers. */
export function withSecurityHeaders(headers: Record<string, string>): Record<string, string> {
  return { ...SECURITY_HEADERS, ...headers };
}

/**
 * A 404 carrying the full security set (audit5 H5). Every 404 the site emits
 * goes through here: before, the nine Functions that answer "not found" built
 * their own `new Response(...)` with a bare Content-Type, so the HTML 404 was
 * framable and HSTS-free on exactly the paths bots probe first, and the XML
 * responses flip-flopped between protected and unprotected depending on which
 * branch of their own code answered.
 *
 * `headers` carries whatever the caller adds of its own — content type, cache
 * policy — and always loses to nothing: the security set is merged in under
 * it, so a caller cannot accidentally drop CSP by forgetting it.
 */
export function notFoundResponse(body: string | null, headers: Record<string, string>): Response {
  return new Response(body, { status: 404, headers: withSecurityHeaders(headers) });
}

/**
 * The response language for a server-rendered page: the URL's language prefix
 * wins (a /sv/station/… request is a Swedish page whatever the client asks
 * for), then the Accept-Language header, then English.
 *
 * Quality-ordered, not first-match: `sv-SE,da;q=0.9` prefers sv even though da
 * is listed first, so each candidate carries its q-value and the highest wins.
 */
export function acceptLang(header: string | null | undefined, pathLang?: Lang | null): Lang {
  if (pathLang) return pathLang;
  const candidates = (header ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { lang: langOf(tag), q: q ? parseFloat(q.split('=')[1] ?? '1') || 0 : 1 };
    })
    .filter((c): c is { lang: Lang; q: number } => c.lang !== null);
  if (candidates.length === 0) return 'en';
  return candidates.reduce((best, c) => (c.q > best.q ? c : best)).lang;
}

/** Map an Accept-Language tag ("sv-SE", "da", "en-GB", "xx") to a supported lang. */
function langOf(tag: string): Lang | null {
  const code = tag.trim().toLowerCase();
  if (code.startsWith('sv')) return 'sv';
  if (code.startsWith('da')) return 'da';
  if (code.startsWith('en') || code === '*' || code === '') return 'en';
  return null;
}

/**
 * The branded collector-outage page. Self-contained on purpose: it is served
 * when the collector Worker is down, so it must not depend on the SPA bundle,
 * a stylesheet request that could itself fail, or any JavaScript. The styling
 * mirrors this module's own 404 page below (renderNotFoundPage — same palette,
 * same brand mark), which used to live in functions/[[path]].js before wave C
 * moved it here (audit7 L15), so every error URL reads as the same site.
 *
 * `route` is the path the visitor actually asked for, language prefix
 * included — audit5 H4. It is used verbatim as the retry href rather than run
 * back through localizedPath: the request path is already in the visitor's
 * language (they typed it), and the archive families do not all localize, so
 * re-prefixing /line/804 for a Swedish reader would build /sv/line/804 — a
 * second dead link on a page that is already an error. The brand and home
 * links, which are fixed destinations, DO go through localizedPath so a
 * Swedish or Danish reader lands on their own home page instead of the
 * English one.
 */
export function renderUnavailablePage(lang: Lang, route: string): string {
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(translate('err502_title', lang))} — ${BRAND_NAME}</title>
    <meta name="robots" content="noindex" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0c10; color: #e7eaf0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.55; }
      main { max-width: 560px; padding: 2rem 1.25rem; text-align: center; }
      h1 { font-size: 1.5rem; margin: 0 0 .4rem; }
      p { color: #8b93a7; margin: 0 0 1.4rem; }
      .brand { color: #10b981; font-weight: 700; font-size: .95rem; text-decoration: none; letter-spacing: .02em; display: inline-block; margin-bottom: 1.6rem; }
      .code { color: #8b93a7; font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; display: block; margin-bottom: .6rem; }
      nav { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem 1.1rem; font-size: .9rem; }
      nav a { color: #9fc9ff; text-decoration: none; }
      nav a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <a class="brand" href="${esc(localizedPath('/', lang))}" lang="da">${BRAND_NAME}</a>
      <span class="code">502 · ${esc(route)}</span>
      <h1>${esc(translate('err502_title', lang))}</h1>
      <p>${esc(translate('err502_body', lang))}</p>
      <nav aria-label="${esc(translate('nav_site_sections', lang))}">
        <a href="${esc(route)}" rel="nofollow">${esc(translate('err502_retry', lang))}</a>
        <a href="${esc(localizedPath('/', lang))}" rel="nofollow">${esc(translate('err502_home', lang))}</a>
      </nav>
    </main>
  </body>
</html>`;
}

/**
 * 502 with the branded page. `no-store` matters: a CDN or browser that cached
 * the outage page would keep serving it after the collector recovered.
 */
export function serviceUnavailableResponse(lang: Lang, route: string): Response {
  return new Response(renderUnavailablePage(lang, route), {
    status: 502,
    headers: withSecurityHeaders({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    }),
  });
}

export const NOT_FOUND_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

/**
 * The branded 404, localized from the URL's own language prefix.
 *
 * Shared by the root catch-all and the archive Functions (audit6 M13/L10): the
 * new `functions/{sv,da}/history/[[path]].js` used to answer
 * `/sv/history/{7,14,30,90}` with a one-line plain-text 404 because
 * handleArchiveRequest now claims the whole /sv/history prefix — a silent
 * downgrade from the branded, localized, four-link page the root catch-all
 * served before, and inconsistent with `/sv/gibberish`, which still gets it.
 * The localized station Functions had the same bug in a different costume: an
 * ENGLISH plain-text 404 while their history twins were localized.
 */
export function renderNotFoundPage(pathname: string): string {
  const lang = pathname.startsWith('/sv/') ? 'sv' : pathname.startsWith('/da/') ? 'da' : 'en';
  const title = translate('err404_title', lang);
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} — ${BRAND_NAME}</title>
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
      <a class="brand" href="${localizedPath('/', lang)}" lang="da">${BRAND_NAME}</a>
      <h1>${esc(title)}</h1>
      <p>${esc(translate('err404_body', lang))}</p>
      <nav aria-label="${esc(translate('nav_site_sections', lang))}">
        <a href="${localizedPath('/', lang)}">${esc(translate('nav_board', lang))}</a>
        <a href="${localizedPath('/history', lang)}">${esc(translate('nav_history', lang))}</a>
        <a href="/line" hreflang="en">${esc(translate('arch_link_line', lang))}</a>
        <a href="/station" hreflang="en">${esc(translate('arch_link_station', lang))}</a>
      </nav>
    </main>
  </body>
</html>`;
}

/** A 404 Response carrying the branded page for `pathname` and the security set. */
export function notFoundPageResponse(pathname: string): Response {
  return notFoundResponse(renderNotFoundPage(pathname), NOT_FOUND_HEADERS);
}
