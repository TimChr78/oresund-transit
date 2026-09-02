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
        if (url.includes('/api/transit/history')) return jsonResponse({ days: 7, date_from: '2026-08-27', date_to: '2026-09-02' });
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
    // audit3 H4 — the archive URLs are dated from the collector data window.
    expect(xml).toMatch(/<loc>https:\/\/oresund\.live\/station\/hyllie<\/loc><lastmod>2026-09-02<\/lastmod>/);
  });

  it('dates every URL even when the collector fails (static base, still 200)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml'), env: {} });
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('https://oresund.live/');
    // Canonical lines are always listed, even when the collector is unreachable.
    expect(xml).toContain('https://oresund.live/line/804');
    // Stations remain discovery-only — no static station set.
    expect(xml).not.toContain('https://oresund.live/station/hyllie');
    // audit3 H4 — the fallback path still carries a lastmod on every URL.
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(entry, entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('keeps the archive URLs when only the history endpoint fails (the date degrades instead)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/transit/lines')) return jsonResponse({ lines: [{ line: '804', disruptions: 3 }] });
        if (url.includes('/api/transit/stations')) return jsonResponse({ stations: [{ slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' }] });
        return jsonResponse({ error: 'history unavailable' }, 503);
      }),
    );
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml'), env: {} });
    const xml = await res.text();
    expect(xml).toContain('https://oresund.live/station/hyllie');
    expect(xml).toContain('https://oresund.live/line/804');
    // Every URL still carries a lastmod — just not a data-derived one.
    for (const entry of [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!)) {
      expect(entry, entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    }
  });

  it('answers HEAD with headers only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ lines: [], stations: [] })));
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml', { method: 'HEAD' }), env: {} });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('keeps line + station URLs when only the history fetch rejects (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/transit/lines')) return jsonResponse({ lines: [{ line: '804', disruptions: 2 }] });
        if (url.includes('/api/transit/stations')) return jsonResponse({ stations: [{ slug: 'kastrup', stop_id: '860000858', stop_name: 'Københavns Lufthavn (Kastrup)' }] });
        if (url.includes('/api/transit/history')) throw new TypeError('fetch failed');
        throw new Error(`no stub for ${url}`);
      }),
    );
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml'), env: {} });
    expect(res.status).toBe(200);
    const xml = await res.text();
    // Lines and stations survive the history rejection...
    expect(xml).toContain('https://oresund.live/line/804');
    expect(xml).toContain('https://oresund.live/station/kastrup');
    // ...with lastmod present (fallback date), and every entry still carries one.
    expect(xml).toContain('<lastmod>');
    for (const entry of [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!)) {
      expect(entry, entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    }
  });
});
