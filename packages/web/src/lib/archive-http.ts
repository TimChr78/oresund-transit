/**
 * HTTP wiring for the archive routes — the shared dispatch used by the thin
 * Pages Functions in functions/{line,station,history}/[[path]].js.
 *
 * It parses the request path, fetches the matching collector endpoint, and
 * returns a fully-rendered HTML Response (200). Data problems (collector
 * unreachable / non-2xx / unparseable) answer 502 plain text rather than a
 * broken page; paths outside the archive namespace return null so the caller
 * can reply 404.
 *
 * This is the only module that touches fetch + Response; every renderer lives
 * in the pure ./archive module, so the whole surface is testable against a
 * stubbed global fetch.
 */
import { esc } from './html';
import {
  DAY_RANGES,
  renderHistoryIndex,
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

function html(body: string): Response {
  return new Response(body, { status: 200, headers: HTML_HEADERS });
}

function unavailable(route: string): Response {
  return new Response(`Archive temporarily unavailable (${esc(route)})`, {
    status: 502,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
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

function parseLines(json: unknown): ArchiveLine[] {
  const b = json as { lines?: unknown } | null;
  if (!b || !Array.isArray(b.lines)) throw new TypeError('invalid lines shape');
  return (b.lines as { line?: unknown; disruptions?: unknown }[])
    .filter((l) => l && typeof l.line === 'string' && typeof l.disruptions === 'number')
    .map((l) => ({ line: l.line as string, disruptions: l.disruptions as number }));
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
  return b as ArchiveStationStats;
}

function isDays(value: number): value is ArchiveDays {
  return (DAY_RANGES as readonly number[]).includes(value);
}

/** Normalize a pathname: strip trailing slashes (except root). */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Dispatch a request for `/line/*`, `/station/*` or `/history/*`. Returns a
 * Response for every matched path (data errors → 502), or null when the path
 * is not an archive route.
 */
export async function handleArchiveRequest(pathname: string, fetchImpl: FetchLike = fetch): Promise<Response | null> {
  const p = normalizePath(pathname);
  const enc = encodeURIComponent;

  try {
    // --- /history ---
    if (p === '/history') {
      return html(renderHistoryIndex());
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
      const [stats, stations] = await Promise.all([
        fetchJsonOrNull(`${COLLECTOR_BASE}/station/${enc(slug)}?days=30`, parseStation, fetchImpl),
        fetchJson(`${COLLECTOR_BASE}/stations`, parseStations, fetchImpl).catch(() => [] as ArchiveStation[]),
      ]);
      if (!stats) return null; // unknown station → 404
      return html(renderStationPage(stats, stations));
    }
    return null;
  } catch (err) {
    // Prefer not to leak internal error text to the page; log is provider-side.
    void err;
    return unavailable(p);
  }
}

/** Export a typed writer for consumers that need to force the day type. */
export function asDays(value: number): ArchiveDays | null {
  return isDays(value) ? value : null;
}
