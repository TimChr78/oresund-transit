import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_LINES,
  renderHistoryIndex,
  renderHistoryPage,
  renderLineIndex,
  renderLinePage,
  renderStationIndex,
  renderStationPage,
  unionCanonicalLines,
  type ArchiveHistory,
  type ArchiveLineStats,
  type ArchiveStationStats,
} from '../src/lib/archive';
import { handleArchiveRequest } from '../src/lib/archive-http';

/** A minimal valid history payload for the last 7 days. */
const history: ArchiveHistory = {
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  total_disruptions: 4,
  daily: [
    { date: '2026-08-06', count: 3, cancellations: 0, delays: 3, alerts: 0, avg_delay: 650 },
    { date: '2026-07-31', count: 1, cancellations: 1, delays: 0, alerts: 0, avg_delay: null },
  ],
};

/** A minimal valid line payload. */
const lineStats: ArchiveLineStats = {
  line: '804',
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  total_disruptions: 4,
  daily: history.daily,
  by_cause: [{ cause: 'signal_failure', count: 3 }],
  recent: [
    {
      id: 1,
      timestamp: '2026-08-06T12:00:00',
      line: '804',
      type: 'delay',
      cause: 'signal_failure',
      route_section: null,
      severity: 'moderate',
      delay_seconds: 650,
      raw_text: 'Signalfel på bron',
      dep_key: null,
      first_seen: null,
      last_updated: null,
      direction: 'to_denmark',
      technical_number: null,
      sched_time: null,
    },
  ],
};

/** A minimal valid station payload. */
const stationStats: ArchiveStationStats = {
  slug: 'hyllie',
  stop_id: '740001586',
  stop_name: 'Malmö Hyllie',
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  total_departures: 99,
  on_time_count: 92,
  delayed_count: 5,
  canceled_count: 2,
  on_time_pct: 92.9,
  avg_delay_seconds: 180,
  daily: [
    { date: '2026-08-06', total: 15, on_time: 14, delayed: 1, canceled: 0, on_time_pct: 93.3, avg_delay_seconds: 180 },
  ],
  recent: [
    {
      id: 1,
      stop_id: '740001586',
      stop_name: 'Malmö Hyllie',
      line: '804',
      destination: 'Østerport',
      sched_time: '2026-08-06T21:59:00',
      delay_seconds: 0,
      canceled: 0,
      status: 'on_time',
      technical_number: '1143',
      dep_key: '2026-08-06_804_21:59_Østerport',
      first_seen: '2026-08-06T21:59:27',
      last_updated: '2026-08-06T21:59:27',
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseJsonLd(html: string): unknown[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]!),
  );
  return blocks;
}

describe('archive renderers', () => {
  it('history pages carry SEO head, canonical, attribution and daily table', () => {
    const html = renderHistoryPage(7, history);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Disruption history — last 7 days — Øresund.live</title>');
    expect(html).toContain('<link rel="canonical" href="https://oresund.live/history/7" />');
    expect(html).toContain('Data från Trafiklab.se');
    expect(html).toContain('2026-08-06');
    expect(html).toContain('11 min'); // fmtDelay(650/60) → "11 min"
    // JSON-LD: a BreadcrumbList graph and the site identity.
    const graphs = parseJsonLd(html);
    expect(graphs.length).toBeGreaterThan(0);
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it('history index lists the day ranges', () => {
    const html = renderHistoryIndex();
    expect(html).toContain('<h1>Disruption history</h1>');
    for (const d of [7, 14, 30, 90]) expect(html).toContain(`href="/history/${d}"`);
  });

  it('line pages escape external line/cause/raw text and carry breadcrumb JSON-LD', () => {
    const evil: ArchiveLineStats = {
      ...lineStats,
      line: '804',
      by_cause: [
        { cause: '<script>alert(1)</script>', count: 1 },
        { cause: 'a&b', count: 2 },
      ],
      recent: [{ ...lineStats.recent[0]!, raw_text: 'a&b', line: '804' }],
    };
    const html = renderLinePage('804', evil, [{ line: '803', disruptions: 1 }]);
    expect(html).toContain('<title>Line 804 — disruption archive — Øresund.live</title>');
    expect(html).toContain('<link rel="canonical" href="https://oresund.live/line/804" />');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a&amp;b');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('Line 803'); // sibling link
  });

  it('line index renders the discovered lines as cards/links', () => {
    const html = renderLineIndex([{ line: '804', disruptions: 40 }, { line: '800M', disruptions: 2 }]);
    expect(html).toContain('href="/line/804"');
    expect(html).toContain('href="/line/800M"');
    expect(html).toContain('"@type":"ItemList"');
  });

  it('line index lists every canonical line, even with no discovered data', () => {
    const html = renderLineIndex([]);
    // Every canonical line archive is linked, including empty ones.
    for (const l of CANONICAL_LINES) expect(html).toContain(`href="/line/${encodeURIComponent(l)}"`);
    // Disruptions default to 0 for canonical lines with no recorded data.
    expect(html).toContain('Line 807</a> <span class="meta">— 0 disruptions recorded</span>');
    // No duplicates in the ItemList.
    const hrefs = [...html.matchAll(/href="\/line\/[^"]+"/g)].map((m) => m[0]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('empty-archive line page renders correct SEO markup (index,follow, no noindex)', () => {
    const empty: ArchiveLineStats = {
      ...lineStats,
      line: '807',
      total_disruptions: 0,
      by_cause: [],
      recent: [],
    };
    const html = renderLinePage('807', empty, []);
    expect(html).toContain('<title>Line 807 — disruption archive — Øresund.live</title>');
    expect(html).toContain('<meta name="description" content="Disruption history for line 807');
    expect(html).toContain('<link rel="canonical" href="https://oresund.live/line/807" />');
    // Empty archives must stay indexable — never noindex.
    expect(html).toContain('<meta name="robots" content="index,follow" />');
    expect(html).not.toContain('noindex');
    expect(html).toContain('None recorded in this range.');
    // Sibling links still list the canonical line set.
    expect(html).toContain('href="/line/801"');
  });

  it('unionCanonicalLines keeps discovered counts and appends non-canonical lines', () => {
    const unioned = unionCanonicalLines([
      { line: '804', disruptions: 40 },
      { line: 'custom-route', disruptions: 2 },
    ]);
    const byLine = Object.fromEntries(unioned.map((l) => [l.line, l.disruptions]));
    // Canonical line with discovered data keeps its count.
    expect(byLine['804']).toBe(40);
    // Canonical line without data defaults to 0.
    expect(byLine['807']).toBe(0);
    // Non-canonical discovered line is still appended.
    expect(byLine['custom-route']).toBe(2);
    // No duplicates.
    expect(new Set(unioned.map((l) => l.line)).size).toBe(unioned.length);
  });

  it('station pages include on-time stats, daily table and breadcrumb JSON-LD', () => {
    const html = renderStationPage(stationStats, [{ slug: 'kobenhavn-h', stop_id: '860000626', stop_name: 'København H' }]);
    expect(html).toContain('<title>Malmö Hyllie — punctuality archive — Øresund.live</title>');
    expect(html).toContain('<link rel="canonical" href="https://oresund.live/station/hyllie" />');
    expect(html).toContain('92.9%'); // on_time_pct stat
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('København H'); // sibling link
  });

  it('station index renders the monitored stops', () => {
    const html = renderStationIndex(stationStatsSlugList());
    expect(html).toContain('href="/station/hyllie"');
    expect(html).toContain('href="/station/kobenhavn-h"');
  });

  it('JSON-LD does not allow </script> breakout via line values', () => {
    const evilLine: ArchiveLineStats = { ...lineStats, line: '</script><script>alert(1)' };
    const html = renderLinePage(evilLine.line, evilLine, []);
    const ldMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(ldMatches.length).toBeGreaterThan(0);
    const rawLd = ldMatches[0]![1]!;
    expect(rawLd).not.toContain('</script>');
    expect(rawLd).toContain('\\u003c');
    expect(JSON.parse(rawLd.replace(/\\u003c/g, '<')).itemListElement ?? JSON.parse(rawLd.replace(/\\u003c/g, '<'))['@graph']).toBeDefined();
  });
});

function stationStatsSlugList() {
  return [
    { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
    { slug: 'kobenhavn-h', stop_id: '860000626', stop_name: 'København H' },
  ];
}

describe('handleArchiveRequest dispatch', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(routes: Record<string, unknown>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const ok = Object.keys(routes).find((k) => url.includes(k.toLowerCase()));
        if (ok && ok !== '__404__') return jsonResponse(routes[ok]);
        throw new Error(`no stub for ${url}`);
      }),
    );
  }

  it('renders /history as the index (no fetch)', async () => {
    const res = await handleArchiveRequest('/history');
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toContain('text/html');
    expect(await res?.text()).toContain('<h1>Disruption history</h1>');
  });

  it('renders /history/30 from the collector', async () => {
    stubFetch({ '/api/transit/history': history });
    const res = await handleArchiveRequest('/history/30');
    expect(res?.status).toBe(200);
    expect(await res?.text()).toContain('Disruption history — last 30 days');
  });

  it('renders /line index by enumerating lines', async () => {
    stubFetch({ '/api/transit/lines': { lines: [{ line: '804', disruptions: 4 }] } });
    const res = await handleArchiveRequest('/line');
    expect(res?.status).toBe(200);
    const html = await res?.text();
    expect(html).toContain('href="/line/804"');
    // A canonical line with no data must also be listed by the index.
    expect(html).toContain('href="/line/807"');
  });

  it('renders /line/804 from collector data', async () => {
    stubFetch({
      '/api/transit/lines': { lines: [{ line: '804', disruptions: 4 }] },
      '/api/transit/line/804': lineStats,
    });
    const res = await handleArchiveRequest('/line/804');
    expect(res?.status).toBe(200);
    const html = await res?.text();
    expect(html).toContain('Line 804 — disruption archive');
    expect(html).toContain('<link rel="canonical" href="https://oresund.live/line/804" />');
  });

  it('returns null (404) when the collector 404s an unknown line', async () => {
    // The collector answers 404 → the archive route must not render a page.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/transit/lines')) return jsonResponse({ lines: [] });
        if (url.includes('/api/transit/line/nope')) return jsonResponse({ error: 'x' }, 404);
        throw new Error(`no stub for ${url}`);
      }),
    );
    const res = await handleArchiveRequest('/line/nope');
    expect(res).toBeNull();
  });

  it('renders /station and /station/{slug}', async () => {
    stubFetch({
      '/api/transit/stations': { stations: stationStatsSlugList() },
      '/api/transit/station/hyllie': stationStats,
    });
    const index = await handleArchiveRequest('/station');
    expect(await index?.text()).toContain('København H');

    const page = await handleArchiveRequest('/station/hyllie');
    expect(page?.status).toBe(200);
    expect(await page?.text()).toContain('Malmö Hyllie — punctuality archive');
  });

  it('returns 502 on collector failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const res = await handleArchiveRequest('/history/30');
    expect(res?.status).toBe(502);
  });

  it('returns null for a non-archive path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    const res = await handleArchiveRequest('/methodology');
    expect(res).toBeNull();
  });
});
