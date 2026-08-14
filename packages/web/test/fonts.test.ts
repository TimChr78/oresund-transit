import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { getDict } from '../src/i18n';
import { META } from '../src/lib/seo';
import { renderPrerenderedPage } from '../src/lib/prerender';

/**
 * Self-hosted fonts: the site advertises "privacy-friendly, no ads", so it
 * must not send every visitor's IP to fonts.googleapis.com / gstatic. Inter
 * and Space Grotesk (both SIL OFL) are served from /fonts/ instead, declared
 * with @font-face in styles.css (font-display: swap). The variable woff2
 * files cover the exact weights previously loaded from Google Fonts:
 * Inter 400/500/600 and Space Grotesk 500/600/700.
 */
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('self-hosted fonts', () => {
  it('index.html has no Google Fonts links or preconnects', () => {
    expect(indexHtml).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/i);
    expect(indexHtml).not.toMatch(/preconnect.*fonts/i);
  });

  it('styles.css declares @font-face for both families from /fonts/ with font-display: swap', () => {
    expect(styles).toContain('@font-face');
    expect(styles).toMatch(/font-family:\s*'Inter'/);
    expect(styles).toMatch(/font-family:\s*'Space Grotesk'/);
    expect(styles).toMatch(/url\('\/fonts\/[^']+\.woff2'\)/);
    expect(styles).toMatch(/font-display:\s*swap/);
  });

  it('the variable font files cover every previously-loaded weight', () => {
    expect(existsSync(new URL('../public/fonts/Inter.woff2', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../public/fonts/SpaceGrotesk.woff2', import.meta.url))).toBe(true);
  });

  it('ships the SIL OFL license next to each family', () => {
    expect(existsSync(new URL('../public/fonts/Inter-OFL.txt', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../public/fonts/SpaceGrotesk-OFL.txt', import.meta.url))).toBe(true);
  });

  it('the prerendered static pages inherit the Google-free shell', () => {
    const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const html = renderPrerenderedPage(shell, renderMethodologyPage('en', getDict('en')), 'en', META.methodology);
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/i);
  });
});
