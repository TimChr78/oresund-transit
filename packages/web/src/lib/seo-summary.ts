/**
 * Build-time corridor status summary — the natural-language snapshot injected
 * into the no-JS/crawler home shell (#static-shell) during `vite build`.
 *
 * This is a BUILD-TIME-ONLY dependency: scripts/prerender.ts fetches the
 * collector's live + disruptions endpoints once, and the resulting pure
 * strings are baked into the served HTML. The static shell itself never
 * fetches at runtime, so JS-less crawlers see a real status sentence, a
 * last-24h cancellation count and a trend line without any client-side API
 * dependency.
 *
 * Everything here is pure (no I/O) except fetchBuildSummary, which is thin
 * and returns null on any failure so a collector outage can never break the
 * build — the home page just ships its plain lead instead.
 *
 * Timestamp convention: the collector stores naive local timestamps
 * ("YYYY-MM-DD HH:MM:SS"), so the 24h window is computed with naive local
 * stamps derived from `now` (built with the same local getters). The two
 * windows shift together under any timezone offset, so the trend line is
 * exact; only the wall-clock boundary of "last 24h" is approximate — fine
 * for an SEO snapshot, and deterministic for tests.
 */
import type { Disruption, LiveStatus } from '@oresund/shared';
import type { Key } from '../i18n';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The three-sentence snapshot baked into the home shell at build time. */
export interface HomeSummary {
  /** Status sentence key (seo_status_*). */
  statusKey: Key;
  /** Cancellations observed in the last 24h window. */
  cancellations24h: number;
  /** Trend sentence key (seo_trend_*) vs the previous 24h. */
  trendKey: Key;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Format a Date as a naive local timestamp ("YYYY-MM-DDTHH:MM:SS", or with a
 * space separator for the collector's query bounds — stored rows use the
 * space form, so strings compare lexicographically).
 */
export function naiveLocalStamp(d: Date, sep: 'T' | ' ' = 'T'): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${sep}${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Map a live snapshot to the status sentence key (shutdown always wins). */
export function summaryStatusKey(live: LiveStatus): Key {
  if (live.service_shutdown) return 'seo_status_shutdown';
  switch (live.status) {
    case 'red':
      return 'seo_status_cancellations';
    case 'amber':
      return 'seo_status_delayed';
    case 'blue':
      return 'seo_status_alerts';
    default:
      return 'seo_status_normal';
  }
}

/** Normalize a naive timestamp ("T" or space form) to ISO-T, or null if garbage. */
function normalizeTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const t = timestamp.replace(' ', 'T');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t) ? t : null;
}

/**
 * Split a (48h-window) disruption list into cancellations in the last 24h and
 * the previous 24h ([now-24h, now) vs [now-48h, now-24h)). Only
 * `type === 'cancellation'` counts.
 */
export function cancellationBuckets(
  disruptions: Disruption[],
  now: Date,
): { last24: number; prev24: number } {
  // Half-open windows over naive local stamps: last24 = [now-24h, now),
  // prev24 = [now-48h, now-24h). Records outside both are dropped — the
  // collector returns a 48h window, so older rows must not leak into prev24.
  const boundary = naiveLocalStamp(new Date(now.getTime() - DAY_MS));
  const cutoff = naiveLocalStamp(new Date(now.getTime() - 2 * DAY_MS));
  let last24 = 0;
  let prev24 = 0;
  for (const d of disruptions) {
    if (d.type !== 'cancellation') continue;
    const ts = normalizeTimestamp(d.timestamp);
    if (ts === null) continue;
    if (ts >= boundary) last24 += 1;
    else if (ts >= cutoff) prev24 += 1;
  }
  return { last24, prev24 };
}

/** Trend sentence key: more / fewer / in line with the previous 24h. */
export function trendKeyFor(last24: number, prev24: number): Key {
  if (last24 > prev24) return 'seo_trend_up';
  if (last24 < prev24) return 'seo_trend_down';
  return 'seo_trend_flat';
}

/** Combine the live snapshot + disruption window into the home summary. */
export function summarizeHome(live: LiveStatus, disruptions: Disruption[], now: Date): HomeSummary {
  const { last24, prev24 } = cancellationBuckets(disruptions, now);
  return {
    statusKey: summaryStatusKey(live),
    cancellations24h: last24,
    trendKey: trendKeyFor(last24, prev24),
  };
}

async function getJson<T>(url: string, fetchImpl: FetchLike): Promise<T> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`collector ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/**
 * Fetch the build-time snapshot from the collector (`/live` + the last 48h of
 * `/disruptions`, capped at 200 rows) and summarize it. Returns null on any
 * failure — the build degrades to the plain lead rather than failing.
 */
export async function fetchBuildSummary(
  baseUrl: string,
  fetchImpl: FetchLike,
  now: Date,
): Promise<HomeSummary | null> {
  try {
    const from = naiveLocalStamp(new Date(now.getTime() - 2 * DAY_MS), ' ');
    const to = naiveLocalStamp(now, ' ');
    const [live, disruptions] = await Promise.all([
      getJson<LiveStatus>(`${baseUrl}/live`, fetchImpl),
      getJson<{ disruptions: Disruption[] }>(
        `${baseUrl}/disruptions?limit=200&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        fetchImpl,
      ),
    ]);
    return summarizeHome(live, disruptions.disruptions ?? [], now);
  } catch {
    // Collector unreachable / no snapshot yet — leave the shell's plain lead.
    return null;
  }
}