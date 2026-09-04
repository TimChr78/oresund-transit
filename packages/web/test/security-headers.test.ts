import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { SECURITY_HEADERS } from '../src/lib/http-errors';
import { handleArchiveRequest, type FetchLike } from '../src/lib/archive-http';
import { onRequest as catchAllNotFound } from '../functions/[[path]].js';
import { onRequest as assetsNotFound } from '../functions/assets/[[path]].js';
import { onRequest as sitemap } from '../functions/sitemap.xml.js';
import { onRequest as feed } from '../functions/feed.xml.js';
import { onRequest as lineFunction } from '../functions/line/[[path]].js';
import { onRequest as stationFunction } from '../functions/station/[[path]].js';
import { onRequest as historyFunction } from '../functions/history/[[path]].js';
import { onRequest as svStationFunction } from '../functions/sv/station/[[path]].js';
import { onRequest as svHistoryFunction } from '../functions/sv/history/[[path]].js';
import { onRequest as daStationFunction } from '../functions/da/station/[[path]].js';
import { onRequest as daHistoryFunction } from '../functions/da/history/[[path]].js';

/**
 * L1 — security headers for Cloudflare Pages. The `_headers` file in the
 * output directory (public/ → copied verbatim into dist/ by Vite) applies to
 * every static response: HSTS, nosniff, referrer policy and clickjacking
 * protection. Served files (llms.txt, fonts, og-card) and the prerendered
 * pages all get them.
 *
 * audit4 N-C1/N-C2 follow-up: Cloudflare does NOT apply `_headers` to a Pages
 * Function's Response, so the Functions carry the same set in code
 * (SECURITY_HEADERS). These tests keep the two honest — if one changes
 * without the other, the archive URLs and the static ones disagree about
 * their own policy.
 */
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

describe('security headers (Cloudflare Pages _headers)', () => {
  it('applies the hardened header set to every route', () => {
    expect(headers).toMatch(/^\/\*/m);
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toContain('X-Frame-Options: DENY');
  });

  it('allows the Umami analytics origin the shell loads (audit4 N-H1)', () => {
    const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const src = /<script[^>]*\ssrc="(https:[^"]+)"[^>]*data-website-id/.exec(shell)?.[1];
    expect(src, 'the shell ships an analytics script').toBeTruthy();

    // script-src must let the browser run it, and connect-src must let the
    // beacon reach /api/send on the same origin — `script-src 'self'` blocked
    // the tag from the day the header landed, so the dashboard read zero.
    const origin = new URL(src!).origin;
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain(`script-src 'self' ${origin}`);
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain(`connect-src 'self' ${origin}`);
  });

  it('keeps _headers and the Functions’ in-code set identical', () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headers).toContain(`${name}: ${value}`);
    }
  });
});

describe('security headers on Pages Function responses (audit4 N-C2, merged from #48)', () => {
  const payload = {
    slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie', days: 30,
    date_from: '2026-07-08', date_to: '2026-08-06', total_departures: 0,
    on_time_count: 0, delayed_count: 0, canceled_count: 0, on_time_pct: 0,
    avg_delay_seconds: null, daily: [], recent: [], as_of: '2026-08-06T21:59:27',
  };
  const routes: Record<string, unknown> = {
    '/api/transit/lines': { lines: [{ line: '804', disruptions: 4 }] },
    '/api/transit/stations': { stations: [{ slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' }] },
    '/api/transit/station/hyllie': payload,
    '/api/transit/history': { days: 30, date_from: '2026-07-08', date_to: '2026-08-06', total_disruptions: 0, daily: [] },
    // The /history hub reads the corridor punctuality rows as well.
    '/api/transit/punctuality': { days: 30, date_from: '2026-07-08', date_to: '2026-08-06', daily: [] },
    '/api/transit/live': { status: 'green', timestamp: '2026-08-06T21:59:27', disruption_count: 0, service_shutdown: false },
  };
  const fetchOk: FetchLike = async (url) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    if (!hit) throw new Error(`no stub for ${url}`);
    return new Response(JSON.stringify(routes[hit]), { headers: { 'Content-Type': 'application/json' } });
  };
  const fetchDown: FetchLike = async () => { throw new Error('collector unreachable'); };

  it('attaches the full set to a rendered page, the history hub and the branded 502', async () => {
    const page = await handleArchiveRequest('/line', fetchOk);
    expect(page?.status).toBe(200);
    const hub = await handleArchiveRequest('/history', fetchOk);
    expect(hub?.status).toBe(200);
    const down = await handleArchiveRequest('/history/30', fetchDown);
    expect(down?.status).toBe(502);
    for (const res of [page, hub, down]) {
      expect(res).not.toBeNull();
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(res!.headers.get(name), `${name} on a ${res!.status}`).toBe(value);
      }
    }
    // branded fallback (wave 2 N-H4): the 502 is a page, not plain text
    expect(down!.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('attaches them to localized station routes too', async () => {
    const res = await handleArchiveRequest('/sv/station/hyllie', fetchOk);
    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res?.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

/**
 * audit5 H5 — the response shapes the audit4 sweep missed. Every Function
 * below used to build at least one Response with a bare Content-Type, so the
 * invariant "every Function response carries the set" was false: the HTML 404
 * was framable and HSTS-free, /sitemap.xml and /feed.xml shipped none at all,
 * and the nine plain-text 404s likewise. These tests drive each Function
 * across its 200 / 404 / 405 / HEAD shapes so the gap cannot reopen quietly.
 */
describe('security headers on the remaining Function response shapes (audit5 H5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A minimal Pages Function context: just the request and a stubbed ASSETS. */
  const ctx = (path: string, method = 'GET', asset?: () => Response | Promise<Response>) => ({
    request: new Request(`https://oresund.live${path}`, { method }),
    env: { ASSETS: { fetch: vi.fn(asset ?? (() => new Response('nope', { status: 404 }))) } },
  });

  const assertSet = (res: Response, label: string) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name), `${name} on ${label}`).toBe(value);
    }
  };

  /** Stub the collector as gone, so an archive route falls through to its 404. */
  const stubCollector404 = () =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

  const collector = {
    lines: { lines: [{ line: '804', disruptions: 4 }] },
    stations: { stations: [{ slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' }] },
    disruptions: { disruptions: [] },
    history: { days: 7, date_from: '2026-08-01', date_to: '2026-08-06', total_disruptions: 0, daily: [] },
  };
  const stubCollectorUp = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const hit = Object.entries(collector).find(([k]) => url.includes(`/api/transit/${k}`));
        if (!hit) throw new Error(`no stub for ${url}`);
        return new Response(JSON.stringify(hit[1]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );

  it('attaches the set to the HTML 404', async () => {
    const res = await catchAllNotFound(ctx('/gibberish'));
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    assertSet(res, '/gibberish (HTML 404)');
  });

  it('attaches the set to /sitemap.xml on success and on collector failure', async () => {
    stubCollectorUp();
    const ok = await sitemap(ctx('/sitemap.xml'));
    expect(ok.status).toBe(200);
    assertSet(ok, '/sitemap.xml 200');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const fallback = await sitemap(ctx('/sitemap.xml'));
    expect(fallback.status).toBe(200);
    assertSet(fallback, '/sitemap.xml collector-down fallback');
  });

  it('attaches the set to /feed.xml on success and HEAD', async () => {
    stubCollectorUp();
    const ok = await feed(ctx('/feed.xml'));
    expect(ok.status).toBe(200);
    assertSet(ok, '/feed.xml 200');

    const head = await feed(ctx('/feed.xml', 'HEAD'));
    expect(head.status).toBe(200);
    assertSet(head, '/feed.xml HEAD');
  });

  it('attaches the set to the 405s', async () => {
    for (const onRequest of [sitemap, feed]) {
      const res = await onRequest(ctx('/sitemap.xml', 'POST'));
      expect(res.status, '405').toBe(405);
      assertSet(res, '405');
    }
  });

  it('attaches the set to the plain-text asset 404', async () => {
    const res = await assetsNotFound(
      ctx('/assets/missing-a1b2c3.js', 'GET', () =>
        new Response('<html>shell</html>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    assertSet(res, '/assets/* 404');
  });

  it('attaches the set to every archive route’s plain-text 404, in all three languages', async () => {
    stubCollector404();
    const cases: [string, (c: unknown) => Promise<Response>][] = [
      ['/line/999', lineFunction],
      ['/station/gibberish', stationFunction],
      ['/history/gibberish', historyFunction],
      ['/sv/station/gibberish', svStationFunction],
      ['/sv/history/gibberish', svHistoryFunction],
      ['/da/station/gibberish', daStationFunction],
      ['/da/history/gibberish', daHistoryFunction],
    ];
    for (const [path, onRequest] of cases) {
      const res = await onRequest(ctx(path));
      expect(res.status, path).toBe(404);
      expect(res.headers.get('Content-Type'), path).toBe('text/plain; charset=utf-8');
      assertSet(res, path);
    }
  });
});

/**
 * audit5 M9 — several Functions claimed to be "scoped to /x/* via
 * _routes.json so every other route stays on the free static tier". That file
 * is include "/*": a Function runs on every request, static assets included,
 * and the whole static-header guarantee rests on the passthrough re-fetching
 * each file through env.ASSETS.fetch (where Cloudflare applies _headers).
 * Nothing in the repo noticed when the comments went false; these pin it.
 */
describe('_routes.json and the ASSETS.fetch passthrough (audit5 M9)', () => {
  const routes = JSON.parse(readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8'));

  it('scopes nothing: a Function runs on every request', () => {
    // If this ever becomes a real per-route scoping, the comments that were
    // rewritten to match it must be revisited with it — and so must the
    // assumption that every static asset reaches the header rules through a
    // Function's ASSETS.fetch.
    expect(routes).toEqual({ version: 1, include: ['/*'], exclude: [] });
  });

  it('says in _headers that static coverage flows through the passthrough', () => {
    expect(headers).toMatch(/ASSETS\.fetch/);
    expect(headers).toMatch(/_routes\.json/);
  });

  it('hands a static asset on with the headers the binding applied', async () => {
    // The Response below is what env.ASSETS.fetch returns on the real edge:
    // the file's content-type plus the _headers set Cloudflare merged in. The
    // Function must return it as-is — rebuilding it would drop the set and
    // strip protection from every /assets/* URL.
    const fromAssets = new Response('console.log(1)', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...SECURITY_HEADERS,
      },
    });
    const res = await assetsNotFound({
      request: new Request('https://oresund.live/assets/index-a1b2c3.js'),
      env: { ASSETS: { fetch: async () => fromAssets } },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name), name).toBe(value);
    }
  });
});
