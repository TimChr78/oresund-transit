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
