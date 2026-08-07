import { describe, expect, it } from 'vitest';
import type { LiveStatus } from '@oresund/shared';
import hyllieRaw from './fixtures/hyllie-raw.json';
import kobenhavnHRaw from './fixtures/kobenhavn-h-raw.json';
import type { TrafiklabDeparture } from '@oresund/shared';
import { runScheduled, handleFetch, type Env, type FetchLike } from '../src/index.js';
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
    expect(depRow(db, '804_21:59_Østerport').status).toBe('canceled');
  });

  it('creates a delay disruption for a delay >= 600s', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, delay: 650 };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('delay');
    expect(rows[0]!.delay_seconds).toBe(650);
  });

  it('creates an alert disruption when the departure carries alerts', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, delay: 0, alerts: [{ title: 'Signalfel', text: 'Störning i tågtrafiken' }] };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const rows = disruptionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('alert');
    expect(rows[0]!.cause).toBe('signal_failure');
  });

  it('records an on-time departure with NO disruption row', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, delay: 0, canceled: false };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    const row = depRow(db, '804_21:59_Østerport');
    expect(row.status).toBe('on_time');
    expect(row.delay_seconds).toBe(0);
    expect(row.canceled).toBe(0);
    expect(disruptionRows(db)).toHaveLength(0);
  });

  it('records a sub-600s delay as delayed but without a disruption row', async () => {
    const db = new FakeD1();
    const dep = { ...realDeparture, delay: 299 };
    await runScheduled(env(db), fetchFor(hylliePayload([dep])), () => new Date('2026-08-06T12:00:00Z'));

    expect(depRow(db, '804_21:59_Østerport').status).toBe('delayed');
    expect(disruptionRows(db)).toHaveLength(0);
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
