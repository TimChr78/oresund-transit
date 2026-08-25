import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_LINES,
  MONITORING_START,
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
import { translate } from '../src/i18n';

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

/** Every JSON-LD node across a page's blocks — graph children, or the block itself. */
function graphNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  for (const block of parseJsonLd(html)) {
    const b = block as Record<string, unknown>;
    const graph = b['@graph'];
    if (Array.isArray(graph)) nodes.push(...(graph as Record<string, unknown>[]));
    else nodes.push(b);
  }
  return nodes;
}

/** The first JSON-LD node of a given @type on a page. */
function findNode(html: string, type: string): Record<string, unknown> | undefined {
  return graphNodes(html).find((n) => n['@type'] === type);
}

describe('archive renderers', () => {
  it('station stats with zero delay observations emit null avgDelay - no NaN/Infinity in prerendered HTML (CR regression)', () => {
    // A station whose window has rows but no delayed trains must not divide by zero.
    const empty = {
      ...stationStats,
      delayed_count: 0,
      avg_delay_seconds: null,
      daily: stationStats.daily.map((d) => ({ ...d, delayed: 0, avg_delay_seconds: null })),
    };
    const html = renderStationPage(empty, stationStatsSlugList());
    expect(html).not.toMatch(/NaN|Infinity/);
  });

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

  it('MONITORING_START is the live-monitoring start date (2026-08-06)', () => {
    expect(MONITORING_START).toBe('2026-08-06');
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
    const html = renderStationPage(stationStats, stationStatsSlugList());
    expect(html).toContain('<title>Malmö Hyllie — punctuality — Øresund.live</title>');
    expect(html).toContain('<link rel="canonical" href="https://oresund.live/station/hyllie" />');
    expect(html).toContain('92.9%'); // on_time_pct stat
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('København H'); // sibling link
    expect(html).toContain('Malmö C'); // new sibling link
    expect(html).not.toContain('No data yet'); // non-empty archive has no empty-state note
    // L4/L5 — every og-tagged page ships the large-image twitter card and og:image (+alt).
    expect(html).toContain('property="og:image" content="https://oresund.live/og-card.png"');
    expect(html).toContain('property="og:image:alt" content="Øresund.live — Øresundståg departures across the Sound"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:image" content="https://oresund.live/og-card.png"');
  });

  it('station pages with an empty archive render graceful "no data yet" copy (no div-by-zero)', () => {
    const empty: ArchiveStationStats = {
      ...stationStats,
      slug: 'kastrup',
      stop_id: '860000858',
      stop_name: 'Københavns Lufthavn (Kastrup)',
      total_departures: 0,
      on_time_count: 0,
      delayed_count: 0,
      canceled_count: 0,
      on_time_pct: 0,
      avg_delay_seconds: null,
      daily: [
        { date: '2026-08-06', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
      ],
      recent: [],
    };
    const html = renderStationPage(empty, stationStatsSlugList());
    expect(html).toContain('<title>Københavns Lufthavn (Kastrup) — punctuality — Øresund.live</title>');
    expect(html).toContain('No data yet — this station\'s archive starts once live monitoring begins.');
    expect(html).toContain('No departures recorded yet.');
    expect(html).toContain('0%'); // zeroed stats, never NaN
    expect(html).not.toContain('NaN');
    // Empty archives must stay indexable — never noindex.
    expect(html).toContain('<meta name="robots" content="index,follow" />');
    expect(html).not.toContain('noindex');
  });

  it('station pages collapse pre-monitoring empty days into ONE monitoring note but keep post-monitoring empty rows', () => {
    // Ascending daily series: two zero-filled pre-monitoring days (2026-08-04..05,
    // before MONITORING_START), a real-data day at monitoring start, and a quiet
    // (empty) day AFTER monitoring began — which is a genuine data point.
    const mixed: ArchiveStationStats = {
      ...stationStats,
      days: 5,
      date_from: '2026-08-03',
      date_to: '2026-08-07',
      daily: [
        { date: '2026-08-03', total: 12, on_time: 11, delayed: 1, canceled: 0, on_time_pct: 91.7, avg_delay_seconds: 200 },
        { date: '2026-08-04', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
        { date: '2026-08-05', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
        { date: '2026-08-06', total: 15, on_time: 14, delayed: 1, canceled: 0, on_time_pct: 93.3, avg_delay_seconds: 180 },
        { date: '2026-08-07', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
      ],
    };
    const html = renderStationPage(mixed, stationStatsSlugList());
    // The pre-monitoring zero days collapse into EXACTLY one explanatory note row.
    expect(html).toContain('Monitoring began 2026-08-06');
    expect((html.match(/Monitoring began 2026-08-06/g) ?? []).length).toBe(1);
    expect(html).not.toContain('>2026-08-05<');
    expect(html).not.toContain('>2026-08-04<');
    // A real-data day (pre- or post-monitoring) still renders as a row.
    expect(html).toContain('>2026-08-03<');
    expect(html).toContain('>2026-08-06<');
    // 2026-08-07 is empty AFTER monitoring start: a genuine quiet day stays a row.
    expect(html).toContain('>2026-08-07<');
    // Not a brand-new stop — no "no data yet" banner.
    expect(html).not.toContain('No data yet');
  });

  it('station index renders the monitored stops', () => {
    const html = renderStationIndex(stationStatsSlugList());
    expect(html).toContain('href="/station/hyllie"');
    expect(html).toContain('href="/station/kobenhavn-h"');
    expect(html).toContain('href="/station/malmo-c"');
    expect(html).toContain('href="/station/kastrup"');
  });

  it('station archive title template keeps the longest monitored stop ≤ 60 chars (L3)', () => {
    // "Københavns Lufthavn (Kastrup)" is 29 chars — the longest name; the old
    // "… — punctuality archive — Øresund.live" template produced a 66-char
    // <title>. The i18n template must keep the rendered title within limits.
    const kastrup: ArchiveStationStats = {
      ...stationStats,
      slug: 'kastrup',
      stop_id: '860000858',
      stop_name: 'Københavns Lufthavn (Kastrup)',
      total_departures: 0,
      on_time_count: 0,
      delayed_count: 0,
      canceled_count: 0,
      on_time_pct: 0,
      avg_delay_seconds: null,
      daily: [
        { date: '2026-08-06', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
      ],
      recent: [],
    };
    const title = translate('station_archive_title', 'en', { name: kastrup.stop_name });
    expect(title.length).toBeLessThanOrEqual(60);
    // And it renders verbatim into the page <title>.
    const html = renderStationPage(kastrup, stationStatsSlugList());
    expect(html).toContain(`<title>${title}</title>`);
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

describe('Dataset JSON-LD on archive pages (SEO audit H4)', () => {
  it('line pages carry a Dataset node with temporal coverage, CC-BY license, distribution and variableMeasured', () => {
    const html = renderLinePage('804', lineStats, [{ line: '803', disruptions: 1 }]);
    const dataset = findNode(html, 'Dataset');
    expect(dataset).toBeDefined();
    expect(dataset?.name).toContain('Line 804');
    expect(dataset?.description).toBeTruthy();
    expect(dataset?.temporalCoverage).toBe('2026-07-31/2026-08-06');
    expect(dataset?.license).toBe('https://creativecommons.org/licenses/by/4.0/');
    const dist = dataset?.distribution as { contentUrl?: string };
    expect(dist.contentUrl).toBe('https://oresund.live/line/804');
    expect((dataset?.variableMeasured as string[]).length).toBeGreaterThan(0);
  });

  it('creators track the data source window: KoDa backfill era → Trafiklab + KoDa; live era → Trafiklab only', () => {
    // The fixture window starts 2026-07-31, before live data (2026-08-06) — the
    // KoDa historical backfill is part of the dataset, so both are credited.
    const backfill = renderLinePage('804', lineStats, []);
    const backfillCreators = (findNode(backfill, 'Dataset')?.creator as { name: string }[]).map((c) => c.name);
    expect(backfillCreators).toEqual(expect.arrayContaining(['Trafiklab', 'KoDa']));

    // A window entirely inside the live-data era is Trafiklab-only.
    const liveOnly: ArchiveLineStats = { ...lineStats, date_from: '2026-08-10', date_to: '2026-08-16' };
    const fresh = renderLinePage('804', liveOnly, []);
    const freshCreators = (findNode(fresh, 'Dataset')?.creator as { name: string }[]).map((c) => c.name);
    expect(freshCreators).toEqual(['Trafiklab']);
  });

  it('station pages carry a Dataset node (Trafiklab creator) covering their window', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList());
    const dataset = findNode(html, 'Dataset');
    expect(dataset).toBeDefined();
    expect(dataset?.temporalCoverage).toBe('2026-07-31/2026-08-06');
    expect(dataset?.license).toBe('https://creativecommons.org/licenses/by/4.0/');
    const dist = dataset?.distribution as { contentUrl?: string };
    expect(dist.contentUrl).toBe('https://oresund.live/station/hyllie');
    const creators = dataset?.creator as { name: string }[];
    expect(creators.map((c) => c.name)).toEqual(['Trafiklab']);
    expect((dataset?.variableMeasured as string[]).length).toBeGreaterThan(0);
  });

  it('history day pages carry a Dataset node matching their window', () => {
    const html = renderHistoryPage(7, history);
    const dataset = findNode(html, 'Dataset');
    expect(dataset).toBeDefined();
    expect(dataset?.temporalCoverage).toBe('2026-07-31/2026-08-06');
    expect(dataset?.license).toBe('https://creativecommons.org/licenses/by/4.0/');
    const dist = dataset?.distribution as { contentUrl?: string };
    expect(dist.contentUrl).toBe('https://oresund.live/history/7');
    expect((dataset?.variableMeasured as string[]).length).toBeGreaterThan(0);
  });
});

describe('ItemList JSON-LD on history windows (SEO audit M9)', () => {
  it('each history day page lists the other available windows as an ItemList', () => {
    const html = renderHistoryPage(30, history);
    const itemList = findNode(html, 'ItemList');
    expect(itemList).toBeDefined();
    const urls = (itemList?.itemListElement as { url?: string }[]).map((i) => i.url);
    expect(urls).toContain('https://oresund.live/history/7');
    expect(urls).not.toContain('https://oresund.live/history/30');
  });
});

describe('JSON-LD block structure (SEO audit M10)', () => {
  it('declares @context once at the block root — never nested inside @graph nodes', () => {
    const pages = [
      renderHistoryPage(7, history),
      renderLineIndex([{ line: '804', disruptions: 1 }]),
      renderLinePage('804', lineStats, []),
      renderStationIndex(stationStatsSlugList()),
      renderStationPage(stationStats, stationStatsSlugList()),
    ];
    for (const page of pages) {
      for (const block of parseJsonLd(page)) {
        const root = block as { '@context'?: string; '@graph'?: Record<string, unknown>[] };
        expect(root['@context'], JSON.stringify(block)).toBe('https://schema.org');
        for (const node of root['@graph'] ?? []) {
          expect(node['@context'], JSON.stringify(block)).toBeUndefined();
        }
      }
    }
  });
});

function stationStatsSlugList() {
  return [
    { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
    { slug: 'kobenhavn-h', stop_id: '860000626', stop_name: 'København H' },
    { slug: 'malmo-c', stop_id: '740000001', stop_name: 'Malmö C' },
    { slug: 'kastrup', stop_id: '860000858', stop_name: 'Københavns Lufthavn (Kastrup)' },
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

  it('redirects /history to the default 30-day window (H5: no duplicate index)', async () => {
    // No fetch — the redirect is served before any collector call.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('must not fetch'); }));
    const res = await handleArchiveRequest('/history');
    expect(res?.status).toBe(301);
    expect(res?.headers.get('location')).toBe('/history/30');
    const trailing = await handleArchiveRequest('/history/');
    expect(trailing?.status).toBe(301);
    expect(trailing?.headers.get('location')).toBe('/history/30');
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

describe('archive SEO pass — intro paragraphs, summary stats, monitoring note', () => {
  it('gives each history window a unique intro paragraph (H5)', () => {
    const phrases: Record<number, string> = {
      7: 'A snapshot of the last 7 days',
      14: 'Two weeks of service history',
      30: 'A month of service history',
      90: 'Three months of service history',
    };
    for (const days of [7, 14, 30, 90] as const) {
      const html = renderHistoryPage(days, history);
      expect(html, `window ${days}`).toContain(phrases[days]!);
    }
    // Intros are window-specific, not shared boilerplate.
    expect(renderHistoryPage(30, history)).not.toContain('A snapshot of the last 7 days');
    expect(renderHistoryPage(7, history)).not.toContain('Three months of service history');
  });

  it('prerenders a summary stats row on history pages (total, cancellations, delays, alerts, avg delay)', () => {
    const html = renderHistoryPage(7, history);
    // history fixture: total 4; cancellations 1; delays 3; alerts 0; avg 650 → "11 min"
    expect(html).toContain('<span class="stat"><b>4</b><span>Total</span></span>');
    expect(html).toContain('<span class="stat"><b>1</b><span>Cancellations</span></span>');
    expect(html).toContain('<span class="stat"><b>3</b><span>Delays</span></span>');
    expect(html).toContain('<span class="stat"><b>0</b><span>Alerts</span></span>');
    expect(html).toContain('<span class="stat"><b>11 min</b><span>Avg delay</span></span>');
  });

  it('weights the avg delay by delayed records, not the total disruption count (cancellations must not skew it)', () => {
    // Day A has 10 disruptions but only 3 delays (7 cancellations); weighting
    // by count would over-weight it 3.3x. Day B has 2 delays, 0 cancellations.
    const weighted: ArchiveHistory = {
      ...history,
      days: 7,
      total_disruptions: 12,
      daily: [
        { date: '2026-08-06', count: 10, cancellations: 7, delays: 3, alerts: 0, avg_delay: 600 },
        { date: '2026-08-05', count: 2, cancellations: 0, delays: 2, alerts: 0, avg_delay: 1200 },
      ],
    };
    const html = renderHistoryPage(7, weighted);
    // Correct: (600*3 + 1200*2) / (3+2) = 840s → "14 min".
    // Count-weighting would yield (600*10 + 1200*2) / (10+2) = 700s → "12 min".
    expect(html).toContain('<span class="stat"><b>14 min</b><span>Avg delay</span></span>');
  });

  it('replaces pre-monitoring empty days with the monitoring-began note', () => {
    const withGap: ArchiveHistory = {
      ...history,
      days: 90,
      date_from: '2026-06-01',
      date_to: '2026-08-06',
      total_disruptions: 5,
      daily: [
        { date: '2026-08-06', count: 3, cancellations: 0, delays: 3, alerts: 0, avg_delay: 650 },
        { date: '2026-08-05', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
        { date: '2026-08-04', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
        { date: '2026-06-01', count: 2, cancellations: 0, delays: 2, alerts: 0, avg_delay: 300 },
      ],
    };
    const html = renderHistoryPage(90, withGap);
    // The zero-filled pre-monitoring run collapses into one explanatory row.
    expect(html).toContain('Monitoring began 2026-08-06');
    expect(html).not.toContain('>2026-08-05<');
    expect(html).not.toContain('>2026-08-04<');
    // The fixture's daily rows are NEWEST-first (collector order), so the gap
    // row must still read oldest → newest — never an inverted period.
    expect(html).toContain('4 Aug 2026 to 5 Aug 2026');
    expect(html).not.toContain('5 Aug 2026 to 4 Aug 2026');
    // Real data days still render as rows.
    expect(html).toContain('>2026-08-06<');
    expect(html).toContain('>2026-06-01<');
  });

  it('keeps empty days AFTER monitoring began as ordinary zero rows', () => {
    const withQuietDay: ArchiveHistory = {
      ...history,
      total_disruptions: 3,
      daily: [
        { date: '2026-08-06', count: 3, cancellations: 0, delays: 3, alerts: 0, avg_delay: 650 },
        { date: '2026-08-07', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
      ],
    };
    const html = renderHistoryPage(7, withQuietDay);
    // 2026-08-07 is after monitoring start: a genuine quiet day stays a table row.
    expect(html).toContain('>2026-08-07<');
    expect(html).not.toContain('Monitoring began 2026-08-06');
  });

  it('line pages carry an intro paragraph and a summary stats row', () => {
    const html = renderLinePage('804', lineStats, [{ line: '803', disruptions: 1 }]);
    expect(html).toContain('Disruptions recorded for line 804');
    expect(html).toContain('<span class="stat"><b>4</b><span>Total</span></span>');
    expect(html).toContain('<span class="stat"><b>1</b><span>Cancellations</span></span>');
    expect(html).toContain('<span class="stat"><b>3</b><span>Delays</span></span>');
    expect(html).toContain('<span class="stat"><b>11 min</b><span>Avg delay</span></span>');
  });

  it('escapes the line value inside the new intro copy', () => {
    const evil = { ...lineStats, line: '<script>alert(1)</script>' };
    const html = renderLinePage(evil.line, evil, []);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('station pages carry an intro paragraph', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList());
    expect(html).toContain('On-time performance at Malmö Hyllie');
    // The existing summary stats row stays intact.
    expect(html).toContain('<span class="stat"><b>99</b><span>Departures</span></span>');
    expect(html).toContain('<span class="stat"><b>92.9%</b><span>On time</span></span>');
  });
});
