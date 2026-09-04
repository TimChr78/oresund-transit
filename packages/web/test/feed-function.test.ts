import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/feed.xml.js';

/**
 * Smoke tests for the /feed.xml Pages Function.
 *
 * The function file is plain JS (bundled by wrangler at deploy time, never
 * typechecked) typed via the sibling feed.xml.d.ts. The heavy lifting (XML
 * rendering, escaping, pubDate offsets) is covered in depth by
 * test/rss.test.ts — these tests only pin the fetch → render → respond wiring.
 */

const FEED_URL =
  'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit/disruptions?limit=50';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A minimal disruption row (all nullable fields null). */
function disruptionRow(id: number): Record<string, unknown> {
  return {
    id,
    timestamp: '2026-07-15T12:00:00',
    line: '803',
    type: 'delay',
    cause: 'signal_failure',
    route_section: null,
    severity: 'moderate',
    delay_seconds: 660,
    raw_text: 'Signalfel på bron',
    dep_key: null,
    first_seen: null,
    last_updated: null,
    direction: 'to_denmark',
    technical_number: null,
    sched_time: null,
  };
}

async function loadFunction() {
  return { onRequest };
}

describe('functions/feed.xml.js', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('exports an onRequest handler', async () => {
    const mod = await loadFunction();
    expect(typeof mod.onRequest).toBe('function');
  });

  it('fetches the collector and renders the feed with the RSS content-type', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ disruptions: [disruptionRow(1)] }));
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadFunction();
    const res = await mod.onRequest({
      request: new Request('https://oresund.live/feed.xml', { method: 'GET' }),
      env: {},
    });

    expect(fetchMock).toHaveBeenCalledWith(
      FEED_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const xml = await res.text();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<title>Line 803 delayed to Denmark</title>');
    expect(xml).toContain('<guid isPermaLink="false">https://oresund.live/disruption/1</guid>');
  });

  it('keeps every item link inside the /line discovery set (audit6)', async () => {
    // The collector stores any route.designation it accepted, so the feed can
    // name a line /line/{line} would 404 on. The Function therefore reads the
    // same discovery set the archive route guards with.
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes('/disruptions')) {
          return jsonResponse({ disruptions: [disruptionRow(1), { ...disruptionRow(2), line: '999' }] });
        }
        return jsonResponse({ lines: [{ line: '999', disruptions: 3, last_seen: null }] });
      }),
    );

    const mod = await loadFunction();
    const res = await mod.onRequest({ request: new Request('https://oresund.live/feed.xml'), env: {} });
    const xml = await res.text();

    expect(urls.some((u) => u.endsWith('/api/transit/lines'))).toBe(true);
    // The canonical line and the discovered one both deep-link.
    expect(xml).toContain('<link>https://oresund.live/line/803</link>');
    expect(xml).toContain('<link>https://oresund.live/line/999</link>');
  });

  it('keeps the channel link for a line the archive route has no page for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/disruptions')) {
          return jsonResponse({ disruptions: [{ ...disruptionRow(1), line: '777' }] });
        }
        return jsonResponse({ lines: [{ line: '999', disruptions: 3, last_seen: null }] });
      }),
    );

    const mod = await loadFunction();
    const xml = await (await mod.onRequest({ request: new Request('https://oresund.live/feed.xml'), env: {} })).text();
    expect(xml).toContain('<link>https://oresund.live/</link>');
    expect(xml).not.toContain('/line/777');
  });

  it('degrades to the canonical archive links when the discovery fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/disruptions')) {
          return jsonResponse({ disruptions: [disruptionRow(1), { ...disruptionRow(2), line: '777' }] });
        }
        throw new Error('lines endpoint down');
      }),
    );

    const mod = await loadFunction();
    const res = await mod.onRequest({ request: new Request('https://oresund.live/feed.xml'), env: {} });
    // A discovery outage is not a feed outage: the feed still renders.
    expect(res.status).toBe(200);
    const xml = await res.text();
    // Canonical pages exist without a discovery fetch; the unobserved line
    // falls back to the board rather than to a 404.
    expect(xml).toContain('<link>https://oresund.live/line/803</link>');
    expect(xml).not.toContain('/line/777');
  });

  it('returns a branded HTML 502 page when the collector fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const mod = await loadFunction();
    const res = await mod.onRequest({ request: new Request('https://oresund.live/feed.xml'), env: {} });

    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).not.toContain('<rss');
    expect(body).toContain('<!doctype html>');
    expect(body).toContain('Temporarily unavailable');
    expect(body).toContain('href="/feed.xml"'); // the retry hint re-requests the feed
    expect(body).toContain('href="/"'); // and the way back to the board
  });

  it('returns a branded HTML 502 on a non-2xx collector response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'boom' }, 500)));

    const mod = await loadFunction();
    const res = await mod.onRequest({ request: new Request('https://oresund.live/feed.xml'), env: {} });

    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 502 when the collector answers 200 with a non-JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>proxy error</html>', { status: 200 })),
    );

    const mod = await loadFunction();
    const res = await mod.onRequest({ request: new Request('https://oresund.live/feed.xml'), env: {} });

    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).not.toContain('<rss');
  });

  it('localizes the 502 page from Accept-Language (audit4 N-H4)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));

    const mod = await loadFunction();
    const res = await mod.onRequest({
      request: new Request('https://oresund.live/feed.xml', {
        headers: { 'accept-language': 'sv-SE,sv;q=0.9,en;q=0.8' },
      }),
      env: {},
    });

    expect(await res.text()).toContain('Tillfälligt otillgänglig');
  });

  it('answers HEAD with headers only (empty body)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ disruptions: [] })));

    const mod = await loadFunction();
    const res = await mod.onRequest({
      request: new Request('https://oresund.live/feed.xml', { method: 'HEAD' }),
      env: {},
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect(await res.text()).toBe('');
  });
});
