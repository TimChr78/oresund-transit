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
  sortNewestFirst,
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
