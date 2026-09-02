import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderApp } from '../src/components/App';
import { renderFooter } from '../src/components/Footer';
import { translate } from '../src/i18n';
import { createInitialState } from '../src/state';
import { renderHistoryIndex, renderLineIndex, renderStationIndex, type ArchiveStation } from '../src/lib/archive';

const stations: ArchiveStation[] = [
  { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
  { slug: 'kobenhavn-h', stop_id: '860000626', stop_name: 'København H' },
  { slug: 'malmo-c', stop_id: '740000003', stop_name: 'Malmö C' },
  { slug: 'kastrup', stop_id: '860000858', stop_name: 'Københavns Lufthavn (Kastrup)' },
];

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

  it('every archive page family autodiscovers the feed too (audit3 M7)', () => {
    // M2/M7: the home shell always linked the feed; the 27 archive URLs built
    // by pageShell did not, so the feed was undiscoverable there.
    const feedLink =
      '<link rel="alternate" type="application/rss+xml" title="Øresund.live disruptions" href="/feed.xml" />';
    for (const html of [renderHistoryIndex(), renderStationIndex(stations), renderLineIndex([])]) {
      expect(html).toContain(feedLink);
    }
  });

  it('footer_rss has a non-empty translation in all three dictionaries', () => {
    expect(translate('footer_rss', 'en')).toMatch(/RSS/i);
    expect(translate('footer_rss', 'sv').trim().length).toBeGreaterThan(0);
    expect(translate('footer_rss', 'da').trim().length).toBeGreaterThan(0);
  });
});
