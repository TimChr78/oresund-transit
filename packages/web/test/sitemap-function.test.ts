import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/sitemap.xml.js';

/**
 * Smoke tests for the /sitemap.xml Pages Function. The heavy lifting is in
 * src/lib/sitemap.ts buildSitemap (covered by test/sitemap.test.ts); these
 * pin the fetch → build → respond wiring and the collector-failure fallback.
 */

/**
 * Every URL that IS submitted carries a date at day precision (audit3 H4).
 * Lines the collector has never observed are not submitted at all any more
 * (audit5 M4), so there is no <lastmod>-less line family left to special-case.
 */
function assertEveryUrlDated(xml: string): void {
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    expect(entry, entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
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

  it('keeps the canonical line + station URLs when the collector is down (still 200)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml'), env: {} });
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('https://oresund.live/');
    // audit6 M10 — this used to assert the OPPOSITE: the fallback was
    // buildSitemap([], [], …), so any collector blip withdrew all 21 line and
    // station URLs (55% of the submitted set) for as long as the outage lasted
    // plus up to max-age=600 of CDN cache. The canonical lines and the four
    // monitored stations are static facts that do not depend on collector
    // health, so an outage must not un-submit them.
    expect(xml).toContain('https://oresund.live/line/804');
    expect(xml).toContain('https://oresund.live/station/hyllie');
    expect(xml).toContain('https://oresund.live/sv/station/hyllie');
    // The /line index itself is still offered, and dated.
    expect(xml).toContain('https://oresund.live/line</loc>');
    // audit6 M6 — the bus lines stay out even here: their archives predate
    // monitoring and the healthy sitemap omits them, so an outage must not
    // add them back.
    expect(xml).not.toContain('https://oresund.live/line/6<');
    expect(xml).not.toContain('https://oresund.live/line/16<');
    // audit4 N-M3 still holds, and matters more here than anywhere: a line
    // whose data is unknown publishes NO lastmod rather than an unverified
    // date. With the collector down nothing is known about any line, so no
    // /line/{n} entry claims freshness — and every other URL is still dated.
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
    expect(entries.length).toBeGreaterThan(0);
    const lineUrl = /<loc>https:\/\/oresund\.live\/line\/\d+<\/loc>/;
    for (const entry of entries) {
      if (lineUrl.test(entry)) {
        expect(entry, entry).not.toMatch(/<lastmod>/);
      } else {
        expect(entry, entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
      }
    }
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
    assertEveryUrlDated(xml);
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

  /**
   * dist/build-meta.json read back through the ASSETS binding, the way the
   * Function dates the static URLs' <lastmod> on a real deploy.
   */
  const assetsBinding = (meta: unknown) => ({ ASSETS: { fetch: async () => jsonResponse(meta) } });
  const staticLastmod = (xml: string): string | null => /<loc>https:\/\/oresund\.live\/<\/loc><lastmod>([\d-]+)<\/lastmod>/.exec(xml)?.[1] ?? null;

  it('dates the static URLs from a build stamp the build actually writes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ lines: [], stations: [] })));
    const res = await onRequest({
      request: new Request('https://oresund.live/sitemap.xml'),
      env: assetsBinding({ generated: '2026-09-01T09:15:00Z' }),
    });
    // The instant is reduced to its date part — that part is the deploy date.
    expect(staticLastmod(await res.text())).toBe('2026-09-01');
  });

  it.each([
    ['an impossible time', '2026-09-01T25:00:00Z'],
    ['an impossible hour', '2026-09-01T24:00:00Z'],
    ['trailing junk', '2026-09-01junk'],
    ['an impossible calendar date', '2026-02-30'],
    ['a space-separated stamp', '2026-09-01 09:15:00'],
  ])('ignores a build stamp that is %s instead of slicing it to a date', async (_label, generated) => {
    // The clock is stubbed (audit6 M12): the fallback legitimately resolves to
    // today(), so an assertion of the form "not 2026-09-01" fails on the day
    // the suite happens to run on 2026-09-01 — three cases would break even
    // though stampDate behaved correctly. Pinned to a fixed instant, the
    // expectation is exact instead of date-dependent.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    try {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ lines: [], stations: [] })));
      const res = await onRequest({
        request: new Request('https://oresund.live/sitemap.xml'),
        env: assetsBinding({ generated }),
      });
      // slice(0, 10) turned several of these into "2026-09-01" — a date the
      // build never wrote. The stamp is dropped whole, so the static URLs fall
      // back to today, which here is exactly 2026-09-01 in the corridor's own
      // wall clock.
      expect(staticLastmod(await res.text())).toBe('2026-09-01');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('drops a last_seen that is not a real calendar date (2026-02-30)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/transit/lines')) {
          return jsonResponse({ lines: [{ line: '804', disruptions: 3, last_seen: '2026-02-30' }] });
        }
        if (url.includes('/api/transit/stations')) return jsonResponse({ stations: [] });
        if (url.includes('/api/transit/history')) return jsonResponse({ days: 7, date_from: '2026-08-27', date_to: '2026-09-02' });
        throw new Error(`no stub for ${url}`);
      }),
    );
    const res = await onRequest({ request: new Request('https://oresund.live/sitemap.xml'), env: {} });
    const xml = await res.text();
    // DATE_RE alone let the impossible date through to buildSitemap, which then
    // dropped it at w3cDate and left the line undated. Rejected at asDate it
    // still falls back to the data window, so the line keeps a lastmod.
    expect(xml).not.toContain('<lastmod>2026-02-30</lastmod>');
    expect(xml).toContain('<loc>https://oresund.live/line/804</loc><lastmod>2026-09-02</lastmod>');
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
    assertEveryUrlDated(xml);
  });
});
