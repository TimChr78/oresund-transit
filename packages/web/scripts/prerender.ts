/**
 * Prerender the static routes (/methodology, /privacy) into real HTML pages.
 *
 * Runs AFTER `vite build` (see package.json): reads the BUILT dist/index.html
 * (which carries the hashed CSS/JS asset links — the source shell's raw
 * /src/main.ts does not exist in dist), injects the server-rendered page
 * fragment (en — the crawler default; the in-browser lang switcher re-renders
 * for visitors) into <div id="app">, swaps in the route's SEO
 * title/description/canonical, and writes dist/methodology.html +
 * dist/privacy.html. Cloudflare Pages serves those files at /methodology and
 * /privacy (extension-less redirect), bypassing the SPA catch-all.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { getDict, type Lang } from '../src/i18n';
import { renderPrerenderedPage } from '../src/lib/prerender';
<<<<<<< HEAD
import { PRERENDER_FILES } from '../src/lib/static-pages';
=======
import { STATIC_PAGES, type PrerenderedPageId } from '../src/lib/static-pages';
>>>>>>> origin/main
import { META, type PageMeta } from '../src/lib/seo';

const shell = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const LANG: Lang = 'en';

<<<<<<< HEAD
// Map each static route to its SEO metadata + renderer. PRERENDER_FILES (the
// single source of truth shared with the soft-404 catch-all) drives which
// pages are emitted, so adding a page here keeps the catch-all in sync.
type StaticRoute = 'methodology' | 'privacy';
const PAGES: Record<StaticRoute, { meta: PageMeta; render: () => string }> = {
=======
// Renderer registry keyed by the shared static route ids (PrerenderedPageId,
// the non-home entries of STATIC_PAGES in src/lib/static-pages). The Record is
// exhaustively typed, so adding a static page to that registry forces this
// table to grow a renderer too — a new prerendered path can never silently map
// to a missing renderer (no arbitrary string casts).
const PAGES: Record<PrerenderedPageId, { meta: PageMeta; render: () => string }> = {
>>>>>>> origin/main
  methodology: { meta: META.methodology, render: () => renderMethodologyPage(LANG, getDict(LANG)) },
  privacy: { meta: META.privacy, render: () => renderPrivacyPage(LANG, getDict(LANG)) },
};

<<<<<<< HEAD
const pages: { file: string; meta: PageMeta; render: () => string }[] = PRERENDER_FILES.map(
  (file) => {
    const route = file.slice(0, -'.html'.length) as StaticRoute;
    return { file, ...PAGES[route] };
  },
);
=======
const pages: { file: string; meta: PageMeta; render: () => string }[] = STATIC_PAGES.filter(
  (p): p is Extract<(typeof STATIC_PAGES)[number], { id: PrerenderedPageId }> => p.id !== 'home',
).map(({ path, id }) => ({ file: `${path.slice(1)}.html`, ...PAGES[id] }));
>>>>>>> origin/main

for (const page of pages) {
  const html = renderPrerenderedPage(shell, page.render(), LANG, page.meta);
  // e2e guard: the emitted page must load the BUILT bundle and stylesheet.
  // If this ever regresses to the source shell (dead /src/main.ts, no CSS),
  // fail the build instead of deploying a broken page.
  if (!html.includes('src="/assets/') || html.includes('src="/src/main.ts"') || !html.includes('href="/assets/')) {
    throw new Error(`prerendered ${page.file} must reference the built /assets/ bundle — got a source-shell script or no stylesheet`);
  }
  writeFileSync(new URL(`../dist/${page.file}`, import.meta.url), html);
  console.log(`prerendered dist/${page.file}`);
}
