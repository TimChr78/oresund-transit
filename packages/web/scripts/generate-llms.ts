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