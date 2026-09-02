/**
 * Generate /llms.txt at build time — the LLM-readable site index.
 *
 * Runs AFTER `vite build` and the prerender script (see package.json): writes
 * dist/llms.txt from the same route data as the sitemap (src/lib/sitemap.ts,
 * buildLlmsTxt). Cloudflare Pages serves the file as a static asset at
 * /llms.txt — no request-time collector dependency (the sitemap Function
 * discovers lines/stations live; llms.txt is a deliberate build-time snapshot
 * using the canonical line set + monitored stops).
 */
import { writeFileSync } from 'node:fs';
import { buildLlmsTxt } from '../src/lib/sitemap';

const url = new URL('../dist/llms.txt', import.meta.url);
writeFileSync(url, buildLlmsTxt());
console.log('generated dist/llms.txt');

/**
 * Also stamp the deploy date (audit3 H4): the sitemap Function reads it back
 * through the ASSETS binding to date the static URLs' <lastmod>, so the
 * timestamp advances only on a real deploy. Stockholm's calendar day, to match
 * the day boundary the collector's data windows use.
 */
const generated = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
writeFileSync(new URL('../dist/build-meta.json', import.meta.url), `${JSON.stringify({ generated }, null, 2)}\n`);
console.log(`generated dist/build-meta.json (${generated})`);
