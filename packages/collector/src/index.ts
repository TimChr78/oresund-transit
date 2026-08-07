/**
 * oresund-transit collector Worker entry point.
 *
 * scheduled()  — every 5 min (wrangler.toml cron): fetch both monitored stops
 *                from Trafiklab, filter to cross-border trains, upsert
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
  isSwedenBoundTrain,
} from './logic.js';
import {
  logDisruption,
  queryDelayStats,
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
 * The two monitored stops. SiteIds come from the real fixtures' query.query:
 * Hyllie 740001586 (trains to Denmark via isCrossborderTrain), København H
 * 860000626 (trains to Sweden via isSwedenBoundTrain). Buses are excluded per
 * the Phase 2 scope decision.
 */
const MONITORED_STOPS = [
  { id: '740001586', name: 'Malmö Hyllie', filter: isCrossborderTrain },
  { id: '860000626', name: 'København H', filter: isSwedenBoundTrain },
] as const;

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

function toDepartureRow(
  stop: { id: string; name: string },
  dep: TrafiklabDeparture,
  now: Date,
): DepartureInput {
  const line = dep.route?.designation ?? null;
  const destination = dep.route?.direction ?? null;
  const canceled = dep.canceled ? 1 : 0;
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
    dep_key: depKey(dep),
    first_seen: formatLocalIso(now),
    last_updated: formatLocalIso(now),
  };
}

/**
 * Classify one departure into a disruption row (or null when it is not
 * disruptive): canceled → cancellation, delay >= 600s → delay, alerts → alert.
 * Reuses the ported logic.ts classifiers as-is.
 */
function classifyDeparture(
  row: DepartureInput,
  dep: TrafiklabDeparture,
  now: Date,
): DisruptionInput | null {
  const alerts = (dep.alerts ?? []) as { title?: unknown; text?: unknown }[];
  const title = alerts.map((a) => String(a?.title ?? '')).filter(Boolean).join(' | ');
  const text = alerts.map((a) => String(a?.text ?? '')).filter(Boolean).join(' | ');
  const type = classifyType(dep.canceled, dep.delay, title, text);
  if (type === 'unknown') return null;

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
    dep_key: row.dep_key,
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
 * The scheduled run: fetch both stops → filter → upsert departures → classify
 * + log disruptions → detect service shutdown → persist LiveStatus snapshot.
 * fetchFn and nowFn are injected so tests never touch the network or the
 * clock. A fetch failure aborts the run (thrown) so a broken API poll is
 * never mistaken for "no cross-border service".
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
      crossborderCount += 1;
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** The read-only HTTP API surface. */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/health') return new Response('ok');

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

  return json({ error: 'not found' }, 404);
}

export default {
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env, globalThis.fetch as unknown as FetchLike, () => new Date()));
  },
  fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },
};
