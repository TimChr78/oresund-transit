import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/sitemap.xml.js';

/**
 * Smoke tests for the /sitemap.xml Pages Function. The heavy lifting is in
 * src/lib/sitemap.ts buildSitemap (covered by test/sitemap.test.ts); these
 * pin the fetch → build → respond wiring and the collector-failure fallback.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('functions/sitemap.xml.js', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('serves an XML sitemap including discovered line + station pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/transit/lines')) return jsonResponse({ lines: [{ line: '804', disruptions: 3 }] });
        if (url.includes('/api/transit/stations')) return jsonResponse({ stations: [{ slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' }] });
        throw new Error(`no stub for ${url}`);
      }),
    );
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml', { method: 'GET' }), env: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    const xml = await res.text();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('https://oresund.live/line/804');
    expect(xml).toContain('https://oresund.live/station/hyllie');
    expect(xml).toContain('https://oresund.live/history/90');
  });

  it('falls back to the static base (still 200) when the collector fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml'), env: {} });
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('https://oresund.live/');
    expect(xml).not.toContain('https://oresund.live/line/804');
  });

  it('answers HEAD with headers only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ lines: [], stations: [] })));
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml', { method: 'HEAD' }), env: {} });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});
