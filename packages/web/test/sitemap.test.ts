import { describe, expect, it } from 'vitest';
import { buildSitemap } from '../src/lib/sitemap';

/**
 * The sitemap lists every indexable route so Google Search Console can
 * discover them: the three static pages (dashboard/, methodology, privacy)
 * plus the dynamic archive routes (/line/*, /station/* and /history/{days}).
 *
 * It is built by functions/sitemap.xml.js, which discovers the line/station
 * sets from the collector at request time; buildSitemap is the pure builder
 * under test here.
 */
describe('buildSitemap', () => {
  it('lists the three static pages and the fixed history archive when no data resolves', () => {
    const locs = [...buildSitemap([], []).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // The static pages plus the fixed archive indexes/ranges are always listed.
    expect(locs).toContain('https://oresund.live/');
    expect(locs).toContain('https://oresund.live/methodology');
    expect(locs).toContain('https://oresund.live/privacy');
    expect(locs).toContain('https://oresund.live/history');
    expect(locs).toContain('https://oresund.live/line');
    expect(locs).toContain('https://oresund.live/station');
    for (const d of [7, 14, 30, 90]) expect(locs).toContain(`https://oresund.live/history/${d}`);
    // No per-line/per-station pages when there's no data.
    expect(locs).not.toContain('https://oresund.live/line/804');
    expect(locs).not.toContain('https://oresund.live/station/hyllie');
  });

  it('adds discovered line and station archive pages', () => {
    const locs = [...buildSitemap([{ line: '804', disruptions: 3 }, { line: '803', disruptions: 1 }], [
      { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
      { slug: 'kobenhavn-h', stop_id: '860000626', stop_name: 'København H' },
    ]).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(locs).toContain('https://oresund.live/line');
    expect(locs).toContain('https://oresund.live/line/804');
    expect(locs).toContain('https://oresund.live/line/803');
    expect(locs).toContain('https://oresund.live/station');
    expect(locs).toContain('https://oresund.live/station/hyllie');
    expect(locs).toContain('https://oresund.live/station/kobenhavn-h');
    // No duplicates.
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('URL-encodes line identifiers in the sitemap', () => {
    const xml = buildSitemap([{ line: '800M', disruptions: 1 }], []);
    expect(xml).toContain('https://oresund.live/line/800M');
  });

  it('is a valid urlset with the sitemaps.org namespace', () => {
    expect(buildSitemap([], [])).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(buildSitemap([], [])).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });
});
