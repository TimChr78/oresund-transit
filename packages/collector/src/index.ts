/**
 * oresund-transit collector Worker entry point.
 *
 * scheduled()  — every 5 min (wrangler.toml cron): fetch all four monitored
 *                stops from Trafiklab, filter the relevant trains, upsert
 *                departures, classify + log disruptions, detect service
 *                shutdown, and persist a LiveStatus snapshot to D1.
 * fetch()      — read-only API: /health, /api/transit/live,
 *                /api/transit/delay-stats.
 *
 * All network/D1 I/O is injected (fetchFn, env.DB) so the worker logic is
 * fully testable against fakes — no real Trafiklab or D1 needed.
 */
import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { LiveStatus, TrafiklabDeparture } from '@oresund/shared';
import {
  categorizeCause,
  categorizeSeverity,
  classifyType,
  delayStatus,
  formatTime,
  getDirection,
  isCrossborderTrain,
  isEveryAlertResumed,
  isSwedenBoundTrain,
  isOresundTrain,
} from './logic.js';
import {
  logDisruption,
  queryDelayStats,
  queryDistinctLines,
  queryHistory,
  queryLineHistory,
  queryLineStops,
  queryPunctuality,
  queryRecentDepartures,
  queryRecentDisruptions,
  queryStationLines,
  queryStationPunctuality,
  readLiveStatus,
  upsertDeparture,
  writeLiveStatus,
  type D1Like,
  type DepartureInput,
  type DisruptionInput,
} from './db.js';
import { MONITORED_STOPS as MONITORED_STOP_DATA, type MonitoredStopSlug } from './stops.js';

export interface Env {
  DB: D1Like;
  TRAFIKLAB_KEY: string;
  TRAFIKLAB_BASE_URL?: string;
}

/** Minimal fetch surface the worker relies on (injectable for tests). */
export type FetchLike = (url: string) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

const DEFAULT_BASE_URL = 'https://realtime-api.trafiklab.se/v1/departures';

/**
 * The four monitored stops — ids, names, slugs and the cross-border flag come
 * from ./stops, the one copy of that set (audit6 M11). This module only adds
 * what polling needs: the per-stop departure filter.
 *
 * Trafiklab quota: polling every 5 minutes costs ~288 requests/day per stop,
 * ≈ 8.6k requests/month. Four monitored stops therefore consume ≈ 35k
 * requests/month of the Trafiklab key quota; each added or removed stop
 * moves that needle by ~8.6k requests/month.
 *
 * The filters are mode- and destination-scoped, not agency-scoped (audit7
 * N-M3). Each one rejects a departure whose transport mode is not TRAIN/RAIL —
 * which is what keeps buses out — and then selects on the departure's own
 * strings: a destination keyword (a Denmark-bound keyword at Hyllie, a
 * Sweden-bound one at København H and Kastrup) or, at Malmö C, an 8xx
 * designation or the Øresundståg operator id. They do NOT read an operator or
 * line-list field, so they separate Øresundståg from Pågatåg, SJ and
 * Snälltåget only by where the train is going and what it is numbered — a
 * non-Øresundståg train whose destination string names a corridor city would
 * be counted. Measured effect today is none (the live by_line is pure 8xx),
 * but the claim is the heuristic, not an operator filter.
 *
 * `crossborder: false` on Malmö C is a separate, narrower claim: its filter
 * (isOresundTrain) is the strictest of the four, but purely local Øresundståg
 * turns call there and cannot attest that the crossing is running, so the
 * service-shutdown detector counts only the three crossborder stops (Hyllie,
 * København H, Kastrup Lufthavn).
 *
 * `satisfies Record<MonitoredStopSlug, …>` rather than a `Record<string, …>`
 * annotation (audit7 L1): the target names every slug MONITORED_STOPS defines
 * and nothing else, so a stop added to stops.ts without a filter here — or a
 * key misspelled here — is a compile error instead of an `undefined` filter
 * thrown on the first departure of a runScheduled pass, which would abort the
 * whole poll: no departures upserted and no live_status written. It also makes
 * `STOP_FILTERS[stop.slug]` below a total index, so the `!` that used to
 * assert it is gone rather than suppressed.
 */
const STOP_FILTERS = {
  hyllie: isCrossborderTrain,
  'kobenhavn-h': isSwedenBoundTrain,
  'malmo-c': isOresundTrain,
  kastrup: isSwedenBoundTrain,
} satisfies Record<MonitoredStopSlug, (dep: TrafiklabDeparture) => boolean>;

const MONITORED_STOPS = MONITORED_STOP_DATA.map((stop) => ({
  ...stop,
  filter: STOP_FILTERS[stop.slug],
}));

/** The stable archive URL slug for a monitored stop (ASCII, URL-safe). */
export interface StationInfo {
  slug: string;
  stop_id: string;
  stop_name: string;
}

/** The four monitored stops, as the API's /stations discovery payload reports them. */
export const STATIONS: StationInfo[] = MONITORED_STOPS.map((s) => ({
  slug: s.slug,
  stop_id: s.id,
  stop_name: s.name,
}));

/**
 * The monitored stops a list of departure stop ids belongs to, in order.
 * Line histories only ever carry observed stop ids, so this is what the line
 * archive can build a station page URL for — an id that is not one of the four
 * monitored stops (a partial or historical ingest) is dropped rather than
 * served as a dead link.
 */
function monitoredStops(stopIds: string[]): StationInfo[] {
  const stops: StationInfo[] = [];
  for (const stopId of stopIds) {
    const stop = STATIONS.find((s) => s.stop_id === stopId);
    if (stop) stops.push(stop);
  }
  return stops;
}

/** Operating hours / timestamps are "local" = Europe/Stockholm (monitor local). */
const LOCAL_TZ = 'Europe/Stockholm';

function localParts(now: Date, tz: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
}

/** Local naive ISO timestamp, e.g. "2026-08-06T21:59:27" (matches fixtures). */
export function formatLocalIso(now: Date, tz: string = LOCAL_TZ): string {
  const parts = localParts(now, tz);
  const get = (t: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Hour-of-day in the local timezone (0-23). */
export function localHour(now: Date, tz: string = LOCAL_TZ): number {
  const hour = localParts(now, tz).find((p) => p.type === 'hour')?.value;
  return Number(hour ?? '0');
}

/** Operating hours 06:00–22:00 local (22:00 excluded). */
export function isOperatingHours(now: Date, tz: string = LOCAL_TZ): boolean {
  const h = localHour(now, tz);
  return h >= 6 && h < 22;
}

/**
 * Stable key for a scheduled departure: {line}_{HH:MM}_{destination}
 * (e.g. "804_21:59_Østerport") — matches the dep_key format used by the
 * private monitor's seed data. Deliberately carries no date: the departures
 * row is one per scheduled slot and disruptions are deduped by dep_key *and*
 * calendar day in logDisruption.
 */
export function depKey(dep: TrafiklabDeparture): string {
  const line = dep.route?.designation ?? '?';
  const destination = dep.route?.direction ?? '?';
  return `${line}_${formatTime(dep.scheduled)}_${destination}`;
}

/**
 * Date-scoped key for the departures table: {YYYY-MM-DD}_{line}_{HH:MM}_{dest}.
 * The departures table drives delay%-over-time queries, so each day must get
 * its own row — a date-less key lets the upsert clobber yesterday's data.
 * Disruptions keep the date-less depKey() (deduped by dep_key + calendar day,
 * and matching the private monitor's format for the A/B verification cron).
 */
export function departureKey(dep: TrafiklabDeparture): string {
  const base = depKey(dep);
  const d = dep.scheduled ? String(dep.scheduled).slice(0, 10) : '';
  return d ? `${d}_${base}` : base;
}

/**
 * Join the departure's alert title/text fields the way classifyType expects
 * them (same extraction classifyDeparture uses). Shared so the departures
 * KPI and the disruption list classify from identical inputs.
 */
function alertTitleText(dep: TrafiklabDeparture): { title: string; text: string } {
  const alerts = (dep.alerts ?? []) as { title?: unknown; text?: unknown }[];
  return {
    title: alerts.map((a) => String(a?.title ?? '')).filter(Boolean).join(' | '),
    text: alerts.map((a) => String(a?.text ?? '')).filter(Boolean).join(' | '),
  };
}

function toDepartureRow(
  stop: { id: string; name: string },
  dep: TrafiklabDeparture,
  now: Date,
): DepartureInput {
  const line = dep.route?.designation ?? null;
  const destination = dep.route?.direction ?? null;
  // Cancellation is decided by the SAME classifier as the disruption list:
  // classifyType falls back to alert keywords ("Tåget är inställt …"), which
  // Trafiklab frequently sends with the boolean canceled flag still false.
  // Without this, the departures KPI (status column) would say on_time while
  // the disruption list says cancellation — the exact bug this fixes.
  // Note: the keyword check is a bare substring match, so a *delay* message
  // that merely references another canceled service (e.g. "Försenad pga
  // inställt byte") would mislabel this departure as canceled — a known
  // tradeoff inherited from classifyType, kept for KPI/list parity.
  const { title, text } = alertTitleText(dep);
  const type = classifyType(dep.canceled, dep.delay, title, text);
  const canceled = type === 'cancellation' ? 1 : 0;
  return {
    stop_id: stop.id,
    stop_name: stop.name,
    line,
    destination,
    sched_time: dep.scheduled ?? null,
    delay_seconds: dep.delay ?? 0,
    canceled,
    status: canceled === 1 ? 'canceled' : delayStatus(dep.delay ?? 0),
    technical_number: dep.trip?.technical_number != null ? String(dep.trip.technical_number) : null,
    dep_key: departureKey(dep),
    first_seen: formatLocalIso(now),
    last_updated: formatLocalIso(now),
  };
}

/**
 * Classify one departure into a disruption row (or null when it is not
 * disruptive): canceled → cancellation, delay >= 240s → delay, alerts → alert.
 * Reuses the ported logic.ts classifiers as-is.
 */
function classifyDeparture(
  row: DepartureInput,
  dep: TrafiklabDeparture,
  now: Date,
): DisruptionInput | null {
  const { title, text } = alertTitleText(dep);
  const type = classifyType(dep.canceled, dep.delay, title, text);
  if (type === 'unknown') return null;
  // Resumed-normal notices ("Förseningar – Tågen kan köra normalt igen") are
  // the all-clear message — NOT a disruption. The delay field still carries a
  // stale value at that point (0–779s observed), so without this filter every
  // back-to-normal poll would be logged as a delay/alert and inflate
  // disruption_count while the train is actually on time. Text-classified
  // cancellations (installt/cancelled in title/text) must still be kept, so
  // the filter only applies when the type is not cancellation. True residual
  // delays (>= 240s) and dep.canceled cancellations are also kept.
  // Per-alert check: a departure with mixed alerts (one active + one resumed-normal) must NOT be suppressed.
  if (type !== "cancellation" && (dep.delay ?? 0) < 240 && isEveryAlertResumed((dep.alerts ?? []) as { title?: unknown; text?: unknown }[])) return null;

  const ts = formatLocalIso(now);
  return {
    timestamp: ts,
    line: row.line,
    type,
    cause: categorizeCause(title, text),
    route_section: null,
    severity: categorizeSeverity(dep.delay, dep.canceled, title, text),
    delay_seconds: Math.max(dep.delay ?? 0, 0),
    raw_text: text || title || null,
    dep_key: depKey(dep),
    first_seen: ts,
    last_updated: ts,
    direction: getDirection(row.line, row.destination),
    technical_number: row.technical_number,
    sched_time: row.sched_time,
  };
}

/**
 * Build the LiveStatus snapshot. Status rule (provisional, validated against
 * the private monitor during the A/B week):
 *   - service shutdown (operating hours + zero cross-border trains) → red
 *   - any cancellation → red, any delay → amber, any alert → blue, else green
 */
export function buildLiveStatus(
  now: Date,
  crossborderCount: number,
  disruptions: DisruptionInput[],
  departuresSeen: DepartureInput[],
): LiveStatus {
  const serviceShutdown = isOperatingHours(now) && crossborderCount === 0;
  let status: LiveStatus['status'];
  let statusText: string;
  if (serviceShutdown) {
    status = 'red';
    statusText = 'No cross-border service detected';
  } else if (disruptions.some((d) => d.type === 'cancellation')) {
    status = 'red';
    statusText = 'Cancellations';
  } else if (disruptions.some((d) => d.type === 'delay')) {
    status = 'amber';
    statusText = 'Delays';
  } else if (disruptions.some((d) => d.type === 'alert')) {
    status = 'blue';
    statusText = 'Alerts';
  } else {
    status = 'green';
    statusText = 'Normal service';
  }

  const departureCounts = { to_denmark: 0, to_sweden: 0, bus: 0 };
  const directions: LiveStatus['directions'] = { to_denmark: [], to_sweden: [], bus: [] };
  for (const d of departuresSeen) {
    const dir = getDirection(d.line, d.destination);
    if (!dir) continue;
    departureCounts[dir] += 1;
    if (d.destination && !directions[dir].includes(d.destination)) {
      directions[dir].push(d.destination);
    }
  }

  const ts = formatLocalIso(now);
  return {
    status,
    status_text: statusText,
    timestamp: ts,
    time_short: formatTime(ts),
    disruption_count: disruptions.length,
    departure_counts: departureCounts,
    service_shutdown: serviceShutdown,
    directions,
  };
}

/**
 * The scheduled run: fetch all four stops → filter → upsert departures →
 * classify + log disruptions → detect service shutdown → persist LiveStatus
 * snapshot. fetchFn and nowFn are injected so tests never touch the network
 * or the clock. A fetch failure aborts the run (thrown) so a broken API poll
 * is never mistaken for "no cross-border service". crossborderCount counts
 * only departures from stops flagged `crossborder` (Malmö C is excluded — its
 * all-trains filter sees purely local Pågatåg traffic and cannot attest
 * cross-border service).
 */
export async function runScheduled(env: Env, fetchFn: FetchLike, nowFn: () => Date): Promise<LiveStatus> {
  if (!env.TRAFIKLAB_KEY) throw new Error('TRAFIKLAB_KEY is not configured');
  const baseUrl = env.TRAFIKLAB_BASE_URL ?? DEFAULT_BASE_URL;
  const now = nowFn();

  let crossborderCount = 0;
  const departuresSeen: DepartureInput[] = [];
  const disruptions: DisruptionInput[] = [];

  for (const stop of MONITORED_STOPS) {
    const url = `${baseUrl}/${stop.id}?key=${env.TRAFIKLAB_KEY}`;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Trafiklab fetch failed for ${stop.id}: HTTP ${res.status ?? 'unknown'}`);
    const body = (await res.json()) as { departures?: TrafiklabDeparture[] };

    for (const dep of body.departures ?? []) {
      if (!stop.filter(dep)) continue;
      // Only stops flagged `crossborder` attest cross-border service; Malmö C
      // also sees purely local trains, so it must not mask a shutdown.
      if (stop.crossborder) crossborderCount += 1;
      const row = toDepartureRow(stop, dep, now);
      await upsertDeparture(env.DB, row);
      departuresSeen.push(row);

      const disruption = classifyDeparture(row, dep, now);
      if (disruption) {
        await logDisruption(env.DB, disruption);
        disruptions.push(disruption);
      }
    }
  }

  const status = buildLiveStatus(now, crossborderCount, disruptions, departuresSeen);
  await writeLiveStatus(env.DB, status);
  return status;
}

/** CORS headers for the Phase 3 browser dashboard (Cloudflare Pages). */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
};

/** Add the CORS headers to a Response (preserving status + existing headers). */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function json(body: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  );
}

/** The read-only HTTP API surface. */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // Browser preflight — every API path is GET-only, so a blanket 204 works.
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

  if (url.pathname === '/health') return withCors(new Response('ok'));

  if (url.pathname === '/api/transit/live') {
    const status = await readLiveStatus(env.DB);
    if (!status) return json({ error: 'no live status snapshot yet' }, 503);
    return json(status);
  }

  if (url.pathname === '/api/transit/delay-stats') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) {
      return json({ error: 'from and to query parameters are required (ISO date/datetime)' }, 400);
    }
    if (!isValidQueryBound(from) || !isValidQueryBound(to)) return badWindowResponse();
    // Same guard the web's archive boundary applies: a reversed window is a
    // caller error, not an empty result worth a 200.
    if (from > to) return json({ error: 'from must not be after to' }, 400);
    return json(await queryDelayStats(env.DB, from, to));
  }

  if (url.pathname === '/api/transit/disruptions') {
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam === null ? 50 : Number(limitParam);
    if (!Number.isInteger(limit) || limit <= 0) {
      return json({ error: 'limit must be a positive integer' }, 400);
    }
    const opts: { limit: number; from?: string; to?: string } = { limit: Math.min(limit, 200) };
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (from !== null) {
      if (!isValidQueryBound(from)) return badWindowResponse();
      opts.from = from;
    }
    if (to !== null) {
      if (!isValidQueryBound(to)) return badWindowResponse();
      opts.to = to;
    }
    if (opts.from !== undefined && opts.to !== undefined && opts.from > opts.to) {
      return json({ error: 'from must not be after to' }, 400);
    }
    return json({ disruptions: await queryRecentDisruptions(env.DB, opts) });
  }

  if (url.pathname === '/api/transit/history') {
    const daysParam = url.searchParams.get('days');
    const days = daysParam === null ? 7 : Number(daysParam);
    if (days !== 7 && days !== 14 && days !== 30 && days !== 90) {
      return json({ error: 'days must be one of 7, 14, 30 or 90' }, 400);
    }
    return json(await queryHistory(env.DB, days));
  }

  if (url.pathname === '/api/transit/punctuality') {
    const daysParam = url.searchParams.get('days');
    const days = daysParam === null ? 7 : Number(daysParam);
    if (days !== 7 && days !== 14 && days !== 30 && days !== 90) {
      return json({ error: 'days must be one of 7, 14, 30 or 90' }, 400);
    }
    return json(await queryPunctuality(env.DB, days));
  }

  // ---- Archive (server-rendered SEO pages) ----
  // Discovery endpoints feed the archive index pages + the dynamic sitemap.
  if (url.pathname === '/api/transit/lines') {
    // An explicit, generous limit (audit6 M10): the default 50 ordered the
    // rows by disruption count, so a canonical line crowded out by busier
    // ones came back as "never seen" and the sitemap dropped a page that has
    // data. The corridor has a dozen lines; 500 cannot be outrun.
    return json({ lines: await queryDistinctLines(env.DB, 500) });
  }

  if (url.pathname === '/api/transit/stations') {
    return json({ stations: STATIONS });
  }

  if (url.pathname.startsWith('/api/transit/line/')) {
    const rawSegment = url.pathname.slice('/api/transit/line/'.length);
    const line = decodeSegment(rawSegment);
    if (line === null) return json({ error: 'line must be valid percent-encoded UTF-8' }, 400);
    if (!line) return json({ error: 'line is required' }, 400);
    const days = parseDays(url);
    // N-M1: the monitored stops the line was actually observed at, so the
    // line archive can cross-link the station pages it shares data with.
    const [stats, stopIds] = await Promise.all([
      queryLineHistory(env.DB, line, days),
      queryLineStops(env.DB, line, days),
    ]);
    return json({ ...stats, stops: monitoredStops(stopIds) });
  }

  if (url.pathname.startsWith('/api/transit/station/')) {
    const rawSegment = url.pathname.slice('/api/transit/station/'.length);
    const slug = decodeSegment(rawSegment);
    if (slug === null) return json({ error: 'station slug must be valid percent-encoded UTF-8' }, 400);
    const stop = STATIONS.find((s) => s.slug === slug);
    if (!stop) return json({ error: 'unknown station' }, 404);
    const days = parseDays(url);
    // One clock for the whole response: the punctuality window's "today", the
    // sched_time <= bound on the recent rows, and the as_of stamp all read the
    // same instant, so the page cannot pair rows with a timestamp they predate.
    const now = new Date();
    // N-M1: the lines observed at this stop, for the station page's
    // cross-links back to the per-line archives.
    const [punctuality, recent, lines] = await Promise.all([
      queryStationPunctuality(env.DB, stop.stop_id, days, now),
      queryRecentDepartures(env.DB, stop.stop_id, 20, now),
      queryStationLines(env.DB, stop.stop_id, days, now),
    ]);
    return json({
      ...punctuality,
      slug: stop.slug,
      stop_name: stop.stop_name,
      as_of: recent.as_of,
      recent: recent.rows,
      lines,
    });
  }

  return json({ error: 'not found' }, 404);
}

/** days query param for archive pages — 7|14|30|90, defaulting to 30. */
function parseDays(url: URL): number {
  const n = url.searchParams.get('days');
  const value = n === null ? 30 : Number(n);
  return value === 7 || value === 14 || value === 30 || value === 90 ? value : 30;
}

// ---- Query-param validation (audit7 L4) ----
//
// The archive boundaries on the web side validate their window before it is
// compared against anything; the collector's own endpoints did not, so a
// free-text bound ("banana", "2026-99-99") went into the SQL string comparison
// as-is and came back as a 200 whose echo said the window was the nonsense the
// caller sent. Nothing on the site sends a user-controlled bound here, so no
// page was wrong — but the endpoint is public and the values are compared
// lexicographically against stored stamps, which is exactly the input a
// boundary should check.

/** The years a real bound can carry — the collector has no data outside them. */
const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

const QUERY_BOUND_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/;

/** Days in a month, leap years included (proleptic Gregorian, string math). */
function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/**
 * True for a real calendar date ("2026-08-06") or that date with a complete
 * naive local time ("2026-08-06T21:59:27") — the two shapes the columns these
 * bounds are compared against actually carry. REJECTED, not clamped: a bound
 * that is not a real instant is a caller error, and answering 400 says so
 * where echoing "date_from": "banana" would bless it.
 */
export function isValidQueryBound(value: string): boolean {
  const m = QUERY_BOUND_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (m[4] !== undefined) {
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    if (hour > 23 || minute > 59 || second > 59) return false;
  }
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** The 400 a malformed window bound earns, naming what the endpoint accepts. */
function badWindowResponse(): Response {
  return json(
    { error: 'from and to must be a real calendar date or local stamp: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS' },
    400,
  );
}

/**
 * Decode a URL path segment, or null when it is not valid percent-encoded
 * UTF-8 (audit7 L4): `/api/transit/line/%` threw a bare URIError out of
 * decodeURIComponent and answered a 500 for what is a malformed request.
 */
function decodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export default {
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env, globalThis.fetch as unknown as FetchLike, () => new Date()));
  },
  fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },
};
