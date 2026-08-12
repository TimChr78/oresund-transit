import { describe, expect, it } from 'vitest';
import type { HistoryResponse } from '../src/api';
import { renderInsightCards } from '../src/components/InsightCards';

function history(overrides: Partial<HistoryResponse> = {}): HistoryResponse {
  return {
    days: 14,
    date_from: '2026-07-24',
    date_to: '2026-08-06',
    total_disruptions: 21,
    daily: [
      ...Array.from({ length: 7 }, (_, i) => ({
        date: `2026-07-${String(24 + i).padStart(2, '0')}`,
        count: 1,
        cancellations: 0,
        delays: 1,
        alerts: 0,
        avg_delay: 120,
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        date: `2026-07-${String(31 + i).padStart(2, '0')}`,
        count: 2,
        cancellations: 0,
        delays: 2,
        alerts: 0,
        avg_delay: 240,
      })),
    ],
    by_line: [],
    by_cause: [],
    by_hour: [
      { hour: 8, count: 5, avg_delay: 300 },
      { hour: 12, count: 5, avg_delay: 60 },
    ],
    ...overrides,
  };
}

describe('renderInsightCards', () => {
  it('renders the week-over-week card: +N%, (a → b), avg delay this vs prev week', () => {
    const html = renderInsightCards(history(), 'en');
    expect(html).toContain('Week over week');
    expect(html).toContain('+100% vs previous week');
    expect(html).toContain('7 → 14');
    expect(html).toContain('2 min → 4 min');
  });

  it('renders the peak vs off-peak card: rush share % + avg delays', () => {
    const html = renderInsightCards(history(), 'en');
    expect(html).toContain('Peak hours');
    expect(html).toContain('50% of disruptions during peak');
    expect(html).toContain('5 min');
    expect(html).toContain('1 min');
  });

  it('omits the week-over-week card when there are fewer than 14 daily rows', () => {
    const seven = history({ days: 7, daily: history().daily.slice(7) });
    const html = renderInsightCards(seven, 'en');
    expect(html).not.toContain('Week over week');
    expect(html).toContain('Peak hours');
  });

  it('uses trilingual card titles', () => {
    expect(renderInsightCards(history(), 'sv')).toContain('Vecka mot vecka');
    expect(renderInsightCards(history(), 'sv')).toContain('Rusningstid');
    expect(renderInsightCards(history(), 'da')).toContain('Uge mod uge');
    expect(renderInsightCards(history(), 'da')).toContain('Myldretid');
  });

  it('adds a peak-hours hint to the peak card (Phase 8)', () => {
    const html = renderInsightCards(history(), 'en');
    expect(html).toContain('class="chart-hint"');
    // & is escaped to &amp; by esc(), matching the on-page text
    expect(html).toContain('Peak hours 07–09 &amp; 16–18 vs rest of day');
  });

  it('translates the peak-hours hint', () => {
    expect(renderInsightCards(history(), 'sv')).toContain('Rusningstid 07–09 &amp; 16–18 jämfört med övrig tid');
    expect(renderInsightCards(history(), 'da')).toContain('Myldretid 07–09 &amp; 16–18 mod resten af dagen');
  });
});
