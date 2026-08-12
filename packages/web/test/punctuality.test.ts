import { describe, expect, it } from 'vitest';
import type { HistoryResponse, PunctualityResponse } from '../src/api';
import { renderPunctualityChart } from '../src/components/PunctualityChart';
import { svgY } from '../src/lib/stats';

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

describe('svgY', () => {
  it('maps 0..100 onto the SVG canvas with 100 at the top', () => {
    expect(svgY(100, 100)).toBe(0);
    expect(svgY(0, 100)).toBe(100);
    expect(svgY(50, 120)).toBe(60);
  });

  it('clamps out-of-range values', () => {
    expect(svgY(150, 100)).toBe(0);
    expect(svgY(-5, 100)).toBe(100);
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

  it('audit: scales uniformly (fixed viewBox + width/height auto, no preserveAspectRatio="none") so strokes never distort', () => {
    const html = renderPunctualityChart(PUNCTUALITY, 'en');
    expect(html).toContain('<svg');
    expect(html).not.toContain('preserveAspectRatio');
    expect(html).toContain('punct-line');
    expect(html).toContain('punct-grid');
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

  it('renders y-axis % labels on the left (mono, faint)', () => {
    const html = renderPunctualityChart(PUNCTUALITY, 'en');
    expect(html).toContain('punct-ylabels');
    for (const label of ['0', '25', '50', '75', '100']) {
      expect(html).toContain(`>${label}%<`);
    }
  });

  it('places the 100% label at the top and 0% at the bottom (not inverted)', () => {
    const html = renderPunctualityChart(PUNCTUALITY, 'en');
    expect(html).toContain('style="top:0%">100%<');
    expect(html).toContain('style="top:100%">0%<');
    expect(html).toContain('style="top:50%">50%<');
  });

  it('draws the line only through days that have departures and explains the gap', () => {
    const gapped = {
      days: 7,
      date_from: '2026-07-31',
      date_to: '2026-08-06',
      daily: [
        { date: '2026-07-31', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
        { date: '2026-08-01', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
        { date: '2026-08-02', total: 10, on_time: 9, delayed: 1, canceled: 0, on_time_pct: 90, avg_delay_seconds: 60 },
        { date: '2026-08-03', total: 10, on_time: 8, delayed: 2, canceled: 0, on_time_pct: 80, avg_delay_seconds: 120 },
        { date: '2026-08-04', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
        { date: '2026-08-05', total: 12, on_time: 11, delayed: 1, canceled: 0, on_time_pct: 91.7, avg_delay_seconds: 40 },
        { date: '2026-08-06', total: 12, on_time: 11, delayed: 1, canceled: 0, on_time_pct: 91.7, avg_delay_seconds: 40 },
      ],
    };
    const html = renderPunctualityChart(gapped, 'en');
    // Two contiguous data runs -> two polyline segments, no flat-0% fake line.
    expect(html.match(/class="punct-line"/g)).toHaveLength(2);
    expect(html).toContain('data since 2026-08-02');
    // No-data days get no dots.
    expect(html).not.toContain('<title>2026-08-04');
  });

  it('renders grid + note but no line when every day has no departures', () => {
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
    expect(html).toContain('punct-ylabels');
    expect(html).not.toContain('punct-line');
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
    // No departures collected -> no fake flat 0% line, just the empty grid.
    expect(html).not.toContain('polyline');
  });

  it('renders an empty state instead of an SVG when there are no daily rows', () => {
    const empty: PunctualityResponse = { days: 7, date_from: 'x', date_to: 'y', daily: [] };
    const html = renderPunctualityChart(empty, 'en');
    expect(html).not.toContain('<svg');
    expect(html).toContain('empty');
  });

  it('adds a muted hint under the punctuality title (Phase 8)', () => {
    const html = renderPunctualityChart(PUNCTUALITY, 'en');
    expect(html).toMatch(
      /chart-title">Punctuality<\/h3>\s*<p class="chart-hint">Share of departures on time \(under 4 min delay\) per day<\/p>/,
    );
    expect(renderPunctualityChart(PUNCTUALITY, 'sv')).toContain('Andel avgångar i tid (under 4 min försening) per dag');
    expect(renderPunctualityChart(PUNCTUALITY, 'da')).toContain('Andel afgange til tiden (under 4 min forsinkelse) pr. dag');
  });

  it('still shows the punctuality hint in the empty state', () => {
    const empty: PunctualityResponse = { days: 7, date_from: 'x', date_to: 'y', daily: [] };
    const html = renderPunctualityChart(empty, 'en');
    expect(html).toMatch(/class="chart-title">Punctuality<\/h3>\s*<p class="chart-hint">/);
  });
});

// Keep HistoryResponse referenced so the fixture stays typed to the API shape.
void HISTORY;
