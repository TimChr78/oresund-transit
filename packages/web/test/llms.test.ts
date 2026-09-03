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
  });

  /**
   * M9 — the station pages exist in en + sv + da (audit3 C1), so llms.txt
   * enumerates all twelve URLs. Each carries a one-line description, in the
   * page's own language, that names the stop and its Trafiklab stop id — an
   * LLM should be able to answer "which station should I check?" and pick the
   * right language variant without following four links.
   */
  it('enumerates every station URL in all three languages, each with a description', () => {
    // The label is the localized display name — the string the linked page's
    // own H1 uses, not the collector's English stop_name (audit4 LOW).
    const stations = [
      { slug: 'hyllie', id: '740001586', names: { en: 'Malmö Hyllie', sv: 'Malmö Hyllie', da: 'Malmö Hyllie' } },
      { slug: 'malmo-c', id: '740000003', names: { en: 'Malmö C', sv: 'Malmö C', da: 'Malmö C' } },
      {
        slug: 'kastrup',
        id: '860000858',
        names: { en: 'Københavns Lufthavn (Kastrup)', sv: 'Kastrup flygplats', da: 'Kastrup Lufthavn' },
      },
      { slug: 'kobenhavn-h', id: '860000626', names: { en: 'København H', sv: 'Köpenhamn H', da: 'København H' } },
    ];
    const prefixes = { en: '', sv: '/sv', da: '/da' } as const;
    const langLabel = { en: 'English', sv: 'svenska', da: 'dansk' } as const;
    for (const s of stations) {
      for (const lang of ['en', 'sv', 'da'] as const) {
        const line = `- [${s.names[lang]} — ${langLabel[lang]}](${prefixes[lang]}/station/${s.slug}):`;
        expect(txt, line).toContain(line);
      }
      // The description names the stop id — the same identifier the page's
      // TrainStation JSON-LD publishes — so a reader can match the page to
      // the stop it covers. Three language variants, so three occurrences.
      expect(txt.split(`${s.id}`).length - 1).toBe(3);
    }
    // 4 stops x 3 languages, every one a link followed by a description.
    const stationLines = txt.split('\n').filter((l) => /]\((\/(sv|da))?\/station\/.+/.test(l));
    expect(stationLines).toHaveLength(12);
    expect(stationLines.filter((l) => l.includes(': '))).toHaveLength(12);
  });

  it('names all four monitored stops in the live-status lede (no two-station under-claim)', () => {
    const lede = txt.split('\n').find((l) => l.startsWith('- [Live departure board]'));
    for (const name of ['Malmö Hyllie', 'Malmö C', 'Kastrup', 'København H']) {
      expect(lede, name).toContain(name);
    }
  });

  it('lists the history hub (all three languages) and every day window, plus methodology and privacy', () => {
    expect(txt).toContain('[Disruption history](/history):');
    // The hub localizes, so its twins are named right where the hub is —
    // an LLM can pick the Swedish or Danish page without a second hop.
    expect(txt).toContain('](/sv/history)');
    expect(txt).toContain('](/da/history)');
    expect(txt).toContain('[Disruption history, last 30 days](/history/30)');
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