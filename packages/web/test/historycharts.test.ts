import { describe, expect, it } from 'vitest';
import type { HistoryResponse } from '../src/api';
import { renderHistoryCharts } from '../src/components/HistoryCharts';

const HISTORY: HistoryResponse = {
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  total_disruptions: 9,
  daily: [
    { date: '2026-07-31', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
    { date: '2026-08-01', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
    { date: '2026-08-02', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
    { date: '2026-08-03', count: 3, cancellations: 1, delays: 2, alerts: 0, avg_delay: 240 },
    { date: '2026-08-04', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
    { date: '2026-08-05', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
    { date: '2026-08-06', count: 6, cancellations: 0, delays: 6, alerts: 0, avg_delay: 480 },
  ],
  by_line: [],
  by_cause: [],
  by_hour: [],
};

describe('renderHistoryCharts — trend overlay', () => {
  it('renders the 3-day moving-average polyline above the daily bars with a legend', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    expect(html).toContain('trend-layer');
    expect(html).toContain('polyline');
    expect(html).toContain('trend-line');
    expect(html).toContain('3-day avg');
  });

  it('uses the trilingual trend legend', () => {
    expect(renderHistoryCharts(HISTORY, null, 7, 'sv')).toContain('3-dagarsmedel');
    expect(renderHistoryCharts(HISTORY, null, 7, 'da')).toContain('3-dages gennemsnit');
  });

  it('omits the trend layer when every day is zero', () => {
    const zero: HistoryResponse = {
      ...HISTORY,
      total_disruptions: 0,
      daily: HISTORY.daily.map((d) => ({ ...d, count: 0 })),
    };
    const html = renderHistoryCharts(zero, null, 7, 'en');
    expect(html).not.toContain('trend-layer');
    expect(html).not.toContain('polyline');
  });
});
