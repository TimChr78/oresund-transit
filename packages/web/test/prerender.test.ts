import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { getDict } from '../src/i18n';
import { META } from '../src/lib/seo';
import { renderPrerenderedPage } from '../src/lib/prerender';

/**
 * SEO prerender: /methodology and /privacy must ship their content in the
 * initial HTML payload (server-served), not an empty #app shell — crawlers
 * and JS-disabled clients must see the actual page. The in-browser lang
 * switcher keeps working because the shell (main.ts module script, delegated
 * click listener) is preserved.
 *
 * We test the pure prerender function with the REAL index.html shell (the
 * same input the build script uses), plus the committed public/*.html
 * artifacts that Cloudflare Pages actually serves.
 */
const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Extract the `content` of a `<meta name|property="…">` tag, multiline-tolerant. */
function metaContent(html: string, attr: string, value: string): string {
  const m = html.match(new RegExp(`<meta\\s+${attr}="${value}"[\\s\\S]*?content="([^"]*)"`));
  return m?.[1] ?? '';
}

describe('prerendered static pages', () => {
  it('puts the methodology content in the HTML, not an empty #app', () => {
    const body = renderMethodologyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en', META.methodology);
    expect(html).toContain('delay under 240 seconds');
    expect(html).toContain('lines 802–805');
    expect(html).toContain('id="app"');
    expect(html).not.toContain('<div id="app"></div>');
  });

  it('puts the privacy content in the HTML, not an empty #app', () => {
    const body = renderPrivacyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en', META.privacy);
    expect(html).toContain('hello@oresund.live');
    expect(html).toContain('Trafiklab.se');
    expect(html).not.toContain('<div id="app"></div>');
  });

  it('keeps the lang switcher working: module script + set-lang buttons survive', () => {
    const body = renderMethodologyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en', META.methodology);
    expect(html).toContain('type="module" src="/src/main.ts"');
    expect(html).toContain('data-action="set-lang"');
  });

  it('the committed public pages Cloudflare serves are prerendered, not shells', () => {
    const methodology = readFileSync(new URL('../public/methodology.html', import.meta.url), 'utf8');
    expect(methodology).toContain('delay under 240 seconds');
    expect(methodology).not.toContain('<div id="app"></div>');
    const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
    expect(privacy).toContain('hello@oresund.live');
    expect(privacy).not.toContain('<div id="app"></div>');
  });
});

describe('per-route title and meta description', () => {
  const methodology = renderPrerenderedPage(
    shell,
    renderMethodologyPage('en', getDict('en')),
    'en',
    META.methodology,
  );
  const privacy = renderPrerenderedPage(shell, renderPrivacyPage('en', getDict('en')), 'en', META.privacy);

  it('gives /methodology its own title, distinct from the dashboard', () => {
    expect(methodology).toContain('<title>Methodology — Øresund.live</title>');
    expect(methodology).not.toContain('live train status across the Sound');
  });

  it('gives /privacy its own title, distinct from the dashboard', () => {
    expect(privacy).toContain('<title>Privacy — Øresund.live</title>');
    expect(privacy).not.toContain('live train status across the Sound');
  });

  it('gives each route its own meta description', () => {
    expect(methodology).toContain('name="description"');
    expect(methodology).toContain(META.methodology.description);
    expect(methodology).not.toContain(META.privacy.description);
    expect(privacy).toContain(META.privacy.description);
    expect(privacy).not.toContain(META.methodology.description);
  });

  it('keeps og:title / og:description / twitter tags in sync with the route title', () => {
    expect(metaContent(methodology, 'property', 'og:title')).toBe(META.methodology.title);
    expect(metaContent(methodology, 'property', 'og:description')).toBe(META.methodology.description);
    expect(metaContent(methodology, 'name', 'twitter:title')).toBe(META.methodology.title);
    expect(metaContent(methodology, 'name', 'twitter:description')).toBe(META.methodology.description);
    expect(metaContent(privacy, 'property', 'og:title')).toBe(META.privacy.title);
    expect(metaContent(privacy, 'property', 'og:description')).toBe(META.privacy.description);
    expect(metaContent(privacy, 'name', 'twitter:description')).toBe(META.privacy.description);
  });

  it('the dashboard shell keeps its own (distinct) title + description', () => {
    expect(shell).toContain('<title>Øresund.live — live train status across the Sound</title>');
    expect(shell).toContain('name="description"');
    expect(shell).not.toContain('<title>Methodology — Øresund.live</title>');
    expect(shell).not.toContain('<title>Privacy — Øresund.live</title>');
  });

  it('the committed public pages carry their route title', () => {
    const methodology = readFileSync(new URL('../public/methodology.html', import.meta.url), 'utf8');
    expect(methodology).toContain('<title>Methodology — Øresund.live</title>');
    const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
    expect(privacy).toContain('<title>Privacy — Øresund.live</title>');
  });
});

describe('per-route canonical', () => {
  const methodology = renderPrerenderedPage(
    shell,
    renderMethodologyPage('en', getDict('en')),
    'en',
    META.methodology,
  );
  const privacy = renderPrerenderedPage(shell, renderPrivacyPage('en', getDict('en')), 'en', META.privacy);

  it('canonicalizes /methodology (and /methodology/) to the bare URL', () => {
    expect(methodology).toContain('<link rel="canonical" href="https://oresund.live/methodology" />');
    expect(methodology).not.toContain('href="https://oresund.live/methodology/"');
  });

  it('canonicalizes /privacy (and /privacy/) to the bare URL', () => {
    expect(privacy).toContain('<link rel="canonical" href="https://oresund.live/privacy" />');
    expect(privacy).not.toContain('href="https://oresund.live/privacy/"');
  });

  it('canonicalizes the dashboard shell (/, /index.html) to https://oresund.live/', () => {
    expect(shell).toContain('<link rel="canonical" href="https://oresund.live/" />');
    expect(shell).not.toContain('href="https://oresund.live/index.html"');
  });

  it('the committed public pages carry their canonical', () => {
    const methodology = readFileSync(new URL('../public/methodology.html', import.meta.url), 'utf8');
    expect(methodology).toContain('<link rel="canonical" href="https://oresund.live/methodology" />');
    const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
    expect(privacy).toContain('<link rel="canonical" href="https://oresund.live/privacy" />');
  });
});

describe('JSON-LD structured data', () => {
  const blocks = (html: string): object[] =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1] ?? ''));

  const types = (data: object): string[] => {
    const graph = (data as { '@graph'?: { '@type': string }[] })['@graph'];
    return graph ? graph.map((n) => n['@type']) : [(data as { '@type': string })['@type']];
  };

  it('index.html carries exactly one ld+json block with WebSite + Organization', () => {
    const parsed = blocks(shell);
    expect(parsed).toHaveLength(1);
    const first = parsed[0];
    expect(first).toBeDefined();
    expect(types(first as object)).toEqual(expect.arrayContaining(['WebSite', 'Organization']));
  });

  it('the structured data contains only real facts: name, url, description', () => {
    const first = blocks(shell)[0];
    expect(first).toBeDefined();
    const data = first as { '@graph': { '@type': string; name: string; url: string; description: string }[] };
    for (const node of data['@graph']) {
      expect(node.name).toBe('Øresund.live');
      expect(node.url).toBe('https://oresund.live/');
      expect(node.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('the prerendered static pages mirror the same block', () => {
    const methodology = renderPrerenderedPage(
      shell,
      renderMethodologyPage('en', getDict('en')),
      'en',
      META.methodology,
    );
    const parsed = blocks(methodology);
    expect(parsed).toHaveLength(1);
    const first = parsed[0];
    expect(first).toBeDefined();
    expect(types(first as object)).toEqual(expect.arrayContaining(['WebSite', 'Organization']));
  });

  it('the committed public pages carry the block too', () => {
    const methodology = readFileSync(new URL('../public/methodology.html', import.meta.url), 'utf8');
    expect(methodology).toContain('<script type="application/ld+json">');
    const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
    expect(privacy).toContain('<script type="application/ld+json">');
  });
});
