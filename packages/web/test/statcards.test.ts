import { describe, expect, it } from 'vitest';
import type { DelayStats } from '@oresund/shared';
import { renderStatCards } from '../src/components/StatCards';

const STATS: DelayStats = {
  date_from: '2026-08-06',
  date_to: '2026-08-07',
  total_departures: 120,
  on_time_count: 108,
  delayed_count: 9,
  canceled_count: 3,
  on_time_pct: 90,
  delayed_pct: 7.5,
  canceled_pct: 2.5,
  avg_delay_seconds: 180,
  by_line: {},
};

describe('renderStatCards — inline hints', () => {
  it('renders a muted one-liner hint under every stat label (5 cards)', () => {
    const html = renderStatCards(STATS, 'en');
    expect((html.match(/class="stat-hint"/g) ?? []).length).toBe(5);
  });

  it('defines each stat in English', () => {
    const html = renderStatCards(STATS, 'en');
    expect(html).toContain('Today · share of departures with under 1 min delay');
    expect(html).toContain('Today · departures delayed 1 min or more');
    expect(html).toContain('Today · departures canceled');
    expect(html).toContain('Mean delay of all departures today');
    expect(html).toContain('Cross-border Øresundståg departures today');
  });

  it('places the hint right after the label, inside the same .stat card', () => {
    const html = renderStatCards(STATS, 'en');
    expect(html).toMatch(/class="stat-label">On time<\/span>\s*<span class="stat-hint">/);
    expect(html).toMatch(/class="stat-label">Departures<\/span>\s*<span class="stat-hint">/);
  });

  it('translates hints into sv and da', () => {
    const sv = renderStatCards(STATS, 'sv');
    expect(sv).toContain('Idag · andel avgångar med under 1 min försening');
    expect(sv).toContain('Snittförsening för alla avgångar idag');
    const da = renderStatCards(STATS, 'da');
    expect(da).toContain('I dag · andel afgange med under 1 min forsinkelse');
    expect(da).toContain('Grænseoverskridende Øresundståg-afgange i dag');
  });
});
