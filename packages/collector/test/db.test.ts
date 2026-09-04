import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Departure, Disruption, LiveStatus } from '@oresund/shared';
import {
  upsertDeparture,
  logDisruption,
  writeLiveStatus,
  readLiveStatus,
  queryDelayStats,
  queryPunctuality,
  queryRecentDepartures,
  queryStationPunctuality,
  MONITORED_STOP_IDS,
  type D1Like,
  type D1PreparedLike,
} from '../src/db.js';
import { FakeD1 } from './fake-d1.js';

/** A Departure row as produced by the worker (id is autoincrement in D1). */
type DepartureInput = Omit<Departure, 'id'>;
/** A Disruption row as produced by the worker (id is autoincrement in D1). */
type DisruptionInput = Omit<Disruption, 'id'>;

const depRow: DepartureInput = {
  stop_id: '740001586',
  stop_name: 'Malmö Hyllie',
  line: '804',
  destination: 'Østerport',
  sched_time: '2026-08-06T21:59:00',
  delay_seconds: 0,
  canceled: 0,
  status: 'on_time',
  technical_number: '1143',
  dep_key: '804_21:59_Østerport',
  first_seen: '2026-08-06T21:59:27',
  last_updated: '2026-08-06T21:59:27',
};

const disruptionRow: DisruptionInput = {
  timestamp: '2026-08-06T21:59:27',
  line: '804',
  type: 'delay',
  cause: 'unknown',
  route_section: null,
  severity: 'minor',
  delay_seconds: 650,
  raw_text: null,
  dep_key: '804_21:59_Østerport',
  first_seen: '2026-08-06T21:59:27',
  last_updated: '2026-08-06T21:59:27',
  direction: 'to_denmark',
  technical_number: '1143',
  sched_time: '2026-08-06T21:59:00',
};

describe('upsertDeparture', () => {
  it('inserts a new departure row with every column bound', async () => {
    const db = new FakeD1();
    await upsertDeparture(db, depRow);

    const call = db.callsMatching('INSERT INTO departures');
    expect(call).toHaveLength(1);
    const { sql, binds } = call[0]!;
    expect(sql).toContain('ON CONFLICT (stop_id, dep_key) DO UPDATE SET');
    expect(binds).toEqual([
      '740001586',
      'Malmö Hyllie',
      '804',
      'Østerport',
      '2026-08-06T21:59:00',
      0,
      0,
      'on_time',
      '1143',
      '804_21:59_Østerport',
      '2026-08-06T21:59:27',
      '2026-08-06T21:59:27',
    ]);
  });

  it('updates the live fields on conflict and keeps first_seen', async () => {
    const db = new FakeD1();
    await upsertDeparture(db, depRow);

    const { sql } = db.callsMatching('INSERT INTO departures')[0]!;
    const updateSet = sql.slice(sql.indexOf('DO UPDATE SET'));
    expect(updateSet).toContain('delay_seconds = excluded.delay_seconds');
    expect(updateSet).toContain('status = excluded.status');
    expect(updateSet).toContain('canceled = excluded.canceled');
    expect(updateSet).toContain('last_updated = excluded.last_updated');
    // first_seen records the original observation and must never be clobbered
    expect(updateSet).not.toContain('first_seen');
  });
});

describe('logDisruption', () => {
  it('inserts a disruption when no row exists for the same dep_key and day', async () => {
    const db = new FakeD1(); // no stubFirst → first() returns null
    await logDisruption(db, disruptionRow);

    const insert = db.callsMatching('INSERT INTO disruptions');
    expect(insert).toHaveLength(1);
    expect(insert[0]!.binds).toContain('804_21:59_Østerport');
    expect(insert[0]!.binds).toContain('delay');
    expect(db.callsMatching('UPDATE disruptions')).toHaveLength(0);
  });

  it('queries existing rows by dep_key and the same calendar day', async () => {
    const db = new FakeD1();
    await logDisruption(db, disruptionRow);

    const sel = db.callsMatching('SELECT id, delay_seconds, type FROM disruptions')[0]!;
    expect(sel.sql).toContain('dep_key = ?');
    expect(sel.sql).toContain('date(timestamp) = date(?)');
    expect(sel.binds).toEqual(['804_21:59_Østerport', '2026-08-06T21:59:27']);
  });

  it('updates the existing row instead of inserting (dedup path)', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds, type FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 300,
      type: 'delay',
    });
    await logDisruption(db, { ...disruptionRow, delay_seconds: 100 });

    const update = db.callsMatching('UPDATE disruptions SET')[0]!;
    expect(update.sql).toContain('last_updated = ?');
    expect(update.sql).toContain('WHERE id = ?');
    expect(db.callsMatching('INSERT INTO disruptions')).toHaveLength(0);
  });

  it('keeps the worse (larger) delay when updating', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds, type FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 600,
      type: 'delay',
    });
    await logDisruption(db, { ...disruptionRow, delay_seconds: 300 });
    expect(db.lastBindsFor('UPDATE disruptions SET')[0]).toBe(600);

    const db2 = new FakeD1();
    db2.stubFirst('SELECT id, delay_seconds, type FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 300,
      type: 'delay',
    });
    await logDisruption(db2, { ...disruptionRow, delay_seconds: 900 });
    expect(db2.lastBindsFor('UPDATE disruptions SET')[0]).toBe(900);
  });

  it('keeps the stickier (more severe) type when a later poll classifies weaker', async () => {
    // Regression (2026-08-11): Trafiklab resets delay fields late; a re-poll
    // classifies the same departure as alert while the worst delay is kept —
    // leaving type=alert with delay=1465s. The stronger type must survive.
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds, type FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 1465,
      type: 'delay',
    });
    await logDisruption(db, { ...disruptionRow, type: 'alert', delay_seconds: 0 });
    const binds = db.lastBindsFor('UPDATE disruptions SET');
    expect(binds[0]).toBe(1465); // worst delay kept
    expect(binds[1]).toBe('delay'); // type NOT downgraded to alert
  });

  it('upgrades the stored type when the incoming classification is stronger', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds, type FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 300,
      type: 'alert',
    });
    await logDisruption(db, { ...disruptionRow, type: 'cancellation', severity: 'major', delay_seconds: 0 });
    expect(db.lastBindsFor('UPDATE disruptions SET')[1]).toBe('cancellation');
  });

  it('keeps the incoming type on equal severity rank', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds, type FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 300,
      type: 'delay',
    });
    await logDisruption(db, { ...disruptionRow, type: 'delay', delay_seconds: 300 });
    expect(db.lastBindsFor('UPDATE disruptions SET')[1]).toBe('delay');
  });

  it('carries the latest info (type/severity/cause) on update', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds, type FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 600,
      type: 'delay',
    });
    await logDisruption(db, {
      ...disruptionRow,
      type: 'cancellation',
      severity: 'major',
      cause: 'signal_failure',
      delay_seconds: 300,
    });
    const update = db.lastBindsFor('UPDATE disruptions SET');
    expect(update).toEqual([
      600,
      'cancellation',
      'major',
      'signal_failure',
      null,
      '2026-08-06T21:59:27',
      7,
    ]);
  });
});

describe('writeLiveStatus / readLiveStatus', () => {
  const status: LiveStatus = {
    status: 'red',
    status_text: 'No cross-border service detected',
    timestamp: '2026-08-06T21:59:27',
    time_short: '21:59',
    disruption_count: 0,
    departure_counts: { to_denmark: 0, to_sweden: 0, bus: 0 },
    service_shutdown: true,
    directions: { to_denmark: [], to_sweden: [], bus: [] },
  };

  it('upserts the single live_status row (id = 1) with the JSON snapshot', async () => {
    const db = new FakeD1();
    await writeLiveStatus(db, status);

    const call = db.callsMatching('INSERT INTO live_status')[0]!;
    expect(call.sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(call.sql).toContain('VALUES (1, ?, ?)');
    expect(JSON.parse(String(call.binds[0]))).toEqual(status);
    expect(call.binds[1]).toBe('2026-08-06T21:59:27');
  });

  it('reads back the stored snapshot', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT snapshot FROM live_status WHERE id = 1', {
      snapshot: JSON.stringify(status),
    });
    await expect(readLiveStatus(db)).resolves.toEqual(status);
  });

  it('returns null when no snapshot has been written yet', async () => {
    const db = new FakeD1();
    await expect(readLiveStatus(db)).resolves.toBeNull();
  });
});

describe('queryDelayStats', () => {
  const statusSql =
    'SELECT status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE sched_time >= ? AND sched_time < ? GROUP BY status';
  const lineSql =
    'SELECT line, status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE sched_time >= ? AND sched_time < ? GROUP BY line, status';

  it('aggregates totals, percentages, average delay and per-line stats', async () => {
    const db = new FakeD1();
    db.stubAll(statusSql, [
      { status: 'on_time', count: 3, avg_delay: 10 },
      { status: 'delayed', count: 1, avg_delay: 650 },
      { status: 'canceled', count: 1, avg_delay: 0 },
    ]);
    db.stubAll(lineSql, [
      { line: '804', status: 'on_time', count: 2, avg_delay: 5 },
      { line: '804', status: 'delayed', count: 1, avg_delay: 650 },
      { line: '803', status: 'on_time', count: 1, avg_delay: 20 },
      { line: '802', status: 'canceled', count: 1, avg_delay: 0 },
    ]);

    const stats = await queryDelayStats(db, '2026-08-06', '2026-08-07');

    expect(stats.date_from).toBe('2026-08-06');
    expect(stats.date_to).toBe('2026-08-07');
    expect(stats.total_departures).toBe(5);
    expect(stats.on_time_count).toBe(3);
    expect(stats.delayed_count).toBe(1);
    expect(stats.canceled_count).toBe(1);
    expect(stats.on_time_pct).toBe(60);
    expect(stats.delayed_pct).toBe(20);
    expect(stats.canceled_pct).toBe(20);
    expect(stats.avg_delay_seconds).toBe(136); // (3*10 + 1*650 + 1*0) / 5
    expect(stats.by_line['804']).toEqual({ total: 3, on_time_pct: 66.7, delayed_pct: 33.3, avg_delay_seconds: 220 });
    expect(stats.by_line['803']).toEqual({ total: 1, on_time_pct: 100, delayed_pct: 0, avg_delay_seconds: 20 });
    expect(stats.by_line['802']).toEqual({ total: 1, on_time_pct: 0, delayed_pct: 0, avg_delay_seconds: 0 });
  });

  it('returns zeroed stats when no departures match', async () => {
    const db = new FakeD1();
    db.stubAll(statusSql, []);
    db.stubAll(lineSql, []);

    const stats = await queryDelayStats(db, '2026-08-06', '2026-08-07');
    expect(stats.total_departures).toBe(0);
    expect(stats.on_time_pct).toBe(0);
    expect(stats.avg_delay_seconds).toBeNull();
    expect(stats.by_line).toEqual({});
  });
});

describe('queryPunctuality', () => {
  // C1 (audit5): the corridor query is bounded to the monitored stops, so the
  // placeholder list is derived from MONITORED_STOP_IDS rather than restated.
  const punctSql = `SELECT date(sched_time) AS date, status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE stop_id IN (${MONITORED_STOP_IDS.map(() => '?').join(', ')}) AND sched_time >= ? AND sched_time < ? GROUP BY date(sched_time), status`;

  it('returns one zero-filled row per calendar day with on_time_pct math', async () => {
    const db = new FakeD1();
    db.stubAll(punctSql, [
      { date: '2026-08-06', status: 'on_time', count: 8, avg_delay: 0 },
      { date: '2026-08-06', status: 'delayed', count: 1, avg_delay: 650 },
      { date: '2026-08-06', status: 'canceled', count: 1, avg_delay: 0 },
      { date: '2026-08-05', status: 'delayed', count: 2, avg_delay: 300 },
    ]);

    const stats = await queryPunctuality(db, 7, new Date('2026-08-06T12:00:00Z'));

    expect(stats.days).toBe(7);
    expect(stats.date_from).toBe('2026-07-31');
    expect(stats.date_to).toBe('2026-08-06');
    expect(stats.daily).toHaveLength(7);
    // zero-filled day with no departures
    expect(stats.daily[0]).toEqual({
      date: '2026-07-31',
      total: 0,
      on_time: 0,
      delayed: 0,
      canceled: 0,
      on_time_pct: 0,
      avg_delay_seconds: null,
    });
    // 2026-08-05: only 2 delayed
    expect(stats.daily[5]).toEqual({
      date: '2026-08-05',
      total: 2,
      on_time: 0,
      delayed: 2,
      canceled: 0,
      on_time_pct: 0,
      avg_delay_seconds: 300,
    });
    // 2026-08-06: 8 + 1 + 1 = 10, on_time 8 -> 80%, weighted avg (8*0 + 650 + 0)/10
    expect(stats.daily[6]).toEqual({
      date: '2026-08-06',
      total: 10,
      on_time: 8,
      delayed: 1,
      canceled: 1,
      on_time_pct: 80,
      avg_delay_seconds: 65,
    });
    // the range bound is [date_from, date_to + 1 day), and the stop filter
    // binds the four monitored ids BEFORE the window (audit5 C1 — the corridor
    // query used to bind nothing but the window, so superseded stop ids leaked
    // into the /history hub's headline).
    expect(db.lastBindsFor('GROUP BY date(sched_time), status')).toEqual([
      ...MONITORED_STOP_IDS,
      '2026-07-31',
      '2026-08-07',
    ]);
  });

  it('rounds on_time_pct to one decimal and weights avg delay by count', async () => {
    const db = new FakeD1();
    db.stubAll(punctSql, [
      { date: '2026-08-06', status: 'on_time', count: 7, avg_delay: 0 },
      { date: '2026-08-06', status: 'delayed', count: 3, avg_delay: 600 },
    ]);

    const stats = await queryPunctuality(db, 7, new Date('2026-08-06T12:00:00Z'));
    const last = stats.daily[stats.daily.length - 1]!;
    expect(last.on_time_pct).toBe(70);
    expect(last.avg_delay_seconds).toBe(180); // (7*0 + 3*600) / 10
  });

  it('supports 14 and 30 day windows', async () => {
    const db = new FakeD1();
    const stats = await queryPunctuality(db, 30, new Date('2026-08-06T12:00:00Z'));
    expect(stats.daily).toHaveLength(30);
    expect(stats.date_from).toBe('2026-07-08');
    expect(stats.date_to).toBe('2026-08-06');
  });
});

// ---- C1 (audit5): corridor vs per-station reconciliation ----

/** The columns of `departures` the two punctuality queries read. */
interface StoredDeparture {
  stop_id: string;
  sched_time: string;
  status: string | null;
  delay_seconds: number;
}

/**
 * Evaluates the corridor and per-station punctuality SQL against ONE in-memory
 * table. FakeD1 keys its stubs on the exact SQL string, which cannot express
 * "the same rows seen through two different WHERE clauses" — and that shared
 * table is the whole point: the reconciliation invariant only means something
 * if both queries read the same data. The WHERE semantics (stop filter, the
 * half-open [from, to) window, GROUP BY date + status, COUNT/AVG) are applied
 * here so a query that loses its stop filter fails this test instead of
 * passing it.
 */
class ReconciliationD1 implements D1Like {
  constructor(readonly rows: StoredDeparture[]) {}

  prepare(sql: string): D1PreparedLike {
    return new ReconciliationPrepared(this, sql);
  }
}

class ReconciliationPrepared implements D1PreparedLike {
  private binds: unknown[] = [];

  constructor(
    private readonly fake: ReconciliationD1,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedLike {
    this.binds = values;
    return this;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (!this.sql.includes('GROUP BY date(sched_time), status')) {
      throw new Error(`ReconciliationD1 only evaluates the punctuality queries, got: ${this.sql}`);
    }
    // The corridor query binds its stop ids then the window; the station query
    // binds one id then the window. Arity is derived from the SQL, so a query
    // that stops binding stop ids cannot quietly degrade into "whole table".
    let stopIds: string[];
    let from: string;
    let to: string;
    if (this.sql.includes('stop_id IN (')) {
      if (this.binds.length < 4) throw new Error(`corridor query bound no stop ids: ${this.binds.length} binds`);
      const split = this.binds.length - 2;
      stopIds = this.binds.slice(0, split).map(String);
      from = String(this.binds[split]);
      to = String(this.binds[split + 1]);
    } else if (this.sql.includes('stop_id = ?')) {
      if (this.binds.length !== 3) throw new Error(`station query expected 3 binds, got ${this.binds.length}`);
      stopIds = [String(this.binds[0])];
      from = String(this.binds[1]);
      to = String(this.binds[2]);
    } else {
      throw new Error(`punctuality SQL has no stop filter (audit5 C1 regression): ${this.sql}`);
    }

    const groups = new Map<string, { date: string; status: string | null; count: number; sum: number }>();
    for (const row of this.fake.rows) {
      // TEXT comparison, as in SQLite — sched_time is stored as a naive local
      // stamp, so the date prefix and the half-open window compare correctly.
      if (!stopIds.includes(row.stop_id)) continue;
      if (row.sched_time < from || row.sched_time >= to) continue;
      const date = row.sched_time.slice(0, 10);
      const key = `${date}|${row.status ?? ''}`;
      const entry = groups.get(key) ?? { date, status: row.status, count: 0, sum: 0 };
      entry.count += 1;
      entry.sum += row.delay_seconds;
      groups.set(key, entry);
    }
    const results = [...groups.values()]
      .map((g) => ({
        date: g.date,
        status: g.status,
        count: g.count,
        avg_delay: g.count > 0 ? g.sum / g.count : null,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.status ?? '') < (b.status ?? '') ? -1 : 1));
    return { results: results as T[] };
  }

  async first<T>(): Promise<T | null> {
    throw new Error('ReconciliationD1 does not implement first()');
  }

  async run(): Promise<{ meta?: { changes?: number } }> {
    throw new Error('ReconciliationD1 does not implement run()');
  }
}

describe('corridor vs station reconciliation (audit5 C1)', () => {
  const NOW = new Date('2026-08-24T12:00:00Z');

  /**
   * Departures across the four monitored stops plus the two superseded ids the
   * stop-id correction windows left behind. 840004349 is the old Kastrup id;
   * 740000001 is Stockholm C, so those rows are a different station's traffic
   * entirely and must never reach the corridor total.
   */
  const rows: StoredDeparture[] = [
    // Malmö Hyllie 740001586
    ...buildDay('740001586', '2026-08-20', 8, 1, 1),
    ...buildDay('740001586', '2026-08-21', 6, 2, 0),
    // København H 860000626
    ...buildDay('860000626', '2026-08-20', 5, 1, 0),
    ...buildDay('860000626', '2026-08-21', 7, 0, 1),
    // Malmö C 740000003
    ...buildDay('740000003', '2026-08-20', 4, 0, 0),
    ...buildDay('740000003', '2026-08-21', 9, 1, 1),
    // Kastrup 860000858
    ...buildDay('860000858', '2026-08-20', 3, 1, 0),
    // ghost rows — superseded ids, inside the same window
    ...buildDay('840004349', '2026-08-20', 40, 10, 5),
    ...buildDay('740000001', '2026-08-21', 55, 12, 3),
    // ghost rows — outside the window, to prove the window bound still holds
    ...buildDay('740001586', '2026-08-01', 30, 0, 0),
  ];

  /** One day at one stop: `onTime` on-time, `delayed` delayed, `canceled` canceled. */
  function buildDay(stopId: string, date: string, onTime: number, delayed: number, canceled: number): StoredDeparture[] {
    const out: StoredDeparture[] = [];
    const push = (status: string | null, delay: number, slot: number) =>
      out.push({ stop_id: stopId, sched_time: `${date}T06:${String(10 + slot).padStart(2, '0')}:00`, status, delay_seconds: delay });
    for (let i = 0; i < onTime; i++) push('on_time', 0, i % 40);
    for (let i = 0; i < delayed; i++) push('delayed', 300 + i * 10, (i + 1) % 40);
    for (let i = 0; i < canceled; i++) push('canceled', 0, (i + 2) % 40);
    return out;
  }

  it('aggregates the corridor to exactly the sum of the four stations', async () => {
    const db = new ReconciliationD1(rows);

    const corridor = await queryPunctuality(db, 7, NOW);
    const stations = await Promise.all(MONITORED_STOP_IDS.map((id) => queryStationPunctuality(db, id, 7, NOW)));

    const corridorTotal = corridor.daily.reduce((sum, day) => sum + day.total, 0);
    const stationTotals = stations.map((s) => s.total_departures);

    // The invariant the /history hub's headline rests on: the hub says "what
    // the four monitored stations recorded together", so its number must be
    // their sum — not the table's row count.
    expect(corridorTotal).toBe(stationTotals.reduce((sum, n) => sum + n, 0));

    // ...and per status, not just in aggregate.
    const corridorStatus = (pick: (d: (typeof corridor.daily)[number]) => number) =>
      corridor.daily.reduce((sum, day) => sum + pick(day), 0);
    expect(corridorStatus((d) => d.on_time)).toBe(stations.reduce((sum, s) => sum + s.on_time_count, 0));
    expect(corridorStatus((d) => d.delayed)).toBe(stations.reduce((sum, s) => sum + s.delayed_count, 0));
    expect(corridorStatus((d) => d.canceled)).toBe(stations.reduce((sum, s) => sum + s.canceled_count, 0));

    // 51 monitored departures in the window (42 on time / 6 delayed / 3
    // canceled) — the 125 ghost rows at 840004349 + 740000001 and the
    // out-of-window day at Hyllie add nothing.
    expect(corridorTotal).toBe(51);
    expect(stationTotals).toEqual([18, 14, 15, 4]);
    expect(corridorStatus((d) => d.on_time)).toBe(42);
  });

  it('excludes rows at stop ids outside the monitored set', async () => {
    const db = new ReconciliationD1(rows);
    const corridor = await queryPunctuality(db, 7, NOW);
    for (const day of corridor.daily) {
      expect(day.total, day.date).toBeLessThanOrEqual(51);
    }
  });
});

describe('purge migration 0003 (audit5 C1)', () => {
  const migration = readFileSync(new URL('../migrations/0003_purge_superseded_stop_ids.sql', import.meta.url), 'utf8');

  it('deletes exactly the rows at stop ids outside the monitored set', () => {
    const ids = [...migration.matchAll(/'(\d+)'/g)].map((m) => m[1]);
    expect(migration).toMatch(/^DELETE FROM departures WHERE stop_id NOT IN/m);
    // The purge and the read-side filter must name the same stops, or the
    // historical window and the live aggregate disagree again.
    expect([...new Set(ids)]).toEqual([...MONITORED_STOP_IDS]);
  });
});

describe('queryRecentDepartures', () => {
  const recentSql =
    'SELECT * FROM departures WHERE stop_id = ? AND sched_time <= ? ORDER BY sched_time DESC LIMIT ?';

  it('bounds the query to already-observed slots and stamps the read (audit4 N-C1)', async () => {
    const db = new FakeD1();
    db.stubAll(recentSql, [{ stop_id: '740001586', sched_time: '2026-08-06T13:59:00' }]);

    const recent = await queryRecentDepartures(db, '740001586', 20, new Date('2026-08-06T12:00:00Z'));

    expect(recent.rows).toEqual([{ stop_id: '740001586', sched_time: '2026-08-06T13:59:00' }]);
    // Naive local (Europe/Stockholm, UTC+2 in August) — the format sched_time
    // itself is stored in, so the two compare lexicographically in SQL.
    expect(recent.as_of).toBe('2026-08-06T14:00:00');
    // (stop_id, as_of, limit) — the second bind is what keeps future slots out.
    expect(db.lastBindsFor('AND sched_time <= ?')).toEqual(['740001586', '2026-08-06T14:00:00', 20]);
  });

  it('stamps the read with the injectable clock, not the wall clock', async () => {
    const db = new FakeD1();
    db.stubAll(recentSql, []);

    const recent = await queryRecentDepartures(db, '860000626', 5, new Date('2026-01-15T22:30:00Z'));

    // January = CET (UTC+1), so the same instant stamps as 23:30 local.
    expect(recent.as_of).toBe('2026-01-15T23:30:00');
    expect(db.lastBindsFor('AND sched_time <= ?')).toEqual(['860000626', '2026-01-15T23:30:00', 5]);
  });
});
