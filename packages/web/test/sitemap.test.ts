import { describe, expect, it } from 'vitest';
import { buildSitemap, type SitemapLastmod } from '../src/lib/sitemap';
import { CANONICAL_LINES, renderLinePage, type ArchiveLineStats } from '../src/lib/archive';
import { parseLines } from '../src/lib/archive-http';

/**
 * Fixed dates so the lastmod assertions stay deterministic. Plain W3C dates:
 * buildSitemap validates its lastmod sources instead of clamping them
 * (audit5 L11), so a timestamp here would be dropped rather than sliced.
 */
const LASTMOD: SitemapLastmod = { deployed: '2026-09-01', data: '2026-09-02' };

/**
 * A minimal /line/{line} payload, just enough to drive renderLinePage's robots
 * decision in the L9 test below.
 */
function lineStatsFixture(line: string, over: Partial<ArchiveLineStats>): ArchiveLineStats {
  return {
    line,
    days: 30,
    date_from: '2026-08-06',
    date_to: '2026-09-04',
    total_disruptions: 400,
    daily: [],
    by_cause: [],
    recent: [],
    ...over,
  };
}

/**
 * The sitemap lists every indexable route so Google Search Console can
 * discover them: the three static pages (dashboard/, methodology, privacy)
 * plus the dynamic archive routes (/line/*, /station/* and /history/{days}).
 *
 * It is built by functions/sitemap.xml.js, which discovers the line/station
 * sets from the collector at request time; buildSitemap is the pure builder
 * under test here. Every canonical line is always listed (even with no data) —
 * the dynamic discovery is only a supplement for lines outside the known set.
 */
describe('buildSitemap', () => {
  it('lists the three static pages, the fixed history archive, and every canonical line even when no data resolves', () => {
    const locs = [...buildSitemap([], [], LASTMOD).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // The static pages plus the fixed archive indexes/ranges are always listed.
    expect(locs).toContain('https://oresund.live/');
    expect(locs).toContain('https://oresund.live/methodology');
    expect(locs).toContain('https://oresund.live/privacy');
    // /history is a real page now (the aggregate hub), so it is listed.
    expect(locs).toContain('https://oresund.live/history');
    expect(locs).toContain('https://oresund.live/line');
    expect(locs).toContain('https://oresund.live/station');
    for (const d of [7, 14, 30, 90]) expect(locs).toContain(`https://oresund.live/history/${d}`);
    // M1 (2026-09-26): every canonical line is submitted — including the 7
    // URLs the SEO audit found missing (/line/801, 807, 808, 809, 910, 6, 16).
    // Submission asserts existence; the zero-data pages keep their own
    // noindex decision (linePageIndexable).
    for (const line of ['801', '807', '808', '809', '910', '6', '16']) {
      expect(locs, line).toContain(`https://oresund.live/line/${line}`);
    }
    for (const line of CANONICAL_LINES) {
      expect(locs, line).toContain(`https://oresund.live/line/${line}`);
    }
    // Stations remain discovery-only (no static station set).
    expect(locs).not.toContain('https://oresund.live/station/hyllie');
  });

  it('adds discovered line and station archive pages', () => {
    const locs = [...buildSitemap([{ line: '7085', disruptions: 3 }], [
      { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
      { slug: 'kobenhavn-h', stop_id: '860000626', stop_name: 'København H' },
      { slug: 'malmo-c', stop_id: '740000001', stop_name: 'Malmö C' },
      { slug: 'kastrup', stop_id: '860000858', stop_name: 'Københavns Lufthavn (Kastrup)' },
    ], LASTMOD).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(locs).toContain('https://oresund.live/line');
    // The dynamic, non-canonical line is still appended.
    expect(locs).toContain('https://oresund.live/line/7085');
    expect(locs).toContain('https://oresund.live/station');
    expect(locs).toContain('https://oresund.live/station/hyllie');
    expect(locs).toContain('https://oresund.live/station/kobenhavn-h');
    // New stations expand the sitemap automatically via collector discovery.
    expect(locs).toContain('https://oresund.live/station/malmo-c');
    expect(locs).toContain('https://oresund.live/station/kastrup');
    // No duplicates.
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('URL-encodes line identifiers in the sitemap', () => {
    const xml = buildSitemap([{ line: '800 M/Ø', disruptions: 1 }], [], LASTMOD);
    expect(xml).toContain('https://oresund.live/line/800%20M%2F%C3%98');
  });

  it('is a valid urlset with the sitemaps.org namespace', () => {
    expect(buildSitemap([], [], LASTMOD)).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(buildSitemap([], [], LASTMOD)).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it('adds the 6 localized sv/da static URLs (home, methodology, privacy)', () => {
    const locs = [...buildSitemap([], [], LASTMOD).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain('https://oresund.live/sv/');
    expect(locs).toContain('https://oresund.live/da/');
    expect(locs).toContain('https://oresund.live/sv/methodology');
    expect(locs).toContain('https://oresund.live/da/methodology');
    expect(locs).toContain('https://oresund.live/sv/privacy');
    expect(locs).toContain('https://oresund.live/da/privacy');
  });

  it('annotates each static URL with the full hreflang cluster (en/sv/da/x-default)', () => {
    const xml = buildSitemap([], [], LASTMOD);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    // Every non-archive static URL must carry the x:html link set. Sample the
    // methodology cluster (all four variants present, on each of its 3 URLs).
    const links = [
      'xhtml:link rel="alternate" hreflang="en" href="https://oresund.live/methodology"',
      'xhtml:link rel="alternate" hreflang="sv" href="https://oresund.live/sv/methodology"',
      'xhtml:link rel="alternate" hreflang="da" href="https://oresund.live/da/methodology"',
      'xhtml:link rel="alternate" hreflang="x-default" href="https://oresund.live/methodology"',
    ];
    for (const link of links) {
      // 3 methodology URLs each carry the cluster.
      expect(xml.split(link).length - 1).toBe(3);
    }
    // And the homepage cluster links to the localized root URLs.
    expect(xml).toContain('hreflang="sv" href="https://oresund.live/sv/"');
    expect(xml).toContain('hreflang="da" href="https://oresund.live/da/"');
  });

  it('no <url> entry is bare — every archive URL carries self-referencing en + x-default alternates', () => {
    const xml = buildSitemap([{ line: '7085', disruptions: 3 }], [
      { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
      { slug: 'kastrup', stop_id: '860000858', stop_name: 'Københavns Lufthavn (Kastrup)' },
    ], LASTMOD);
    // Strict: EVERY <url> block (static or archive) must carry at least one
    // xhtml:link alternate — archives have no sv/da twins, so their minimum
    // is the self-referencing en + x-default pair.
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
      .map((m) => m[1])
      .filter((v): v is string => v !== undefined);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry, entry).toMatch(/<xhtml:link rel="alternate" hreflang="[^"]+" href="[^"]+" \/>/);
    }

    // Archive alternates point at the archive URL itself (no /sv/ /da/ twins).
    // The /history hub is not in this list — it has localized twins and is
    // asserted with the full cluster in its own test below.
    const archiveUrls = [
      'https://oresund.live/history/7',
      'https://oresund.live/history/30',
      'https://oresund.live/history/90',
      'https://oresund.live/line',
      'https://oresund.live/line/7085',
      'https://oresund.live/station',
      'https://oresund.live/station/hyllie',
      'https://oresund.live/station/kastrup',
    ];
    for (const url of archiveUrls) {
      const entry = entries.find((e) => e.includes(`<loc>${url}</loc>`));
      expect(entry, url).toBeDefined();
      const block = entry!;
      expect(block, url).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${url}" />`);
      expect(block, url).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${url}" />`);
    }
  });

  it('every URL with data carries a W3C <lastmod>, dated by the family that actually moves it (audit3 H4)', () => {
    const xml = buildSitemap(
      [{ line: '7085', disruptions: 3, last_seen: '2026-08-28' }],
      [{ slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' }],
      LASTMOD,
    );
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
    expect(entries.length).toBeGreaterThan(0);
    // <lastmod> precedes <changefreq> — the order the sitemap XSD defines — and
    // stays at day precision. Only the never-observed canonical lines carry no
    // date at all (asserted in its own test below).
    const dated = entries.filter((e) => e.includes('<lastmod>'));
    expect(dated.length).toBeGreaterThan(0);
    for (const entry of dated) {
      expect(entry, entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod><changefreq>/);
      expect(entry, entry).not.toMatch(/<lastmod>[^<]*T[^<]*<\/lastmod>/);
    }
    // Static pages change only on deploy.
    for (const url of ['https://oresund.live/', 'https://oresund.live/sv/', 'https://oresund.live/da/privacy']) {
      const block = entries.find((e) => e.includes(`<loc>${url}</loc>`));
      expect(block, url).toContain('<lastmod>2026-09-01</lastmod>');
    }
    // The archive set changes with the data.
    for (const url of ['https://oresund.live/history/7', 'https://oresund.live/line', 'https://oresund.live/station/hyllie']) {
      const block = entries.find((e) => e.includes(`<loc>${url}</loc>`));
      expect(block, url).toContain('<lastmod>2026-09-02</lastmod>');
    }
    // A discovered line is dated from its OWN data, not the corpus window.
    expect(entries.find((e) => e.includes('<loc>https://oresund.live/line/7085</loc>'))).toContain(
      '<lastmod>2026-08-28</lastmod>',
    );
  });

  it('submits a line that has never recorded a disruption, undated (M1 + audit4 N-M3)', () => {
    // M1 (2026-09-26) reversed audit5 M4's omission: a zero-content archive is
    // still a real, linked page and the sitemap lists it (existence). What it
    // must NOT do is claim freshness it cannot back (audit4 N-M3) — a line the
    // collector has never seen publishes no <lastmod> at all.
    const xml = buildSitemap([], [], LASTMOD);
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
    for (const line of CANONICAL_LINES) {
      const entry = entries.find((e) => e.includes(`<loc>https://oresund.live/line/${encodeURIComponent(line)}</loc>`));
      expect(entry, line).toBeDefined();
      expect(entry, line).not.toContain('<lastmod>');
    }
    expect(entries.find((e) => e.includes('<loc>https://oresund.live/line</loc>'))).toContain(
      '<lastmod>2026-09-02</lastmod>',
    );
  });;

  it('submits the pre-monitoring bus lines, dated from their own rows (M1)', () => {
    // Lines 6 and 16 carry real rows — from 2026-08-04 and 2026-08-02, BEFORE
    // the 2026-08-06 monitoring start. audit6 M6 kept them out of the sitemap;
    // M1 (2026-09-26) submits every line archive, so they go out dated from
    // their own last data day (audit4 N-M3) while their pages keep noindex
    // (audit6 L2). Existence and keepability are separate decisions now.
    const xml = buildSitemap(
      [
        { line: '6', disruptions: 46, last_seen: '2026-08-04' },
        { line: '16', disruptions: 30, last_seen: '2026-08-02' },
        { line: '802', disruptions: 400, last_seen: '2026-09-01' },
      ],
      [],
      LASTMOD,
    );
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
    expect(entries.find((e) => e.includes('<loc>https://oresund.live/line/6</loc>'))).toContain(
      '<lastmod>2026-08-04</lastmod>',
    );
    expect(entries.find((e) => e.includes('<loc>https://oresund.live/line/16</loc>'))).toContain(
      '<lastmod>2026-08-02</lastmod>',
    );
    // A line with monitored-era data is still submitted, dated from its own data.
    const train = entries.find((e) => e.includes('<loc>https://oresund.live/line/802</loc>'));
    expect(train).toBeDefined();
    expect(train).toContain('<lastmod>2026-09-01</lastmod>');
  });;

  it('submits every line archive while the pages keep their own robots verdict (M1)', () => {
    // M1 (2026-09-26): submission and indexability are separate decisions
    // again. The sitemap lists every line archive (existence); each page still
    // takes its own linePageIndexable verdict (keepability), unchanged here.
    // Same rows into both surfaces, each asserting its own verdict.
    const rows = [
      // In the era but quiet for over 30 days: submitted AND indexable.
      { line: '802', disruptions: 400, last_seen: '2026-08-10' },
      // Rows only from before monitoring: submitted, and noindex.
      { line: '16', disruptions: 30, last_seen: '2026-08-02' },
      // Never observed: submitted, and (no rows in the window) noindex.
      { line: '801', disruptions: 0 },
    ];
    const xml = buildSitemap(rows, [], LASTMOD);
    const entries = [...xml.matchAll(/<loc>https:\/\/oresund\.live\/line\/([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(entries).toEqual([...CANONICAL_LINES]);

    const quiet = renderLinePage('802', lineStatsFixture('802', { total_disruptions: 0, by_cause: [], recent: [], last_seen: '2026-08-10' }), []);
    const bus = renderLinePage('16', lineStatsFixture('16', { last_seen: '2026-08-02' }), []);
    const never = renderLinePage('801', lineStatsFixture('801', { total_disruptions: 0, by_cause: [], recent: [], last_seen: null }), []);
    expect(quiet).toContain('content="index,follow"');
    expect(bus).toContain('content="noindex,follow"');
    expect(never).toContain('content="noindex,follow"');
  });;

  it('submits a line whose /lines last_seen is not a real calendar date — undated (audit7 review + M1)', () => {
    // archive-http's parseLines produces the ArchiveLine[] the sitemap
    // consumes, so a shape-only DATE_RE there let "2026-99-99" through to the
    // era comparison. The parse boundary applies the calendar check first.
    // Since M1 the line is submitted either way (existence), but the impossible
    // date is dropped: the entry carries no <lastmod> and never leaks the raw
    // value.
    const lines = parseLines({
      lines: [
        { line: '804', disruptions: 0, last_seen: '2026-99-99' },
        // Positive control: a real date still drives the line's own lastmod.
        { line: '802', disruptions: 3, last_seen: '2026-08-28' },
      ],
    });
    expect(lines.find((l) => l.line === '804')?.last_seen).toBeUndefined();

    const xml = buildSitemap(lines, [], LASTMOD);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain('https://oresund.live/line/802');
    expect(locs).toContain('https://oresund.live/line/804');
    // And nothing leaks the raw value as a <lastmod> either.
    expect(xml).not.toContain('<lastmod>2026-99-99</lastmod>');
    const entry804 = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
      .map((m) => m[1]!)
      .find((e) => e.includes('<loc>https://oresund.live/line/804</loc>'));
    expect(entry804).toBeDefined();
    expect(entry804).not.toContain('<lastmod>');
  });;

  it('submits the canonical lines when the collector is unreachable (audit6 M10 + M1)', () => {
    // The outage path: nothing is known about any line, which is not the same
    // as every line having no data. The whole canonical set goes out — buses
    // included since M1, like every other line archive — and none of them
    // claims a freshness date it cannot back.
    const xml = buildSitemap([], [], LASTMOD);
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
    for (const line of ['801', '802', '806', '807', '910', '6', '16']) {
      expect(entries.find((e) => e.includes(`<loc>https://oresund.live/line/${line}</loc>`)), line).toBeDefined();
    }
    const lineEntry = entries.find((e) => e.includes('<loc>https://oresund.live/line/802</loc>'));
    expect(lineEntry).toBeDefined();
    expect(lineEntry).not.toContain('<lastmod>');
  });;

  it('drops a lastmod source that is not a date instead of clamping it (audit5 L11)', () => {
    // slice(0, 10) made any string LOOK like a date — and <lastmod> is the one
    // sitemap signal Google acts on. A timestamp is not a date; say nothing.
    const xml = buildSitemap([{ line: '7085', disruptions: 3 }], [], {
      deployed: '2026-09-01T08:00:00Z',
      data: 'not-a-date',
    });
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
    // The static family loses its date entirely…
    expect(entries.find((e) => e.includes('<loc>https://oresund.live/</loc>'))).not.toContain('<lastmod>');
    // …and the archive family falls back to nothing rather than to garbage.
    expect(entries.find((e) => e.includes('<loc>https://oresund.live/line</loc>'))).not.toContain('<lastmod>');
    // …and nothing that is not a date ever reaches the attribute.
    expect(xml).not.toMatch(/<lastmod>[^<]*T[^<]*<\/lastmod>/);
    expect(xml).not.toContain('<lastmod>not-a-date</lastmod>');
  });

  it('keeps a lastmod for a discovered line an older collector reports without a date', () => {
    // Deploying the site ahead of the collector must not strip the date from
    // the pages that DO have data; the data-window end is the fallback.
    const xml = buildSitemap([{ line: '7085', disruptions: 3 }], [], LASTMOD);
    const block = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!).find((e) =>
      e.includes('<loc>https://oresund.live/line/7085</loc>'),
    );
    expect(block).toContain('<lastmod>2026-09-02</lastmod>');
  });
});

describe('localized station URLs (audit3 C1)', () => {
  it('emits en + sv + da for every station, each carrying the full hreflang cluster', () => {
    const xml = buildSitemap([], [
      { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
    ], LASTMOD);
    for (const url of [
      'https://oresund.live/station/hyllie',
      'https://oresund.live/sv/station/hyllie',
      'https://oresund.live/da/station/hyllie',
    ]) {
      const entry = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!).find((e) => e.includes(`<loc>${url}</loc>`));
      expect(entry, url).toBeDefined();
      expect(entry!, url).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://oresund.live/station/hyllie" />');
      expect(entry!, url).toContain('<xhtml:link rel="alternate" hreflang="sv" href="https://oresund.live/sv/station/hyllie" />');
      expect(entry!, url).toContain('<xhtml:link rel="alternate" hreflang="da" href="https://oresund.live/da/station/hyllie" />');
      expect(entry!, url).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://oresund.live/station/hyllie" />');
    }
  });

  it('leaves the single-URL archives (line, history window, station hub) without localized twins', () => {
    const xml = buildSitemap([{ line: '804', disruptions: 2 }], [
      { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
    ], LASTMOD);
    expect(xml).not.toContain('<loc>https://oresund.live/sv/line/804</loc>');
    expect(xml).not.toContain('<loc>https://oresund.live/sv/history/7</loc>');
    expect(xml).not.toContain('<loc>https://oresund.live/sv/station</loc>');
  });

  it('emits the /history hub in en + sv + da, each carrying the full hreflang cluster (audit4)', () => {
    const xml = buildSitemap([], [], LASTMOD);
    for (const url of [
      'https://oresund.live/history',
      'https://oresund.live/sv/history',
      'https://oresund.live/da/history',
    ]) {
      const entry = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!).find((e) => e.includes(`<loc>${url}</loc>`));
      expect(entry, url).toBeDefined();
      expect(entry!, url).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://oresund.live/history" />');
      expect(entry!, url).toContain('<xhtml:link rel="alternate" hreflang="sv" href="https://oresund.live/sv/history" />');
      expect(entry!, url).toContain('<xhtml:link rel="alternate" hreflang="da" href="https://oresund.live/da/history" />');
      expect(entry!, url).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://oresund.live/history" />');
      // The hub is data-driven, so its <lastmod> is the data-window end, like
      // the windows and station pages it links.
      expect(entry!, url).toContain('<lastmod>2026-09-02</lastmod>');
    }
  });
});
