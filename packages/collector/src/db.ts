/**
 * D1 persistence helpers for the collector worker. Pure SQL + mapping — no
 * network I/O, no environment access — so every function is testable against
 * a minimal fake (see test/fake-d1.ts). Mirrors the private monitor's
 * log_departure / log_disruption semantics.
 */
import type { Departure, Disruption, DelayStats, LineDelayStats, LiveStatus } from '@oresund/shared';
import { stickierType, type DisruptionType } from './logic.js';

/**
 * Minimal structural D1 interface — anything with prepare()/bind()/all()/
 * first()/run() works (the real Cloudflare D1Database satisfies it, as does
 * the test fake). Deliberately abstract: tests must not need real D1.
 */
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedLike;
}

/** Departure row without the autoincrement id (worker builds these). */
export type DepartureInput = Omit<Departure, 'id'>;
/** Disruption row without the autoincrement id (worker builds these). */
export type DisruptionInput = Omit<Disruption, 'id'>;

const DEPARTURE_COLS = [
  'stop_id',
  'stop_name',
  'line',
  'destination',
  'sched_time',
  'delay_seconds',
  'canceled',
  'status',
  'technical_number',
  'dep_key',
  'first_seen',
  'last_updated',
] as const;

/**
 * Insert a departure observation, keyed by (stop_id, dep_key). On conflict the
 * live fields are refreshed (mirroring log_departure in the private monitor);
 * sched_time is also refreshed because it carries the observation date that
 * date-filtered delay stats rely on. first_seen is never clobbered.
 */
export function upsertDeparture(db: D1Like, dep: DepartureInput): Promise<{ meta?: { changes?: number } }> {
  return db
    .prepare(
      `INSERT INTO departures (${DEPARTURE_COLS.join(', ')})
       VALUES (${DEPARTURE_COLS.map(() => '?').join(', ')})
       ON CONFLICT (stop_id, dep_key) DO UPDATE SET
         delay_seconds = excluded.delay_seconds,
         status = excluded.status,
         canceled = excluded.canceled,
         sched_time = excluded.sched_time,
         last_updated = excluded.last_updated`,
    )
    .bind(
      dep.stop_id,
      dep.stop_name,
      dep.line,
      dep.destination,
      dep.sched_time,
      dep.delay_seconds,
      dep.canceled,
      dep.status,
      dep.technical_number,
      dep.dep_key,
      dep.first_seen,
      dep.last_updated,
    )
    .run();
}

const DISRUPTION_COLS = [
  'timestamp',
  'line',
  'type',
  'cause',
  'route_section',
  'severity',
  'delay_seconds',
  'raw_text',
  'dep_key',
  'first_seen',
  'last_updated',
  'direction',
  'technical_number',
  'sched_time',
] as const;

const EXISTING_DISRUPTION_SQL =
  'SELECT id, delay_seconds, type FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1';

/**
 * Log a disruption, deduplicated by dep_key within the same calendar day
 * (mirroring log_disruption in the private monitor): when the same scheduled
 * departure already has a disruption today, update it keeping the worse
 * (larger) delay and the stickier (more severe) type, plus the latest
 * info; otherwise insert a fresh row.
 *
 * Type stickiness matters because Trafiklab resets delay fields late
 * (re-timing / post-departure polls): a departure first logged as delay>=600
 * can re-classify as alert on a later poll even though the worst delay — and
 * the alert text describing it — still describe the same event.
 */
export async function logDisruption(db: D1Like, d: DisruptionInput): Promise<{ meta?: { changes?: number } }> {
  const existing = await db
    .prepare(EXISTING_DISRUPTION_SQL)
    .bind(d.dep_key, d.timestamp)
    .first<{ id: number; delay_seconds: number | null; type: DisruptionType | null }>();

  if (existing) {
    const delay = Math.max(existing.delay_seconds ?? 0, d.delay_seconds ?? 0);
    // The shared Disruption row type widens `type` to string | null (DB rows);
    // incoming classifications from classifyType are always one of the four.
    const incomingType = (d.type ?? 'unknown') as DisruptionType;
    const type = existing.type ? stickierType(existing.type, incomingType) : incomingType;
    return db
      .prepare(
        'UPDATE disruptions SET delay_seconds = ?, type = ?, severity = ?, cause = ?, raw_text = ?, last_updated = ? WHERE id = ?',
      )
      .bind(delay, type, d.severity, d.cause, d.raw_text, d.last_updated, existing.id)
      .run();
  }
  return db
    .prepare(
      `INSERT INTO disruptions (${DISRUPTION_COLS.join(', ')}) VALUES (${DISRUPTION_COLS.map(() => '?').join(', ')})`,
    )
    .bind(
      d.timestamp,
      d.line,
      d.type,
      d.cause,
      d.route_section,
      d.severity,
      d.delay_seconds,
      d.raw_text,
      d.dep_key,
      d.first_seen,
      d.last_updated,
      d.direction,
      d.technical_number,
      d.sched_time,
    )
    .run();
}

/**
 * Recent disruptions, newest first. `limit` caps the result (the caller has
 * already clamped it to [1, 200]); optional from/to filter on `timestamp`
 * with the same half-open [from, to) convention as queryDelayStats.
 */
export async function queryRecentDisruptions(
  db: D1Like,
  opts: { limit: number; from?: string; to?: string },
): Promise<Disruption[]> {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (opts.from !== undefined) {
    clauses.push('timestamp >= ?');
    binds.push(opts.from);
  }
  if (opts.to !== undefined) {
    clauses.push('timestamp < ?');
    binds.push(opts.to);
  }
  const sql =
    clauses.length > 0
      ? `SELECT * FROM disruptions WHERE ${clauses.join(' AND ')} ORDER BY timestamp DESC LIMIT ?`
      : 'SELECT * FROM disruptions ORDER BY timestamp DESC LIMIT ?';
  binds.push(opts.limit);
  const { results } = await db.prepare(sql).bind(...binds).all<Disruption>();
  return results;
}

/**
 * Persist the LiveStatus snapshot as a single row (id = 1) — documented
 * storage choice: D1 over KV. The collector worker and (Phase 3) web worker
 * share the existing D1 binding; KV would need a new namespace + wrangler.toml
 * change. The full snapshot is stored as JSON in one column.
 */
export function writeLiveStatus(db: D1Like, status: LiveStatus): Promise<{ meta?: { changes?: number } }> {
  return db
    .prepare(
      'INSERT INTO live_status (id, snapshot, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at',
    )
    .bind(JSON.stringify(status), status.timestamp)
    .run();
}

/** Read the last LiveStatus snapshot, or null before the first scheduled run. */
export async function readLiveStatus(db: D1Like): Promise<LiveStatus | null> {
  const row = await db.prepare('SELECT snapshot FROM live_status WHERE id = 1').first<{ snapshot: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.snapshot) as LiveStatus;
  } catch {
    return null;
  }
}

const DELAY_STATS_STATUS_SQL =
  'SELECT status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE sched_time >= ? AND sched_time < ? GROUP BY status';
const DELAY_STATS_LINE_SQL =
  'SELECT line, status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE sched_time >= ? AND sched_time < ? GROUP BY line, status';

/**
 * Delay-% analytics over the departures observed in [from, to) (ISO
 * date/datetime strings compared lexicographically against sched_time).
 */
export async function queryDelayStats(db: D1Like, from: string, to: string): Promise<DelayStats> {
  const [byStatus, byLine] = await Promise.all([
    db
      .prepare(DELAY_STATS_STATUS_SQL)
      .bind(from, to)
      .all<{ status: string; count: number; avg_delay: number | null }>(),
    db
      .prepare(DELAY_STATS_LINE_SQL)
      .bind(from, to)
      .all<{ line: string | null; status: string; count: number; avg_delay: number | null }>(),
  ]);

  const countOf = (status: string): number =>
    byStatus.results.find((r) => r.status === status)?.count ?? 0;
  const onTime = countOf('on_time');
  const delayed = countOf('delayed');
  const canceled = countOf('canceled');
  const total = onTime + delayed + canceled;
  const pct = (n: number): number => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

  const withAvg = byStatus.results.filter((r) => r.avg_delay != null);
  const avg =
    withAvg.length > 0
      ? Math.round(
          withAvg.reduce((sum, r) => sum + r.count * (r.avg_delay ?? 0), 0) /
            withAvg.reduce((sum, r) => sum + r.count, 0),
        )
      : null;

  const byLineMap: Record<string, LineDelayStats> = {};
  for (const r of byLine.results) {
    const key = r.line ?? 'unknown';
    const stats = (byLineMap[key] ??= { total: 0, on_time_pct: 0, delayed_pct: 0, avg_delay_seconds: null });
    stats.total += r.count;
  }
  for (const r of byLine.results) {
    const key = r.line ?? 'unknown';
    const stats = byLineMap[key]!;
    if (r.status === 'on_time') stats.on_time_pct = pctFor(stats.total, r.count);
    if (r.status === 'delayed') stats.delayed_pct = pctFor(stats.total, r.count);
  }
  for (const key of Object.keys(byLineMap)) {
    const rows = byLine.results.filter((r) => (r.line ?? 'unknown') === key);
    byLineMap[key]!.avg_delay_seconds = avgForLine(rows);
  }

  return {
    date_from: from,
    date_to: to,
    total_departures: total,
    on_time_count: onTime,
    delayed_count: delayed,
    canceled_count: canceled,
    on_time_pct: pct(onTime),
    delayed_pct: pct(delayed),
    canceled_pct: pct(canceled),
    avg_delay_seconds: avg,
    by_line: byLineMap,
  };
}

function pctFor(total: number, count: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

function avgForLine(rows: { count: number; avg_delay: number | null }[]): number | null {
  const withAvg = rows.filter((r) => r.avg_delay != null);
  if (withAvg.length === 0) return null;
  return Math.round(
    withAvg.reduce((sum, r) => sum + r.count * (r.avg_delay ?? 0), 0) /
      withAvg.reduce((sum, r) => sum + r.count, 0),
  );
}

/**
 * Disruption-history aggregates for the dashboard charts. `days` is one of
 * 7|14|30 (validated by the caller); the range is the last `days` calendar
 * days in the worker's local timezone (Europe/Stockholm), half-open bound
 * [date_from, date_to + 1 day) — `now` is injectable so tests are
 * deterministic.
 */
export interface HistoryStats {
  days: number;
  date_from: string;
  date_to: string;
  total_disruptions: number;
  daily: { date: string; count: number; cancellations: number; delays: number; alerts: number; avg_delay: number | null }[];
  by_line: { line: string; count: number; avg_delay: number | null; max_delay: number | null }[];
  by_cause: { cause: string; count: number }[];
  by_hour: { hour: number; count: number; avg_delay: number | null }[];
}

/** Disruption timestamps are stored as naive local time — mirror index.ts. */
const LOCAL_TZ = 'Europe/Stockholm';

/** Calendar date of a Date in the worker's local timezone ("2026-08-06"). */
function localDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Naive local ISO timestamp ("2026-08-06T21:59:27") — the exact format
 * sched_time is stored in, so it compares lexicographically against the
 * column. Mirrors formatLocalIso in index.ts (kept here to avoid the import
 * cycle: index.ts already imports this module).
 */
function localIsoStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Add N calendar days to an ISO date string (DST-safe via UTC date math). */
function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

const HISTORY_DAILY_SQL =
  'SELECT date(timestamp) AS date, type, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY date(timestamp), type';const HISTORY_LINE_SQL =
  'SELECT line, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay, MAX(delay_seconds) AS max_delay FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY line ORDER BY count DESC';
const HISTORY_CAUSE_SQL =
  'SELECT cause, COUNT(*) AS count FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY cause ORDER BY count DESC';
const HISTORY_HOUR_SQL =
  "SELECT CAST(strftime('%H', timestamp) AS INTEGER) AS hour, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY hour ORDER BY hour ASC";

export async function queryHistory(db: D1Like, days: number, now: Date = new Date()): Promise<HistoryStats> {
  const to = localDateOnly(now);
  const from = addDaysStr(to, -(days - 1));
  const toExclusive = addDaysStr(to, 1);

  const [dailyRows, lineRows, causeRows, hourRows] = await Promise.all([
    db
      .prepare(HISTORY_DAILY_SQL)
      .bind(from, toExclusive)
      .all<{ date: string; type: string | null; count: number; avg_delay: number | null }>(),
    db
      .prepare(HISTORY_LINE_SQL)
      .bind(from, toExclusive)
      .all<{ line: string | null; count: number; avg_delay: number | null; max_delay: number | null }>(),
    db.prepare(HISTORY_CAUSE_SQL).bind(from, toExclusive).all<{ cause: string | null; count: number }>(),
    db
      .prepare(HISTORY_HOUR_SQL)
      .bind(from, toExclusive)
      .all<{ hour: number; count: number; avg_delay: number | null }>(),
  ]);

  // One entry per day in the range, zero-filled (charts need the full axis).
  const daily: HistoryStats['daily'] = [];
  const byDate = new Map<string, HistoryStats['daily'][number]>();
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const entry = { date: d, count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null as number | null };
    daily.push(entry);
    byDate.set(d, entry);
  }
  const delaySum = new Map<string, { sum: number; n: number }>();
  for (const r of dailyRows.results) {
    const entry = byDate.get(r.date);
    if (!entry) continue;
    entry.count += r.count;
    if (r.type === 'cancellation') entry.cancellations += r.count;
    else if (r.type === 'delay') entry.delays += r.count;
    else if (r.type === 'alert') entry.alerts += r.count;
    if (r.avg_delay != null) {
      const acc = delaySum.get(r.date) ?? { sum: 0, n: 0 };
      acc.sum += r.count * r.avg_delay;
      acc.n += r.count;
      delaySum.set(r.date, acc);
    }
  }
  for (const entry of daily) {
    const acc = delaySum.get(entry.date);
    entry.avg_delay = acc && acc.n > 0 ? Math.round(acc.sum / acc.n) : null;
  }

  return {
    days,
    date_from: from,
    date_to: to,
    total_disruptions: daily.reduce((sum, e) => sum + e.count, 0),
    daily,
    by_line: lineRows.results
      .map((r) => ({
        line: r.line ?? 'unknown',
        count: r.count,
        avg_delay: r.avg_delay === null ? null : Math.round(r.avg_delay),
        max_delay: r.max_delay,
      }))
      .sort((a, b) => b.count - a.count),
    by_cause: causeRows.results
      .map((r) => ({ cause: r.cause ?? 'unknown', count: r.count }))
      .sort((a, b) => b.count - a.count),
    by_hour: hourRows.results
      .map((r) => ({ hour: r.hour, count: r.count, avg_delay: r.avg_delay === null ? null : Math.round(r.avg_delay) }))
      .sort((a, b) => a.hour - b.hour),
  };
}

/**
 * The stop ids this collector monitors — the same four as MONITORED_STOPS in
 * index.ts, restated here because index.ts owns the per-stop metadata and
 * imports this module, so db.ts cannot reach back for them. If a stop id is
 * ever superseded again, both lists change together (db.test.ts asserts this
 * list is what the corridor query and the purge migration 0003 both name).
 *
 * C1 (audit5): the corridor punctuality query aggregated the WHOLE departures
 * table, so rows written against superseded stop ids leaked into /history.
 * Kastrup 840004349 → 860000858 and Malmö C 740000001 → 740000003 (740000001
 * is Stockholm C — Arlanda Express / Uppsala trains, not Øresund traffic at
 * all) inflated the hub's headline departures by +9.1% over 30 days and +46%
 * over 90, because the real data only starts 2026-08-06.
 */
export const MONITORED_STOP_IDS = ['740001586', '860000626', '740000003', '860000858'] as const;

const PUNCTUALITY_SQL = `SELECT date(sched_time) AS date, status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE stop_id IN (${MONITORED_STOP_IDS.map(() => '?').join(', ')}) AND sched_time >= ? AND sched_time < ? GROUP BY date(sched_time), status`;

/** One calendar day of punctuality stats, zero-filled when no departures. */
export interface PunctualityRow {
  date: string;
  total: number;
  on_time: number;
  delayed: number;
  canceled: number;
  on_time_pct: number;
  avg_delay_seconds: number | null;
}

/** Delay-% over time — the /api/transit/punctuality contract. */
export interface PunctualityStats {
  days: number;
  date_from: string;
  date_to: string;
  daily: PunctualityRow[];
}

/**
 * Daily delay-% over the last `days` calendar days (7|14|30, validated by the
 * caller). Same half-open [date_from, date_to + 1 day) range convention as
 * queryHistory; `now` is injectable so tests are deterministic. One row per
 * calendar day in the range, zero-filled — sparse early days render as zeros.
 */
export async function queryPunctuality(db: D1Like, days: number, now: Date = new Date()): Promise<PunctualityStats> {
  const to = localDateOnly(now);
  const from = addDaysStr(to, -(days - 1));
  const toExclusive = addDaysStr(to, 1);

  const { results } = await db
    .prepare(PUNCTUALITY_SQL)
    .bind(...MONITORED_STOP_IDS, from, toExclusive)
    .all<{ date: string; status: string | null; count: number; avg_delay: number | null }>();

  const daily: PunctualityRow[] = [];
  const byDate = new Map<string, PunctualityRow>();
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const entry: PunctualityRow = {
      date: d,
      total: 0,
      on_time: 0,
      delayed: 0,
      canceled: 0,
      on_time_pct: 0,
      avg_delay_seconds: null,
    };
    daily.push(entry);
    byDate.set(d, entry);
  }

  // Per-day rows keyed by status, for the weighted avg delay pass below.
  const rowsByDay = new Map<string, { count: number; avg_delay: number | null }[]>();
  for (const r of results) {
    const entry = byDate.get(r.date);
    if (!entry) continue;
    const rows = rowsByDay.get(r.date) ?? [];
    rows.push({ count: r.count, avg_delay: r.avg_delay });
    rowsByDay.set(r.date, rows);
    if (r.status === 'on_time') entry.on_time += r.count;
    else if (r.status === 'delayed') entry.delayed += r.count;
    else if (r.status === 'canceled') entry.canceled += r.count;
  }

  for (const entry of daily) {
    entry.total = entry.on_time + entry.delayed + entry.canceled;
    entry.on_time_pct = entry.total > 0 ? Math.round((entry.on_time / entry.total) * 1000) / 10 : 0;
    const rows = rowsByDay.get(entry.date) ?? [];
    const withAvg = rows.filter((r) => r.avg_delay != null);
    if (withAvg.length > 0) {
      entry.avg_delay_seconds = Math.round(
        withAvg.reduce((sum, r) => sum + r.count * (r.avg_delay ?? 0), 0) /
          withAvg.reduce((sum, r) => sum + r.count, 0),
      );
    }
  }

  return { days, date_from: from, date_to: to, daily };
}

/**
 * Per-line disruption history — the /api/transit/line/{line} contract. Like
 * queryHistory but filtered to one line: zero-filled daily counts (the chart
 * axis), a by-cause facet, and the most recent disruptions for the line (for
 * a server-rendered archive list). `now` is injectable so tests are
 * deterministic.
 */
export interface LineHistoryStats {
  line: string;
  days: number;
  date_from: string;
  date_to: string;
  total_disruptions: number;
  daily: HistoryStats['daily'];
  by_cause: { cause: string; count: number }[];
  recent: Disruption[];
}

const LINE_DAILY_SQL =
  'SELECT date(timestamp) AS date, type, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM disruptions WHERE line = ? AND timestamp >= ? AND timestamp < ? GROUP BY date(timestamp), type';
const LINE_CAUSE_SQL =
  'SELECT cause, COUNT(*) AS count FROM disruptions WHERE line = ? AND timestamp >= ? AND timestamp < ? GROUP BY cause ORDER BY count DESC';
const LINE_RECENT_SQL = 'SELECT * FROM disruptions WHERE line = ? ORDER BY timestamp DESC LIMIT ?';

const RECENT_DISRUPTIONS_LIMIT = 20;

export async function queryLineHistory(
  db: D1Like,
  line: string,
  days: number,
  now: Date = new Date(),
): Promise<LineHistoryStats> {
  const to = localDateOnly(now);
  const from = addDaysStr(to, -(days - 1));
  const toExclusive = addDaysStr(to, 1);

  const [dailyRows, causeRows, recentRows] = await Promise.all([
    db
      .prepare(LINE_DAILY_SQL)
      .bind(line, from, toExclusive)
      .all<{ date: string; type: string | null; count: number; avg_delay: number | null }>(),
    db.prepare(LINE_CAUSE_SQL).bind(line, from, toExclusive).all<{ cause: string | null; count: number }>(),
    db
      .prepare(LINE_RECENT_SQL)
      .bind(line, RECENT_DISRUPTIONS_LIMIT)
      .all<Disruption>(),
  ]);

  const daily: LineHistoryStats['daily'] = [];
  const byDate = new Map<string, LineHistoryStats['daily'][number]>();
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const entry = { date: d, count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null as number | null };
    daily.push(entry);
    byDate.set(d, entry);
  }
  const delaySum = new Map<string, { sum: number; n: number }>();
  for (const r of dailyRows.results) {
    const entry = byDate.get(r.date);
    if (!entry) continue;
    entry.count += r.count;
    if (r.type === 'cancellation') entry.cancellations += r.count;
    else if (r.type === 'delay') entry.delays += r.count;
    else if (r.type === 'alert') entry.alerts += r.count;
    if (r.avg_delay != null) {
      const acc = delaySum.get(r.date) ?? { sum: 0, n: 0 };
      acc.sum += r.count * r.avg_delay;
      acc.n += r.count;
      delaySum.set(r.date, acc);
    }
  }
  for (const entry of daily) {
    const acc = delaySum.get(entry.date);
    entry.avg_delay = acc && acc.n > 0 ? Math.round(acc.sum / acc.n) : null;
  }

  return {
    line,
    days,
    date_from: from,
    date_to: to,
    total_disruptions: daily.reduce((sum, e) => sum + e.count, 0),
    daily,
    by_cause: causeRows.results
      .map((r) => ({ cause: r.cause ?? 'unknown', count: r.count }))
      .sort((a, b) => b.count - a.count),
    recent: recentRows.results,
  };
}

/**
 * Distinct lines with disruption counts — discovery for /api/transit/lines.
 * `last_seen` is the last calendar day the line actually recorded a
 * disruption, which is the honest <lastmod> for its archive page (audit4
 * N-M3): a canonical line that never appears in the data has none, so the
 * sitemap can stop claiming it is freshly updated every day.
 */
export interface LineSummary {
  line: string;
  disruptions: number;
  /** "YYYY-MM-DD" of the newest disruption on the line, or null when it has none. */
  last_seen: string | null;
}

export function queryDistinctLines(db: D1Like, limit = 50): Promise<LineSummary[]> {
  return db
    .prepare(
      'SELECT line, COUNT(*) AS count, MAX(date(timestamp)) AS last_seen FROM disruptions WHERE line IS NOT NULL GROUP BY line ORDER BY count DESC LIMIT ?',
    )
    .bind(limit)
    .all<{ line: string; count: number; last_seen: string | null }>()
    .then(({ results }) =>
      results.map((r) => ({ line: r.line, disruptions: r.count, last_seen: r.last_seen ?? null })),
    );
}

/**
 * Per-station delay-% over time, filtered to one stop — the departure-side
 * companion to a station page (disruptions have no station column). Same
 * zero-filled daily shape as queryPunctuality, plus the period totals.
 */
export interface StationPunctuality {
  stop_id: string;
  days: number;
  date_from: string;
  date_to: string;
  total_departures: number;
  on_time_count: number;
  delayed_count: number;
  canceled_count: number;
  on_time_pct: number;
  avg_delay_seconds: number | null;
  daily: PunctualityRow[];
}

const STATION_PUNCTUALITY_SQL =
  'SELECT date(sched_time) AS date, status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE stop_id = ? AND sched_time >= ? AND sched_time < ? GROUP BY date(sched_time), status';

export async function queryStationPunctuality(
  db: D1Like,
  stopId: string,
  days: number,
  now: Date = new Date(),
): Promise<StationPunctuality> {
  const to = localDateOnly(now);
  const from = addDaysStr(to, -(days - 1));
  const toExclusive = addDaysStr(to, 1);

  const { results } = await db
    .prepare(STATION_PUNCTUALITY_SQL)
    .bind(stopId, from, toExclusive)
    .all<{ date: string; status: string | null; count: number; avg_delay: number | null }>();

  const daily: PunctualityRow[] = [];
  const byDate = new Map<string, PunctualityRow>();
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const entry: PunctualityRow = {
      date: d,
      total: 0,
      on_time: 0,
      delayed: 0,
      canceled: 0,
      on_time_pct: 0,
      avg_delay_seconds: null,
    };
    daily.push(entry);
    byDate.set(d, entry);
  }

  const rowsByDay = new Map<string, { count: number; avg_delay: number | null }[]>();
  for (const r of results) {
    const entry = byDate.get(r.date);
    if (!entry) continue;
    const rows = rowsByDay.get(r.date) ?? [];
    rows.push({ count: r.count, avg_delay: r.avg_delay });
    rowsByDay.set(r.date, rows);
    if (r.status === 'on_time') entry.on_time += r.count;
    else if (r.status === 'delayed') entry.delayed += r.count;
    else if (r.status === 'canceled') entry.canceled += r.count;
  }

  let on_time_count = 0;
  let delayed_count = 0;
  let canceled_count = 0;
  for (const entry of daily) {
    entry.total = entry.on_time + entry.delayed + entry.canceled;
    entry.on_time_pct = entry.total > 0 ? Math.round((entry.on_time / entry.total) * 1000) / 10 : 0;
    const rows = rowsByDay.get(entry.date) ?? [];
    const withAvg = rows.filter((r) => r.avg_delay != null);
    if (withAvg.length > 0) {
      entry.avg_delay_seconds = Math.round(
        withAvg.reduce((sum, r) => sum + r.count * (r.avg_delay ?? 0), 0) /
          withAvg.reduce((sum, r) => sum + r.count, 0),
      );
    }
    on_time_count += entry.on_time;
    delayed_count += entry.delayed;
    canceled_count += entry.canceled;
  }

  const total_departures = on_time_count + delayed_count + canceled_count;
  const withAvg = daily.filter((d) => d.avg_delay_seconds != null);
  const avg_delay_seconds =
    withAvg.length > 0
      ? Math.round(
          withAvg.reduce((sum, d) => sum + d.total * (d.avg_delay_seconds ?? 0), 0) /
            withAvg.reduce((sum, d) => sum + d.total, 0),
        )
      : null;

  return {
    stop_id: stopId,
    days,
    date_from: from,
    date_to: to,
    total_departures,
    on_time_count,
    delayed_count,
    canceled_count,
    on_time_pct: total_departures > 0 ? Math.round((on_time_count / total_departures) * 1000) / 10 : 0,
    avg_delay_seconds,
    daily,
  };
}

/**
 * The lines observed at one stop inside the window — the station page's
 * "lines serving this stop" cross-links. Derived from the departures table
 * (the only per-stop data the collector keeps), bounded like every other
 * window query so a line that stopped serving the stop ages out of the list.
 */
const STATION_LINES_SQL =
  'SELECT DISTINCT line FROM departures WHERE stop_id = ? AND line IS NOT NULL AND sched_time >= ? AND sched_time < ? ORDER BY line';

export async function queryStationLines(
  db: D1Like,
  stopId: string,
  days: number,
  now: Date = new Date(),
): Promise<string[]> {
  const to = localDateOnly(now);
  const from = addDaysStr(to, -(days - 1));
  const toExclusive = addDaysStr(to, 1);
  const { results } = await db
    .prepare(STATION_LINES_SQL)
    .bind(stopId, from, toExclusive)
    .all<{ line: string }>();
  return results.map((r) => r.line);
}

/**
 * The stops one line was observed at inside the window — the line page's
 * "stations on this line" cross-links. Returns raw stop ids; the caller maps
 * them onto the monitored stops it can build a page URL for.
 */
const LINE_STOPS_SQL =
  'SELECT DISTINCT stop_id FROM departures WHERE line = ? AND sched_time >= ? AND sched_time < ? ORDER BY stop_id';

export async function queryLineStops(
  db: D1Like,
  line: string,
  days: number,
  now: Date = new Date(),
): Promise<string[]> {
  const to = localDateOnly(now);
  const from = addDaysStr(to, -(days - 1));
  const toExclusive = addDaysStr(to, 1);
  const { results } = await db
    .prepare(LINE_STOPS_SQL)
    .bind(line, from, toExclusive)
    .all<{ stop_id: string }>();
  return results.map((r) => r.stop_id);
}

/** The recent-rows list on a station page, plus the clock it was read at. */
export interface RecentDepartures {
  rows: Departure[];
  /**
   * Naive local ISO stamp of the read (audit4 N-C1). Every returned row's
   * sched_time is <= this, and the stamp is what the page shows under the
   * "Latest observed departures" heading so a reader can tell how stale the
   * board is.
   */
  as_of: string;
}

const RECENT_DEPARTURES_SQL =
  'SELECT * FROM departures WHERE stop_id = ? AND sched_time <= ? ORDER BY sched_time DESC LIMIT ?';

/**
 * Recent departures observed at a stop — the recent-rows list on a station page.
 *
 * Bounded to sched_time <= now (audit4 N-C1): the collector ingests Trafiklab's
 * lookahead window, so the departures table holds rows for slots up to ~50 min
 * in the future and an unbounded `ORDER BY sched_time DESC` served them under an
 * "observed" heading. `<= now` is the tightest correct bound, and — unlike a
 * fixed now-3h..now window — it can never empty the table, because the LIMIT
 * walks back through the off-peak gap to the last slots that did run.
 */
export async function queryRecentDepartures(
  db: D1Like,
  stopId: string,
  limit: number,
  now: Date = new Date(),
): Promise<RecentDepartures> {
  const asOf = localIsoStamp(now);
  const { results } = await db
    .prepare(RECENT_DEPARTURES_SQL)
    .bind(stopId, asOf, limit)
    .all<Departure>();
  return { rows: results, as_of: asOf };
}
