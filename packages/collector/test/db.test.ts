import { describe, expect, it } from 'vitest';
import type { Departure, Disruption, LiveStatus } from '@oresund/shared';
import {
  upsertDeparture,
  logDisruption,
  writeLiveStatus,
  readLiveStatus,
  queryDelayStats,
  queryPunctuality,
  queryRecentDepartures,
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
  const punctSql =
    'SELECT date(sched_time) AS date, status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE sched_time >= ? AND sched_time < ? GROUP BY date(sched_time), status';

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
    // the range bound is [date_from, date_to + 1 day)
    expect(db.lastBindsFor('GROUP BY date(sched_time), status')).toEqual(['2026-07-31', '2026-08-07']);
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
