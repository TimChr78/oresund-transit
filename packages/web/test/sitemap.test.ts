import { describe, expect, it } from 'vitest';
import { buildSitemap } from '../src/lib/sitemap';
import { CANONICAL_LINES } from '../src/lib/archive';

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
    const locs = [...buildSitemap([], []).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // The static pages plus the fixed archive indexes/ranges are always listed.
    expect(locs).toContain('https://oresund.live/');
    expect(locs).toContain('https://oresund.live/methodology');
    expect(locs).toContain('https://oresund.live/privacy');
    // /history 301s to /history/30 (H5) — only the canonical window is listed.
    expect(locs).not.toContain('https://oresund.live/history');
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
    ]).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

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
    const xml = buildSitemap([{ line: '800 M/Ø', disruptions: 1 }], []);
    expect(xml).toContain('https://oresund.live/line/800%20M%2F%C3%98');
  });

  it('is a valid urlset with the sitemaps.org namespace', () => {
    expect(buildSitemap([], [])).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(buildSitemap([], [])).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it('adds the 6 localized sv/da static URLs (home, methodology, privacy)', () => {
    const locs = [...buildSitemap([], []).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain('https://oresund.live/sv/');
    expect(locs).toContain('https://oresund.live/da/');
    expect(locs).toContain('https://oresund.live/sv/methodology');
    expect(locs).toContain('https://oresund.live/da/methodology');
    expect(locs).toContain('https://oresund.live/sv/privacy');
    expect(locs).toContain('https://oresund.live/da/privacy');
  });

  it('annotates each static URL with the full hreflang cluster (en/sv/da/x-default)', () => {
    const xml = buildSitemap([], []);
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
    ]);
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
    // /history itself 301s to /history/30 (H5) so it is intentionally absent.
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
});
