import { describe, expect, it } from 'vitest';
import { buildSitemap, type SitemapLastmod } from '../src/lib/sitemap';
import { CANONICAL_LINES } from '../src/lib/archive';

/** Fixed dates so the lastmod assertions stay deterministic. */
const LASTMOD: SitemapLastmod = { deployed: '2026-09-01T08:00:00Z', data: '2026-09-02' };

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
    // Every canonical line archive is listed even though the collector
    // returned no data — they must be crawlable whether or not they have
    // disruptions in the current window.
    for (const l of CANONICAL_LINES) expect(locs).toContain(`https://oresund.live/line/${encodeURIComponent(l)}`);
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

  it('omits <lastmod> from a line that has never recorded a disruption (audit4 N-M3)', () => {
    // The canonical union keeps those pages crawlable, but a page whose content
    // is "no disruptions recorded" must not tell Google it changes daily —
    // that claim is unverifiable, and unverifiable dates get ignored.
    const xml = buildSitemap([], [], LASTMOD);
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
    for (const line of CANONICAL_LINES) {
      const block = entries.find((e) => e.includes(`<loc>https://oresund.live/line/${encodeURIComponent(line)}</loc>`));
      expect(block, line).toBeDefined();
      expect(block, line).not.toContain('<lastmod>');
      // …while the /line index that lists them still carries one.
    }
    expect(entries.find((e) => e.includes('<loc>https://oresund.live/line</loc>'))).toContain(
      '<lastmod>2026-09-02</lastmod>',
    );
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
