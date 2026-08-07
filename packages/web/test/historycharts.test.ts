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
  by_line: [
    { line: '804', count: 6, avg_delay: 480, max_delay: 900 },
    { line: 'unknown', count: 2, avg_delay: null, max_delay: null },
  ],
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

  it('marks the trend polyline non-scaling so the stretched SVG cannot balloon stroke width', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    expect(html).toMatch(/<polyline[^>]*vector-effect="non-scaling-stroke"/);
  });

  it('marks the stretched daily-grid lines non-scaling too (same distortion class)', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    expect(html).toMatch(/<line[^>]*vector-effect="non-scaling-stroke"/);
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

describe('renderHistoryCharts — enriched By Line', () => {
  it('shows count + avg delay + max delay with a route label', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    expect(html).toContain('804');
    expect(html).toContain('Øresundståg Malmö–København');
    expect(html).toContain('8 min'); // avg 480 s
    expect(html).toContain('15 min'); // max 900 s
  });

  it('renders an em dash for a line without delay data', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    expect(html).toContain('—');
  });
});

describe('renderHistoryCharts — By Weekday', () => {
  it('renders Mon–Sun bars with trilingual labels', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    expect(html).toContain('By weekday');
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(html).toContain(label);
    }
    const sv = renderHistoryCharts(HISTORY, null, 7, 'sv');
    expect(sv).toContain('Per veckodag');
    expect(sv).toContain('Mån');
    expect(sv).toContain('Sön');
    const da = renderHistoryCharts(HISTORY, null, 7, 'da');
    expect(da).toContain('Per ugedag');
  });

  it('shows the weekday count and avg delay', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    // Monday 2026-08-03: 3 disruptions @ 4 min avg
    expect(html).toContain('>3<');
    expect(html).toContain('4 min');
  });
});


describe('renderHistoryCharts — day-range toggles', () => {
  it('renders all four ranges with correct labels (90 days not mislabeled 30)', () => {
    const html = renderHistoryCharts(HISTORY, null, 90, 'en');
    expect(html).toContain('7 days');
    expect(html).toContain('14 days');
    expect(html).toContain('30 days');
    expect(html).toContain('90 days');
  });
});

describe('renderHistoryCharts — daily axis legibility', () => {
  it('labels month boundaries with a localized day+month tick ("1 Aug")', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en'); // 2026-07-31 .. 2026-08-06
    expect(html).toContain('>1 Aug<');
    expect(html).toContain('>31<'); // bare day-of-month elsewhere
    // Localized month names: sv "1 aug", da "1 aug"
    expect(renderHistoryCharts(HISTORY, null, 7, 'sv')).toContain('>1 aug<');
    expect(renderHistoryCharts(HISTORY, null, 7, 'da')).toContain('>1 aug<');
  });

  it('omits non-month-start labels at a long range (stride) while keeping month starts', () => {
    const longDaily = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-07-${String(i + 3).padStart(2, '0')}`,
      count: 1,
      cancellations: 0,
      delays: 1,
      alerts: 0,
      avg_delay: null,
    })).map((d, i) => (i === 29 ? { ...d, date: '2026-08-01' } : d));
    const html = renderHistoryCharts({ ...HISTORY, daily: longDaily }, null, 30, 'en');
    expect(html).toContain('>1 Aug<');
  });

  it('renders horizontal gridlines behind the daily bars', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    expect(html).toContain('daily-grid');
    expect(html).toContain('<line');
  });

  it('shows a subtle max-count label at the top-left of the plot', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en'); // max = 6 on 2026-08-06
    expect(html).toContain('plot-max');
    expect(html).toContain('max 6');
  });

  it('omits the max label when every day is zero', () => {
    const zero: HistoryResponse = { ...HISTORY, daily: HISTORY.daily.map((d) => ({ ...d, count: 0 })) };
    const html = renderHistoryCharts(zero, null, 7, 'en');
    expect(html).not.toContain('plot-max');
  });
});

describe('renderHistoryCharts — by-hour heatmap (share %, 30-day baseline)', () => {  const byHour = [
    { hour: 6, count: 10, avg_delay: null },
    { hour: 18, count: 30, avg_delay: null },
  ];

  it('colors cells with the red→green share palette (max hour = red)', () => {
    const html = renderHistoryCharts({ ...HISTORY, by_hour: byHour }, null, 7, 'en');
    expect(html).toContain('background-color:rgb(');
    expect(html).toContain('rgb(239, 68, 68)'); // 18:00 is the max share -> red
    expect(html).not.toContain('--i:'); // no indigo-alpha ramp anymore
  });

  it('renders zero-share hours as invisible cells, not faint green', () => {
    const html = renderHistoryCharts({ ...HISTORY, by_hour: byHour }, null, 7, 'en');
    expect(html).toContain('opacity:0.000'); // e.g. 04:00 has no disruptions
  });

  it('tooltips show the share % and the raw count ("06:00 — 25.0% (10)")', () => {
    const html = renderHistoryCharts({ ...HISTORY, by_hour: byHour }, null, 7, 'en');
    expect(html).toContain('06:00 — 25.0% (10)');
    expect(html).toContain('18:00 — 75.0% (30)');
  });

  it('uses the separate 30-day heatmap history when provided', () => {
    const heatmapHistory: HistoryResponse = {
      ...HISTORY,
      by_hour: [{ hour: 7, count: 1, avg_delay: null }],
    };
    const html = renderHistoryCharts(
      { ...HISTORY, by_hour: [{ hour: 18, count: 99, avg_delay: null }] },
      null,
      7,
      'en',
      heatmapHistory,
    );
    expect(html).toContain('07:00 — 100.0% (1)');
    expect(html).not.toContain('(99)'); // main history's 18:00 count is not used
  });

  it('adds the trilingual "last 30 days" caption only with the 30-day baseline', () => {
    const heatmapHistory: HistoryResponse = { ...HISTORY, by_hour: byHour };
    const withBaseline = (lang: 'en' | 'sv' | 'da'): string =>
      renderHistoryCharts({ ...HISTORY, by_hour: byHour }, null, 7, lang, heatmapHistory);
    expect(withBaseline('en')).toContain('Share of disruptions by hour — last 30 days');
    expect(withBaseline('sv')).toContain('senaste 30 dagarna');
    expect(withBaseline('da')).toContain('sidste 30 dage');
    // No baseline (fallback to the range-toggled history) -> no caption, so
    // the caption never claims a 30-day window the chart is not showing.
    expect(renderHistoryCharts({ ...HISTORY, by_hour: byHour }, null, 7, 'en')).not.toContain('heat-caption');
  });
});

describe('renderHistoryCharts — hbar structure (de-right-align)', () => {
  it('renders label → track → fill → count → meta in order for line rows', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    const lineRow = html.match(/<div class="hbar hbar-line">([\s\S]*?)<\/div>/)?.[1] ?? '';
    const pos = (cls: string): number => lineRow.indexOf(cls);
    expect(pos('hbar-label')).toBeGreaterThan(-1);
    expect(pos('hbar-track')).toBeGreaterThan(pos('hbar-label'));
    expect(pos('hbar-fill')).toBeGreaterThan(pos('hbar-track'));
    expect(pos('hbar-count')).toBeGreaterThan(pos('hbar-fill'));
    expect(pos('hbar-meta')).toBeGreaterThan(pos('hbar-count'));
  });

  it('renders the simple hbar rows with label, track, count and meta classes', () => {
    const html = renderHistoryCharts(HISTORY, null, 7, 'en');
    const rows = html.match(/<div class="hbar">([\s\S]*?)<\/div>/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows.slice(0, 3)) {
      expect(row).toMatch(/hbar-label/);
      expect(row).toMatch(/hbar-track/);
      expect(row).toMatch(/hbar-count/);
    }
  });
});
