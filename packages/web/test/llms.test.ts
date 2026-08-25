import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { buildLlmsTxt } from '../src/lib/sitemap';
import { CANONICAL_LINES, DAY_RANGES } from '../src/lib/archive';

/**
 * M7 — /llms.txt: an LLM-readable site index (llmstxt.org) generated at build
 * time from the same route data as the sitemap: site title, a one-paragraph
 * description and a grouped page list (Live status, Archives per
 * line/station, History windows, Methodology, Privacy). It is served as a
 * static file out of dist/ — no request-time collector dependency (the
 * sitemap's static base lists the same canonical lines and monitored stops).
 */
const txt = buildLlmsTxt();

describe('llms.txt (M7)', () => {
  it('starts with the site title and a one-paragraph description', () => {
    expect(txt.startsWith('# Øresund.live\n')).toBe(true);
    const paragraph = txt.split('\n').find((l) => l.startsWith('> '));
    expect(paragraph).toBeDefined();
    expect(paragraph!.length).toBeGreaterThan(40);
    expect(txt).toContain('Øresundståg');
  });

  it('groups the pages: Live status, Archives per line/station, History windows, Methodology, Privacy', () => {
    for (const group of ['Live status', 'Archives per line/station', 'History windows', 'Methodology', 'Privacy']) {
      expect(txt).toContain(`## ${group}`);
    }
  });

  it('lists the live board and every canonical line + monitored station archive', () => {
    expect(txt).toMatch(/\[Live departure board\]\(\//);
    expect(txt).toContain('[Line archives](/line)');
    for (const l of CANONICAL_LINES) {
      expect(txt).toContain(`[Line ${l}](/line/${encodeURIComponent(l)})`);
    }
    expect(txt).toContain('[Station archives](/station)');
    expect(txt).toContain('[Malmö Hyllie](/station/hyllie)');
    expect(txt).toContain('[København H](/station/kobenhavn-h)');
    expect(txt).toContain('[Malmö C](/station/malmo-c)');
    expect(txt).toContain('[Københavns Lufthavn (Kastrup)](/station/kastrup)');
  });

  it('lists the history index and every day window, plus methodology and privacy', () => {
    expect(txt).toContain('[Disruption history](/history)');
    for (const d of DAY_RANGES) {
      expect(txt).toContain(`[Last ${d} days](/history/${d})`);
    }
    expect(txt).toContain('(/methodology)');
    expect(txt).toContain('(/privacy)');
  });

  it('is generated at build time into dist/ (never committed to public/)', () => {
    const script = readFileSync(new URL('../scripts/generate-llms.ts', import.meta.url), 'utf8');
    expect(script).toContain("new URL('../dist/llms.txt', import.meta.url)");
    expect(script).toContain('buildLlmsTxt');
    expect(script).not.toContain('public/');
    expect(existsSync(new URL('../public/llms.txt', import.meta.url))).toBe(false);
  });
});