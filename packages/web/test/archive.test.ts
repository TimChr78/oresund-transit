import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_LINES,
  corridorTotals,
  renderHistoryHub,
  renderHistoryPage,
  renderLineIndex,
  renderLinePage,
  renderStationIndex,
  renderStationPage,
  unionCanonicalLines,
  type ArchiveHistory,
  type ArchiveLineStats,
  type ArchivePunctuality,
  type ArchiveStationStats,
} from '../src/lib/archive';
import { handleArchiveRequest } from '../src/lib/archive-http';
import { STATIC_STATIONS } from '../src/lib/sitemap';
import { translate } from '../src/i18n';
import { esc } from '../src/lib/html';

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

/**
 * A minimal corridor-wide punctuality payload — the /api/transit/punctuality
 * shape the /history hub sums into its three headline numbers.
 */
const punctuality: ArchivePunctuality = {
  days: 30,
  date_from: '2026-07-08',
  date_to: '2026-08-06',
  daily: [
    { date: '2026-08-06', total: 40, on_time: 37, delayed: 2, canceled: 1, on_time_pct: 92.5, avg_delay_seconds: 120 },
    { date: '2026-08-05', total: 20, on_time: 18, delayed: 2, canceled: 0, on_time_pct: 90, avg_delay_seconds: 90 },
  ],
};

/** The hub's other input: the 30-day disruption window. */
const history30: ArchiveHistory = {
  days: 30,
  date_from: '2026-07-08',
  date_to: '2026-08-06',
  total_disruptions: 7,
  daily: [{ date: '2026-08-06', count: 3, cancellations: 1, delays: 2, alerts: 0, avg_delay: 300 }],
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

/** A corridor snapshot, the same shape /api/transit/live returns. */
const liveSnapshot = {
  status: 'amber' as const,
  status_text: 'Delays',
  timestamp: '2026-08-06T21:59:27',
  time_short: '21:59',
  disruption_count: 2,
  departure_counts: { to_denmark: 0, to_sweden: 0, bus: 0 },
  service_shutdown: false,
  directions: { to_denmark: [], to_sweden: [], bus: [] },
};

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
  it('every archive page emits the self-referencing hreflang set (en + x-default) in <head>', () => {
    // Most archive routes exist as ONE URL per page (no /sv/ or /da/ twins),
    // so each must carry at least the en + x-default alternates pointing at
    // itself. The station pages and the /history hub ship the FULL cluster
    // instead — which still satisfies the minimum asserted here. Mirrors the
    // hreflang pattern of the static pages (seo.ts).
    const pages: [string, string][] = [
      [renderHistoryHub(punctuality, history30), 'https://oresund.live/history'],
      [renderHistoryPage(7, history), 'https://oresund.live/history/7'],
      [renderLineIndex([{ line: '804', disruptions: 40 }]), 'https://oresund.live/line'],
      [renderLinePage('804', lineStats, []), 'https://oresund.live/line/804'],
      [renderStationIndex(stationStatsSlugList()), 'https://oresund.live/station'],
      [renderStationPage(stationStats, stationStatsSlugList()), 'https://oresund.live/station/hyllie'],
    ];
    for (const [html, url] of pages) {
      expect(html, url).toContain(`<link rel="alternate" hreflang="en" href="${url}" />`);
      expect(html, url).toContain(`<link rel="alternate" hreflang="x-default" href="${url}" />`);
      // The alternates live in <head>, next to the canonical, never in <body>.
      const head = html.slice(0, html.indexOf('</head>'));
      expect(head, url).toContain(`hreflang="x-default"`);
    }
  });

  it('history pages carry SEO head, canonical, attribution and daily table', () => {
    const html = renderHistoryPage(7, history);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Disruption history — last 7 days — Øresund.live</title>');
    expect(html).toContain('<link rel="canonical" href="https://oresund.live/history/7" />');
    // M2: the EN archive must use the English (i18n) attribution, never the
    // Swedish "Data från Trafiklab.se" fragment.
    expect(html).toContain('Data from Trafiklab.se');
    expect(html).not.toContain('Data från Trafiklab.se');
    expect(html).toContain('2026-08-06');
    expect(html).toContain('11 min'); // fmtDelay(650/60) → "11 min"
    // JSON-LD: a BreadcrumbList graph and the site identity.
    const graphs = parseJsonLd(html);
    expect(graphs.length).toBeGreaterThan(0);
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it('every archive page carries og:image (1200x630 og-card) + twitter:card=summary_large_image', () => {
    const pages = [
      renderHistoryHub(punctuality, history30),
      renderHistoryPage(7, history),
      renderLineIndex([]),
      renderLinePage('804', lineStats, []),
      renderStationIndex(stationStatsSlugList()),
      renderStationPage(stationStats, stationStatsSlugList()),
    ];
    for (const html of pages) {
      expect(html).toContain('property="og:title"');
      expect(html).toContain('property="og:description"');
      expect(html).toContain('property="og:url"');
      expect(html).toContain('property="og:image" content="https://oresund.live/og-card.png"');
      expect(html).toContain('property="og:image:width" content="1200"');
      expect(html).toContain('property="og:image:height" content="630"');
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
      expect(html).toContain('name="twitter:title"');
      expect(html).toContain('name="twitter:description"');
    }
  });

  it('history index lists the day ranges', () => {
    const html = renderHistoryHub(punctuality, history30);
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

  it('hub indexes carry descriptive intro paragraphs (M3)', () => {
    const lineIntro = renderLineIndex([]);
    expect(lineIntro).toContain('This hub covers every train service');
    expect(lineIntro).toContain('Øresundståg');
    expect(lineIntro).toContain('last 30 days');
    const stationIntro = renderStationIndex(stationStatsSlugList());
    expect(stationIntro).toContain('This hub covers the monitored stops');
    expect(stationIntro).toContain('København H');
    expect(stationIntro).toContain('last 30 days');
  });

  it('line index lists every canonical line, even with no discovered data', () => {
    const html = renderLineIndex([]);
    // Every canonical line archive is linked, including empty ones.
    for (const l of CANONICAL_LINES) expect(html).toContain(`href="/line/${encodeURIComponent(l)}"`);
    // M4: anchors carry route context ("delays & history"), not a bare line number.
    expect(html).toContain('>Line 807 delays &amp; history</a> <span class="meta">— 0 disruptions recorded</span>');
    // No duplicates in the ItemList.
    const hrefs = [...html.matchAll(/href="\/line\/[^"]+"/g)].map((m) => m[0]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('line index anchors carry route context even with recorded disruptions', () => {
    const html = renderLineIndex([{ line: '804', disruptions: 40 }]);
    expect(html).toContain('>Line 804 delays &amp; history</a> <span class="meta">— 40 disruptions recorded</span>');
  });

  it('line page sibling links carry the same descriptive anchor text', () => {
    const html = renderLinePage('804', lineStats, [{ line: '807', disruptions: 1 }]);
    expect(html).toContain('>Line 807 delays &amp; history</a>');
    expect(html).not.toContain('<a href="/line/807">Line 807</a>');
  });

  it('empty-archive line page renders correct SEO markup (noindex,follow)', () => {
    const empty: ArchiveLineStats = {
      ...lineStats,
      line: '807',
      total_disruptions: 0,
      by_cause: [],
      recent: [],
    };
    const html = renderLinePage('807', empty, []);
    expect(html).toContain('<title>Line 807 — disruption archive — Øresund.live</title>');
    expect(html).toContain('<meta name="description" content="Disruption history for Line 807');
    expect(html).toContain('<link rel="canonical" href="https://oresund.live/line/807" />');
    // audit6 L2 — an archive with nothing recorded in its window is a real,
    // linked page with an honest note, but not a page to index. noindex,follow
    // keeps it out of the index while the sibling and station cross-links it
    // carries still count, which is the same rule the sitemap applies (M6).
    expect(html).toContain('<meta name="robots" content="noindex,follow" />');
    // M1: an annotation replaces the zero-data sections (no blank tables).
    expect(html).toContain('No disruptions recorded since monitoring began 2026-08-06.');
    // Sibling links still list the canonical line set.
    expect(html).toContain('href="/line/801"');

    // A line with data stays indexable.
    const withData = renderLinePage('802', lineStats, []);
    expect(withData).toContain('<meta name="robots" content="index,follow" />');
    expect(withData).not.toContain('noindex');
  });

  it('never formats an impossible collector date into a plausible one (audit6 M7)', () => {
    // fmtDate is the English archive formatter audit5 M5 left alone: Date.UTC
    // rolls over, so "2026-99-99" became "7 Jun 2034" and "2026-02-30" became
    // "2 Mar 2026" — a confident, wrong, indexable date in the /line/* and
    // /history/{days} meta descriptions. The impossible value comes back as
    // itself: visibly wrong, never plausibly wrong.
    const impossible: ArchiveLineStats = {
      ...lineStats,
      date_from: '2026-99-99',
      date_to: '2026-02-30',
    };
    const html = renderLinePage('804', impossible, []);
    expect(html).not.toContain('2034');
    expect(html).not.toContain('2027');
    expect(html).not.toContain('Mar 2026');
    expect(html).toContain('content="Disruption history for Line 804 on the Øresund crossing — 4 disruptions between 2026-99-99 and 2026-02-30."');
  });


  it('empty line archives annotate instead of rendering empty <ul>/<table> sections', () => {
    const empty: ArchiveLineStats = {
      ...lineStats,
      line: '801',
      total_disruptions: 0,
      daily: [],
      by_cause: [],
      recent: [],
    };
    const html = renderLinePage('801', empty, []);
    // M1: one clear annotation replaces the zero-data sections.
    expect(html).toContain('No disruptions recorded since monitoring began 2026-08-06.');
    expect(html).not.toContain('<h2>Most common causes</h2>');
    expect(html).not.toContain('<h2>Daily breakdown</h2>');
    expect(html).not.toContain('<h2>Recent disruptions</h2>');
    expect(html).not.toMatch(/<tbody>\s*<\/tbody>/);
    // The line is a known archive — no duplicate "Other lines" self-link.
    expect(html).not.toContain('href="/line/801"');
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
    // SERP-safe title: parenthetical qualifier stripped from <title> (audit2 H1)
    expect(html).toContain('<title>Københavns Lufthavn — punctuality — Øresund.live</title>');
    expect(html).toContain('Københavns Lufthavn (Kastrup)'); // official name kept in body
    expect(html).toContain('No departures recorded since monitoring began 2026-08-06.');
    expect(html).toContain('0%'); // zeroed stats, never NaN
    expect(html).not.toContain('NaN');
    // Empty archives must stay indexable — never noindex.
    expect(html).toContain('<meta name="robots" content="index,follow" />');
    expect(html).not.toContain('noindex');
  });

  it('station recent observations include the destination where available (M4)', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList());
    // The departures table gives a row its route context in columns:
    // 21:59 | 804 | #1143 | Østerport (C1's table replaced the old <ul>).
    expect(html).toContain('<td class="meta">21:59</td><td>804</td><td class="meta">#1143</td><td>Østerport</td>');
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
    // The renderer strips the parenthetical qualifier for <title> (SERP-safe,
    // audit2 H1), so build the expected title the same way.
    const titleName = kastrup.stop_name.replace(/\s*\((?:Kastrup|CPH|Copenhagen)\)\s*/i, ' ').trim();
    const title = translate('station_archive_title', 'en', { name: titleName });
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

describe('station URL encoding (audit3 M6)', () => {
  it('canonical, breadcrumb and Dataset URLs agree with the encoded hrefs of the index cards', () => {
    for (const station of stationStatsSlugList()) {
      const stats: ArchiveStationStats = { ...stationStats, slug: station.slug, stop_id: station.stop_id, stop_name: station.stop_name };
      const html = renderStationPage(stats, stationStatsSlugList());
      const encoded = encodeURIComponent(station.slug);
      const expected = `https://oresund.live/station/${encoded}`;
      // The index card links to the same URL the page claims as canonical.
      const index = renderStationIndex(stationStatsSlugList());
      expect(index).toContain(`href="/station/${encoded}"`);
      expect(html).toContain(`<link rel="canonical" href="${expected}" />`);
      expect(html).toContain(`<link rel="alternate" hreflang="en" href="${expected}" />`);
      const breadcrumb = findNode(html, 'BreadcrumbList') as { itemListElement: { item: string }[] } | undefined;
      expect(breadcrumb?.itemListElement.at(-1)?.item).toBe(expected);
      const dataset = findNode(html, 'Dataset') as { distribution: { contentUrl: string } } | undefined;
      expect(dataset?.distribution.contentUrl).toBe(expected);
    }
  });

  it('encodes the station slug in the station index ItemList too', () => {
    // A slug the dictionaries do not know yet (collector discovery of a new
    // stop) still renders — from the collector's own stop_name.
    const stations = [{ slug: 'malmö c', stop_id: '740000001', stop_name: 'Malmö C' }];
    const html = renderStationIndex(stations);
    const list = findNode(html, 'ItemList') as { itemListElement: { url: string; name: string }[] } | undefined;
    expect(list?.itemListElement[0]?.url).toBe('https://oresund.live/station/malm%C3%B6%20c');
    expect(list?.itemListElement[0]?.name).toBe('Malmö C');
    expect(html).toContain('>Malmö C</span>');
  });
});

describe('zero-data days (audit3 M1)', () => {
  it('station daily rows show an em-dash instead of 0% / 0 min when no departures were observed', () => {
    const withGap: ArchiveStationStats = {
      ...stationStats,
      daily: [
        // Pre-era day: the collector zero-fills the window, so nothing was observed.
        { date: '2026-08-04', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
        { date: '2026-08-05', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: 0 },
        { date: '2026-08-06', total: 15, on_time: 14, delayed: 1, canceled: 0, on_time_pct: 93.3, avg_delay_seconds: 180 },
      ],
    };
    const html = renderStationPage(withGap, stationStatsSlugList());
    expect(html).toContain('<td class="meta">2026-08-04</td><td>0</td><td>0</td><td>0</td><td>0</td><td>—</td><td>—</td>');
    expect(html).toContain('<td class="meta">2026-08-05</td><td>0</td><td>0</td><td>0</td><td>0</td><td>—</td><td>—</td>');
    // An observed day keeps its numbers.
    expect(html).toContain('<td class="meta">2026-08-06</td><td>15</td><td>14</td><td>1</td><td>0</td><td>93.3%</td><td>3 min</td>');
  });

  it('history/line daily rows show an em-dash for the average when a day records no disruptions', () => {
    const html = renderHistoryPage(7, {
      ...history,
      daily: [
        { date: '2026-08-06', count: 3, cancellations: 0, delays: 3, alerts: 0, avg_delay: 650 },
        { date: '2026-08-05', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
      ],
    });
    expect(html).toContain('<td class="meta">2026-08-05</td><td>0</td><td>0</td><td>0</td><td>0</td><td>—</td>');
    expect(html).toContain('<td class="meta">2026-08-06</td><td>3</td><td>0</td><td>3</td><td>0</td><td>11 min</td>');
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
  it('the /history index lists every available window as an ItemList', () => {
    const html = renderHistoryHub(punctuality, history30);
    const itemList = findNode(html, 'ItemList');
    expect(itemList).toBeDefined();
    const urls = (itemList?.itemListElement as { url?: string }[]).map((i) => i.url);
    expect(urls).toEqual([
      'https://oresund.live/history/7',
      'https://oresund.live/history/14',
      'https://oresund.live/history/30',
      'https://oresund.live/history/90',
    ]);
  });

  it('each history day page lists the other available windows as an ItemList', () => {
    const html = renderHistoryPage(30, history);
    const itemList = findNode(html, 'ItemList');
    expect(itemList).toBeDefined();
    const urls = (itemList?.itemListElement as { url?: string }[]).map((i) => i.url);
    expect(urls).toContain('https://oresund.live/history/7');
    expect(urls).not.toContain('https://oresund.live/history/30');
  });
});

describe('the /history hub — aggregate archive page', () => {
  it('keeps the <title> ≤ 60 chars and the meta description inside 120–155 in every language', () => {
    for (const lang of ['en', 'sv', 'da'] as const) {
      const html = renderHistoryHub(punctuality, history30, lang);
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
      expect(title.length, `${lang} title`).toBeLessThanOrEqual(60);
      const desc = /<meta name="description" content="([^"]*)" \/>/.exec(html)?.[1] ?? '';
      expect(desc.length, `${lang} description`).toBeGreaterThanOrEqual(120);
      expect(desc.length, `${lang} description`).toBeLessThanOrEqual(155);
    }
  });

  it('renders the whole page in each language, canonical following the prefix', () => {
    const en = renderHistoryHub(punctuality, history30, 'en');
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('<title>Disruption history — Øresund.live</title>');
    expect(en).toContain('<h1>Disruption history</h1>');
    expect(en).toContain('<link rel="canonical" href="https://oresund.live/history" />');
    expect(en).toContain('over the last 30 days, 2026-07-08 to 2026-08-06');
    expect(en).toContain('<b>91.7%</b>');

    const sv = renderHistoryHub(punctuality, history30, 'sv');
    expect(sv).toContain('<html lang="sv">');
    expect(sv).toContain('<h1>Störningshistorik</h1>');
    expect(sv).toContain('<link rel="canonical" href="https://oresund.live/sv/history" />');
    // The localized page shows localized decimal separators and station names,
    // and links the localized station routes.
    expect(sv).toContain('<b>91,7%</b>');
    expect(sv).toContain('<a href="/sv/station/kobenhavn-h">Köpenhamn H</a>');

    const da = renderHistoryHub(punctuality, history30, 'da');
    expect(da).toContain('<html lang="da">');
    expect(da).toContain('<h1>Forstyrrelseshistorik</h1>');
    expect(da).toContain('<link rel="canonical" href="https://oresund.live/da/history" />');
    expect(da).toContain('<a href="/da/station/malmo-c">Malmö C</a>');
  });

  it('announces the full hreflang cluster, self-consistently, on all three variants', () => {
    for (const lang of ['en', 'sv', 'da'] as const) {
      const prefix = lang === 'en' ? '' : `/${lang}`;
      const html = renderHistoryHub(punctuality, history30, lang);
      const head = html.slice(0, html.indexOf('</head>'));
      expect(head, `${lang} canonical`).toContain(
        `<link rel="canonical" href="https://oresund.live${prefix}/history" />`,
      );
      for (const l of ['en', 'sv', 'da'] as const) {
        const p = l === 'en' ? '' : `/${l}`;
        expect(head, `${lang} -> ${l}`).toContain(
          `<link rel="alternate" hreflang="${l}" href="https://oresund.live${p}/history" />`,
        );
      }
      expect(head, `${lang} x-default`).toContain(
        '<link rel="alternate" hreflang="x-default" href="https://oresund.live/history" />',
      );
      // og:locale + alternates — the twins exist, so they are advertised.
      expect(html).toContain(`<meta property="og:locale" content="${lang === 'en' ? 'en_GB' : lang === 'sv' ? 'sv_SE' : 'da_DK'}" />`);
      expect(html).toContain('og:locale:alternate');
    }
  });

  it('links every window, every monitored station and every canonical line', () => {
    const html = renderHistoryHub(punctuality, history30);
    for (const d of [7, 14, 30, 90]) expect(html).toContain(`href="/history/${d}"`);
    for (const s of STATIC_STATIONS) expect(html).toContain(`href="/station/${s.slug}"`);
    for (const l of CANONICAL_LINES) expect(html).toContain(`href="/line/${encodeURIComponent(l)}"`);
    // The window pages are English-only, so the hub annotates them with
    // hreflang="en" — hreflang only (audit5 M1): it names the target document,
    // while lang would name this element's own Swedish/English anchor text.
    for (const d of [7, 14, 30, 90]) {
      expect(html).toContain(`<a href="/history/${d}" hreflang="en">`);
      expect(html).not.toContain(`<a href="/history/${d}" hreflang="en" lang="en">`);
      expect(html).not.toContain(`<a href="/history/${d}" lang="en">`);
    }
  });

  it('annotates the English-only line archives on the localized variants, station links in its own language', () => {
    const sv = renderHistoryHub(punctuality, history30, 'sv');
    expect(sv).toContain('<a href="/line/804" hreflang="en">Linje 804');
    // No lang: the anchor text is Swedish and must be read as Swedish (audit5 M1).
    expect(sv).not.toContain('<a href="/line/804" hreflang="en" lang="en">');
    expect(sv).toContain('<a href="/sv/station/hyllie">Malmö Hyllie</a>');
    expect(sv).not.toContain('<a href="/station/');
  });

  it('names the departures card\'s unit and says what one disruption counts (audit5 M3)', () => {
    // Three cards, three denominators: the departures figure is per-stop
    // observations, the share is of those observations, and the disruption
    // count is deduped per affected departure and day. Unexplained, the page
    // contradicts itself under a heading that says "recorded together".
    for (const lang of ['en', 'sv', 'da'] as const) {
      const html = renderHistoryHub(punctuality, history30, lang);
      expect(html, lang).toContain(`<span>${esc(translate('hub_stat_departures', lang))}</span>`);
      expect(html, lang).not.toContain(`>${esc(translate('stat_departures', lang))}</span>`);
      expect(html, lang).toContain(esc(translate('hub_disruptions_note', lang)));
    }
    // The empty-corridor variant renders BOTH notes: its disruption card is
    // the only one left standing, so the sentence still explains a number on
    // the page. Dropping it there left "7 disruptions" with no denominator.
    const empty = renderHistoryHub({ ...punctuality, daily: [] }, history30, 'en');
    expect(empty).toContain(esc(translate('station_no_data_note', 'en')));
    expect(empty).toContain(esc(translate('hub_disruptions_note', 'en')));
    // The count itself is still on the page for the note to explain.
    expect(empty).toContain('>7</b>');
  });

  it('localizes the structured data it shares with the visible page (audit5 M2)', () => {
    for (const lang of ['sv', 'da'] as const) {
      const html = renderHistoryHub(punctuality, history30, lang);
      // og:image:alt followed the page's language.
      expect(html, lang).toContain(`<meta property="og:image:alt" content="${translate('og_image_alt', lang)}" />`);
      // The windows ItemList names its items the way the visible list does.
      const lists = graphNodes(html).filter((n) => n['@type'] === 'ItemList');
      const windows = lists[0]!.itemListElement as { name: string }[];
      expect(windows.map((w) => w.name)).toEqual(
        [7, 14, 30, 90].map((d) => translate('history_window_label', lang, { days: d })),
      );
      expect(html, lang).not.toContain('Last 30 days');
    }
  });

  it('localizes the station Dataset name and its measured variables (audit5 M2)', () => {
    const html = renderStationPage({ ...stationStats }, stationStatsSlugList(), null, 'sv');
    const dataset = graphNodes(html).find((n) => n['@type'] === 'Dataset') as {
      name: string;
      variableMeasured: string[];
    };
    expect(dataset.name).toBe(translate('dataset_station_name', 'sv', { name: 'Malmö Hyllie' }));
    expect(dataset.variableMeasured).toEqual(
      (
        [
          'var_departures_per_day',
          'var_on_time_per_day',
          'var_delayed_per_day',
          'var_canceled_per_day',
          'var_on_time_pct_per_day',
          'var_avg_delay_per_day',
        ] as const
      ).map((k) => translate(k, 'sv')),
    );
    // The English page keeps English structured data.
    const en = graphNodes(renderStationPage({ ...stationStats }, stationStatsSlugList())).find(
      (n) => n['@type'] === 'Dataset',
    ) as { variableMeasured: string[] };
    expect(en.variableMeasured).toContain('Departures per day');
  });

  it('renders the headline on-time share through formatPct (audit5 M7)', () => {
    // 92.9 is the collector's one-decimal rounding; the localized pages must
    // show it with their own separator, as the meta description and the daily
    // table beside it already do.
    const sv = renderStationPage({ ...stationStats }, stationStatsSlugList(), null, 'sv');
    expect(sv).toContain('<b>92,9%</b>');
    expect(sv).not.toMatch(/<b>92\.9%<\/b>/);
    const da = renderStationPage({ ...stationStats }, stationStatsSlugList(), null, 'da');
    expect(da).toContain('<b>92,9%</b>');
    const en = renderStationPage({ ...stationStats }, stationStatsSlugList());
    expect(en).toContain('<b>92.9%</b>');
  });

  it('labels the bus lines as buses wherever the line family is named (audit5 M4)', () => {
    // Lines 6 and 16 are the Hyllie buses, archived because the stop is
    // monitored — not train services, and not labelled as one.
    for (const lang of ['en', 'sv', 'da'] as const) {
      const hub = renderHistoryHub(punctuality, history30, lang);
      expect(hub, lang).toContain(esc(translate('bus_line_archive_href', lang, { line: '6' })));
      expect(hub, lang).not.toContain(esc(translate('line_archive_href', lang, { line: '6' })));
      expect(hub, lang).toContain(esc(translate('line_archive_href', lang, { line: '804' })));
    }
    // The line page says so in its H1, and explains why a bus is archived at all.
    const page = renderLinePage('6', { ...lineStats, line: '6', total_disruptions: 12 }, []);
    expect(page).toContain('<h1>Bus line 6 — disruption archive</h1>');
    expect(page).toContain(esc(translate('line_bus_note', 'en', { line: '6' })));
    expect(page).toContain('<title>Bus line 6 — disruption archive — Øresund.live</title>');
    // Every other field that names the page takes the same mode-aware label —
    // not the hardcoded "Line" that had the page contradict its own heading.
    expect(page).toContain('<a href="/line">Lines</a> › Bus line 6</p>');
    expect(page).toContain('Disruption history for Bus line 6 on the Øresund crossing');
    expect(page).not.toContain('Disruption history for line 6 on');
    const crumb = findNode(page, 'BreadcrumbList');
    const crumbNames = (crumb?.itemListElement as { name?: string }[] | undefined)?.map((i) => i.name);
    expect(crumbNames).toContain('Bus line 6');
    expect(crumbNames).not.toContain('Line 6');
    const busDataset = findNode(page, 'Dataset');
    expect(busDataset?.name).toBe('Bus line 6 disruption archive');
    // A train line keeps the unqualified heading — and the unqualified label
    // everywhere else, so the bus wording never leaks onto a train page.
    const train = renderLinePage('804', { ...lineStats, line: '804' }, []);
    expect(train).toContain('<h1>Line 804 — disruption archive</h1>');
    expect(train).not.toContain(esc(translate('line_bus_note', 'en', { line: '804' })));
    expect(train).toContain('Disruption history for Line 804 on the Øresund crossing');
    const trainCrumb = findNode(train, 'BreadcrumbList');
    expect((trainCrumb?.itemListElement as { name?: string }[] | undefined)?.map((i) => i.name)).toContain('Line 804');
    expect(findNode(train, 'Dataset')?.name).toBe('Line 804 disruption archive');
  });

  it('renders line-archive causes as a readable list, not raw enum keys (audit5 L13)', () => {
    const page = renderLinePage('802', { ...lineStats, by_cause: [
      { cause: 'unknown', count: 419 },
      { cause: 'signal_failure', count: 89 },
      { cause: 'vehicle', count: 1 },
    ] }, []);
    expect(page).toContain('<li>Unknown <span class="meta">— 419 disruptions</span></li>');
    expect(page).toContain('<li>Signal failure <span class="meta">— 89 disruptions</span></li>');
    expect(page).toContain('<li>Vehicle fault <span class="meta">— 1 disruption</span></li>');
    expect(page).not.toContain('signal_failure');
  });

  it('aggregates the daily rows into one weighted share, not an average of shares', () => {
    // 55 of 60 on time → 91.7%, and a naive mean of the two daily percentages
    // would have said 91.25 ≈ 91.3.
    expect(corridorTotals(punctuality)).toEqual({
      departures: 60,
      onTime: 55,
      delayed: 4,
      canceled: 1,
      onTimePct: 91.7,
    });
  });

  it('stays honest when the corridor recorded no departures yet', () => {
    // A brand-new deployment zero-fills the window: 0% would read as a
    // catastrophic month, so the punctuality cards give way to the note while
    // the disruption count — an independent dataset — still renders.
    const empty: ArchivePunctuality = { ...punctuality, daily: [] };
    expect(corridorTotals(empty).onTimePct).toBeNull();
    const html = renderHistoryHub(empty, history30);
    expect(html).not.toContain('<b>0%');
    expect(html).toContain('No departures recorded since monitoring began');
    expect(html).toContain('<b>7</b>');
  });

  it('describes its visible link lists as ItemLists, in the language of the page', () => {
    const lists = graphNodes(renderHistoryHub(punctuality, history30, 'sv')).filter((n) => n['@type'] === 'ItemList');
    expect(lists).toHaveLength(3); // windows, stations, lines
    const stations = lists[1]!.itemListElement as { name: string; url: string }[];
    expect(stations).toHaveLength(STATIC_STATIONS.length);
    expect(stations.map((s) => s.url)).toEqual([
      'https://oresund.live/sv/station/hyllie',
      'https://oresund.live/sv/station/kobenhavn-h',
      'https://oresund.live/sv/station/malmo-c',
      'https://oresund.live/sv/station/kastrup',
    ]);
    const lines = lists[2]!.itemListElement as { url: string }[];
    expect(lines).toHaveLength(CANONICAL_LINES.length);
    // /line/* has no sv twins, so those entries stay English URLs.
    expect(lines.every((l) => l.url.startsWith('https://oresund.live/line/'))).toBe(true);
  });
});

describe('JSON-LD block structure (SEO audit M10)', () => {
  it('declares @context once at the block root — never nested inside @graph nodes', () => {
    const pages = [
      renderHistoryHub(punctuality, history30),
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

  it.each([
    ['an impossible month', { ...history, date_from: '2026-99-01' }],
    ['an impossible day', { ...history, date_to: '2026-02-30' }],
  ])('rejects a history window with %s instead of rendering one (audit6 M7)', (_label, payload) => {
    // The four archive boundaries only typeof-checked date_from/date_to, so an
    // impossible window reached the formatters intact and fmtDate's Date.UTC
    // rollover turned it into a plausible wrong date. Rejected here it is what
    // any other unparseable body is: a branded 502.
    stubFetch({ history: payload, punctuality });
    const res = handleArchiveRequest('/history/7');
    return expect(res.then((r) => r?.status)).resolves.toBe(502);
  });

  it('rejects a line payload with an impossible window instead of rendering it', async () => {
    stubFetch({ lines: { lines: [{ line: '804', disruptions: 4 }] }, line: { ...lineStats, date_from: '2026-13-01' } });
    const res = await handleArchiveRequest('/line/804');
    expect(res?.status).toBe(502);
  });

  it('still renders a line page whose window is a real calendar window', async () => {
    stubFetch({ lines: { lines: [{ line: '804', disruptions: 4 }] }, line: lineStats });
    const res = await handleArchiveRequest('/line/804');
    expect(res?.status).toBe(200);
  });

  it('renders /history as the aggregate hub from two collector calls', async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url);
        if (url.includes('/api/transit/punctuality')) return jsonResponse(punctuality);
        if (url.includes('/api/transit/history')) return jsonResponse(history30);
        throw new Error(`no stub for ${url}`);
      }),
    );
    const res = await handleArchiveRequest('/history');
    expect(res?.status).toBe(200);
    expect(res?.headers.get('cache-control')).toBe('public, max-age=300');
    const html = await res?.text();
    // The three headline numbers, aggregated across the corridor.
    expect(html).toContain('<b>60</b>'); // departures
    expect(html).toContain('<b>91.7%</b>'); // on-time share over both days
    expect(html).toContain('<b>7</b>'); // disruptions
    // Exactly the two calls the hub needs — no discovery fetches.
    expect(fetched.sort()).toEqual([
      'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit/history?days=30',
      'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit/punctuality?days=30',
    ]);
  });

  it('answers a collector failure on /history with the branded localized page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const res = await handleArchiveRequest('/history');
    expect(res?.status).toBe(502);
    expect(await res?.text()).toContain('Temporarily unavailable');
    // The localized twins keep their own language on the error page too.
    const sv = await handleArchiveRequest('/sv/history');
    expect(await sv?.text()).toContain('Tillfälligt otillgänglig');
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
      '/api/transit/station/hyllie': { ...stationStats, as_of: '2026-08-06T21:59:27' },
    });
    const index = await handleArchiveRequest('/station');
    expect(await index?.text()).toContain('København H');

    const page = await handleArchiveRequest('/station/hyllie');
    expect(page?.status).toBe(200);
    const html = await page?.text();
    expect(html).toContain('Malmö Hyllie — punctuality archive');
    // The collector's as-of read survives the guarded parser (audit4 N-C1).
    expect(html).toContain('Observed up to 21:59 on 2026-08-06');
  });

  it('drops an as_of the collector mangled instead of rendering it (CodeRabbit PR48)', async () => {
    // formatDate passes digit runs straight through, so an out-of-range stamp
    // would reach the page as "Observed up to 00:00 on 2026-99-99".
    stubFetch({
      '/api/transit/stations': { stations: stationStatsSlugList() },
      '/api/transit/station/hyllie': { ...stationStats, as_of: '2026-99-99T00:00:00' },
    });
    const html = await (await handleArchiveRequest('/station/hyllie'))?.text();
    expect(html).not.toContain('Observed up to');
    expect(html).not.toContain('2026-99-99');
    // The rest of the payload still renders.
    expect(html).toContain('Malmö Hyllie — punctuality archive');
  });

  it('answers a collector failure with the branded localized page (audit4 N-H4)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const res = await handleArchiveRequest('/history/30');
    expect(res?.status).toBe(502);
    expect(res?.headers.get('content-type')).toContain('text/html');
    expect(res?.headers.get('cache-control')).toBe('no-store');
    const body = await res?.text();
    expect(body).toContain('Temporarily unavailable');
    expect(body).toContain('href="/history/30"'); // the retry hint
    expect(body).toContain('href="/"'); // the way home
  });

  it('localizes the 502 from the URL prefix, not just Accept-Language', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    // /sv/station/hyllie is a Swedish page, so its error page is Swedish even
    // though the client asked for Danish. The unprefixed route negotiates.
    const prefixed = await handleArchiveRequest('/sv/station/hyllie', undefined, 'da-DK,da;q=0.9');
    expect(await prefixed?.text()).toContain('Tillfälligt otillgänglig');

    const negotiated = await handleArchiveRequest('/station/hyllie', undefined, 'da-DK,da;q=0.9');
    expect(await negotiated?.text()).toContain('Midlertidigt utilgængelig');
  });

  it('returns null for a non-archive path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    const res = await handleArchiveRequest('/methodology');
    expect(res).toBeNull();
  });
});

describe('archive table scroll containers (audit3 H5)', () => {
  it('pageShell ships the overflow-x scroll container and stops page-level sideways scroll', () => {
    const html = renderHistoryPage(7, history);
    expect(html).toContain('.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }');
    expect(html).toContain('main { max-width: 880px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; overflow-x: hidden; }');
    // the wrapped table keeps a floor width, so the scroll is real on a 375px screen
    expect(html).toContain('.table-scroll table { min-width: 540px; }');
  });

  it('wraps the history daily table in the scroll container', () => {
    const html = renderHistoryPage(7, history);
    expect(html).toContain('<div class="table-scroll"><table><thead><tr><th scope="col">Date</th>');
    expect(html).toMatch(/<\/table><\/div>/);
  });

  it('wraps the line daily table in the scroll container', () => {
    const html = renderLinePage('804', lineStats, [{ line: '803', disruptions: 1 }]);
    expect(html).toContain('<div class="table-scroll"><table>');
  });

  it('wraps the 7-column station daily table in the scroll container', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList());
    expect(html).toContain('<div class="table-scroll">');
    expect(html).toContain('<th scope="col">Date</th><th scope="col">Departures</th><th scope="col">On time</th><th scope="col">Delayed</th><th scope="col">Canceled</th><th scope="col">On time %</th><th scope="col">Avg delay</th>');
  });
});

describe('station live section + localized routes (audit3 C1/H2)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(routes: Record<string, unknown>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const ok = Object.keys(routes).find((k) => url.includes(k.toLowerCase()));
        if (ok) return jsonResponse(routes[ok]);
        throw new Error(`no stub for ${url}`);
      }),
    );
  }

  /** A corridor snapshot, the same shape /api/transit/live returns. */
  const live = {
    status: 'amber' as const,
    status_text: 'Delays',
    timestamp: '2026-08-06T21:59:27',
    time_short: '21:59',
    disruption_count: 2,
    departure_counts: { to_denmark: 0, to_sweden: 0, bus: 0 },
    service_shutdown: false,
    directions: { to_denmark: [], to_sweden: [], bus: [] },
  };

  it('renders the corridor status band with the StatusBanner colour semantics, as static HTML', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList(), live);
    // amber snapshot → the amber band, translated status + disruption count.
    expect(html).toContain('<p class="status-band status-amber" role="status">');
    expect(html).toContain('Delays');
    expect(html).toContain('<span class="band-count">2 disruptions</span>');
    // No client-side behaviour: the archive shell ships no JS at all.
    expect(html).not.toContain('<script src');
  });

  it('renders the red band when service is shut down, whatever the status field says', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList(), {
      ...live,
      status: 'green',
      service_shutdown: true,
    });
    expect(html).toContain('status-band status-red');
    expect(html).toContain('No train service across the Øresund right now');
  });

  it('drops the band but keeps the departures when no live snapshot is available', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList(), null);
    // Assertions target the rendered elements, not the stylesheet (the shell
    // CSS always carries the .status-band rules).
    expect(html).not.toContain('<p class="status-band');
    // The departures come from the station payload, not the /live snapshot, so
    // a corridor-status gap degrades the band only.
    expect(html).toContain('<section class="station-live">');
    expect(html).toContain('<h2>Latest observed departures</h2>');
    expect(html).toContain('#1143');
    // …and the punctuality archive is untouched.
    expect(html).toContain('Daily on-time performance');
  });

  it('labels the departures table as OBSERVED, not a predictive board', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList(), live);
    expect(html).toContain('<h2>Latest observed departures</h2>');
    expect(html).toContain('These are observed departures, not a predictive departure board');
    // The heading is what a crawler reads — "next departures" must not appear.
    expect(html).not.toMatch(/next departures/i);
  });

  it('stamps the departures table with the as-of read it was bounded to (audit4 N-C1)', () => {
    const html = renderStationPage(
      { ...stationStats, as_of: '2026-08-06T21:59:27' },
      stationStatsSlugList(),
      live,
    );
    expect(html).toContain('<h2>Latest observed departures</h2>');
    expect(html).toContain('Observed up to 21:59 on 2026-08-06');
    // The stamp sits under the heading, before the table it qualifies.
    expect(html.indexOf('Observed up to 21:59')).toBeGreaterThan(html.indexOf('Latest observed departures'));
    expect(html.indexOf('Observed up to 21:59')).toBeLessThan(html.indexOf('#1143'));
  });

  it('localizes the as-of stamp and drops it when the payload has none', () => {
    const sv = renderStationPage({ ...stationStats, as_of: '2026-08-06T21:59:27' }, stationStatsSlugList(), live, 'sv');
    expect(sv).toContain('Observerat till och med 21:59 den 2026-08-06');
    // Optional: a collector older than the site ships no as_of at all.
    expect(renderStationPage(stationStats, stationStatsSlugList(), live)).not.toContain('Observed up to');
  });

  it('shows the train technical_number (H2) and bands the delay like the board does', () => {
    const html = renderStationPage(stationStats, stationStatsSlugList(), live);
    expect(html).toContain('<th scope="col">Time</th><th scope="col">Line</th><th scope="col">Train</th><th scope="col">Destination</th><th scope="col">Status</th><th scope="col">Delay</th>');
    expect(html).toContain('#1143');
    // on_time departure → the hyphenated badge class the stylesheet defines.
    expect(html).toContain('<span class="badge badge-band-on-time"');
  });

  it('renders a cancellation as a cancellation, never as an on-time badge', () => {
    const canceled = {
      ...stationStats.recent[0]!,
      id: 2,
      status: 'canceled' as const,
      canceled: 1 as const,
      delay_seconds: 0,
      technical_number: '1188',
    };
    const stats = { ...stationStats, recent: [canceled] };
    const html = renderStationPage(stats, stationStatsSlugList(), live);
    expect(html).toContain('<span class="badge badge-cancellation">Cancellation</span>');
    expect(html).not.toContain('<span class="badge badge-band-on-time"');
    // A cancelled train has no delay to report — not "0 min".
    expect(html).not.toContain('<td>0 min</td>');
  });

  it('localizes the whole page for /sv and /da (names, headings, table headers, siblings)', () => {
    const sv = renderStationPage(stationStats, stationStatsSlugList(), live, 'sv');
    const da = renderStationPage(stationStats, stationStatsSlugList(), live, 'da');
    expect(sv).toContain('<html lang="sv">');
    expect(da).toContain('<html lang="da">');
    // M4: the stop name comes from the dictionary, not the collector literal.
    expect(sv).toContain('<h1>Malmö Hyllie — punktlighetsarkiv</h1>');
    expect(da).toContain('<h1>Malmö Hyllie — rettidighedsarkiv</h1>');
    expect(sv).toContain('<h2>Senast observerade avgångar</h2>');
    expect(da).toContain('<h2>Senest observerede afgange</h2>');
    expect(sv).toContain('<th scope="col">Tåg</th>');
    expect(da).toContain('<th scope="col">Tog</th>');
    // Sibling links follow the language prefix (those pages exist).
    expect(sv).toContain('href="/sv/station/kobenhavn-h"');
    expect(da).toContain('href="/da/station/malmo-c"');
    // …and the SEO copy localizes too: title + meta description in the page's
    // language (the JSON-LD Dataset name stays the English site identifier).
    expect(sv).toContain('<title>Malmö Hyllie — punktlighet — Øresund.live</title>');
    expect(sv).toContain('name="description" content="Punktlighetshistorik för Malmö Hyllie');
    expect(da).toContain('<title>Malmö Hyllie — rettidighed — Øresund.live</title>');
  });

  it('announces the full hreflang cluster on station routes only', () => {
    const station = renderStationPage(stationStats, stationStatsSlugList(), live, 'en');
    for (const href of [
      'https://oresund.live/station/hyllie',
      'https://oresund.live/sv/station/hyllie',
      'https://oresund.live/da/station/hyllie',
    ]) {
      expect(station).toContain(`href="${href}"`);
    }
    expect(station).toContain('<link rel="alternate" hreflang="sv" href="https://oresund.live/sv/station/hyllie" />');
    expect(station).toContain('<link rel="alternate" hreflang="da" href="https://oresund.live/da/station/hyllie" />');
    expect(station).toContain('<link rel="alternate" hreflang="x-default" href="https://oresund.live/station/hyllie" />');
    // Canonical follows the language prefix.
    expect(station).toContain('<link rel="canonical" href="https://oresund.live/station/hyllie" />');
    expect(renderStationPage(stationStats, stationStatsSlugList(), live, 'sv')).toContain(
      '<link rel="canonical" href="https://oresund.live/sv/station/hyllie" />',
    );
    // Line and history-window pages stay single-URL: en + a self-referencing
    // x-default. The hub is the exception in the history family.
    const line = renderLinePage('804', lineStats, []);
    expect(line).toContain('<link rel="alternate" hreflang="en" href="https://oresund.live/line/804" />');
    expect(line).not.toContain('hreflang="sv"');
    const window = renderHistoryPage(7, history);
    expect(window).toContain('<link rel="alternate" hreflang="en" href="https://oresund.live/history/7" />');
    expect(window).not.toContain('hreflang="sv"');
  });

  it('localizes the shell chrome (footer) with the page', () => {
    const sv = renderStationPage(stationStats, stationStatsSlugList(), live, 'sv');
    expect(sv).toContain('Live-tavlan');
    expect(sv).toContain('<a href="/sv/">Live-tavlan</a>');
    expect(sv).toContain('Data från Trafiklab.se');
  });

  it('serves /sv/station/{slug} and /da/station/{slug} from the collector (live + stats + stations)', async () => {
    stubFetch({
      '/api/transit/stations': { stations: stationStatsSlugList() },
      '/api/transit/station/hyllie': stationStats,
      '/api/transit/live': liveSnapshot,
    });
    const sv = await handleArchiveRequest('/sv/station/hyllie');
    expect(sv?.status).toBe(200);
    const svHtml = await sv?.text();
    expect(svHtml).toContain('<html lang="sv">');
    expect(svHtml).toContain('<link rel="canonical" href="https://oresund.live/sv/station/hyllie" />');
    expect(svHtml).toContain('status-band');
    const da = await handleArchiveRequest('/da/station/hyllie');
    expect((await da?.text())?.includes('<html lang="da"')).toBe(true);
    // The unprefixed route stays English.
    const en = await handleArchiveRequest('/station/hyllie');
    expect(await en?.text()).toContain('<html lang="en">');
  });

  it('keeps a collector /live outage from failing the station page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/transit/live')) throw new Error('down');
        if (url.includes('/api/transit/stations')) return jsonResponse({ stations: stationStatsSlugList() });
        if (url.includes('/api/transit/station/hyllie')) return jsonResponse(stationStats);
        throw new Error(`no stub for ${url}`);
      }),
    );
    const res = await handleArchiveRequest('/station/hyllie');
    expect(res?.status).toBe(200);
    const html = await res?.text();
    expect(html).not.toContain('<p class="status-band');
    expect(html).toContain('Daily on-time performance');
  });

  it('answers 404 for a localized archive path that has no twin (no sv/da pages exist)', async () => {
    stubFetch({ '/api/transit/history': history });
    expect(await handleArchiveRequest('/sv/history/30')).toBeNull();
    expect(await handleArchiveRequest('/da/line/804')).toBeNull();
    // The English routes are untouched.
    expect((await handleArchiveRequest('/history/30'))?.status).toBe(200);
  });
});

describe('station page TrainStation entity (audit3 M12)', () => {
  it('describes the page as a place: TrainStation with the stop id, place and verified geo', () => {
    const station = findNode(renderStationPage(stationStats, stationStatsSlugList(), liveSnapshot, 'en'), 'TrainStation');
    expect(station).toBeDefined();
    // Anchored on the page URL so the Dataset node can reference it.
    expect(station!['@id']).toBe('https://oresund.live/station/hyllie#station');
    expect(station!['url']).toBe('https://oresund.live/station/hyllie');
    expect(station!['name']).toBe('Malmö Hyllie');
    // The Trafiklab/GTFS stop id — the identifier the collector stores, and
    // the same value llms.txt publishes for this station.
    expect(station!['identifier']).toBe('740001586');
    expect(station!['containedInPlace']).toEqual({ '@type': 'Place', name: 'Malmö, Sweden' });
    expect(station!['geo']).toEqual({ '@type': 'GeoCoordinates', latitude: 55.5627, longitude: 12.9758 });
  });

  it('cross-references the entity from the Dataset node via about', () => {
    const ds = findNode(renderStationPage(stationStats, stationStatsSlugList(), liveSnapshot, 'en'), 'Dataset');
    expect(ds!['about']).toEqual({ '@id': 'https://oresund.live/station/hyllie#station' });
  });

  it('keeps the entity on the localized variants (place facts stay stable, URL follows the lang)', () => {
    for (const lang of ['sv', 'da'] as const) {
      const station = findNode(renderStationPage(stationStats, stationStatsSlugList(), liveSnapshot, lang), 'TrainStation');
      expect(station!['@id']).toBe(`https://oresund.live/${lang}/station/hyllie#station`);
      // Coordinates are a fact about the station, not of the translation.
      expect(station!['geo']).toEqual({ '@type': 'GeoCoordinates', latitude: 55.5627, longitude: 12.9758 });
    }
  });

  it('never renders coordinates for a slug the static table does not know', () => {
    const unknown: ArchiveStationStats = { ...stationStats, slug: 'new-stop', stop_id: '999' };
    const station = findNode(renderStationPage(unknown, stationStatsSlugList(), liveSnapshot, 'en'), 'TrainStation');
    expect(station!['geo']).toBeUndefined();
    expect(station!['containedInPlace']).toBeUndefined();
    // The stop id still comes from the collector payload — the page still
    // identifies the place it measures.
    expect(station!['identifier']).toBe('999');
  });
});

describe('archive page head: RSS autodiscovery + og:locale (audit3 M7/M10)', () => {
  it('links the feed via rel=alternate on every archive page family', () => {
    for (const html of [
      renderHistoryHub(punctuality, history30),
      renderStationIndex(stationStatsSlugList()),
      renderLinePage('804', lineStats, []),
      renderStationPage(stationStats, stationStatsSlugList(), liveSnapshot, 'en'),
    ]) {
      expect(
        html,
        html.slice(0, 80),
      ).toContain('<link rel="alternate" type="application/rss+xml" title="Øresund.live — disruptions" href="/feed.xml" />');
    }
  });

  it('announces og:locale on every page, with alternates only where localized twins exist', () => {
    const station = renderStationPage(stationStats, stationStatsSlugList(), liveSnapshot, 'en');
    expect(station).toContain('<meta property="og:locale" content="en_GB" />');
    // The station routes have sv/da twins, so they advertise them.
    expect(station).toContain('<meta property="og:locale:alternate" content="sv_SE" />');
    expect(station).toContain('<meta property="og:locale:alternate" content="da_DK" />');

    const sv = renderStationPage(stationStats, stationStatsSlugList(), liveSnapshot, 'sv');
    expect(sv).toContain('<meta property="og:locale" content="sv_SE" />');
    expect(sv).toContain('<meta property="og:locale:alternate" content="en_GB" />');

    // Single-URL archive pages announce their language but no twins — there
    // is no /sv/line/804 for an alternate to point at.
    const line = renderLinePage('804', lineStats, []);
    expect(line).toContain('<meta property="og:locale" content="en_GB" />');
    expect(line).not.toContain('og:locale:alternate');
  });
});

describe('station ↔ line cross-links (audit4 N-M1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(routes: Record<string, unknown>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const ok = Object.keys(routes).find((k) => url.includes(k.toLowerCase()));
        if (ok) return jsonResponse(routes[ok]);
        throw new Error(`no stub for ${url}`);
      }),
    );
  }

  it('the station page links the per-line archives the collector observed at the stop', () => {
    const html = renderStationPage({ ...stationStats, lines: ['803', '804'] }, stationStatsSlugList());
    expect(html).toContain('<h2>Lines serving this station</h2>');
    expect(html).toContain('<li><a href="/line/803">Line 803 delays &amp; history</a></li>');
    expect(html).toContain('<li><a href="/line/804">Line 804 delays &amp; history</a></li>');
  });

  it('the line page links the station pages the collector observed the line at', () => {
    const html = renderLinePage('804', { ...lineStats, stops: stationStatsSlugList() }, []);
    expect(html).toContain('<h2>Stations on this line</h2>');
    expect(html).toContain('<li><a href="/station/hyllie">Malmö Hyllie</a></li>');
    expect(html).toContain('<li><a href="/station/kobenhavn-h">København H</a></li>');
  });

  it('trilingual heading: SV and DA station pages name the section in their own language', () => {
    const lines = ['804'];
    expect(renderStationPage({ ...stationStats, lines }, stationStatsSlugList(), null, 'sv')).toContain(
      '<h2>Linjer som trafikerar stationen</h2>',
    );
    expect(renderStationPage({ ...stationStats, lines }, stationStatsSlugList(), null, 'da')).toContain(
      '<h2>Linjer, der betjener stationen</h2>',
    );
  });

  it('localized station pages mark the English-only line archives as English', () => {
    // /line/* ships no sv/da twins, so the link says so instead of reading as a
    // Swedish page pointing at a Swedish URL that does not exist.
    const html = renderStationPage({ ...stationStats, lines: ['804'] }, stationStatsSlugList(), null, 'sv');
    expect(html).toContain('<a href="/line/804" hreflang="en">Linje 804');
    // No lang: the anchor text is Swedish (audit5 M1) — lang would tell the
    // screen reader to pronounce Swedish text with English phonemes.
    expect(html).not.toContain('<a href="/line/804" hreflang="en" lang="en">');
    // The English page needs no annotation of its own links.
    const en = renderStationPage({ ...stationStats, lines: ['804'] }, stationStatsSlugList());
    expect(en).toContain('<a href="/line/804">Line 804');
    expect(en).not.toContain('hreflang="en" lang="en"');
  });

  it('omits the section when the payload carries no list (older collector, empty stop)', () => {
    // Spread-omitted, not `lines: undefined` — the field is optional, and
    // exactOptionalPropertyTypes keeps that honest at the call site too.
    expect(renderStationPage({ ...stationStats, lines: [] }, stationStatsSlugList())).not.toContain(
      'Lines serving this station',
    );
    const noLines: ArchiveStationStats = { ...stationStats };
    delete noLines.lines;
    expect(renderStationPage(noLines, stationStatsSlugList())).not.toContain('Lines serving this station');
    expect(renderLinePage('804', { ...lineStats, stops: [] }, [])).not.toContain('Stations on this line');
    const noStops: ArchiveLineStats = { ...lineStats };
    delete noStops.stops;
    expect(renderLinePage('804', noStops, [])).not.toContain('Stations on this line');
  });

  it('drops a malformed cross-link list at the parse boundary', async () => {
    stubFetch({
      '/api/transit/stations': { stations: stationStatsSlugList() },
      '/api/transit/station/hyllie': { ...stationStats, lines: [{ line: '804' }, 42] },
      '/api/transit/live': liveSnapshot,
    });
    const html = await (await handleArchiveRequest('/station/hyllie'))?.text();
    expect(html).not.toContain('Lines serving this station');
    // …while a well-formed list survives the same boundary.
    stubFetch({
      '/api/transit/stations': { stations: stationStatsSlugList() },
      '/api/transit/station/hyllie': { ...stationStats, lines: ['804'] },
      '/api/transit/live': liveSnapshot,
    });
    const ok = await (await handleArchiveRequest('/station/hyllie'))?.text();
    expect(ok).toContain('<h2>Lines serving this station</h2>');
  });

  it('the served line page carries the station links through the guarded parser', async () => {
    stubFetch({
      '/api/transit/lines': { lines: [{ line: '804', disruptions: 4 }] },
      '/api/transit/line/804': { ...lineStats, stops: stationStatsSlugList() },
    });
    const html = await (await handleArchiveRequest('/line/804'))?.text();
    expect(html).toContain('<h2>Stations on this line</h2>');
    expect(html).toContain('href="/station/kastrup"');
  });
});


describe('localized station pages link their own language (audit4 N-M4)', () => {
  const LANGS = ['en', 'sv', 'da'] as const;
  const prefixOf = (lang: string): string => (lang === 'en' ? '' : `/${lang}`);

  /** Every internal <a> on the page, as [href, attributes]. */
  function anchors(html: string): [string, string][] {
    return [...html.matchAll(/<a href="([^"]*)"([^>]*)>/g)].map((m) => [m[1]!, m[2]!]);
  }

  it('all 12 station pages announce the full en/sv/da/x-default cluster, self-consistently', () => {
    for (const slug of stationStatsSlugList().map((s) => s.slug)) {
      for (const lang of LANGS) {
        const html = renderStationPage({ ...stationStats, slug }, stationStatsSlugList(), liveSnapshot, lang);
        const head = html.slice(0, html.indexOf('</head>'));
        const base = `/station/${slug}`;
        const self = `https://oresund.live${prefixOf(lang)}${base}`;
        expect(head, `${lang} ${slug} canonical`).toContain(`<link rel="canonical" href="${self}" />`);
        for (const l of LANGS) {
          expect(head, `${lang} ${slug} -> ${l}`).toContain(
            `<link rel="alternate" hreflang="${l}" href="https://oresund.live${prefixOf(l)}${base}" />`,
          );
        }
        expect(head, `${lang} ${slug} x-default`).toContain(
          `<link rel="alternate" hreflang="x-default" href="https://oresund.live${base}" />`,
        );
      }
    }
  });

  it('all 12 station pages link same-language counterparts, annotating the English-only ones', () => {
    for (const slug of stationStatsSlugList().map((s) => s.slug)) {
      for (const lang of LANGS) {
        const prefix = prefixOf(lang);
        const html = renderStationPage({ ...stationStats, slug }, stationStatsSlugList(), liveSnapshot, lang);
        for (const [href, attrs] of anchors(html)) {
          if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) continue;
          const isLocalizedTwins = href === `${prefix}/` || href.startsWith(`${prefix}/station/`) || href === '/line/804';
          if (href.startsWith(`${prefix}/`) || (lang === 'en' && href.startsWith('/'))) {
            // Same language as the page: no annotation needed.
            expect(attrs, `${lang} ${slug} -> ${href}`).not.toContain('hreflang');
          } else {
            // English-only target linked from a localized page: say so.
            expect(attrs, `${lang} ${slug} -> ${href}`).toContain('hreflang="en"');
            expect(attrs, `${lang} ${slug} -> ${href}`).toContain('lang="en"');
            expect(isLocalizedTwins).toBe(false);
          }
        }
      }
    }
  });

  it('a localized station page keeps its localized board, methodology and privacy links', () => {
    const html = renderStationPage({ ...stationStats, lines: ['804'] }, stationStatsSlugList(), liveSnapshot, 'sv');
    expect(html).toContain('<a class="brand" href="/sv/" lang="da">Øresund.live</a>');
    expect(html).toContain('<a href="/sv/">Live-tavlan</a>');
    expect(html).toContain('<a href="/sv/methodology">');
    expect(html).toContain('<a href="/sv/privacy">');
    // The English page keeps the unprefixed forms.
    const en = renderStationPage({ ...stationStats, lines: ['804'] }, stationStatsSlugList(), liveSnapshot, 'en');
    expect(en).toContain('<a class="brand" href="/" lang="da">Øresund.live</a>');
    expect(en).toContain('<a href="/methodology">');
    expect(en).toContain('<a href="/privacy">');
  });
});
