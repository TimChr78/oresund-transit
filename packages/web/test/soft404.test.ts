import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { onRequest as catchAllFunction } from '../functions/[[path]].js';
import { onRequest as lineFunction } from '../functions/line/[[path]].js';
import { STATIC_PAGE_PATHS } from '../src/lib/static-pages';

/**
 * Soft-404 + static-nav SEO fixes.
 *
 * 1. functions/[[path]].js must answer a real 404 — with `noindex` — for
 *    unknown paths instead of letting them
 *    fall through the SPA shell as 200 homepage content (what Google calls a
 *    soft-404). Real static assets and the known prerendered HTML pages pass
 *    through untouched.
 * 2. index.html ships a plain-<a> footer linking the archive sections so
 *    crawlers can discover /history, /line, /station and /methodology from the
 *    homepage shell (which otherwise has zero <a> tags).
 */

const routesJson = JSON.parse(readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8'));
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function htmlResponse(status: number, contentType = 'text/html; charset=utf-8'): Response {
  return new Response('<html>index.html shell</html>', { status, headers: { 'Content-Type': contentType } });
}

/** Build a context whose ASSETS.fetch is stubbed to `impl`. */
function ctx(path: string, impl: () => Response | Promise<Response>) {
  const fetch = vi.fn(impl);
  return {
    context: { request: new Request(`https://oresund.live${path}`), env: { ASSETS: { fetch } } },
    fetch,
  };
}

describe('soft-404 catch-all (functions/[[path]].js)', () => {
  it('passes a known static asset through untouched', async () => {
    const { context } = ctx('/assets/index-a1b2c3.js', () =>
      new Response('export {}', { status: 200, headers: { 'Content-Type': 'application/javascript' } }),
    );
    const res = await catchAllFunction(context);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    await expect(res.text()).resolves.toBe('export {}');
  });

  it('passes a top-level non-HTML asset through (robots, og-card)', async () => {
    const { context } = ctx('/robots.txt', () =>
      new Response('User-agent: *', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
    );
    const res = await catchAllFunction(context);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
  });

  it('passes localized /sv/ and /da/ static pages through (not soft-404)', async () => {
    for (const p of ['/sv/', '/sv/methodology', '/sv/privacy', '/da/', '/da/methodology', '/da/privacy']) {
      const { context } = ctx(p, () => htmlResponse(200));
      const res = await catchAllFunction(context);
      expect(res.status, p).toBe(200);
      expect(await res.text(), p).toBe('<html>index.html shell</html>');
    }
  });

  // Coverage is derived from the shared static-page contract, so every path
  // registered there is asserted to pass through rather than 404.
  it(`passes every registered static page through (${STATIC_PAGE_PATHS.join(', ')})`, async () => {
    for (const p of STATIC_PAGE_PATHS) {
      const { context } = ctx(p, () => htmlResponse(200));
      const res = await catchAllFunction(context);
      expect(res.status, p).toBe(200);
      expect(await res.text(), p).toBe('<html>index.html shell</html>');
    }
  });

  it('passes through 3xx redirects (e.g. /index.html → /)', async () => {
    const { context } = ctx('/index.html', () =>
      new Response(null, { status: 308, headers: { Location: '/' } }),
    );
    const res = await catchAllFunction(context);
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('/');
  });

  it('answers a branded 404 when ASSETS itself 404s', async () => {
    const { context } = ctx('/definitely-not-a-page', () => htmlResponse(404, 'text/plain; charset=utf-8'));
    const res = await catchAllFunction(context);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Page not found');
  });

  it('answers a branded 404 for an unknown path served by the SPA fallback (soft-404)', async () => {
    const { context } = ctx('/definitely-not-a-page', () => htmlResponse(200));
    const res = await catchAllFunction(context);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');

    const body = await res.text();
    // noindex so robots never index the 404 as if it were the page.
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(body).toContain('<meta name="robots" content="noindex"');
    expect(body).toContain('<title>Page not found');
    // Navigation links back to the live board + the three archive sections.
    expect(body).toContain('href="/"');
    expect(body).toContain('href="/history"');
    expect(body).toContain('href="/line"');
    expect(body).toContain('href="/station"');
  });
});


describe('soft-404: /line/{anything} (audit6 H1)', () => {
  /**
   * The shape the audit measured live: the collector's /line/{line} endpoint
   * validates only that the segment is non-empty and answers 200 with an empty
   * archive for ANY string, so fetchJsonOrNull never saw a 404 and the route's
   * `if (!stats) return null` never fired. Every input produced a page that
   * asserted it was the canonical real page for a thing that does not exist —
   * 200, index,follow, self-referencing canonical, unique H1 and description.
   */
  const ctx = (path: string) => ({
    request: new Request(`https://oresund.live${path}`),
    env: {},
  });
  /** The collector exactly as it behaves today: 200 + an empty archive, for anything. */
  const stubCollector = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // The collector echoes the requested designation back in `line`.
        const asked = decodeURIComponent(url.split('/api/transit/line/')[1]!.split('?')[0]!);
        return new Response(
          JSON.stringify({
            line: asked, days: 30, date_from: '2026-08-06', date_to: '2026-09-04',
            total_disruptions: 0, daily: [], by_cause: [], recent: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

  it.each([
    '/line/gibberish',
    '/line/99999',
    '/line/802x',
    '/line/-1',
    '/line/%20',
  ])('answers a real 404 — with noindex — for %s, not a soft 404', async (path) => {
    stubCollector();
    const res = await lineFunction(ctx(path));
    expect(res.status, path).toBe(404);
    expect(res.headers.get('Content-Type'), path).toContain('text/html');
    expect(res.headers.get('X-Robots-Tag'), path).toContain('noindex');
    const body = await res.text();
    expect(body, path).toContain('<meta name="robots" content="noindex"');
    // No page shell leaks through: no canonical, no index directive.
    expect(body, path).not.toContain('rel="canonical"');
    expect(body, path).not.toContain('content="index,follow"');
  });

  it('still renders a real line page when the line is canonical', async () => {
    stubCollector();
    const res = await lineFunction(ctx('/line/802'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('rel="canonical" href="https://oresund.live/line/802"');
  });

  it('renders a page for a non-canonical line the collector has actually observed', async () => {
    // The canonical set is a floor, not a ceiling: a newly designated line with
    // real rows is discovered from /lines and is a real archive.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body =
          url.includes('/api/transit/lines')
            ? { lines: [{ line: '7085', disruptions: 3, last_seen: '2026-09-01' }] }
            : {
                line: '7085', days: 30, date_from: '2026-08-06', date_to: '2026-09-04',
                total_disruptions: 3, daily: [], by_cause: [], recent: [],
              };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    const res = await lineFunction(ctx('/line/7085'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('rel="canonical" href="https://oresund.live/line/7085"');
  });
});


function parsed_include(): string[] {
  return routesJson.include as string[];
}

describe('_routes.json catch-all wiring', () => {
  it('includes the root catch-all so the Function runs for unknown routes', () => {
    // '/*' is the only include — CF rejects overlapping rules. Route-specific
    // Functions (line/station/history) still win by specificity over the
    // catch-all, and assets pass through ASSETS.fetch.
    expect(parsed_include()).toEqual(['/*']);
    expect(routesJson.exclude).toEqual([]);
  });
});

describe('homepage shell footer', () => {
  it('ships plain <a> archive links in the initial HTML', () => {
    // audit5 H2: the footer's head-term anchor points at the hub.
    expect(indexHtml).toContain('href="/history">Disruption history</a>');
    expect(indexHtml).toContain('href="/line">Line archives</a>');
    expect(indexHtml).toContain('href="/station">Station archives</a>');
    expect(indexHtml).toContain('href="/methodology">Methodology</a>');
  });

  it('ships SV and DA language links pointing at the localized homes', () => {
    expect(indexHtml).toContain('href="/sv/" lang="sv" hreflang="sv">SV</a>');
    expect(indexHtml).toContain('href="/da/" lang="da" hreflang="da">DA</a>');
  });

  it('marks the footer as a nav landmark (crawlers can discover internal links)', () => {
    expect(indexHtml).toMatch(/<footer class="site-footer">\s*<nav/);
  });
});
