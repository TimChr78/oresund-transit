import type { DelayStats, Departure, Disruption, LiveStatus } from '@oresund/shared';
import { isValidLocalTimestamp } from './i18n/format';

/**
 * API client for the collector Worker (Phase 3a). All paths are RELATIVE
 * (/api/transit/...) so one build works from the dev proxy, workers.dev, or
 * oresund.live. fetch is injectable so tests never touch the network.
 */

/** The /api/transit/history response shape (Phase 3a HistoryStats contract). */
export interface HistoryResponse {
  days: number;
  date_from: string;
  date_to: string;
  total_disruptions: number;
  daily: {
    date: string;
    count: number;
    cancellations: number;
    delays: number;
    alerts: number;
    avg_delay: number | null;
  }[];
  by_line: { line: string; count: number; avg_delay: number | null; max_delay: number | null }[];
  by_cause: { cause: string; count: number }[];
  by_hour: { hour: number; count: number; avg_delay: number | null }[];
}

export type HistoryDays = 7 | 14 | 30 | 90;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike = (url, init) => fetch(url, init);

/** Inject a fetch implementation (tests; never touches the network). */
export function configureFetch(fn: FetchLike): void {
  fetchImpl = fn;
}

/** Thrown on non-2xx responses; `status` lets callers special-case 503. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function apiUrl(path: string, params: Record<string, string | number> = {}): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) qs.set(key, String(value));
  const query = qs.toString();
  return `/api/transit/${path}${query ? `?${query}` : ''}`;
}

async function request<T>(
  path: string,
  parse: (json: unknown) => T,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = apiUrl(path, params);
  const res = await fetchImpl(url, { method: 'GET' });
  if (!res.ok) {
    throw new ApiError(res.status, `API error: HTTP ${res.status} for ${url}`);
  }
  return parse(await res.json());
}

export function fetchLiveStatus(): Promise<LiveStatus> {
  return request('live', (json) => json as LiveStatus);
}

export function fetchDelayStats(from: string, to: string): Promise<DelayStats> {
  return request('delay-stats', (json) => json as DelayStats, { from, to });
}

export function fetchDisruptions(limit = 50, from?: string, to?: string): Promise<Disruption[]> {
  return request('disruptions', parseDisruptionsResponse, {
    limit,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  });
}

export function fetchHistory(days: HistoryDays = 7): Promise<HistoryResponse> {
  return request('history', parseHistoryResponse, { days });
}

/** One calendar day of punctuality stats (the /api/transit/punctuality contract). */
export interface PunctualityDay {
  date: string;
  total: number;
  on_time: number;
  delayed: number;
  canceled: number;
  on_time_pct: number;
  avg_delay_seconds: number | null;
}

/** The /api/transit/punctuality response shape — delay-% over time. */
export interface PunctualityResponse {
  days: number;
  date_from: string;
  date_to: string;
  daily: PunctualityDay[];
}

export function fetchPunctuality(days: HistoryDays = 7): Promise<PunctualityResponse> {
  return request('punctuality', parsePunctualityResponse, { days });
}

/**
 * Guarded parse of the /api/transit/punctuality JSON shape.
 *
 * Per-row validation (audit6 M8), mirroring the server-side parse the archive
 * routes run over the same endpoint (archive-http.ts parsePunctuality). The
 * board's chart interpolates `on_time_pct` into an SVG <title> and a legend
 * <span>, and svgY() coerces with .toFixed(1) — so a string or a non-finite
 * number reached the DOM without anything throwing. A row that fails is
 * dropped, which under-reports rather than rendering a value nothing measured.
 */
export function parsePunctualityResponse(json: unknown): PunctualityResponse {
  const body = json as Partial<PunctualityResponse> | null;
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.days !== 'number' ||
    typeof body.date_from !== 'string' ||
    typeof body.date_to !== 'string' ||
    !Array.isArray(body.daily)
  ) {
    throw new TypeError('invalid /api/transit/punctuality response shape');
  }
  const daily = body.daily.filter(
    (r) =>
      r &&
      typeof r === 'object' &&
      typeof r.date === 'string' &&
      Number.isFinite(r.total) &&
      Number.isFinite(r.on_time) &&
      Number.isFinite(r.delayed) &&
      Number.isFinite(r.canceled) &&
      Number.isFinite(r.on_time_pct) &&
      r.total >= 0 &&
      r.on_time >= 0 &&
      r.delayed >= 0 &&
      r.canceled >= 0 &&
      r.on_time <= r.total,
  );
  return { ...body, daily } as PunctualityResponse;
}

/** /api/transit/disruptions wraps its list in { disruptions: [...] }. */
export function parseDisruptionsResponse(json: unknown): Disruption[] {
  const body = json as { disruptions?: unknown } | null;
  if (!body || !Array.isArray(body.disruptions)) {
    throw new TypeError('invalid /api/transit/disruptions response shape');
  }
  return body.disruptions as Disruption[];
}

/**
 * The /api/transit/station/{slug}?days=N response: the stop's punctuality
 * window (fields mirrored from queryStationPunctuality) plus the `recent`
 * departures observed at that stop — the only per-station data the collector
 * exposes, and what the board's station scope renders (backlog A1: disruption
 * rows carry no stop_id, so the corridor feed cannot be filtered by station).
 */
export interface StationResponse {
  slug: string;
  stop_id: string;
  stop_name: string;
  days: number;
  date_from: string;
  date_to: string;
  total_departures: number;
  on_time_count: number;
  delayed_count: number;
  canceled_count: number;
  on_time_pct: number;
  avg_delay_seconds: number | null;
  recent: Departure[];
  /**
   * Naive local ISO stamp of the read (audit4 N-C1): every row in `recent` has
   * a sched_time <= it. Optional — an older collector payload carries no stamp.
   */
  as_of?: string;
  /**
   * The lines observed at this stop inside the window (audit4 N-M1) — what the
   * board can cross-link to the per-line archives. Optional — the collector
   * deploys independently of the site.
   */
  lines?: string[];
}

export function fetchStation(slug: string, days: HistoryDays = 30): Promise<StationResponse> {
  return request(`station/${encodeURIComponent(slug)}`, parseStationResponse, { days });
}

/** Guarded parse of the /api/transit/station/{slug} JSON shape. */
export function parseStationResponse(json: unknown): StationResponse {
  const body = json as Partial<StationResponse> | null;
  const avgDelay = body?.avg_delay_seconds;
  if (
    !body ||
    typeof body.slug !== 'string' ||
    typeof body.stop_id !== 'string' ||
    typeof body.stop_name !== 'string' ||
    typeof body.days !== 'number' ||
    typeof body.date_from !== 'string' ||
    typeof body.date_to !== 'string' ||
    typeof body.total_departures !== 'number' ||
    typeof body.on_time_count !== 'number' ||
    typeof body.delayed_count !== 'number' ||
    typeof body.canceled_count !== 'number' ||
    typeof body.on_time_pct !== 'number' ||
    (avgDelay !== null && typeof avgDelay !== 'number') ||
    !Array.isArray(body.recent) ||
    (body.as_of !== undefined && typeof body.as_of !== 'string')
  ) {
    throw new TypeError('invalid /api/transit/station response shape');
  }
  // An as_of that is not a complete local stamp is dropped, not passed on: the
  // board renders it verbatim under the departures heading, and the field
  // shapes are wrong often enough (a truncated or out-of-range stamp) that a
  // "2026-99-99T12:00:00" would read as an observed time. Absent is honest.
  if (body.as_of !== undefined && !isValidLocalTimestamp(body.as_of)) delete body.as_of;
  // Same tolerance for the cross-link list: a payload that is not a string
  // array would reach the board's link renderer as a non-string line number.
  if (body.lines !== undefined && !isStringArray(body.lines)) delete body.lines;
  return body as StationResponse;
}

/** True for a list whose every entry is a string (the optional N-M1 link list). */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Guarded parse of the Phase 3a /api/transit/history JSON shape. */
export function parseHistoryResponse(json: unknown): HistoryResponse {
  const body = json as Partial<HistoryResponse> | null;
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.days !== 'number' ||
    typeof body.date_from !== 'string' ||
    typeof body.date_to !== 'string' ||
    typeof body.total_disruptions !== 'number' ||
    !Array.isArray(body.daily) ||
    !Array.isArray(body.by_line) ||
    !Array.isArray(body.by_cause) ||
    !Array.isArray(body.by_hour)
  ) {
    throw new TypeError('invalid /api/transit/history response shape');
  }
  return body as HistoryResponse;
}
