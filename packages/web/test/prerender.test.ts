import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { getDict } from '../src/i18n';
import { META } from '../src/lib/seo';
import { renderPrerenderedPage } from '../src/lib/prerender';

/**
 * SEO prerender: /methodology and /privacy must ship their content in the
 * initial HTML payload (server-served), not an empty #app shell — crawlers
 * and JS-disabled clients must see the actual page. The in-browser lang
 * switcher keeps working because the shell (the built JS module + delegated
 * click listener) is preserved.
 *
 * The build runs `vite build` FIRST, then the prerender script applies
 * renderPrerenderedPage() to the BUILT dist/index.html (which carries the
 * hashed CSS/JS asset links) and writes dist/{methodology,privacy}.html.
 * We test the pure transform against the source index.html shell and assert
 * the pipeline contract (script input/output, no stale public/*.html that
 * could serve a dead /src/main.ts or unstyled page).
 */
const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const prerenderScript = readFileSync(new URL('../scripts/prerender.ts', import.meta.url), 'utf8');

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
    expect(html).toContain('type="module"');
    expect(html).toContain('data-action="set-lang"');
  });

  it('drops the dashboard-only noscript: static pages render fine without JS', () => {
    const body = renderMethodologyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en', META.methodology);
    expect(html).not.toContain('<noscript>');
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

  it('keeps og:title / og:description / og:url / twitter tags in sync with the route', () => {
    expect(metaContent(methodology, 'property', 'og:title')).toBe(META.methodology.title);
    expect(metaContent(methodology, 'property', 'og:description')).toBe(META.methodology.description);
    expect(metaContent(methodology, 'property', 'og:url')).toBe(META.methodology.canonical);
    expect(metaContent(methodology, 'name', 'twitter:title')).toBe(META.methodology.title);
    expect(metaContent(methodology, 'name', 'twitter:description')).toBe(META.methodology.description);
    expect(metaContent(privacy, 'property', 'og:title')).toBe(META.privacy.title);
    expect(metaContent(privacy, 'property', 'og:description')).toBe(META.privacy.description);
    expect(metaContent(privacy, 'property', 'og:url')).toBe(META.privacy.canonical);
    expect(metaContent(privacy, 'name', 'twitter:description')).toBe(META.privacy.description);
  });

  it('the dashboard shell keeps its own (distinct) title + description', () => {
    expect(shell).toContain('<title>Øresund.live — live train status across the Sound</title>');
    expect(shell).toContain('name="description"');
    expect(shell).not.toContain('<title>Methodology — Øresund.live</title>');
    expect(shell).not.toContain('<title>Privacy — Øresund.live</title>');
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

  it('emits exactly one canonical on /methodology — the route URL, never the homepage', () => {
    expect(methodology.match(/rel="canonical"/g) ?? []).toHaveLength(1);
    expect(methodology).toContain('<link rel="canonical" href="https://oresund.live/methodology" />');
    expect(methodology).not.toContain('href="https://oresund.live/"');
    expect(methodology).not.toContain('href="https://oresund.live/methodology/"');
  });

  it('emits exactly one canonical on /privacy — the route URL, never the homepage', () => {
    expect(privacy.match(/rel="canonical"/g) ?? []).toHaveLength(1);
    expect(privacy).toContain('<link rel="canonical" href="https://oresund.live/privacy" />');
    expect(privacy).not.toContain('href="https://oresund.live/"');
    expect(privacy).not.toContain('href="https://oresund.live/privacy/"');
  });

  it('canonicalizes the dashboard shell (/, /index.html) to https://oresund.live/', () => {
    expect(shell).toContain('<link rel="canonical" href="https://oresund.live/" />');
    expect(shell).not.toContain('href="https://oresund.live/index.html"');
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
});

describe('prerender build pipeline', () => {
  it('runs AFTER vite build: reads the built dist/index.html shell', () => {
    expect(prerenderScript).toContain("new URL('../dist/index.html', import.meta.url)");
    expect(prerenderScript).not.toContain("new URL('../index.html', import.meta.url)");
  });

  it('writes the prerendered pages into dist/ (never public/)', () => {
    expect(prerenderScript).toContain("new URL(`../dist/${page.file}`, import.meta.url)");
    expect(prerenderScript).not.toContain('public/');
  });

  it('public/ carries no stale prerendered html (a dead /src/main.ts + unstyled page must never deploy)', () => {
    expect(existsSync(new URL('../public/methodology.html', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../public/privacy.html', import.meta.url))).toBe(false);
  });

  it('the script fails the build if an emitted page lacks the built bundle (e2e guard)', () => {
    expect(prerenderScript).toContain('src="/assets/');
    expect(prerenderScript).toContain('src="/src/main.ts"');
    expect(prerenderScript).toContain('href="/assets/');
    expect(prerenderScript).toContain('throw new Error');
  });
});
