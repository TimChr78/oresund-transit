import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveStatus } from '@oresund/shared';
import hyllieRaw from './fixtures/hyllie-raw.json';
import kobenhavnHRaw from './fixtures/kobenhavn-h-raw.json';
import type { TrafiklabDeparture } from '@oresund/shared';
import { runScheduled, handleFetch, departureKey, type Env, type FetchLike } from '../src/index.js';
import { FakeD1 } from './fake-d1.js';

// Real fixture SiteIds (from the fixtures' query.query) — the same values the
// worker puts in the departures URL.
const HYLLIE_ID = '740001586';
const KBH_ID = '860000626';

/** Column order of the departures INSERT (see src/db.ts). */
const DEP_COLS = [
  'stop_id', 'stop_name', 'line', 'destination', 'sched_time', 'delay_seconds',
  'canceled', 'status', 'technical_number', 'dep_key', 'first_seen', 'last_updated',
];
const DIS_COLS = [
  'timestamp', 'line', 'type', 'cause', 'route_section', 'severity', 'delay_seconds',
  'raw_text', 'dep_key', 'first_seen', 'last_updated', 'direction', 'technical_number', 'sched_time',
];

function depRow(db: FakeD1, depKey: string): Record<string, unknown> {
  const call = db.callsMatching('INSERT INTO departures').find((c) => c.binds[9] === depKey);
  if (!call) throw new Error(`no departures INSERT for ${depKey}`);
  return Object.fromEntries(DEP_COLS.map((col, i) => [col, call.binds[i]]));
}

function disruptionRows(db: FakeD1): Record<string, unknown>[] {
  return db.callsMatching('INSERT INTO disruptions').map((c) =>
    Object.fromEntries(DIS_COLS.map((col, i) => [col, c.binds[i]])),
  );
}

function writtenStatus(db: FakeD1): LiveStatus {
  const snapshot = db.lastBindsFor('INSERT INTO live_status')[0];
  return JSON.parse(String(snapshot)) as LiveStatus;
}

/** Fake fetch serving canned API bodies keyed by stop SiteId. */
function fetchFor(stops: Record<string, unknown>): FetchLike {
  return async (url: string) => {
    for (const [id, body] of Object.entries(stops)) {
      if (url.includes(id)) return { ok: true, json: async () => body };
    }
    throw new Error(`unexpected fetch URL: ${url}`);
  };
}

function env(db: FakeD1): Env {
  return { DB: db, TRAFIKLAB_KEY: 'test-key' };
}

// The first Hyllie fixture departure — a real 804 train to Østerport that
// passes the isCrossborderTrain filter. Edge cases (cancellation, big delay)
// are derived from this real shape rather than invented.
const realDeparture = (hyllieRaw.departures as unknown as TrafiklabDeparture[])[0]!;

/** A canned API payload with a single departure for the Hyllie stop. */
function hylliePayload(departures: TrafiklabDeparture[]): Record<string, unknown> {
  return { '740001586': { departures }, '860000626': { departures: [] } };
}

describe('runScheduled — service shutdown detection', () => {
  it('flags service_shutdown = TRUE when 0 cross-border trains run in operating hours', async () => {
    const db = new FakeD1();
    // 12:00 UTC = 14:00 Europe/Stockholm — inside 06:00–22:00
    const now = new Date('2026-08-06T12:00:00Z');
    const status = await runScheduled(env(db), fetchFor({ '740001586': { departures: [] }, '860000626': { departures: [] } }), () => now);

    expect(status.service_shutdown).toBe(true);
    expect(status.status).toBe('red');
    expect(status.status_text).toBe('No cross-border service detected');
    expect(status.disruption_count).toBe(0);
    // snapshot is persisted for the dashboard
    expect(writtenStatus(db).service_shutdown).toBe(true);
  });

  it('does NOT flag shutdown when cross-border trains are present', async () => {
    const db = new FakeD1();
    // 19:59 UTC = 21:59 Europe/Stockholm (matches the fixture timestamps)
    const now = new Date('2026-08-06T19:59:00Z');
    const status = await runScheduled(env(db), fetchFor({ [HYLLIE_ID]: hyllieRaw, [KBH_ID]: kobenhavnHRaw }), () => now);

    expect(status.service_shutdown).toBe(false);
    // Hyllie: 4 trains to Denmark (804/803/802/804). København H: only the
    // 803→Hässleholm is Sweden-bound — note: the ported SWEDEN_DEST_KEYWORDS
    // list has no 'kristianstad', so 802→Kristianstad C is filtered out (a
    // known port-plan quirk, kept as-is).
    expect(status.departure_counts).toEqual({ to_denmark: 4, to_sweden: 1, bus: 0 });
    expect(status.directions.to_denmark).toContain('Østerport');
    expect(status.directions.to_sweden).toContain('Hässleholm');
  });

  it('does NOT flag shutdown outside operating hours even with 0 trains', async () => {
    const db = new FakeD1();
    // 22:30 UTC = 00:30 Europe/Stockholm (next day) — outside 06:00–22:00
    const now = new Date('2026-08-06T22:30:00Z');
    const status = await runScheduled(env(db), fetchFor({ '740001586': { departures: [] }, '860000626': { departures: [] } }), () => now);

    expect(status.service_shutdown).toBe(false);
    expect(status.status).toBe('green');
  });
});

describe('runScheduled — disruption classification', () => {
  it('creates a cancellation disruption for a canceled departure', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, canceled: true, delay: 0 };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('cancellation');
    expect(rows[0]!.dep_key).toBe('804_21:59_Østerport');
    expect(rows[0]!.direction).toBe('to_denmark');
    // the departure row itself is marked canceled
    expect(depRow(db, '2026-08-06_804_21:59_Østerport').status).toBe('canceled');
  });

  it('counts a keyword-cancelled departure (flag false) as canceled in the departures row too', async () => {
    // Trafiklab frequently reports cancellations via the alert text
    // ("Tåget är inställt …") while leaving the boolean `canceled` flag at
    // false. The disruption list already catches that via classifyType's
    // keyword fallback; the departures KPI must agree with it.
    const db = new FakeD1();
    const dep = {
      ...realDeparture,
      canceled: false,
      delay: 0,
      alerts: [{ title: 'Inställt tåg', text: 'Tåget är inställt København Østerport - Malmö C. Orsaken är signalfel.' }],
    };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    // 1. the departures INSERT carries status='canceled' and canceled=1
    const row = depRow(db, '2026-08-06_804_21:59_Østerport');
    expect(row.status).toBe('canceled');
    expect(row.canceled).toBe(1);

    // 2. the disruptions INSERT still classifies it as a cancellation
    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('cancellation');
  });

  it('creates a delay disruption for a delay >= 240s', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, delay: 240 };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('delay');
    expect(rows[0]!.delay_seconds).toBe(240);
  });

  it('prioritizes cancellation over delay when both a big delay and a cancellation keyword are present', async () => {
    const db = new FakeD1();
    const dep = {
      ...realDeparture,
      canceled: false,
      delay: 300,
      alerts: [{ title: 'Inställt tåg', text: 'Tåget är inställt København Østerport - Malmö C.' }],
    };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    // classifyType checks cancellation before the 240s delay threshold, so the
    // departure row lands in the canceled bucket — same as the disruption list.
    const row = depRow(db, '2026-08-06_804_21:59_Østerport');
    expect(row.status).toBe('canceled');
    expect(row.canceled).toBe(1);
    expect(disruptionRows(db)[0]!.type).toBe('cancellation');
  });

  it('still records a big delay with a keyword-free alert as delayed (not canceled)', async () => {
    const db = new FakeD1();
    const dep = {
      ...realDeparture,
      canceled: false,
      delay: 300,
      alerts: [{ title: 'Signalfel', text: 'Störning i tågtrafiken' }],
    };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    // No cancellation keyword → cancellation stays off; the 240s boundary still
    // decides the KPI status, and the disruption list calls it a delay.
    const row = depRow(db, '2026-08-06_804_21:59_Østerport');
    expect(row.status).toBe('delayed');
    expect(row.canceled).toBe(0);
    expect(disruptionRows(db)[0]!.type).toBe('delay');
  });

  it('creates an alert disruption when the departure carries alerts', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, delay: 0, alerts: [{ title: 'Signalfel', text: 'Störning i tågtrafiken' }] };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('alert');
    expect(rows[0]!.cause).toBe('signal_failure');
    // alert-only (no cancellation keyword) → KPI still sees it as on_time
    expect(depRow(db, '2026-08-06_804_21:59_Østerport').status).toBe('on_time');
  });

  it('records an on-time departure with NO disruption row', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, delay: 0, canceled: false };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const row = depRow(db, '2026-08-06_804_21:59_Østerport');
    expect(row.status).toBe('on_time');
    expect(row.delay_seconds).toBe(0);
    expect(row.canceled).toBe(0);
    expect(disruptionRows(db)).toHaveLength(0);
  });

  it('records a sub-240s delay as on_time with no disruption row', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, delay: 239 };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    expect(depRow(db, '2026-08-06_804_21:59_Østerport').status).toBe('on_time');
    expect(disruptionRows(db)).toHaveLength(0);
  });

  it('does NOT log a "resumed normal" notice with a stale sub-240s delay (count 0, green)', async () => {
    // Trafiklab follows a disruption with "Förseningar – Tågen kan köra normalt
    // igen" once service is back, but the delay field still carries a stale
    // value. Previously classifyType logged this as an alert/delay row and
    // buildLiveStatus counted it — the miscount this fix removes.
    const db = new FakeD1();
    const dep = {
      ...realDeparture,
      delay: 120,
      canceled: false,
      alerts: [{ title: 'Förseningar', text: 'Tågen kan köra normalt igen' }],
    };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    expect(disruptionRows(db)).toHaveLength(0);
    const status = writtenStatus(db);
    expect(status.disruption_count).toBe(0);
    expect(status.status).toBe('green');
    // the KPI already treated it as on time — list and count now agree
    expect(depRow(db, '2026-08-06_804_21:59_Østerport').status).toBe('on_time');
  });

  it('also filters the "kör normalt igen" variant and the exact D1 spellings', async () => {
    const db = new FakeD1();
    const dep = {
      ...realDeparture,
      delay: 90,
      canceled: false,
      alerts: [{ title: 'Förseningar - Tågen kan köra normalt igen', text: 'Tågen kör normalt igen' }],
    };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    expect(disruptionRows(db)).toHaveLength(0);
    expect(writtenStatus(db).disruption_count).toBe(0);
  });

  it('keeps a TRUE residual delay (>= 240s) even with a resumed-normal message', async () => {
    const db = new FakeD1();
    const dep = {
      ...realDeparture,
      delay: 300,
      canceled: false,
      alerts: [{ title: 'Förseningar', text: 'Tågen kan köra normalt igen' }],
    };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('delay');
    expect(rows[0]!.delay_seconds).toBe(300);
    expect(writtenStatus(db).status).toBe('amber');
  });

  it('does NOT filter a TEXT-classified cancellation (installt) with a resumed-normal message', async () => {
    // installt in text classifies as cancellation - must survive the all-clear filter even with delay<240
    const db = new FakeD1();
    const dep = { ...realDeparture, canceled: false, delay: 120, alerts: [{ title: 'Resumed - Tagen kan kora normalt igen', text: 'Taget ar installt - kan kora normalt igen' }] } as unknown as typeof realDeparture;
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));
    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('cancellation');
  });

  it('does NOT filter a canceled departure with a resumed-normal message', async () => {
    const db = new FakeD1();
    const dep = {
      ...realDeparture,
      delay: 0,
      canceled: true,
      alerts: [{ title: 'Förseningar', text: 'Tågen kan köra normalt igen' }],
    };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('cancellation');
  });
});

describe('handleFetch — API paths', () => {
  it('GET /health returns ok', async () => {
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/health'), env(db));
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe('ok');
  });

  it('GET /api/transit/live returns the stored snapshot', async () => {
    const db = new FakeD1();
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
    db.stubFirst('SELECT snapshot FROM live_status WHERE id = 1', { snapshot: JSON.stringify(status) });

    const res = await handleFetch(new Request('https://oresund.live/api/transit/live'), env(db));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(status);
  });

  it('GET /api/transit/live returns 503 before the first scheduled run', async () => {
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/api/transit/live'), env(db));
    expect(res.status).toBe(503);
  });

  it('GET /api/transit/delay-stats aggregates the departures table', async () => {
    const db = new FakeD1();
    db.stubAll(
      'SELECT status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE sched_time >= ? AND sched_time < ? GROUP BY status',
      [
        { status: 'on_time', count: 9, avg_delay: 5 },
        { status: 'delayed', count: 1, avg_delay: 650 },
      ],
    );
    db.stubAll(
      'SELECT line, status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE sched_time >= ? AND sched_time < ? GROUP BY line, status',
      [
        { line: '804', status: 'on_time', count: 9, avg_delay: 5 },
        { line: '804', status: 'delayed', count: 1, avg_delay: 650 },
      ],
    );

    const res = await handleFetch(
      new Request('https://oresund.live/api/transit/delay-stats?from=2026-08-06&to=2026-08-07'),
      env(db),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total_departures: number; on_time_pct: number };
    expect(body.total_departures).toBe(10);
    expect(body.on_time_pct).toBe(90);
  });

  it('GET /api/transit/delay-stats requires from and to', async () => {
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/api/transit/delay-stats'), env(db));
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown paths', async () => {
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/nope'), env(db));
    expect(res.status).toBe(404);
  });
});

describe('handleFetch — /api/transit/disruptions', () => {
  const LIST_SQL = 'SELECT * FROM disruptions ORDER BY timestamp DESC LIMIT ?';
  const LIST_FILTERED_SQL =
    'SELECT * FROM disruptions WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?';

  // Full disruption rows mirroring what the worker writes from the real
  // fixture data (dep_key, direction, technical_number from hyllie-raw.json).
  const rows = [
    {
      id: 2,
      timestamp: '2026-08-06T21:59:27',
      line: '804',
      type: 'delay',
      cause: 'signal_failure',
      route_section: null,
      severity: 'minor',
      delay_seconds: 650,
      raw_text: 'Signalfel',
      dep_key: '804_21:59_Østerport',
      first_seen: '2026-08-06T21:59:27',
      last_updated: '2026-08-06T21:59:27',
      direction: 'to_denmark',
      technical_number: '1143',
      sched_time: '2026-08-06T21:59:00',
    },
    {
      id: 1,
      timestamp: '2026-08-05T08:30:00',
      line: '803',
      type: 'cancellation',
      cause: null,
      route_section: null,
      severity: 'major',
      delay_seconds: 0,
      raw_text: null,
      dep_key: '803_08:30_Hässleholm',
      first_seen: '2026-08-05T08:30:00',
      last_updated: '2026-08-05T08:30:00',
      direction: 'to_sweden',
      technical_number: null,
      sched_time: '2026-08-05T08:30:00',
    },
  ];

  it('returns disruptions ordered newest-first with the full column set', async () => {
    const db = new FakeD1();
    db.stubAll(LIST_SQL, rows);

    const res = await handleFetch(new Request('https://oresund.live/api/transit/disruptions'), env(db));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ disruptions: rows });
    // ordering is guaranteed by the SQL, not by the response assembly
    expect(db.callsMatching('ORDER BY timestamp DESC')).toHaveLength(1);
  });

  it('defaults limit to 50', async () => {
    const db = new FakeD1();
    await handleFetch(new Request('https://oresund.live/api/transit/disruptions'), env(db));
    expect(db.lastBindsFor('LIMIT ?')).toEqual([50]);
  });

  it('applies an explicit limit and clamps above 200 to 200', async () => {
    const db = new FakeD1();
    await handleFetch(new Request('https://oresund.live/api/transit/disruptions?limit=50'), env(db));
    expect(db.lastBindsFor('LIMIT ?')).toEqual([50]);

    await handleFetch(new Request('https://oresund.live/api/transit/disruptions?limit=200'), env(db));
    expect(db.lastBindsFor('LIMIT ?')).toEqual([200]);

    await handleFetch(new Request('https://oresund.live/api/transit/disruptions?limit=500'), env(db));
    expect(db.lastBindsFor('LIMIT ?')).toEqual([200]);
  });

  it('filters by from/to when provided', async () => {
    const db = new FakeD1();
    db.stubAll(LIST_FILTERED_SQL, rows);

    const res = await handleFetch(
      new Request('https://oresund.live/api/transit/disruptions?from=2026-08-05&to=2026-08-07'),
      env(db),
    );
    expect(res.status).toBe(200);
    // [from, to) exclusive end, mirroring queryDelayStats
    expect(db.lastBindsFor('LIMIT ?')).toEqual(['2026-08-05', '2026-08-07', 50]);
    await expect(res.json()).resolves.toEqual({ disruptions: rows });
  });

  it('returns 400 for a non-positive-integer limit', async () => {
    for (const bad of ['abc', '0', '-3', '1.5']) {
      const db = new FakeD1();
      const res = await handleFetch(new Request(`https://oresund.live/api/transit/disruptions?limit=${bad}`), env(db));
      expect(res.status).toBe(400);
    }
  });
});

describe('handleFetch — /api/transit/history', () => {
  const DAILY_SQL =
    'SELECT date(timestamp) AS date, type, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY date(timestamp), type';
  const LINE_SQL =
    'SELECT line, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay, MAX(delay_seconds) AS max_delay FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY line ORDER BY count DESC';
  const CAUSE_SQL =
    'SELECT cause, COUNT(*) AS count FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY cause ORDER BY count DESC';
  const HOUR_SQL =
    "SELECT CAST(strftime('%H', timestamp) AS INTEGER) AS hour, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM disruptions WHERE timestamp >= ? AND timestamp < ? GROUP BY hour ORDER BY hour ASC";

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aggregates daily/by_line/by_cause/by_hour over the last 7 days', async () => {
    // 12:00 UTC = 14:00 Europe/Stockholm — date range 2026-07-31..2026-08-06
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
    const db = new FakeD1();
    db.stubAll(DAILY_SQL, [
      { date: '2026-08-06', type: 'delay', count: 3, avg_delay: 650 },
      { date: '2026-08-06', type: 'alert', count: 1, avg_delay: null },
      { date: '2026-08-05', type: 'cancellation', count: 1, avg_delay: 0 },
      { date: '2026-08-05', type: 'delay', count: 2, avg_delay: 300 },
    ]);
    db.stubAll(LINE_SQL, [
      { line: '804', count: 5, avg_delay: 260, max_delay: 650 },
      { line: null, count: 2, avg_delay: null, max_delay: null },
    ]);
    db.stubAll(CAUSE_SQL, [
      { cause: 'signal_failure', count: 4 },
      { cause: null, count: 3 },
    ]);
    db.stubAll(HOUR_SQL, [
      { hour: 21, count: 5, avg_delay: 260 },
      { hour: 7, count: 2, avg_delay: 120 },
    ]);

    const res = await handleFetch(new Request('https://oresund.live/api/transit/history?days=7'), env(db));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      days: 7,
      date_from: '2026-07-31',
      date_to: '2026-08-06',
      total_disruptions: 7,
      daily: [
        { date: '2026-07-31', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
        { date: '2026-08-01', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
        { date: '2026-08-02', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
        { date: '2026-08-03', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
        { date: '2026-08-04', count: 0, cancellations: 0, delays: 0, alerts: 0, avg_delay: null },
        { date: '2026-08-05', count: 3, cancellations: 1, delays: 2, alerts: 0, avg_delay: 200 },
        { date: '2026-08-06', count: 4, cancellations: 0, delays: 3, alerts: 1, avg_delay: 650 },
      ],
      by_line: [
        { line: '804', count: 5, avg_delay: 260, max_delay: 650 },
        { line: 'unknown', count: 2, avg_delay: null, max_delay: null },
      ],
      by_cause: [
        { cause: 'signal_failure', count: 4 },
        { cause: 'unknown', count: 3 },
      ],
      by_hour: [
        { hour: 7, count: 2, avg_delay: 120 },
        { hour: 21, count: 5, avg_delay: 260 },
      ],
    });
    // the range bound is [date_from, date_to + 1 day)
    expect(db.lastBindsFor('GROUP BY date(timestamp), type')).toEqual(['2026-07-31', '2026-08-07']);
  });

  it('defaults to 7 days when days is omitted', async () => {
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/api/transit/history'), env(db));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { days: number; date_from: string; date_to: string };
    expect(body.days).toBe(7);
    expect(body.date_from).toBe('2026-07-31');
    expect(body.date_to).toBe('2026-08-06');
  });

  it('returns 400 when days is not 7, 14 or 30', async () => {
    for (const bad of ['abc', '1', '365', '']) {
      const db = new FakeD1();
      const res = await handleFetch(new Request(`https://oresund.live/api/transit/history?days=${bad}`), env(db));
      expect(res.status).toBe(400);
    }
  });
});

describe('handleFetch — /api/transit/punctuality', () => {
  const PUNCT_SQL =
    'SELECT date(sched_time) AS date, status, COUNT(*) AS count, AVG(delay_seconds) AS avg_delay FROM departures WHERE sched_time >= ? AND sched_time < ? GROUP BY date(sched_time), status';

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns zero-filled daily punctuality rows over the last 7 days', async () => {
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
    const db = new FakeD1();
    db.stubAll(PUNCT_SQL, [
      { date: '2026-08-06', status: 'on_time', count: 9, avg_delay: 0 },
      { date: '2026-08-06', status: 'delayed', count: 1, avg_delay: 650 },
      { date: '2026-08-06', status: 'canceled', count: 1, avg_delay: 0 },
    ]);

    const res = await handleFetch(new Request('https://oresund.live/api/transit/punctuality?days=7'), env(db));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      days: number;
      date_from: string;
      date_to: string;
      daily: { date: string; total: number; on_time: number; delayed: number; canceled: number; on_time_pct: number }[];
    };
    expect(body.days).toBe(7);
    expect(body.date_from).toBe('2026-07-31');
    expect(body.date_to).toBe('2026-08-06');
    expect(body.daily).toHaveLength(7);
    expect(body.daily[0]).toEqual({
      date: '2026-07-31',
      total: 0,
      on_time: 0,
      delayed: 0,
      canceled: 0,
      on_time_pct: 0,
      avg_delay_seconds: null,
    });
    expect(body.daily[6]).toEqual({
      date: '2026-08-06',
      total: 11,
      on_time: 9,
      delayed: 1,
      canceled: 1,
      on_time_pct: 81.8,
      avg_delay_seconds: 59,
    });
    expect(db.lastBindsFor('GROUP BY date(sched_time), status')).toEqual(['2026-07-31', '2026-08-07']);
  });

  it('defaults to 7 days when days is omitted', async () => {
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/api/transit/punctuality'), env(db));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { days: number }).days).toBe(7);
  });

  it('returns 400 when days is not 7, 14 or 30', async () => {
    for (const bad of ['abc', '1', '365', '']) {
      const db = new FakeD1();
      const res = await handleFetch(new Request(`https://oresund.live/api/transit/punctuality?days=${bad}`), env(db));
      expect(res.status).toBe(400);
    }
  });
});

describe('handleFetch — CORS', () => {
  const corsHeaders: Record<string, string> = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
  };

  function expectCors(res: Response): void {
    for (const [name, value] of Object.entries(corsHeaders)) {
      expect(res.headers.get(name)).toBe(value);
    }
  }

  it('adds CORS headers to every response (200/400/404/503)', async () => {
    const db = new FakeD1();
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
    db.stubFirst('SELECT snapshot FROM live_status WHERE id = 1', { snapshot: JSON.stringify(status) });

    const paths: [string, number][] = [
      ['https://oresund.live/health', 200],
      ['https://oresund.live/api/transit/live', 200],
      ['https://oresund.live/api/transit/delay-stats?from=2026-08-06&to=2026-08-07', 200],
      ['https://oresund.live/api/transit/disruptions', 200],
      ['https://oresund.live/api/transit/history', 200],
      ['https://oresund.live/api/transit/punctuality?days=7', 200],
      ['https://oresund.live/api/transit/delay-stats', 400],
      ['https://oresund.live/nope', 404],
    ];
    for (const [path, expectedStatus] of paths) {
      const res = await handleFetch(new Request(path), env(db));
      expect(res.status, path).toBe(expectedStatus);
      expectCors(res);
    }

    // 503 — no live snapshot yet
    const db503 = new FakeD1();
    const res503 = await handleFetch(new Request('https://oresund.live/api/transit/live'), env(db503));
    expect(res503.status).toBe(503);
    expectCors(res503);
  });

  it('answers OPTIONS preflight with 204 and CORS headers', async () => {
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/api/transit/live', { method: 'OPTIONS' }), env(db));
    expect(res.status).toBe(204);
    expectCors(res);
    await expect(res.text()).resolves.toBe('');
  });
});

// 90-day window (KoDa backfill reach)
describe('handleFetch — 90-day window', () => {
  it('accepts days=90 on punctuality and history', async () => {
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/api/transit/punctuality?days=90'), env(db));
    expect(res.status).toBe(200);
    const res2 = await handleFetch(new Request('https://oresund.live/api/transit/history?days=90'), env(db));
    expect(res2.status).toBe(200);
  });

  it('rejects days=45', async () => {
    const db = new FakeD1();
    const res = await handleFetch(new Request('https://oresund.live/api/transit/punctuality?days=45'), env(db));
    expect(res.status).toBe(400);
  });
});

describe('departureKey — date-scoped (punctuality history fix)', () => {
  it('prefixes the departure key with the scheduled date', () => {
    const dep = {
      route: { designation: '804', direction: 'Østerport' },
      scheduled: '2026-08-07T10:59:00',
      delay: 0,
      canceled: false,
    } as unknown as Parameters<typeof departureKey>[0];
    expect(departureKey(dep)).toBe('2026-08-07_804_10:59_Østerport');
  });

  it('falls back to the date-less key when scheduled is missing', () => {
    const dep = { route: { designation: '804', direction: 'Østerport' } } as unknown as Parameters<typeof departureKey>[0];
    expect(departureKey(dep)).toBe('804_?_Østerport');
  });
});
