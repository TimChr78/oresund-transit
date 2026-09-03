/**
 * HTTP wiring for the archive routes — the shared dispatch used by the thin
 * Pages Functions in functions/{line,station,history}/[[path]].js.
 *
 * It parses the request path, fetches the matching collector endpoint, and
 * returns a fully-rendered HTML Response (200). Data problems (collector
 * unreachable / non-2xx / unparseable) answer a branded localized 502 page
 * rather than a broken or blank page (audit4 N-H4); paths outside the archive
 * namespace return null so the caller can reply 404.
 *
 * This is the only module that touches fetch + Response; every renderer lives
 * in the pure ./archive module, so the whole surface is testable against a
 * stubbed global fetch.
 */
import { type Lang } from '../i18n';
import { isValidLocalTimestamp } from '../i18n/format';
import type { LiveStatus } from '@oresund/shared';
import { acceptLang, serviceUnavailableResponse, SECURITY_HEADERS, withSecurityHeaders } from './http-errors';
import {
  DAY_RANGES,
  renderHistoryPage,
  renderLineIndex,
  renderLinePage,
  renderStationIndex,
  renderStationPage,
  type ArchiveDays,
  type ArchiveHistory,
  type ArchiveLine,
  type ArchiveLineStats,
  type ArchiveStation,
  type ArchiveStationStats,
} from './archive';

const COLLECTOR_BASE = 'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
};

/**
 * The security header set public/_headers applies to static assets (audit4
 * N-C2). Cloudflare only reads `_headers` for files it serves from dist/ — a
 * Pages Function's Response is NOT covered by it. Defined once in
 * ./http-errors and re-exported here so the archive routes' 200/301/502 all
 * carry it; test/security-headers.test.ts asserts it matches the file.
 */
export { SECURITY_HEADERS };

function html(body: string): Response {
  return new Response(body, { status: 200, headers: withSecurityHeaders(HTML_HEADERS) });
}

/**
 * The collector is down. The 502 status is unchanged (crawlers and monitors
 * still see a real error); only the body became a page a reader can act on
 * (audit4 N-H4). `pathLang` is the URL's own language prefix, or null for the
 * unprefixed routes so Accept-Language gets to answer instead.
 */
function unavailable(route: string, pathLang: Lang | null, acceptLanguage?: string | null): Response {
  return serviceUnavailableResponse(acceptLang(acceptLanguage, pathLang), route);
}

/** Fetch a URL and parse the JSON body; throws on any failure. */
async function fetchJson<T>(url: string, parse: (json: unknown) => T, fetchImpl: FetchLike): Promise<T> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`collector ${res.status} for ${url}`);
  return parse(await res.json());
}

/** One page route — the collector may legitimately 404 for an unknown slug. */
async function fetchJsonOrNull<T>(url: string, parse: (json: unknown) => T, fetchImpl: FetchLike): Promise<T | null> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`collector ${res.status} for ${url}`);
  return parse(await res.json());
}

// ---- Guarded parsers (external JSON — validate before rendering) ----

function parseHistory(json: unknown): ArchiveHistory {
  const b = json as Partial<ArchiveHistory> | null;
  if (
    !b ||
    typeof b.days !== 'number' ||
    typeof b.date_from !== 'string' ||
    typeof b.date_to !== 'string' ||
    typeof b.total_disruptions !== 'number' ||
    !Array.isArray(b.daily)
  ) {
    throw new TypeError('invalid history shape');
  }
  return b as ArchiveHistory;
}

/** A W3C date, the only shape a sitemap <lastmod> may carry. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLines(json: unknown): ArchiveLine[] {
  const b = json as { lines?: unknown } | null;
  if (!b || !Array.isArray(b.lines)) throw new TypeError('invalid lines shape');
  return (b.lines as { line?: unknown; disruptions?: unknown; last_seen?: unknown }[])
    .filter((l) => l && typeof l.line === 'string' && typeof l.disruptions === 'number')
    .map((l) => ({
      line: l.line as string,
      disruptions: l.disruptions as number,
      // N-M3: the line's own last-data date, when the collector reports one.
      // Anything that is not a plain date is dropped, so the sitemap can never
      // emit a <lastmod> that is not a date.
      ...(typeof l.last_seen === 'string' && DATE_RE.test(l.last_seen) ? { last_seen: l.last_seen } : {}),
    }));
}

function parseLine(json: unknown): ArchiveLineStats {
  const b = json as Partial<ArchiveLineStats> | null;
  if (
    !b ||
    typeof b.days !== 'number' ||
    typeof b.date_from !== 'string' ||
    typeof b.date_to !== 'string' ||
    typeof b.total_disruptions !== 'number' ||
    !Array.isArray(b.daily) ||
    !Array.isArray(b.by_cause) ||
    !Array.isArray(b.recent)
  ) {
    throw new TypeError('invalid line shape');
  }
  // N-M1: the cross-link list is optional (the collector deploys
  // independently), so a payload without it just renders no section — but one
  // that is malformed must not reach the renderer as a broken entry.
  if (b.stops !== undefined) b.stops = parseStations({ stations: b.stops });
  return b as ArchiveLineStats;
}

function parseStations(json: unknown): ArchiveStation[] {
  const b = json as { stations?: unknown } | null;
  if (!b || !Array.isArray(b.stations)) throw new TypeError('invalid stations shape');
  return (b.stations as { slug?: unknown; stop_id?: unknown; stop_name?: unknown }[])
    .filter((s) => s && typeof s.slug === 'string' && typeof s.stop_id === 'string' && typeof s.stop_name === 'string')
    .map((s) => ({ slug: s.slug as string, stop_id: s.stop_id as string, stop_name: s.stop_name as string }));
}

function parseStation(json: unknown): ArchiveStationStats {
  const b = json as Partial<ArchiveStationStats> | null;
  if (
    !b ||
    typeof b.days !== 'number' ||
    typeof b.date_from !== 'string' ||
    typeof b.date_to !== 'string' ||
    typeof b.total_departures !== 'number' ||
    typeof b.slug !== 'string' ||
    !Array.isArray(b.daily) ||
    !Array.isArray(b.recent)
  ) {
    throw new TypeError('invalid station shape');
  }
  // The collector is an external boundary and renders before anyone sees the
  // value, so an as_of that is not a complete local stamp is dropped here too:
  // formatDate/formatTime pass the digits through, and "observed up to
  // 00:00 on 2026-99-99" is worse than no stamp at all (CodeRabbit PR48).
  if (b.as_of !== undefined && !isValidLocalTimestamp(b.as_of)) delete b.as_of;
  // N-M1: the line cross-links are optional, and a malformed list is dropped
  // rather than rendered as link text.
  if (b.lines !== undefined && !isArrayOfStrings(b.lines)) delete b.lines;
  return b as ArchiveStationStats;
}

function isDays(value: number): value is ArchiveDays {
  return (DAY_RANGES as readonly number[]).includes(value);
}

/** True for a list whose every entry is a string (the optional N-M1 link lists). */
function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * The collector /api/transit/live shape — only the fields the corridor status
 * band renders are validated; the rest passes through as parsed JSON.
 */
function parseLive(json: unknown): LiveStatus {
  const b = json as Partial<LiveStatus> | null;
  if (
    !b ||
    typeof b.status !== 'string' ||
    typeof b.timestamp !== 'string' ||
    typeof b.disruption_count !== 'number' ||
    typeof b.service_shutdown !== 'boolean'
  ) {
    throw new TypeError('invalid live shape');
  }
  return b as LiveStatus;
}

/**
 * The language prefix of a localized station route. Only the station family
 * localizes (audit3 C1) — /line/* and /history/* stay single-URL — so a
 * prefixed path that is not a station route is answered by the caller's 404
 * rather than silently rendering an English page.
 */
const LANG_PREFIX = /^\/(sv|da)(\/.+)$/;

/** Normalize a pathname: strip trailing slashes (except root). */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Dispatch a request for `/line/*`, `/station/*` or `/history/*` — including
 * the localized station routes `/sv/station/*` and `/da/station/*`. Returns a
 * Response for every matched path (data errors → 502), or null when the path
 * is not an archive route.
 *
 * `acceptLanguage` is the request's Accept-Language header, used only when the
 * collector fails on an UNPREFIXED route (a prefixed route is already in the
 * language its URL names).
 */
export async function handleArchiveRequest(
  pathname: string,
  fetchImpl: FetchLike = fetch,
  acceptLanguage?: string | null,
): Promise<Response | null> {
  let p = normalizePath(pathname);
  const enc = encodeURIComponent;

  // Localized station pages: strip the language prefix and render in that
  // language. The canonical/hreflang/sibling links all follow the prefix, so
  // /sv/station/hyllie is a real Swedish page and not a translated clone of
  // the English one.
  let lang: Lang = 'en';
  let pathLang: Lang | null = null;
  const prefixed = LANG_PREFIX.exec(p);
  if (prefixed) {
    pathLang = prefixed[1] as Lang;
    lang = pathLang;
    p = normalizePath(prefixed[2]!);
    // Only the station family localizes (audit3 C1) — /line, /history and the
    // hubs ship no localized twins, so a prefixed path to them is not a page.
    if (!p.startsWith('/station/')) return null;
  }

  try {
    // --- /history ---
    // /history duplicates the window pages (H5): 301 to the default 30-day
    // window so there is exactly one canonical history URL. Served by routing
    // (the history Pages Function owns /history/*), before any fetch.
    if (p === '/history') {
      return new Response(null, {
        status: 301,
        headers: withSecurityHeaders({
          Location: '/history/30',
          'Cache-Control': 'public, max-age=3600',
        }),
      });
    }
    const hist = /^\/history\/(7|14|30|90)$/.exec(p);
    if (hist) {
      const days = Number(hist[1]) as ArchiveDays;
      const history = await fetchJson(`${COLLECTOR_BASE}/history?days=${days}`, parseHistory, fetchImpl);
      return html(renderHistoryPage(days, history));
    }

    // --- /line ---
    if (p === '/line') {
      const lines = await fetchJson(`${COLLECTOR_BASE}/lines`, parseLines, fetchImpl);
      return html(renderLineIndex(lines));
    }
    const line = /^\/line\/([^/]+)$/.exec(p);
    if (line) {
      const raw = decodeURIComponent(line[1]!);
      const [stats, lines] = await Promise.all([
        fetchJsonOrNull(`${COLLECTOR_BASE}/line/${enc(raw)}?days=30`, parseLine, fetchImpl),
        fetchJson(`${COLLECTOR_BASE}/lines`, parseLines, fetchImpl).catch(() => [] as ArchiveLine[]),
      ]);
      if (!stats) return null; // unknown line → 404
      return html(renderLinePage(stats.line, stats, lines));
    }

    // --- /station ---
    if (p === '/station') {
      const stations = await fetchJson(`${COLLECTOR_BASE}/stations`, parseStations, fetchImpl);
      return html(renderStationIndex(stations));
    }
    const station = /^\/station\/([^/]+)$/.exec(p);
    if (station) {
      const slug = decodeURIComponent(station[1]!);
      // The corridor snapshot is best-effort: a /live gap must degrade to a
      // page without its status band, not fail the whole station URL.
      const [stats, stations, live] = await Promise.all([
        fetchJsonOrNull(`${COLLECTOR_BASE}/station/${enc(slug)}?days=30`, parseStation, fetchImpl),
        fetchJson(`${COLLECTOR_BASE}/stations`, parseStations, fetchImpl).catch(() => [] as ArchiveStation[]),
        fetchJson(`${COLLECTOR_BASE}/live`, parseLive, fetchImpl).catch(() => null),
      ]);
      if (!stats) return null; // unknown station → 404
      return html(renderStationPage(stats, stations, live, lang));
    }
    return null;
  } catch (err) {
    // Prefer not to leak internal error text to the page; log is provider-side.
    void err;
    return unavailable(p, pathLang, acceptLanguage);
  }
}

/** Export a typed writer for consumers that need to force the day type. */
export function asDays(value: number): ArchiveDays | null {
  return isDays(value) ? value : null;
}
