import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Deploy-race protection. During a Pages deploy there is a window where the
 * new HTML references a hashed asset that has not propagated yet; the SPA
 * fallback would serve index.html (200) for the missing asset, and the
 * custom-domain /assets/* cache rule would cache that HTML under the JS URL
 * for hours -> blank page. Three layers defend against it:
 *
 * 1. public/_redirects — /assets/* resolves to a real 404 (module load fails
 *    cleanly instead of fetching HTML).
 * 2. public/404.html — the page served for those 404s.
 * 3. Inline self-heal script in index.html — detects the never-booted app
 *    and reloads once (sessionStorage-guarded against loops).
 */

const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('deploy-race protection', () => {
  it('_redirects returns 404 for missing assets (before the SPA catch-all)', () => {
    const lines = redirects.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(lines[0]).toBe('/assets/*    /404.html    404');
    expect(lines).toContain('/*           /index.html  200');
  });

  it('the asset 404 rule comes BEFORE the SPA catch-all', () => {
    const assetIdx = redirects.indexOf('/assets/*');
    const catchAllIdx = redirects.indexOf('/*           /index.html');
    expect(assetIdx).toBeGreaterThan(-1);
    expect(assetIdx).toBeLessThan(catchAllIdx);
  });

  it('ships a real 404 page', () => {
    expect(existsSync(new URL('../public/404.html', import.meta.url))).toBe(true);
  });

  it('index.html carries the self-heal reload guard (max one reload)', () => {
    expect(indexHtml).toContain('oresund-reloaded');
    expect(indexHtml).toContain('location.reload()');
    expect(indexHtml).toContain('sessionStorage');
  });
});
