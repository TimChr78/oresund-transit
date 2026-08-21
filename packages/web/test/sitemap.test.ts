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
    ]).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(locs).toContain('https://oresund.live/line');
    // The dynamic, non-canonical line is still appended.
    expect(locs).toContain('https://oresund.live/line/7085');
    expect(locs).toContain('https://oresund.live/station');
    expect(locs).toContain('https://oresund.live/station/hyllie');
    expect(locs).toContain('https://oresund.live/station/kobenhavn-h');
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
});
