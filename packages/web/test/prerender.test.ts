import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { getDict } from '../src/i18n';
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

describe('prerendered static pages', () => {
  it('puts the methodology content in the HTML, not an empty #app', () => {
    const body = renderMethodologyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en');
    expect(html).toContain('delay under 240 seconds');
    expect(html).toContain('lines 802–805');
    expect(html).toContain('id="app"');
    expect(html).not.toContain('<div id="app"></div>');
  });

  it('puts the privacy content in the HTML, not an empty #app', () => {
    const body = renderPrivacyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en');
    expect(html).toContain('hello@oresund.live');
    expect(html).toContain('Trafiklab.se');
    expect(html).not.toContain('<div id="app"></div>');
  });

  it('keeps the lang switcher working: module script + set-lang buttons survive', () => {
    const body = renderMethodologyPage('en', getDict('en'));
    const html = renderPrerenderedPage(shell, body, 'en');
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
