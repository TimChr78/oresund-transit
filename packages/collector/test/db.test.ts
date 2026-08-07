import { describe, expect, it } from 'vitest';
import type { Departure, Disruption, LiveStatus } from '@oresund/shared';
import {
  upsertDeparture,
  logDisruption,
  writeLiveStatus,
  readLiveStatus,
  queryDelayStats,
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

    const sel = db.callsMatching('SELECT id, delay_seconds FROM disruptions')[0]!;
    expect(sel.sql).toContain('dep_key = ?');
    expect(sel.sql).toContain('date(timestamp) = date(?)');
    expect(sel.binds).toEqual(['804_21:59_Østerport', '2026-08-06T21:59:27']);
  });

  it('updates the existing row instead of inserting (dedup path)', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 300,
    });
    await logDisruption(db, { ...disruptionRow, delay_seconds: 100 });

    const update = db.callsMatching('UPDATE disruptions SET')[0]!;
    expect(update.sql).toContain('last_updated = ?');
    expect(update.sql).toContain('WHERE id = ?');
    expect(db.callsMatching('INSERT INTO disruptions')).toHaveLength(0);
  });

  it('keeps the worse (larger) delay when updating', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 600,
    });
    await logDisruption(db, { ...disruptionRow, delay_seconds: 300 });
    expect(db.lastBindsFor('UPDATE disruptions SET')[0]).toBe(600);

    const db2 = new FakeD1();
    db2.stubFirst('SELECT id, delay_seconds FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 300,
    });
    await logDisruption(db2, { ...disruptionRow, delay_seconds: 900 });
    expect(db2.lastBindsFor('UPDATE disruptions SET')[0]).toBe(900);
  });

  it('carries the latest info (type/severity/cause) on update', async () => {
    const db = new FakeD1();
    db.stubFirst('SELECT id, delay_seconds FROM disruptions WHERE dep_key = ? AND date(timestamp) = date(?) ORDER BY id DESC LIMIT 1', {
      id: 7,
      delay_seconds: 600,
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
