import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The sitemap lists every indexable route so Google Search Console can
 * discover them. It must stay in sync with the client-side routes defined in
 * src/lib/route.ts (dashboard, privacy, methodology) — the dashboard maps to
 * the root URL, privacy and methodology to their named paths.
 */
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

describe('sitemap.xml', () => {
  it('lists all three indexable routes', () => {
    expect(sitemap).toContain('<loc>https://oresund.live/</loc>');
    expect(sitemap).toContain('<loc>https://oresund.live/methodology</loc>');
    expect(sitemap).toContain('<loc>https://oresund.live/privacy</loc>');
  });

  it('is a valid urlset with the sitemaps.org namespace', () => {
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });
});
