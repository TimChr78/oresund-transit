import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Deploy-race protection. During a Pages deploy there is a window where the
 * new HTML references a hashed asset that has not propagated yet; the SPA
 * fallback would serve index.html (200) for the missing asset, and the
 * custom-domain /assets/* cache rule would cache that HTML under the JS URL
 * for hours -> blank page. Two layers defend against it:
 *
 * 1. functions/assets/[[path]].js — returns a real 404 when the requested
 *    asset is missing (detected via the ASSETS binding: a real asset is
 *    JS/CSS, a missing one falls through the SPA fallback as text/html). It is
 *    reached for every URL, because _routes.json is include "/*" and scopes
 *    nothing (audit5 M9 / audit6 L8) — Function choice is by URL specificity,
 *    not by that file.
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

  it('_routes.json routes the archive/asset/feed Functions and the soft-404 catch-all', () => {
    const parsed = JSON.parse(routesJson);
    expect(parsed.version).toBe(1);
    // The root catch-all (functions/[[path]].js) answers unknown paths with a
    // real 404. '/*' is the ONLY include — CF rejects overlapping rules, and
    // route-specific Functions still win by specificity; assets pass through
    // ASSETS.fetch inside the catch-all.
    expect(parsed.include).toEqual(['/*']);
    // Nothing is excluded, so nothing falls back to the free static tier: a
    // Function runs on every request (audit6 L8).
    expect(parsed.exclude).toEqual([]);
  });

  it('assets Function exists and returns a real 404 for missing assets', () => {
    expect(existsSync(new URL('../functions/assets/[[path]].js', import.meta.url))).toBe(true);
    expect(assetFn).toContain('context.env.ASSETS.fetch');
    // audit5 H5: the 404 (and its headers) is built by the shared helper, so
    // its status is no longer spelled out inline here. test/security-headers
    // drives the Function and asserts the status and the full header set.
    expect(assetFn).toContain('notFoundResponse(');
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
