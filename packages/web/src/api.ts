import type { DelayStats, Disruption, LiveStatus } from '@oresund/shared';

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
  daily: { date: string; count: number; cancellations: number; delays: number; alerts: number }[];
  by_line: { line: string; count: number }[];
  by_cause: { cause: string; count: number }[];
  by_hour: { hour: number; count: number }[];
}

export type HistoryDays = 7 | 14 | 30;

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

export function fetchDisruptions(limit = 50): Promise<Disruption[]> {
  return request('disruptions', parseDisruptionsResponse, { limit });
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

/** Guarded parse of the /api/transit/punctuality JSON shape. */
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
  return body as PunctualityResponse;
}

/** /api/transit/disruptions wraps its list in { disruptions: [...] }. */
export function parseDisruptionsResponse(json: unknown): Disruption[] {
  const body = json as { disruptions?: unknown } | null;
  if (!body || !Array.isArray(body.disruptions)) {
    throw new TypeError('invalid /api/transit/disruptions response shape');
  }
  return body.disruptions as Disruption[];
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
