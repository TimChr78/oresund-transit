import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/sitemap.xml.js';

/**
 * Smoke tests for the /sitemap.xml Pages Function. The heavy lifting is in
 * src/lib/sitemap.ts buildSitemap (covered by test/sitemap.test.ts); these
 * pin the fetch → build → respond wiring and the collector-failure fallback.
 */

/** A line URL the collector has never observed — the only <lastmod>-less family (audit4 N-M3). */
const UNSEEN_LINE_ENTRIES = ['801','802','803','804','805','806','807','808','809','910','6','16'];

function assertDatedExceptUnseenLines(xml: string): void {
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    const isUnseenLine = UNSEEN_LINE_ENTRIES.some(
      (l) => !entry.includes('<lastmod>') && entry.includes(`<loc>https://oresund.live/line/${l}</loc>`),
    );
    if (isUnseenLine) {
      expect(entry, entry).not.toMatch(/<lastmod>/);
    } else {
      expect(entry, entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    }
  }
}

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
        // audit4 N-M3: the collector reports the last day each line had data.
        if (url.includes('/api/transit/lines')) return jsonResponse({ lines: [{ line: '804', disruptions: 3, last_seen: '2026-08-28' }] });
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
    // audit4 N-M3 — a line page is dated from its own last day with data, not
    // the corpus window.
    expect(xml).toMatch(/<loc>https:\/\/oresund\.live\/line\/804<\/loc><lastmod>2026-08-28<\/lastmod>/);
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
    // audit3 H4 — every URL with data carries a lastmod. The canonical lines the
    // collector never observed are the exception (audit4 N-M3): a page with no
    // data behind it must not claim a fresh daily lastmod, so they ship none.
    assertDatedExceptUnseenLines(xml);
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
    // Every URL with data still carries a lastmod — just not a data-derived one
    // for the discovered line (its own date is unknown to this payload).
    assertDatedExceptUnseenLines(xml);
    expect(xml).toMatch(/<loc>https:\/\/oresund\.live\/line\/804<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('drops a last_seen that is not a date instead of emitting an invalid <lastmod>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/transit/lines')) {
          return jsonResponse({ lines: [{ line: '804', disruptions: 3, last_seen: 'recently' }] });
        }
        if (url.includes('/api/transit/stations')) return jsonResponse({ stations: [] });
        if (url.includes('/api/transit/history')) return jsonResponse({ days: 7, date_from: '2026-08-27', date_to: '2026-09-02' });
        throw new Error(`no stub for ${url}`);
      }),
    );
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml'), env: {} });
    const xml = await res.text();
    // The line keeps a lastmod — the data-window fallback — and it is a date.
    expect(xml).toMatch(/<loc>https:\/\/oresund\.live\/line\/804<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    expect(xml).not.toContain('<lastmod>recently</lastmod>');
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
    // ...with lastmod present (fallback date) on every URL that has data.
    expect(xml).toContain('<lastmod>');
    assertDatedExceptUnseenLines(xml);
  });
});
