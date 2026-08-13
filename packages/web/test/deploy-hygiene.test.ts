import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Deploy-race protection. During a Pages deploy there is a window where the
 * new HTML references a hashed asset that has not propagated yet; the SPA
 * fallback would serve index.html (200) for the missing asset, and the
 * custom-domain /assets/* cache rule would cache that HTML under the JS URL
 * for hours -> blank page. Two layers defend against it:
 *
 * 1. functions/assets/[[path]].js — scoped to /assets/* via _routes.json,
 *    returns a real 404 when the requested asset is missing (detected via the
 *    ASSETS binding: a real asset is JS/CSS, a missing one falls through the
 *    SPA fallback as text/html).
 * 2. Inline self-heal script in index.html — detects the never-booted app
 *    and reloads once (sessionStorage-guarded against loops).
 *
 * IMPORTANT: there must be NO top-level 404.html. Per Cloudflare Pages
 * "Serving Pages" docs, the presence of 404.html DISABLES Pages' SPA mode,
 * which breaks the client-side routes (/methodology, /privacy).
 */

const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const routesJson = readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8');
const assetFn = readFileSync(new URL('../functions/assets/[[path]].js', import.meta.url), 'utf8');

describe('deploy-race protection', () => {
  it('_redirects has only the SPA catch-all (no asset rule)', () => {
    const lines = redirects.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(lines).toEqual(['/*           /index.html    200']);
  });

  it('_routes.json scopes the Function to /assets/* only', () => {
    const parsed = JSON.parse(routesJson);
    expect(parsed.version).toBe(1);
    expect(parsed.include).toContain('/assets/*');
    // Everything else stays on the free static tier.
    expect(parsed.exclude).toEqual([]);
  });

  it('assets Function exists and returns a real 404 for missing assets', () => {
    expect(existsSync(new URL('../functions/assets/[[path]].js', import.meta.url))).toBe(true);
    expect(assetFn).toContain('context.env.ASSETS.fetch');
    expect(assetFn).toContain('status: 404');
    // A real asset is JS/CSS; a missing one is text/html via the SPA fallback.
    expect(assetFn).toContain("includes('text/html')");
  });

  it('does NOT ship a top-level 404.html (would disable Pages SPA mode)', () => {
    expect(existsSync(new URL('../public/404.html', import.meta.url))).toBe(false);
  });

  it('index.html carries the self-heal reload guard (max one reload)', () => {
    expect(indexHtml).toContain('oresund-reloaded');
    expect(indexHtml).toContain('location.reload()');
    expect(indexHtml).toContain('sessionStorage');
  });
});
