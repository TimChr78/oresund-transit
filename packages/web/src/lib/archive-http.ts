/**
 * HTTP wiring for the archive routes — the shared dispatch used by the thin
 * Pages Functions in functions/{line,station,history}/[[path]].js and their
 * localized twins functions/{sv,da}/{station,history}/[[path]].js.
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
import { isValidLocalDate, isValidLocalTimestamp } from '../i18n/format';
import type { LiveStatus } from '@oresund/shared';
import { acceptLang, serviceUnavailableResponse, SECURITY_HEADERS, withSecurityHeaders } from './http-errors';
import {
  CANONICAL_LINES,
  DAY_RANGES,
  renderHistoryHub,
  renderHistoryPage,
  renderLineIndex,
  renderLinePage,
  renderStationIndex,
  renderStationPage,
  type ArchiveDays,
  type ArchiveHistory,
  type ArchiveLine,
  type ArchiveLineStats,
  type ArchivePunctuality,
  type ArchiveStation,
  type ArchiveStationStats,
} from './archive';

const COLLECTOR_BASE = 'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  // max-age=300 is a deliberate trade (audit6 L16): a page cached just before
  // Stockholm midnight shows the previous day's window for up to five minutes
  // after it. Killing the cache for that one window was judged worse than a
  // five-minute self-correcting staleness.
  'Cache-Control': 'public, max-age=300',
};

/**
 * The security header set public/_headers applies to static assets (audit4
 * N-C2). Cloudflare only reads `_headers` for files it serves from dist/ — a
 * Pages Function's Response is NOT covered by it. Defined once in
 * ./http-errors and re-exported here so the archive routes' 200/502 all
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
 *
 * `route` is the path as requested — prefix included (audit5 H4). It is both
 * the retry link's href and the path printed on the page, so a Swedish reader
 * whose /sv/station/hyllie request failed sees that path and retries it, not
 * the prefix-stripped /station/hyllie.
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
    !isWindow(b.date_from, b.date_to) ||
    typeof b.total_disruptions !== 'number' ||
    !Array.isArray(b.daily)
  ) {
    throw new TypeError('invalid history shape');
  }
  return b as ArchiveHistory;
}

/**
 * A real calendar window: both ends are dates that exist. audit6 M7 — the
 * boundaries were only `typeof`-checked at all four archive routes, so an
 * impossible window from the collector reached the formatters intact and
 * fmtDate's `Date.UTC` rollover turned "2026-99-99" into "7 Jun 2034", which
 * then landed in a meta description. Rejected here the payload is garbage and
 * the route answers its branded 502, like any other unparseable body.
 */
function isWindow(from: unknown, to: unknown): from is string {
  return typeof from === 'string' && typeof to === 'string' && isValidLocalDate(from) && isValidLocalDate(to);
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

/**
 * The collector /api/transit/punctuality shape — the corridor-wide daily rows
 * the /history hub sums into its headline numbers. Only the members the
 * aggregation reads are validated; anything else passes through as parsed JSON.
 */
function parsePunctuality(json: unknown): ArchivePunctuality {
  const b = json as Partial<ArchivePunctuality> | null;
  if (!b || typeof b.days !== 'number' || !isWindow(b.date_from, b.date_to) || !Array.isArray(b.daily)) {
    throw new TypeError('invalid punctuality shape');
  }
  // A row that is not a full punctuality day would poison the sums, so it is
  // dropped rather than partially trusted — the hub then under-reports instead
  // of reporting a number nothing measured.
  b.daily = b.daily.filter(
    (r) =>
      r &&
      typeof r === 'object' &&
      typeof r.date === 'string' &&
      Number.isFinite(r.total) &&
      Number.isFinite(r.on_time) &&
      Number.isFinite(r.delayed) &&
      Number.isFinite(r.canceled) &&
      // CodeRabbit PR53: counts are non-negative and on_time cannot exceed
      // total — a row like total=10/on_time=11 would render an impossible
      // 110.0% against the declared 0-100 contract.
      r.total >= 0 &&
      r.on_time >= 0 &&
      r.delayed >= 0 &&
      r.canceled >= 0 &&
      r.on_time <= r.total,
  );
  return b as ArchivePunctuality;
}

function parseLine(json: unknown): ArchiveLineStats {
  const b = json as Partial<ArchiveLineStats> | null;
  if (
    !b ||
    typeof b.days !== 'number' ||
    !isWindow(b.date_from, b.date_to) ||
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

/**
 * True for a line designation a real archive page exists for: the canonical
 * set, or a line the collector has observed in the current window (audit6 H1).
 */
function isKnownLine(raw: string, lines: ArchiveLine[]): boolean {
  return (CANONICAL_LINES as readonly string[]).includes(raw) || lines.some((l) => l.line === raw);
}

function parseStation(json: unknown): ArchiveStationStats {
  const b = json as Partial<ArchiveStationStats> | null;
  if (
    !b ||
    typeof b.days !== 'number' ||
    !isWindow(b.date_from, b.date_to) ||
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
 * The language prefix of a localized archive route. Two families localize
 * (audit3 C1): the station pages and the /history hub. /line/* and the
 * /history/{days} windows stay single-URL, so a prefixed path that is not one
 * of the two is answered by the caller's 404 rather than silently rendering an
 * English page.
 */
const LANG_PREFIX = /^\/(sv|da)(\/.+)$/;

/** Normalize a pathname: strip trailing slashes (except root). */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Dispatch a request for `/line/*`, `/station/*` or `/history/*` — including
 * the localized routes `/sv|da/station/*` and `/sv|da/history`. Returns a
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

  // Localized archive pages: strip the language prefix and render in that
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
    // Only the station pages and the /history hub localize (audit3 C1) —
    // /line and the /history/{days} windows ship no localized twins, so a
    // prefixed path to those is not a page.
    if (!p.startsWith('/station/') && p !== '/history') return null;
  }

  try {
    // --- /history ---
    // The archive hub: the whole corridor's numbers for the default 30-day
    // window, and the way into every window/station/line archive. A real page
    // since audit4 (it used to 301 to /history/30, which left the trilingual
    // hub renderer unreachable dead code). Two collector calls — the corridor
    // punctuality rows and the disruption window — and nothing else: the
    // station and line lists it links come from the static monitored set.
    // Localized: /sv/history and /da/history render in their own language.
    if (p === '/history') {
      const [punctuality, history] = await Promise.all([
        fetchJson(`${COLLECTOR_BASE}/punctuality?days=30`, parsePunctuality, fetchImpl),
        fetchJson(`${COLLECTOR_BASE}/history?days=30`, parseHistory, fetchImpl),
      ]);
      return html(renderHistoryHub(punctuality, history, lang));
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
      // audit6 H1: /line is the one archive family that took any input at all.
      // The collector's /line/{line} endpoint validates only that the segment
      // is non-empty and answers 200 with an empty archive for any string, so
      // `!stats` below never fired and /line/gibberish, /line/99999 and
      // /line/%20 all rendered 200 with index,follow and a self-referencing
      // canonical — an unbounded indexable URL space of one-page-per-input
      // soft 404s. A line archive exists for the canonical set, or for a line
      // the collector has actually observed; nothing else is a page.
      if (!isKnownLine(raw, lines)) return null;
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
    // The original pathname, not the prefix-stripped `p` — the 502 page's
    // retry link and code line name the URL the visitor asked for (audit5 H4).
    return unavailable(normalizePath(pathname), pathLang, acceptLanguage);
  }
}

/** Export a typed writer for consumers that need to force the day type. */
export function asDays(value: number): ArchiveDays | null {
  return isDays(value) ? value : null;
}
