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
import { META, type PageMeta } from '../src/lib/seo';

const shell = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const LANG: Lang = 'en';

const pages: { file: string; meta: PageMeta; render: () => string }[] = [
  { file: 'methodology.html', meta: META.methodology, render: () => renderMethodologyPage(LANG, getDict(LANG)) },
  { file: 'privacy.html', meta: META.privacy, render: () => renderPrivacyPage(LANG, getDict(LANG)) },
];

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
