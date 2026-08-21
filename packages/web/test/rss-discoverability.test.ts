import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderApp } from '../src/components/App';
import { renderFooter } from '../src/components/Footer';
import { translate } from '../src/i18n';
import { createInitialState } from '../src/state';

/**
 * How /feed.xml is discovered: a <link rel="alternate"> in the page <head>
 * plus a visible footer link. Feeds are intentionally NOT in sitemap.xml
 * (test/sitemap.test.ts pins the sitemap to exactly three indexable URLs).
 */
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const routesJson = JSON.parse(readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8'));

describe('RSS feed discoverability', () => {
  it('index.html <head> links the feed via rel=alternate', () => {
    const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
    expect(head).toMatch(
      /<link\s+rel="alternate"\s+type="application\/rss\+xml"\s+title="Øresund\.live disruptions"\s+href="\/feed\.xml"\s*\/>/,
    );
  });

  it('_routes.json catch-all include covers /feed.xml routing', () => {
    // '/*' is the only include (CF rejects overlap); feed.xml Function wins by specificity.
    expect(routesJson.include).toEqual(['/*']);
    expect(routesJson.exclude).toEqual([]);
  });

  it('footer renders a visible RSS link pointing at /feed.xml in every language', () => {
    for (const lang of ['en', 'sv', 'da'] as const) {
      const html = renderFooter(lang);
      expect(html).toContain('href="/feed.xml"');
      expect(html).toContain(translate('footer_rss', lang));
    }
  });

  it('the full app shell includes the footer RSS link', () => {
    const html = renderApp(createInitialState(), 'en', 'declined');
    expect(html).toContain('href="/feed.xml"');
  });

  it('footer_rss has a non-empty translation in all three dictionaries', () => {
    expect(translate('footer_rss', 'en')).toMatch(/RSS/i);
    expect(translate('footer_rss', 'sv').trim().length).toBeGreaterThan(0);
    expect(translate('footer_rss', 'da').trim().length).toBeGreaterThan(0);
  });
});
