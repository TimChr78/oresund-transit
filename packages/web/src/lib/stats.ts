import type { Disruption, LiveStatus } from '@oresund/shared';

/**
 * Pure chart/table math for the dashboard. Components stay thin: they call
 * these functions and turn the resulting 0..1 fractions into inline styles.
 */

export type Direction = 'to_denmark' | 'to_sweden' | 'all';
export type DayRange = 7 | 14 | 30;

/** Normalize counts to fractions of the max (0..1). Zero max -> zeros, not NaN. */
export function barHeights(counts: readonly number[]): number[] {
  const max = Math.max(0, ...counts);
  if (max <= 0) return counts.map(() => 0);
  return counts.map((c) => c / max);
}

export interface DailySegments {
  cancellations: number;
  delays: number;
  alerts: number;
}

/**
 * Stacked daily bar segments (cancellations/delays/alerts), each as a
 * fraction of the window's max total count. Zero data -> zero segments.
 */
export function dailyBarSegments(
  daily: readonly { count: number; cancellations: number; delays: number; alerts: number }[],
): DailySegments[] {
  const max = Math.max(0, ...daily.map((d) => d.count));
  if (max <= 0) return daily.map(() => ({ cancellations: 0, delays: 0, alerts: 0 }));
  return daily.map((d) => ({
    cancellations: d.cancellations / max,
    delays: d.delays / max,
    alerts: d.alerts / max,
  }));
}

/** Bucket hour -> count into a fixed 24-cell array indexed 0-23 (gaps are 0). */
export function heatmapBuckets(hours: readonly { hour: number; count: number }[]): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const { hour, count } of hours) {
    if (hour >= 0 && hour <= 23) buckets[hour] = (buckets[hour] ?? 0) + count;
  }
  return buckets;
}

/** Normalize the 24 buckets to 0..1 cell intensity. Zero max -> zeros, not NaN. */
export function heatmapIntensity(buckets: readonly number[]): number[] {
  const max = Math.max(0, ...buckets);
  if (max <= 0) return buckets.map(() => 0);
  return buckets.map((b) => b / max);
}

/** Horizontal bar width as a 0..1 fraction of the max. */
export function hBarWidth(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.min(1, count / max);
}

/** Clamped y coordinate for a 0..100 value on an SVG of the given height (100 → top). */
export function svgY(value: number, height: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return height - (clamped / 100) * height;
}

/**
 * Space-separated "x,y" point pairs for an SVG polyline over `values` (on a
 * 0..100 scale), spread evenly across the given width. Empty when no points.
 */
export function svgLinePoints(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${svgY(v, height).toFixed(1)}`)
    .join(' ');
}

/** Sort disruptions newest-first by ISO timestamp (returns a new array). */
export function sortNewestFirst<T extends { timestamp: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Filter disruptions by direction; the all filter keeps everything. */
export function filterByDirection<T extends { direction: Disruption['direction'] }>(
  list: readonly T[],
  direction: Direction,
): T[] {
  if (direction === 'all') return [...list];
  return list.filter((d) => d.direction === direction);
}

/** Departure count for a tab: the direction count, or the sum for "all". */
export function departureCountFor(
  live: Pick<LiveStatus, 'departure_counts'>,
  direction: Direction,
): number {
  const counts = live.departure_counts;
  if (direction === 'all') return counts.to_denmark + counts.to_sweden + counts.bus;
  return counts[direction];
}

/**
 * Delay-stats query window. The API contract is half-open [from, to): a
 * day's departures live in [today, tomorrow). Returning `to` == `from`
 * (as the dashboard did at launch) yields an empty range and zero stats.
 */
export function delayStatsRange(now: Date = new Date()): { from: string; to: string } {
  const p = (n: number): string => String(n).padStart(2, '0');
  const from = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const to = `${tomorrow.getFullYear()}-${p(tomorrow.getMonth() + 1)}-${p(tomorrow.getDate())}`;
  return { from, to };
}
