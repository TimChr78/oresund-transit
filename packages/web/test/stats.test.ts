import { describe, expect, it } from 'vitest';
import type { Disruption, LiveStatus } from '@oresund/shared';
import {
  barHeights,
  dailyBarSegments,
  departureCountFor,
  filterByDirection,
  hBarWidth,
  heatmapBuckets,
  heatmapIntensity,
  movingAverage,
  peakVsOffPeak,
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

describe('departureCountFor', () => {
  const live = { departure_counts: { to_denmark: 7, to_sweden: 5, bus: 0 } } as LiveStatus;

  it('returns the direction count', () => {
    expect(departureCountFor(live, 'to_denmark')).toBe(7);
    expect(departureCountFor(live, 'to_sweden')).toBe(5);
  });

  it('sums all directions for the all filter', () => {
    expect(departureCountFor(live, 'all')).toBe(12);
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
