/**
 * Prerender the static routes (/methodology, /privacy) into real HTML pages.
 *
 * Runs before `vite build` (see package.json): reads the Vite entry shell,
 * injects the server-rendered page fragment (en — the crawler default; the
 * in-browser lang switcher re-renders for visitors) into <div id="app">, and
 * writes public/methodology.html + public/privacy.html so Vite copies them
 * into dist/. Cloudflare Pages serves those files at /methodology and
 * /privacy (extension-less redirect), bypassing the SPA catch-all.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { getDict, type Lang } from '../src/i18n';
import { renderPrerenderedPage } from '../src/lib/prerender';

const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const LANG: Lang = 'en';

const pages: { file: string; render: () => string }[] = [
  { file: 'methodology.html', render: () => renderMethodologyPage(LANG, getDict(LANG)) },
  { file: 'privacy.html', render: () => renderPrivacyPage(LANG, getDict(LANG)) },
];

for (const page of pages) {
  const html = renderPrerenderedPage(shell, page.render(), LANG);
  writeFileSync(new URL(`../public/${page.file}`, import.meta.url), html);
  console.log(`prerendered public/${page.file}`);
}
