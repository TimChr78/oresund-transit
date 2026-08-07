import { describe, expect, it } from 'vitest';
import type { Disruption, LiveStatus } from '@oresund/shared';
import {
  barHeights,
  dailyBarSegments,
  dailyLabelPlan,
  filterByDirection,
  hBarWidth,
  heatColor,
  heatmapBuckets,
  heatmapIntensity,
  heatmapShare,
  movingAverage,
  peakVsOffPeak,
  punctualitySeries,
  sortNewestFirst,
  delayStatsRange,
  weekOverWeek,
  weekdayIndex,
  byWeekday,
} from '../src/lib/stats';

describe('barHeights', () => {
  it('normalizes values to fractions of the max', () => {
    expect(barHeights([2, 4, 1])).toEqual([0.5, 1, 0.25]);
  });

  it('returns zeros for all-zero data (not NaN)', () => {
    expect(barHeights([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('returns an empty array for empty input', () => {
    expect(barHeights([])).toEqual([]);
  });
});

describe('dailyBarSegments', () => {
  it('computes stacked segments as fractions of the window max', () => {
    const daily = [
      { date: '2026-08-05', count: 5, cancellations: 2, delays: 2, alerts: 1 },
      { date: '2026-08-06', count: 10, cancellations: 5, delays: 3, alerts: 2 },
    ];
    expect(dailyBarSegments(daily)).toEqual([
      { cancellations: 0.2, delays: 0.2, alerts: 0.1 },
      { cancellations: 0.5, delays: 0.3, alerts: 0.2 },
    ]);
  });

  it('returns zero segments for zero data (not NaN)', () => {
    const daily = [{ date: '2026-08-06', count: 0, cancellations: 0, delays: 0, alerts: 0 }];
    expect(dailyBarSegments(daily)).toEqual([{ cancellations: 0, delays: 0, alerts: 0 }]);
  });

  it('returns an empty array for empty input', () => {
    expect(dailyBarSegments([])).toEqual([]);
  });
});

describe('heatmapBuckets', () => {
  it('buckets hours into a 24-cell array indexed 0-23', () => {
    const buckets = heatmapBuckets([
      { hour: 6, count: 2 },
      { hour: 6, count: 3 },
      { hour: 23, count: 1 },
    ]);
    expect(buckets).toHaveLength(24);
    expect(buckets[6]).toBe(5);
    expect(buckets[23]).toBe(1);
    expect(buckets[0]).toBe(0);
    expect(buckets[7]).toBe(0);
  });

  it('returns 24 zeros for empty input', () => {
    const buckets = heatmapBuckets([]);
    expect(buckets).toHaveLength(24);
    expect(buckets.every((v) => v === 0)).toBe(true);
  });
});

describe('heatmapIntensity', () => {
  it('normalizes counts to 0..1 intensity', () => {
    expect(heatmapIntensity([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  it('returns zeros for all-zero buckets (not NaN)', () => {
    expect(heatmapIntensity([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('hBarWidth', () => {
  it('returns count/max', () => {
    expect(hBarWidth(5, 10)).toBe(0.5);
    expect(hBarWidth(10, 10)).toBe(1);
  });

  it('guards against max <= 0', () => {
    expect(hBarWidth(3, 0)).toBe(0);
    expect(hBarWidth(0, 10)).toBe(0);
  });
});

describe('movingAverage', () => {
  it('computes a centered 3-day average (edge days clamp the window)', () => {
    expect(movingAverage([0, 0, 0, 3, 0, 0, 0], 3)).toEqual([0, 0, 1, 1, 1, 0, 0]);
  });

  it('smooths a steady ramp', () => {
    expect(movingAverage([0, 1, 2, 3, 4], 3)).toEqual([0.5, 1, 2, 3, 3.5]);
  });

  it('a window of 1 is the identity', () => {
    expect(movingAverage([2, 4, 6], 1)).toEqual([2, 4, 6]);
  });

  it('a window >= length averages everything', () => {
    expect(movingAverage([2, 4, 6], 9)).toEqual([4, 4, 4]);
  });

  it('returns an empty array for empty input', () => {
    expect(movingAverage([], 3)).toEqual([]);
  });
});

describe('weekOverWeek', () => {
  const day = (count: number, avg_delay: number | null = null) => ({ count, avg_delay });

  it('splits 14 daily rows into prior 7 vs last 7 with % change', () => {
    // prev week: 10 disruptions, this week: 12
    const prevCounts = [0, 2, 2, 2, 2, 1, 1]; // 10
    const daily = [
      ...prevCounts.map((c) => day(c, 60)),
      ...Array.from({ length: 7 }, (_, i) => day(i === 0 ? 6 : 1, 90)), // curr: 6,1,1,1,1,1,1 = 12
    ];
    const wow = weekOverWeek(daily);
    expect(wow).toEqual({
      prevCount: 10,
      currCount: 12,
      changePct: 20,
      prevAvgDelay: 60,
      currAvgDelay: 90,
    });
  });

  it('reports a negative change when this week is lighter', () => {
    const daily = [
      ...Array.from({ length: 7 }, () => day(4, 100)),
      ...Array.from({ length: 7 }, () => day(1, 50)),
    ];
    const wow = weekOverWeek(daily);
    expect(wow?.prevCount).toBe(28);
    expect(wow?.currCount).toBe(7);
    expect(wow?.changePct).toBe(-75);
  });

  it('returns null change when the previous week had no disruptions', () => {
    const daily = [
      ...Array.from({ length: 7 }, () => day(0, null)),
      ...Array.from({ length: 7 }, () => day(2, 40)),
    ];
    const wow = weekOverWeek(daily);
    expect(wow?.changePct).toBeNull();
    expect(wow?.prevAvgDelay).toBeNull();
  });

  it('returns null when there are fewer than 14 days', () => {
    expect(weekOverWeek([day(1), day(1)])).toBeNull();
    expect(weekOverWeek([])).toBeNull();
  });
});

describe('weekdayIndex', () => {
  it('maps Monday=0 .. Sunday=6', () => {
    expect(weekdayIndex('2026-08-03')).toBe(0); // Monday
    expect(weekdayIndex('2026-08-04')).toBe(1); // Tuesday
    expect(weekdayIndex('2026-08-06')).toBe(3); // Thursday
    expect(weekdayIndex('2026-08-09')).toBe(6); // Sunday
  });

  it('returns -1 for unparseable input', () => {
    expect(weekdayIndex('')).toBe(-1);
    expect(weekdayIndex('2026-13-40')).toBe(-1);
    expect(weekdayIndex('not-a-date')).toBe(-1);
  });
});

describe('byWeekday', () => {
  it('buckets daily rows into Mon..Sun with avg delays', () => {
    const daily = [
      { date: '2026-08-03', count: 2, avg_delay: 300 }, // Mon
      { date: '2026-08-04', count: 1, avg_delay: 600 }, // Tue
      { date: '2026-08-06', count: 4, avg_delay: 150 }, // Thu
      { date: '2026-08-09', count: 3, avg_delay: null }, // Sun
    ];
    const wd = byWeekday(daily);
    expect(wd.counts).toEqual([2, 1, 0, 4, 0, 0, 3]);
    expect(wd.avgDelays).toEqual([300, 600, null, 150, null, null, null]);
  });

  it('weights avg delay by count within a weekday', () => {
    const daily = [
      { date: '2026-08-03', count: 1, avg_delay: 100 }, // Mon
      { date: '2026-08-10', count: 3, avg_delay: 300 }, // Mon (next week)
    ];
    const wd = byWeekday(daily);
    expect(wd.counts[0]).toBe(4);
    expect(wd.avgDelays[0]).toBe(250); // (1*100 + 3*300) / 4
  });

  it('skips unparseable dates', () => {
    const wd = byWeekday([{ date: 'nope', count: 5, avg_delay: 100 }]);
    expect(wd.counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(wd.avgDelays).toEqual([null, null, null, null, null, null, null]);
  });
});

describe('peakVsOffPeak', () => {
  it('splits rush hours 07-09 + 16-18 from the rest and computes share + avg delays', () => {
    const hours = [
      { hour: 7, count: 10, avg_delay: 600 },
      { hour: 8, count: 20, avg_delay: 300 },
      { hour: 17, count: 10, avg_delay: 600 },
      { hour: 12, count: 40, avg_delay: 100 },
      { hour: 21, count: 20, avg_delay: 200 },
    ];
    const peak = peakVsOffPeak(hours);
    expect(peak.rushCount).toBe(40);
    expect(peak.offPeakCount).toBe(60);
    expect(peak.totalCount).toBe(100);
    expect(peak.rushSharePct).toBe(40);
    expect(peak.rushAvgDelay).toBe(450); // (10*600 + 20*300 + 10*600)/40
    expect(peak.offPeakAvgDelay).toBe(133); // (40*100 + 20*200)/60 = 8000/60 ≈ 133.3
  });

  it('treats hour 9 and 18 as rush (inclusive ranges)', () => {
    const peak = peakVsOffPeak([
      { hour: 9, count: 5, avg_delay: 100 },
      { hour: 18, count: 5, avg_delay: 100 },
      { hour: 10, count: 5, avg_delay: 100 },
    ]);
    expect(peak.rushCount).toBe(10);
    expect(peak.offPeakCount).toBe(5);
    expect(peak.rushSharePct).toBe(67);
  });

  it('zeroes out when there are no rows', () => {
    const peak = peakVsOffPeak([]);
    expect(peak).toEqual({
      rushCount: 0,
      offPeakCount: 0,
      totalCount: 0,
      rushSharePct: 0,
      rushAvgDelay: null,
      offPeakAvgDelay: null,
    });
  });
});

describe('sortNewestFirst', () => {
  it('sorts ISO timestamps descending without mutating the input', () => {
    const input = [
      { id: 1, timestamp: '2026-08-06T10:00:00' },
      { id: 2, timestamp: '2026-08-06T21:59:00' },
      { id: 3, timestamp: '2026-08-05T08:00:00' },
    ];
    const out = sortNewestFirst(input);
    expect(out.map((d) => d.id)).toEqual([2, 1, 3]);
    expect(input.map((d) => d.id)).toEqual([1, 2, 3]);
  });
});

describe('filterByDirection', () => {
  const disruptions = [
    { id: 1, direction: 'to_denmark' },
    { id: 2, direction: 'to_sweden' },
    { id: 3, direction: null },
  ] as unknown as Disruption[];

  it('keeps everything for the all filter', () => {
    expect(filterByDirection(disruptions, 'all').map((d) => d.id)).toEqual([1, 2, 3]);
  });

  it('filters to one direction', () => {
    expect(filterByDirection(disruptions, 'to_denmark').map((d) => d.id)).toEqual([1]);
    expect(filterByDirection(disruptions, 'to_sweden').map((d) => d.id)).toEqual([2]);
  });
});

describe('delayStatsRange', () => {
  it('returns [today, tomorrow) — the half-open API window', () => {
    const { from, to } = delayStatsRange(new Date(2026, 7, 7, 12, 0, 0)); // 2026-08-07
    expect(from).toBe('2026-08-07');
    expect(to).toBe('2026-08-08');
  });

  it('rolls over the month boundary', () => {
    const { from, to } = delayStatsRange(new Date(2026, 11, 31, 23, 59, 0)); // 2026-12-31
    expect(from).toBe('2026-12-31');
    expect(to).toBe('2027-01-01');
  });

  it('from and to differ (never an empty range)', () => {
    const { from, to } = delayStatsRange();
    expect(from).not.toBe(to);
  });
});

/** ISO dates spanning [start, start + count) in UTC — avoids TZ flakiness. */
function isoDays(start: string, count: number): string[] {
  const [y, m, d] = start.split('-').map(Number);
  const base = Date.UTC(y!, m! - 1, d!);
  return Array.from({ length: count }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

describe('dailyLabelPlan', () => {
  it('labels every bar at 7 days; month starts get "day month" instead of bare day', () => {
    const dates = ['2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
    const plan = dailyLabelPlan(dates, 7, MONTHS);
    expect(plan.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(plan.map((l) => l.text)).toEqual(['31', '1 Aug', '02', '03', '04', '05', '06']);
  });

  it('strides a 30-day range (~every 5 bars) but always labels month starts', () => {
    const dates = isoDays('2026-07-08', 30); // 2026-07-08 .. 2026-08-06; Aug 1 = index 24
    const plan = dailyLabelPlan(dates, 30, MONTHS);
    expect(plan.map((l) => l.index)).toEqual([0, 5, 10, 15, 20, 24, 25]);
    expect(plan.find((l) => l.index === 24)?.text).toBe('1 Aug');
    expect(plan.find((l) => l.index === 0)?.text).toBe('08');
  });

  it('uses a wider stride at 90 days and still catches month starts', () => {
    const dates = isoDays('2026-05-09', 90); // 2026-05-09 .. 2026-08-06; Jun 1 = 23, Jul 1 = 53, Aug 1 = 84
    const plan = dailyLabelPlan(dates, 90, MONTHS);
    expect(plan.map((l) => l.index)).toEqual([0, 7, 14, 21, 23, 28, 35, 42, 49, 53, 56, 63, 70, 77, 84]);
    expect(plan.find((l) => l.index === 23)?.text).toBe('1 Jun');
    expect(plan.find((l) => l.index === 84)?.text).toBe('1 Aug');
  });

  it('honors localized month names', () => {
    const plan = dailyLabelPlan(['2026-08-01'], 7, ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']);
    expect(plan[0]?.text).toBe('1 aug');
  });

  it('skips unparseable dates and returns an empty plan for empty input', () => {
    expect(dailyLabelPlan(['nope', '2026-08-01'], 7, MONTHS)).toEqual([{ index: 1, text: '1 Aug' }]);
    expect(dailyLabelPlan([], 7, MONTHS)).toEqual([]);
  });
});

describe('punctualitySeries', () => {  it('keeps only days with departures and reports the no-data count', () => {
    const daily = [
      { date: '2026-07-01', total: 0, on_time_pct: 0 },
      { date: '2026-08-06', total: 10, on_time_pct: 90 },
      { date: '2026-08-07', total: 0, on_time_pct: 0 },
      { date: '2026-08-08', total: 12, on_time_pct: 75 },
    ];
    expect(punctualitySeries(daily)).toEqual({
      days: [
        { date: '2026-08-06', on_time_pct: 90 },
        { date: '2026-08-08', on_time_pct: 75 },
      ],
      indices: [1, 3],
      noDataCount: 2,
    });
  });

  it('returns an empty series when every day has no departures', () => {
    expect(punctualitySeries([{ date: '2026-07-01', total: 0, on_time_pct: 0 }])).toEqual({
      days: [],
      indices: [],
      noDataCount: 1,
    });
  });

  it('keeps every day unchanged when all have departures', () => {
    expect(punctualitySeries([{ date: '2026-08-06', total: 1, on_time_pct: 50 }])).toEqual({
      days: [{ date: '2026-08-06', on_time_pct: 50 }],
      indices: [0],
      noDataCount: 0,
    });
  });
});

describe('heatmapShare', () => {
  it('computes each hour share of the window total (sums to ~100)', () => {
    const share = heatmapShare([
      { hour: 6, count: 25 },
      { hour: 12, count: 25 },
      { hour: 18, count: 50 },
    ]);
    expect(share).toHaveLength(24);
    expect(share[6]).toBe(25);
    expect(share[12]).toBe(25);
    expect(share[18]).toBe(50);
    expect(share[0]).toBe(0);
    expect(share.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });

  it('rounds to one decimal without drifting far from 100', () => {
    const share = heatmapShare([
      { hour: 0, count: 1 },
      { hour: 1, count: 1 },
      { hour: 2, count: 1 },
    ]);
    expect(share[0]).toBe(33.3);
    expect(share[1]).toBe(33.3);
    expect(share[2]).toBe(33.3);
    expect(share.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });

  it('is zero-safe (empty or all-zero input -> 24 zeros)', () => {
    expect(heatmapShare([])).toEqual(new Array<number>(24).fill(0));
    expect(heatmapShare([{ hour: 7, count: 0 }])).toEqual(new Array<number>(24).fill(0));
  });
});

describe('heatColor', () => {
  it('maps low share to green (#10b981) and high share to red (#ef4444)', () => {
    expect(heatColor(0, 100)).toBe('rgb(16, 185, 129)');
    expect(heatColor(100, 100)).toBe('rgb(239, 68, 68)');
  });

  it('interpolates at the midpoint', () => {
    expect(heatColor(50, 100)).toBe('rgb(128, 127, 99)');
  });

  it('clamps out-of-range shares and handles a zero max', () => {
    expect(heatColor(150, 100)).toBe('rgb(239, 68, 68)');
    expect(heatColor(-5, 100)).toBe('rgb(16, 185, 129)');
    expect(heatColor(10, 0)).toBe('rgb(16, 185, 129)');
  });
});
