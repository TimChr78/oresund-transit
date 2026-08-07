import type { Disruption } from '@oresund/shared';

/**
 * Pure chart/table math for the dashboard. Components stay thin: they call
 * these functions and turn the resulting 0..1 fractions into inline styles.
 */

export type Direction = 'to_denmark' | 'to_sweden' | 'all';
export type DayRange = 7 | 14 | 30 | 90;

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

/** Weighted average delay over rows (weight = count); null when no non-null avg. */
function weightedAvgDelay(rows: readonly { count: number; avg_delay: number | null }[]): number | null {
  const withAvg = rows.filter((r) => r.avg_delay != null && r.count > 0);
  if (withAvg.length === 0) return null;
  const total = withAvg.reduce((sum, r) => sum + r.count, 0);
  const weighted = withAvg.reduce((sum, r) => sum + r.count * (r.avg_delay ?? 0), 0);
  return total > 0 ? Math.round(weighted / total) : null;
}

export interface WeekComparison {
  prevCount: number;
  currCount: number;
  /** % change, rounded; null when the previous week had no disruptions. */
  changePct: number | null;
  prevAvgDelay: number | null;
  currAvgDelay: number | null;
}

/**
 * Week-over-week insight from the history daily array. Requires at least 14
 * daily rows: the last 7 are the current week, the 7 before that the
 * previous. Returns null when there are fewer than 14 days.
 */
export function weekOverWeek(
  daily: readonly { count: number; avg_delay: number | null }[],
): WeekComparison | null {
  if (daily.length < 14) return null;
  const prev = daily.slice(daily.length - 14, daily.length - 7);
  const curr = daily.slice(daily.length - 7);
  const countOf = (rows: readonly { count: number }[]): number => rows.reduce((sum, r) => sum + r.count, 0);
  const prevCount = countOf(prev);
  const currCount = countOf(curr);
  const changePct = prevCount > 0 ? Math.round(((currCount - prevCount) / prevCount) * 100) : null;
  return {
    prevCount,
    currCount,
    changePct,
    prevAvgDelay: weightedAvgDelay(prev),
    currAvgDelay: weightedAvgDelay(curr),
  };
}

export interface PeakComparison {
  rushCount: number;
  offPeakCount: number;
  totalCount: number;
  /** Share of disruptions during rush hours, rounded to a whole percent. */
  rushSharePct: number;
  rushAvgDelay: number | null;
  offPeakAvgDelay: number | null;
}

/** Rush hours: 07–09 and 16–18 (inclusive). */
const RUSH_HOURS = new Set([7, 8, 9, 16, 17, 18]);

/**
 * Peak vs off-peak insight from the history by_hour array (with avg_delay).
 * Rush hours are 07–09 and 16–18; everything else counts as off-peak.
 */
export function peakVsOffPeak(
  hours: readonly { hour: number; count: number; avg_delay: number | null }[],
): PeakComparison {
  const rush: { count: number; avg_delay: number | null }[] = [];
  const offPeak: { count: number; avg_delay: number | null }[] = [];
  let rushCount = 0;
  let offPeakCount = 0;
  for (const h of hours) {
    if (RUSH_HOURS.has(h.hour)) {
      rushCount += h.count;
      rush.push(h);
    } else {
      offPeakCount += h.count;
      offPeak.push(h);
    }
  }
  const total = rushCount + offPeakCount;
  return {
    rushCount,
    offPeakCount,
    totalCount: total,
    rushSharePct: total > 0 ? Math.round((rushCount / total) * 100) : 0,
    rushAvgDelay: weightedAvgDelay(rush),
    offPeakAvgDelay: weightedAvgDelay(offPeak),
  };
}

/**
 * Weekday index of an ISO date ("2026-08-06"): Monday = 0 … Sunday = 6.
 * Returns -1 for unparseable input.
 */
export function weekdayIndex(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return -1;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const dayOfMonth = Number(m[3]);
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return -1;
  const day = new Date(Date.UTC(year, month - 1, dayOfMonth));
  // Date.UTC rolls over invalid dates (e.g. 2026-13-40) — verify the round-trip.
  if (day.getUTCFullYear() !== year || day.getUTCMonth() !== month - 1 || day.getUTCDate() !== dayOfMonth) return -1;
  return (day.getUTCDay() + 6) % 7;
}

export interface WeekdayStats {
  /** Mon..Sun disruption counts (index 0 = Monday). */
  counts: number[];
  /** Mon..Sun weighted avg delays; null when a weekday has no delay data. */
  avgDelays: (number | null)[];
}

/**
 * Bucket the history daily array into Mon..Sun (7 cells), summing counts and
 * computing weighted avg delays per weekday from the daily avg_delay values.
 */
export function byWeekday(
  daily: readonly { date: string; count: number; avg_delay: number | null }[],
): WeekdayStats {
  const counts = new Array<number>(7).fill(0);
  const sums = new Array<number>(7).fill(0);
  const ns = new Array<number>(7).fill(0);
  for (const d of daily) {
    const dow = weekdayIndex(d.date);
    if (dow < 0) continue;
    counts[dow] = (counts[dow] ?? 0) + d.count;
    if (d.avg_delay != null) {
      sums[dow] = (sums[dow] ?? 0) + d.count * d.avg_delay;
      ns[dow] = (ns[dow] ?? 0) + d.count;
    }
  }
  const avgDelays = sums.map((sum, i) => (ns[i]! > 0 ? Math.round(sum / ns[i]!) : null));
  return { counts, avgDelays };
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

/**
 * Centered N-day moving average. Edge days clamp the window to the available
 * neighbors (e.g. a 3-day average on day 0 averages days 0-1). Returns a new
 * array of the same length; empty input → empty output.
 */
export function movingAverage(values: readonly number[], window: number): number[] {
  if (window <= 0) return [...values];
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length - 1, i + half);
    let sum = 0;
    let n = 0;
    for (let j = from; j <= to; j += 1) {
      sum += values[j] ?? 0;
      n += 1;
    }
    return n > 0 ? sum / n : 0;
  });
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
