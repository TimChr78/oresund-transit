/**
 * Prerender the static routes into real HTML pages, in every language.
 *
 * Runs AFTER `vite build` (see package.json): reads the BUILT dist/index.html
 * (which carries the hashed CSS/JS asset links — the source shell's raw
 * /src/main.ts does not exist in dist), injects the server-rendered page
 * fragment into <div id="app">, swaps in each variant's SEO title/description/
 * canonical, adds the hreflang cluster, and writes:
 *
 *   dist/{methodology,privacy}.html          — en (crawler default)
 *   dist/sv/{methodology,privacy,index}.html — Swedish variants
 *   dist/da/{methodology,privacy,index}.html — Danish variants
 *   dist/index.html                          — en shell, now with hreflang
 *
 * Cloudflare Pages serves those files at the extension-less pretty paths
 * (/methodology, /sv/methodology, /sv/ …), bypassing the SPA catch-all.
 *
 * The home page has no SSG renderer (it is the SPA shell), so its variants
 * are the shell re-issued with a localized lang/title/canonical + hreflang;
 * the actual board content still renders client-side.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { getDict, type Lang } from '../src/i18n';
import { renderPrerenderedPage, renderLocalizedHome } from '../src/lib/prerender';
import { STATIC_PAGES, STATIC_LANGS, staticFilePath, type StaticPageId, type PrerenderedPageId } from '../src/lib/static-pages';
import { META, hreflangCluster, type PageMeta } from '../src/lib/seo';
import type { Route } from '../src/lib/route';

const shell = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

/** SSG renderers keyed by the shared static route ids (PrerenderedPageId). */
const RENDERERS: Record<PrerenderedPageId, (lang: Lang) => string> = {
  methodology: (lang) => renderMethodologyPage(lang, getDict(lang)),
  privacy: (lang) => renderPrivacyPage(lang, getDict(lang)),
};

/** META key for a static page id (home → the dashboard route's SEO). */
const META_ROUTE: Record<StaticPageId, Route> = {
  home: 'dashboard',
  methodology: 'methodology',
  privacy: 'privacy',
};

for (const page of STATIC_PAGES) {
  for (const lang of STATIC_LANGS) {
    const meta: PageMeta = META[META_ROUTE[page.id]][lang];
    const hreflang = hreflangCluster(page.path);

    const html =
      page.id === 'home'
        ? renderLocalizedHome(shell, lang, meta, hreflang)
        : renderPrerenderedPage(shell, RENDERERS[page.id](lang), lang, meta, hreflang);

    // e2e guard: every emitted page must load the BUILT bundle + stylesheet.
    // If this ever regresses to the source shell (dead /src/main.ts, no CSS),
    // fail the build instead of deploying a broken page.
    if (!html.includes('src="/assets/') || html.includes('src="/src/main.ts"') || !html.includes('href="/assets/')) {
      throw new Error(`prerendered ${page.id}/${lang} must reference the built /assets/ bundle — got a source-shell script or no stylesheet`);
    }

    const file = staticFilePath(page.id, lang);
    const url = new URL(`../dist/${file}`, import.meta.url);
    mkdirSync(new URL('.', url), { recursive: true });
    writeFileSync(url, html);
    console.log(`prerendered dist/${file}`);
  }
}
