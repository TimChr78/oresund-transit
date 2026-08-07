import { describe, expect, it } from 'vitest';
import type { HistoryResponse, PunctualityResponse } from '../src/api';
import { renderPunctualityChart } from '../src/components/PunctualityChart';
import { svgLinePoints, svgY } from '../src/lib/stats';

const HISTORY: HistoryResponse = {
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  total_disruptions: 0,
  daily: [],
  by_line: [],
  by_cause: [],
  by_hour: [],
};

const PUNCTUALITY: PunctualityResponse = {
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  daily: [
    { date: '2026-07-31', total: 10, on_time: 9, delayed: 1, canceled: 0, on_time_pct: 90, avg_delay_seconds: 65 },
    { date: '2026-08-01', total: 10, on_time: 8, delayed: 2, canceled: 0, on_time_pct: 80, avg_delay_seconds: 120 },
    { date: '2026-08-06', total: 10, on_time: 9, delayed: 1, canceled: 0, on_time_pct: 90, avg_delay_seconds: 40 },
  ],
};

describe('svgY / svgLinePoints', () => {
  it('maps 0..100 onto the SVG canvas with 100 at the top', () => {
    expect(svgY(100, 100)).toBe(0);
    expect(svgY(0, 100)).toBe(100);
    expect(svgY(50, 120)).toBe(60);
  });

  it('clamps out-of-range values', () => {
    expect(svgY(150, 100)).toBe(0);
    expect(svgY(-5, 100)).toBe(100);
  });

  it('spreads points evenly across the width', () => {
    expect(svgLinePoints([100, 50, 0], 100, 100)).toBe('0.0,0.0 50.0,50.0 100.0,100.0');
  });

  it('returns an empty string for no points', () => {
    expect(svgLinePoints([], 100, 100)).toBe('');
  });
});

describe('renderPunctualityChart', () => {
  it('renders the translated title and an SVG line chart', () => {
    const html = renderPunctualityChart(PUNCTUALITY, 'en');
    expect(html).toContain('Punctuality');
    expect(html).toContain('<svg');
    expect(html).toContain('polyline');
    expect(html).toContain('polygon'); // area fill
  });

  it('includes day tick labels and the latest on-time % inline', () => {
    const html = renderPunctualityChart(PUNCTUALITY, 'en');
    expect(html).toContain('07-31');
    expect(html).toContain('08-06');
    expect(html).toContain('90%');
  });

  it('uses the trilingual section title', () => {
    expect(renderPunctualityChart(PUNCTUALITY, 'sv')).toContain('Punktlighet');
    expect(renderPunctualityChart(PUNCTUALITY, 'da')).toContain('Punktlighed');
  });

  it('renders gracefully when every day is zero (sparse early data)', () => {
    const zero = {
      days: 7,
      date_from: '2026-07-31',
      date_to: '2026-08-06',
      daily: PUNCTUALITY.daily.map((d) => ({
        date: d.date,
        total: 0,
        on_time: 0,
        delayed: 0,
        canceled: 0,
        on_time_pct: 0,
        avg_delay_seconds: null,
      })),
    };
    const html = renderPunctualityChart(zero, 'en');
    expect(html).toContain('<svg');
    expect(html).toContain('polyline');
  });

  it('renders an empty state instead of an SVG when there are no daily rows', () => {
    const empty: PunctualityResponse = { days: 7, date_from: 'x', date_to: 'y', daily: [] };
    const html = renderPunctualityChart(empty, 'en');
    expect(html).not.toContain('<svg');
    expect(html).toContain('empty');
  });
});

// Keep HistoryResponse referenced so the fixture stays typed to the API shape.
void HISTORY;
