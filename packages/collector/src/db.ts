/**
 * D1 persistence helpers for the collector worker. Pure SQL + mapping — no
 * network I/O, no environment access — so every function is testable against
 * a minimal fake (see test/fake-d1.ts). Mirrors the private monitor's
 * log_departure / log_disruption semantics.
 */
import type { Departure, Disruption, DelayStats, LineDelayStats, LiveStatus } from '@oresund/shared';

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
  'SELECT id, delay_seconds FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1';

/**
 * Log a disruption, deduplicated by dep_key within the same calendar day
 * (mirroring log_disruption in the private monitor): when the same scheduled
 * departure already has a disruption today, update it keeping the worse
 * (larger) delay plus the latest info; otherwise insert a fresh row.
 */
export async function logDisruption(db: D1Like, d: DisruptionInput): Promise<{ meta?: { changes?: number } }> {
  const existing = await db
    .prepare(EXISTING_DISRUPTION_SQL)
    .bind(d.dep_key, d.timestamp)
    .first<{ id: number; delay_seconds: number | null }>();

  if (existing) {
    const delay = Math.max(existing.delay_seconds ?? 0, d.delay_seconds ?? 0);
    return db
      .prepare(
        'UPDATE disruptions SET delay_seconds = ?, type = ?, severity = ?, cause = ?, raw_text = ?, last_updated = ? WHERE id = ?',
      )
      .bind(delay, d.type, d.severity, d.cause, d.raw_text, d.last_updated, existing.id)
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
  daily: { date: string; count: number; cancellations: number; delays: number; alerts: number }[];
  by_line: { line: string; count: number }[];
  by_cause: { cause: string; count: number }[];
  by_hour: { hour: number; count: number }[];
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

/** Add N calendar days to an ISO date string (DST-safe via UTC date math). */
function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

const HISTORY_DAILY_SQL =
  'SELECT date(timestamp) AS date, type, COUNT(*) AS count FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY date(timestamp), type';
const HISTORY_LINE_SQL =
  'SELECT line, COUNT(*) AS count FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY line ORDER BY count DESC';
const HISTORY_CAUSE_SQL =
  'SELECT cause, COUNT(*) AS count FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY cause ORDER BY count DESC';
const HISTORY_HOUR_SQL =
  "SELECT CAST(strftime('%H', timestamp) AS INTEGER) AS hour, COUNT(*) AS count FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY hour ORDER BY hour ASC";

export async function queryHistory(db: D1Like, days: number, now: Date = new Date()): Promise<HistoryStats> {
  const to = localDateOnly(now);
  const from = addDaysStr(to, -(days - 1));
  const toExclusive = addDaysStr(to, 1);

  const [dailyRows, lineRows, causeRows, hourRows] = await Promise.all([
    db.prepare(HISTORY_DAILY_SQL).bind(from, toExclusive).all<{ date: string; type: string | null; count: number }>(),
    db.prepare(HISTORY_LINE_SQL).bind(from, toExclusive).all<{ line: string | null; count: number }>(),
    db.prepare(HISTORY_CAUSE_SQL).bind(from, toExclusive).all<{ cause: string | null; count: number }>(),
    db.prepare(HISTORY_HOUR_SQL).bind(from, toExclusive).all<{ hour: number; count: number }>(),
  ]);

  // One entry per day in the range, zero-filled (charts need the full axis).
  const daily: HistoryStats['daily'] = [];
  const byDate = new Map<string, HistoryStats['daily'][number]>();
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const entry = { date: d, count: 0, cancellations: 0, delays: 0, alerts: 0 };
    daily.push(entry);
    byDate.set(d, entry);
  }
  for (const r of dailyRows.results) {
    const entry = byDate.get(r.date);
    if (!entry) continue;
    entry.count += r.count;
    if (r.type === 'cancellation') entry.cancellations += r.count;
    else if (r.type === 'delay') entry.delays += r.count;
    else if (r.type === 'alert') entry.alerts += r.count;
  }

  return {
    days,
    date_from: from,
    date_to: to,
    total_disruptions: daily.reduce((sum, e) => sum + e.count, 0),
    daily,
    by_line: lineRows.results
      .map((r) => ({ line: r.line ?? 'unknown', count: r.count }))
      .sort((a, b) => b.count - a.count),
    by_cause: causeRows.results
      .map((r) => ({ cause: r.cause ?? 'unknown', count: r.count }))
      .sort((a, b) => b.count - a.count),
    by_hour: hourRows.results.map((r) => ({ hour: r.hour, count: r.count })).sort((a, b) => a.hour - b.hour),
  };
}
