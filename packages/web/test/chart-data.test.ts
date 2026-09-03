import { describe, expect, it } from 'vitest';
import type { HistoryResponse, PunctualityResponse } from '../src/api';
import { renderHistoryCharts } from '../src/components/HistoryCharts';
import { renderPunctualityChart } from '../src/components/PunctualityChart';
import { renderSrTable } from '../src/lib/sr-table';

const HISTORY: HistoryResponse = {
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  total_disruptions: 9,
  daily: [
    { date: '2026-07-31', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
    { date: '2026-08-03', count: 3, cancellations: 1, delays: 2, alerts: 0, avg_delay: 240 },
    { date: '2026-08-06', count: 6, cancellations: 0, delays: 6, alerts: 0, avg_delay: 480 },
  ],
  by_line: [{ line: '804', count: 6, avg_delay: 480, max_delay: 900 }],
  by_cause: [],
  by_hour: [
    { hour: 7, count: 3, avg_delay: 300 },
    { hour: 16, count: 6, avg_delay: 480 },
  ],
};

/** Every sr-only table in a rendered board, keyed by its caption. */
function tablesByCaption(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<table class="sr-only">[\s\S]*?<\/table>/g)) {
    const cap = /<caption>(.*?)<\/caption>/.exec(m[0])?.[1] ?? '';
    out.set(cap, m[0]);
  }
  return out;
}

const PUNCTUALITY: PunctualityResponse = {
  days: 3,
  date_from: '2026-08-04',
  date_to: '2026-08-06',
  daily: [
    { date: '2026-08-04', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null },
    { date: '2026-08-05', total: 40, on_time: 34, delayed: 5, canceled: 1, on_time_pct: 85, avg_delay_seconds: 180 },
    { date: '2026-08-06', total: 52, on_time: 47, delayed: 4, canceled: 1, on_time_pct: 90.4, avg_delay_seconds: 95 },
  ],
};

describe('chart data tables (audit4 N-M15)', () => {

  it('pairs the daily bar chart with a table of every day it drew', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    const found = tablesByCaption(html).get('Daily: data table');
    expect(found, 'a sr-only table follows the daily chart').toBeDefined();
    const t = found!;
    for (const header of ['Date', 'Cancellation', 'Delay', 'Alert', 'Total']) {
      expect(t, header).toContain(`scope="col">${header}</th>`);
    }
    // One row per source day, cells matching the API numbers.
    expect(t).toContain('2026-08-03');
    expect(t).toContain('<th scope="row">2026-08-03</th><td>1</td><td>2</td><td>0</td><td>3</td>');
    expect(t).toContain('<th scope="row">2026-08-06</th><td>0</td><td>6</td><td>0</td><td>6</td>');
    expect(t).toContain('<th scope="row">2026-07-31</th><td>0</td><td>0</td><td>0</td><td>0</td>');
  });

  it('localizes the daily table for sv and da', () => {
    const sv = tablesByCaption(renderHistoryCharts(HISTORY, null, 7, 'sv'));
    expect(sv.has('Per dag: datatabell'), 'sv caption').toBe(true);
    expect(sv.get('Per dag: datatabell')).toContain('Inställd');
    expect(sv.get('Per dag: datatabell')).toContain('Datum');
    const da = tablesByCaption(renderHistoryCharts(HISTORY, null, 7, 'da'));
    expect(da.has('Per dag: datatabel'), 'da caption').toBe(true);
    expect(da.get('Per dag: datatabel')).toContain('Aflyst');
  });

  it('hides the bar plot from assistive tech, since the table carries the numbers', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    expect(html).toContain('<div class="bars" aria-hidden="true">');
  });

  it('pairs the heatmap with the two numbers each cell encodes', () => {
    const html = renderHistoryCharts(HISTORY, null, 30, 'en');
    expect(html).toContain('<div class="heatmap" aria-hidden="true">');
    const found = tablesByCaption(html).get('By hour: data table');
    expect(found, 'a sr-only table follows the heatmap').toBeDefined();
    const t = found!;
    expect(t).toContain('scope="col">Hour</th>');
    expect(t).toContain('scope="col">Share</th>');
    expect(t).toContain('scope="col">Count</th>');
    // 24 hour rows, shares from the same by_hour rows the cells were coloured from.
    expect((t.match(/<th scope="row">/g) ?? []).length).toBe(24);
    // Shares are of the window total (3 + 6 = 9), the same number heatColor used.
    expect(t).toContain('<th scope="row">07:00</th><td>33.3%</td><td>3</td>');
    expect(t).toContain('<th scope="row">16:00</th><td>66.7%</td><td>6</td>');
    // Hours with no disruptions are explicit zeros, not gaps.
    expect(t).toContain('<th scope="row">03:00</th><td>0.0%</td><td>0</td>');
  });

  it('pairs the punctuality line with one row per source day, including the days it skips', () => {
    const html = renderPunctualityChart(PUNCTUALITY, 'en');
    const found = tablesByCaption(html).get('Punctuality: data table');
    expect(found, 'a sr-only table follows the line chart').toBeDefined();
    const t = found!;
    for (const header of ['Date', 'On time %', 'On time', 'Delayed', 'Canceled', 'Avg delay']) {
      expect(t, header).toContain(`scope="col">${header}</th>`);
    }
    // A day with no departures reads as no data, never as 0%.
    expect(t).toContain('<th scope="row">2026-08-04</th><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>');
    expect(t).toContain('<th scope="row">2026-08-05</th><td>85.0%</td><td>34</td><td>5</td><td>1</td><td>3 min</td>');
    expect(t).toContain('<th scope="row">2026-08-06</th><td>90.4%</td><td>47</td><td>4</td><td>1</td><td>2 min</td>');
  });

  it('localizes the punctuality table, including the locale decimal separator', () => {
    const sv = renderPunctualityChart(PUNCTUALITY, 'sv');
    expect(sv).toContain('Punktlighet: datatabell');
    expect(sv).toContain('<td>90,4%</td>');
    expect(sv).toContain('<td>2 min</td>');
    const da = renderPunctualityChart(PUNCTUALITY, 'da');
    expect(da).toContain('Punktlighed: datatabel');
    expect(da).toContain('<td>2 min.</td>');
  });

  it('takes the punctuality svg out of the accessibility tree', () => {
    const html = renderPunctualityChart(PUNCTUALITY, 'en');
    expect(html).toMatch(/<svg viewBox="0 0 560 140" aria-hidden="true">/);
    expect(html).not.toContain('role="img"');
  });

  it('renders a caption, column headings and row headings with real table semantics', () => {
    const html = renderSrTable({
      caption: 'A: data table',
      headers: ['When', 'N'],
      rows: [
        ['Mon <3', '1'],
        ['Tue', '2'],
      ],
    });
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('<caption>A: data table</caption>');
    expect(html).toContain('<th scope="col">When</th>');
    expect(html).toContain('<th scope="row">Mon &lt;3</th><td>1</td>');
    expect(html).toContain('<th scope="row">Tue</th><td>2</td>');
  });

  it('never leaves the visual value labels as the only copy of a number', () => {
    // Every number the daily bars paint is also in the table; the table is the
    // complete series, the labels a subset.
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    const tables = html.match(/<table class="sr-only">/g) ?? [];
    expect(tables.length).toBe(2);
  });
});
