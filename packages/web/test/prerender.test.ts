import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { getDict, type Lang } from '../src/i18n';
import { META, hreflangCluster } from '../src/lib/seo';
import { renderPrerenderedPage, renderLocalizedHome } from '../src/lib/prerender';

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
    const html = renderPrerenderedPage(shell, body, 'en', META.methodology.en);
    expect(html).toContain('delay under 240 seconds');
    expect(html).toContain('lines 802–805');
    expect(html).toContain('id="app"');
    expect(html).not.toContain('<div id="app"></div>');
  });

  it('puts the privacy content in the HTML, not an empty #app', () => {
    const body = renderPrivacyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en', META.privacy.en);
    expect(html).toContain('hello@oresund.live');
    expect(html).toContain('Trafiklab.se');
    expect(html).not.toContain('<div id="app"></div>');
  });

  it('keeps the lang switcher working: module script + set-lang buttons survive', () => {
    const body = renderMethodologyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en', META.methodology.en);
    expect(html).toContain('type="module"');
    expect(html).toContain('data-action="set-lang"');
  });

  it('drops the dashboard-only noscript: static pages render fine without JS', () => {
    const body = renderMethodologyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en', META.methodology.en);
    expect(html).not.toContain('<noscript>');
  });
});

describe('per-route title and meta description', () => {
  const methodology = renderPrerenderedPage(
    shell,
    renderMethodologyPage('en', getDict('en')),
    'en',
    META.methodology.en,
  );
  const privacy = renderPrerenderedPage(shell, renderPrivacyPage('en', getDict('en')), 'en', META.privacy.en);

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
    expect(methodology).toContain(META.methodology.en.description);
    expect(methodology).not.toContain(META.privacy.en.description);
    expect(privacy).toContain(META.privacy.en.description);
    expect(privacy).not.toContain(META.methodology.en.description);
  });

  it('keeps og:title / og:description / og:url / twitter tags in sync with the route', () => {
    expect(metaContent(methodology, 'property', 'og:title')).toBe(META.methodology.en.title);
    expect(metaContent(methodology, 'property', 'og:description')).toBe(META.methodology.en.description);
    expect(metaContent(methodology, 'property', 'og:url')).toBe(META.methodology.en.canonical);
    expect(metaContent(methodology, 'name', 'twitter:title')).toBe(META.methodology.en.title);
    expect(metaContent(methodology, 'name', 'twitter:description')).toBe(META.methodology.en.description);
    expect(metaContent(privacy, 'property', 'og:title')).toBe(META.privacy.en.title);
    expect(metaContent(privacy, 'property', 'og:description')).toBe(META.privacy.en.description);
    expect(metaContent(privacy, 'property', 'og:url')).toBe(META.privacy.en.canonical);
    expect(metaContent(privacy, 'name', 'twitter:description')).toBe(META.privacy.en.description);
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
    META.methodology.en,
  );
  const privacy = renderPrerenderedPage(shell, renderPrivacyPage('en', getDict('en')), 'en', META.privacy.en);

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

  it('ships the summary_large_image twitter card and og:image:alt on every og-tagged page (L4/L5)', () => {
    // The dashboard shell sets the card type + image (with alt)…
    expect(shell).toContain('name="twitter:card" content="summary_large_image"');
    expect(shell).not.toContain('name="twitter:card" content="summary"');
    expect(shell).toContain('name="twitter:image" content="https://oresund.live/og-card.png"');
    expect(shell).toContain('property="og:image:alt" content="Øresund.live — Øresundståg departures across the Sound"');
    // …and the prerendered variants inherit them unchanged.
    const methodology = renderPrerenderedPage(shell, renderMethodologyPage('en', getDict('en')), 'en', META.methodology.en);
    const svHome = renderLocalizedHome(shell, 'sv', META.dashboard.sv, hreflangCluster('/'));
    for (const html of [methodology, svHome]) {
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
      expect(html).toContain('name="twitter:image" content="https://oresund.live/og-card.png"');
      expect(html).toContain('property="og:image:alt" content="Øresund.live — Øresundståg departures across the Sound"');
    }
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
      META.methodology.en,
    );
    const parsed = blocks(methodology);
    expect(parsed).toHaveLength(1);
    const first = parsed[0];
    expect(first).toBeDefined();
    expect(types(first as object)).toEqual(expect.arrayContaining(['WebSite', 'Organization']));
  });

  it('the Organization node carries logo, sameAs repo link and the public contactPoint email (M6)', () => {
    const graph = (blocks(shell)[0] as { '@graph': { '@type': string; logo?: string; sameAs?: string[]; contactPoint?: unknown }[] })['@graph'];
    const org = graph.find((n) => n['@type'] === 'Organization');
    expect(org).toBeDefined();
    expect(org!.logo).toBe('https://oresund.live/og-card.png');
    expect(org!.sameAs).toEqual(['https://github.com/TimChr78/oresund-transit']);
    const cp = org!.contactPoint as { '@type'?: string; email?: string } | undefined;
    expect(cp?.['@type']).toBe('ContactPoint');
    expect(cp?.email).toBe('mailto:hello@oresund.live');
  });
});

describe('prerender build pipeline', () => {
  it('runs AFTER vite build: reads the built dist/index.html shell', () => {
    expect(prerenderScript).toContain("new URL('../dist/index.html', import.meta.url)");
    expect(prerenderScript).not.toContain("new URL('../index.html', import.meta.url)");
  });

  it('writes the prerendered pages into dist/ (never public/)', () => {
    expect(prerenderScript).toContain('new URL(`../dist/${file}`, import.meta.url)');
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

describe('SEO — train + Øresundståg in the served HTML', () => {
  it('the dashboard shell keeps the live-train <title> and ships the lead paragraph without JS', () => {
    // 3x train was the SEO gap; the title stays, and the no-JS/crawler
    // fallback block now carries the H1 lead with train + Øresundståg wording
    // in the INITIAL HTML (visible without JavaScript).
    expect(shell).toContain('<title>Øresund.live — live train status across the Sound</title>');
    expect(shell).toContain('id="static-shell"');
    const leadNode = /<h1 class="lead">([\s\S]*?)<\/h1>/.exec(shell)?.[1] ?? '';
    expect(leadNode).toMatch(/train/i);
    expect(leadNode).toMatch(/Øresundståg/);
    // descriptive-H1 pass: the keyword-bearing lead sentence is the page's H1;
    // the brand wordmark is an un-semantic (non-heading) element.
    expect(shell).not.toContain('<h1 class="brand">');
    expect(shell).toContain('<div class="brand">Øresund <span class="brand-sub">live</span></div>');
  });

  it('the home shell has exactly one H1 — the descriptive lead, never the bare brand', () => {
    const h1s = shell.match(/<h1\b[^>]*>/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toContain('class="lead"');
  });

  it('META.dashboard.en.description is one sentence with natural train + Øresundståg wording', () => {
    const description = META.dashboard.en.description;
    const sentences = description.split('.').filter((s) => s.trim().length > 0);
    expect(sentences).toHaveLength(1);
    expect(description).toMatch(/train/i);
    expect(description).toMatch(/Øresundståg/);
    // the index.html <head> carries the same description (og + twitter + JSON-LD in sync)
    expect(shell).toContain(description);
  });

  it('static pages strip the dashboard fallback block (no duplicate H2 lead on /methodology, /privacy)', () => {
    const methodology = renderPrerenderedPage(
      shell,
      renderMethodologyPage('en', getDict('en')),
      'en',
      META.methodology.en,
    );
    const privacy = renderPrerenderedPage(shell, renderPrivacyPage('en', getDict('en')), 'en', META.privacy.en);
    expect(methodology).not.toContain('static-shell');
    expect(privacy).not.toContain('static-shell');
    expect(methodology).not.toContain('train departures');
    expect(privacy).not.toContain('train departures');
  });

  it('static pages promote their keyword title to a single descriptive H1 (brand is non-heading)', () => {
    const methodology = renderPrerenderedPage(
      shell,
      renderMethodologyPage('en', getDict('en')),
      'en',
      META.methodology.en,
    );
    const privacy = renderPrerenderedPage(shell, renderPrivacyPage('en', getDict('en')), 'en', META.privacy.en);
    for (const html of [methodology, privacy]) {
      const h1s = html.match(/<h1\b[^>]*>/g) ?? [];
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toContain('class="privacy-title"');
      // bare brand must never be a heading — the wordmark is a styled div.
      expect(html).not.toContain('<h1 class="brand">');
      expect(html).toContain('<div class="brand">');
    }
  });
});

describe("boot() fallback removal (CodeRabbit: main.ts 87)", () => {
  it("boot() source removes #static-shell before route branching", async () => {
    const src = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    // static-shell is dropped at the top of boot() before any route handler
    expect(src).toMatch(/document\.getElementById\(["']static-shell["']\)\?\.remove\(\)/);
    // and the removal sits before the route = routePath(...) line
    const removeIdx = src.search(/document\.getElementById\(["\x27]static-shell["\x27]\)\?\.remove\(\)/);
    const routeIdx = src.indexOf("routePath(window.location.pathname)");
    expect(removeIdx).toBeGreaterThan(-1);
    expect(routeIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeLessThan(routeIdx);
    // prerender pipeline already asserts static pages strip it, dashboards keep it in shell — this covers the client boot path
    expect(shell).toContain('id="static-shell"');
  });
});

describe('localized static variants (sv/da) — i18n decision B', () => {
  const LANGS: Lang[] = ['sv', 'da'];

  it('each methodology variant has the correct lang, localized title/canonical and hreflang cluster', () => {
    for (const lang of LANGS) {
      const html = renderPrerenderedPage(
        shell,
        renderMethodologyPage(lang, getDict(lang)),
        lang,
        META.methodology[lang],
        hreflangCluster('/methodology'),
      );
      expect(html, lang).toContain(`<html lang="${lang}">`);
      expect(html, lang).toContain(`<title>${META.methodology[lang].title}</title>`);
      expect(html, lang).toContain(`<link rel="canonical" href="${META.methodology[lang].canonical}" />`);
      expect(html, lang).toContain(`property="og:url"`);
      expect(metaContent(html, 'property', 'og:url')).toBe(META.methodology[lang].canonical);
      // The full hreflang cluster: en + sv + da + x-default.
      expect(html, lang).toContain('hreflang="en" href="https://oresund.live/methodology"');
      expect(html, lang).toContain('hreflang="sv" href="https://oresund.live/sv/methodology"');
      expect(html, lang).toContain('hreflang="da" href="https://oresund.live/da/methodology"');
      expect(html, lang).toContain('hreflang="x-default" href="https://oresund.live/methodology"');
    }
  });

  it('each privacy variant has the correct lang, localized title/canonical and hreflang cluster', () => {
    for (const lang of LANGS) {
      const html = renderPrerenderedPage(
        shell,
        renderPrivacyPage(lang, getDict(lang)),
        lang,
        META.privacy[lang],
        hreflangCluster('/privacy'),
      );
      expect(html, lang).toContain(`<html lang="${lang}">`);
      expect(html, lang).toContain(`<title>${META.privacy[lang].title}</title>`);
      expect(metaContent(html, 'property', 'og:url')).toBe(META.privacy[lang].canonical);
      expect(html, lang).toContain('hreflang="sv" href="https://oresund.live/sv/privacy"');
      expect(html, lang).toContain('hreflang="da" href="https://oresund.live/da/privacy"');
      expect(html, lang).toContain('hreflang="x-default" href="https://oresund.live/privacy"');
    }
  });

  it('the en variants also carry the hreflang cluster (x-default -> en)', () => {
    const methodology = renderPrerenderedPage(
      shell,
      renderMethodologyPage('en', getDict('en')),
      'en',
      META.methodology.en,
      hreflangCluster('/methodology'),
    );
    expect(methodology).toContain('<html lang="en">');
    expect(methodology).toContain('hreflang="en" href="https://oresund.live/methodology"');
    expect(methodology).toContain('hreflang="sv" href="https://oresund.live/sv/methodology"');
    expect(methodology).toContain('hreflang="da" href="https://oresund.live/da/methodology"');
    expect(methodology).toContain('hreflang="x-default" href="https://oresund.live/methodology"');
  });
});

describe('localized home shells (sv/, da/)', () => {
  const LANGS: Lang[] = ['sv', 'da'];

  it('emits lang-attr + localized title + hreflang while keeping the SPA shell intacts', () => {
    for (const lang of LANGS) {
      const html = renderLocalizedHome(shell, lang, META.dashboard[lang], hreflangCluster('/'));
      expect(html, lang).toContain(`<html lang="${lang}">`);
      expect(html, lang).toContain(`<title>${META.dashboard[lang].title}</title>`);
      expect(html, lang).toContain(`<link rel="canonical" href="${META.dashboard[lang].canonical}" />`);
      expect(html, lang).toContain('hreflang="en" href="https://oresund.live/"');
      expect(html, lang).toContain(`hreflang="sv" href="https://oresund.live/sv/"`);
      expect(html, lang).toContain(`hreflang="da" href="https://oresund.live/da/"`);
      expect(html, lang).toContain('hreflang="x-default" href="https://oresund.live/"');
      // The home page must keep its dashboard-only fallbacks.
      expect(html, lang).toContain('id="static-shell"');
      expect(html, lang).toContain('<noscript>');
      expect(html, lang).toContain('type="module"');
    }
  });

  it('the en home shell keeps lang="en" and gains the hreflang cluster', () => {
    const html = renderLocalizedHome(shell, 'en', META.dashboard.en, hreflangCluster('/'));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Øresund.live — live train status across the Sound</title>');
    expect(html).toContain('hreflang="sv" href="https://oresund.live/sv/"');
    expect(html).toContain('hreflang="x-default" href="https://oresund.live/"');
  });
});
