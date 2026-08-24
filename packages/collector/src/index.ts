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
  queryPunctuality,
  queryRecentDepartures,
  queryRecentDisruptions,
  queryStationPunctuality,
  readLiveStatus,
  upsertDeparture,
  writeLiveStatus,
  type D1Like,
  type DepartureInput,
  type DisruptionInput,
} from './db.js';

export interface Env {
  DB: D1Like;
  TRAFIKLAB_KEY: string;
  TRAFIKLAB_BASE_URL?: string;
}

/** Minimal fetch surface the worker relies on (injectable for tests). */
export type FetchLike = (url: string) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

const DEFAULT_BASE_URL = 'https://realtime-api.trafiklab.se/v1/departures';

/**
 * The four monitored stops.
 *
 * Hyllie 740001586 and København H 860000626 are verified live SiteIds (they
 * come from the real fixtures' query.query): Hyllie monitors Denmark-bound
 * trains via isCrossborderTrain, København H monitors Sweden-bound trains via
 * isSwedenBoundTrain. Kastrup Lufthavn mirrors København H's filter.
 *
 * ✅ VERIFIED LIVE 2026-08-22: Kastrup 860000858 returned real departures
 * against the live Trafiklab key. The earlier 840004349 Kastrup id was a
 * registry misinterpretation — Danish stops use the 86xxxx range (København
 * H = 860000626); polled against the live key, 840004349 matched nothing.
 * ⚠️ Malmö C 740000001 was WRONG (Stockholm C); real id is 740000003.
 *
 * Trafiklab quota: polling every 5 minutes costs ~288 requests/day per stop,
 * ≈ 8.6k requests/month. Four monitored stops therefore consume ≈ 35k
 * requests/month of the Trafiklab key quota; each added or removed stop
 * moves that needle by ~8.6k requests/month.
 *
 * Buses are excluded per the Phase 2 scope decision. `crossborder: false` on
 * Malmö C: its filter (isAnyTrain) intentionally admits purely local Pågatåg
 * trains, which cannot attest cross-border service — the service-shutdown
 * detector counts only the three crossborder stops (Hyllie, København H,
 * Kastrup Lufthavn).
 */
const MONITORED_STOPS = [
  { id: '740001586', name: 'Malmö Hyllie', slug: 'hyllie', filter: isCrossborderTrain, crossborder: true },
  { id: '860000626', name: 'København H', slug: 'kobenhavn-h', filter: isSwedenBoundTrain, crossborder: true },
  // ✅ Verified 2026-08-24 against ResRobot: real Malmö Centralstation is
  // 740000003 (740000001 was Stockholm C — collected Arlanda Express/Uppsala).
  // Filter = Øresundståg only (agency 110 / 8xx line): no Pågatåg/SJ/buses.
  { id: '740000003', name: 'Malmö C', slug: 'malmo-c', filter: isOresundTrain, crossborder: false },
  // ✅ Verified live 2026-08-22: 860000858 = 'Kastrup flygplats' (ResRobot exact name) — real departures.
  { id: '860000858', name: 'Københavns Lufthavn (Kastrup)', slug: 'kastrup', filter: isSwedenBoundTrain, crossborder: true },
] as const;

/** The stable archive URL slug for a monitored stop (ASCII, URL-safe). */
export interface StationInfo {
  slug: string;
  stop_id: string;
  stop_name: string;
}

const STATIONS: StationInfo[] = MONITORED_STOPS.map((s) => ({
  slug: s.slug,
  stop_id: s.id,
  stop_name: s.name,
}));

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
    if (from !== null) opts.from = from;
    if (to !== null) opts.to = to;
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
    return json({ lines: await queryDistinctLines(env.DB) });
  }

  if (url.pathname === '/api/transit/stations') {
    return json({ stations: STATIONS });
  }

  if (url.pathname.startsWith('/api/transit/line/')) {
    const line = decodeURIComponent(url.pathname.slice('/api/transit/line/'.length));
    if (!line) return json({ error: 'line is required' }, 400);
    return json(await queryLineHistory(env.DB, line, parseDays(url)));
  }

  if (url.pathname.startsWith('/api/transit/station/')) {
    const slug = decodeURIComponent(url.pathname.slice('/api/transit/station/'.length));
    const stop = STATIONS.find((s) => s.slug === slug);
    if (!stop) return json({ error: 'unknown station' }, 404);
    const days = parseDays(url);
    const punctuality = await queryStationPunctuality(env.DB, stop.stop_id, days);
    return json({
      ...punctuality,
      slug: stop.slug,
      stop_name: stop.stop_name,
      recent: await queryRecentDepartures(env.DB, stop.stop_id, 20),
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

export default {
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env, globalThis.fetch as unknown as FetchLike, () => new Date()));
  },
  fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },
};
