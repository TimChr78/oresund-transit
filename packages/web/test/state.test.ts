import { describe, expect, it } from 'vitest';
import type { DelayStats, Disruption, LiveStatus } from '@oresund/shared';
import { createInitialState, reducer, type Action, type AppState } from '../src/state';
import type { HistoryResponse, PunctualityResponse, StationResponse } from '../src/api';
import type { StationScope } from '../src/components/StationPicker';

const LIVE: LiveStatus = {
  status: 'amber',
  status_text: 'Delays',
  timestamp: '2026-08-06T21:59:27',
  time_short: '21:59',
  disruption_count: 1,
  departure_counts: { to_denmark: 7, to_sweden: 5, bus: 0 },
  service_shutdown: false,
  directions: { to_denmark: ['Østerport'], to_sweden: ['Malmö'], bus: [] },
};

const STATS: DelayStats = {
  date_from: '2026-08-06',
  date_to: '2026-08-06',
  total_departures: 12,
  on_time_count: 10,
  delayed_count: 1,
  canceled_count: 1,
  on_time_pct: 83.3,
  delayed_pct: 8.3,
  canceled_pct: 8.3,
  avg_delay_seconds: 90,
  by_line: {},
};

const DISRUPTION: Disruption = {
  id: 1,
  timestamp: '2026-08-06T21:59:27',
  line: '801',
  type: 'delay',
  cause: 'Signalfel',
  route_section: null,
  severity: 'moderate',
  delay_seconds: 240,
  raw_text: null,
  dep_key: null,
  first_seen: null,
  last_updated: null,
  direction: 'to_denmark',
  technical_number: null,
  sched_time: null,
};

const HISTORY: HistoryResponse = {
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  total_disruptions: 1,
  daily: [{ date: '2026-08-06', count: 1, cancellations: 0, delays: 1, alerts: 0, avg_delay: 240 }],
  by_line: [{ line: '801', count: 1, avg_delay: 240, max_delay: 240 }],
  by_cause: [{ cause: 'Signalfel', count: 1 }],
  by_hour: [{ hour: 21, count: 1, avg_delay: 240 }],
};

const PUNCTUALITY: PunctualityResponse = {
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  daily: [
    { date: '2026-08-06', total: 10, on_time: 9, delayed: 1, canceled: 0, on_time_pct: 90, avg_delay_seconds: 65 },
  ],
};

/** Run actions in order, the way boot()'s dispatch does. */
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reducer, state);

describe('app state reducer', () => {
  it('starts with direction all, dayRange 7, no data, liveState loading', () => {
    const s = createInitialState();
    expect(s.direction).toBe('all');
    expect(s.dayRange).toBe(7);
    expect(s.live).toBeNull();
    expect(s.liveState).toBe('loading');
    expect(s.liveError).toBeNull();
    expect(s.stats).toBeNull();
    expect(s.history).toBeNull();
    expect(s.punctuality).toBeNull();
    expect(s.punctualityError).toBeNull();
    expect(s.disruptions).toEqual([]);
    expect(s.lastRefresh).toBe(0);
    // audit4 N-M11: no section has a request in flight until one starts.
    for (const key of [
      'liveRequestId',
      'statsRequestId',
      'disruptionsRequestId',
      'historyRequestId',
      'heatmapHistoryRequestId',
      'punctualityRequestId',
    ] as const) {
      expect(s[key], key).toBeNull();
    }
  });

  it('SET_DIRECTION changes the filter and leaves data intact', () => {
    const s = run(createInitialState(), { type: 'LIVE_START', id: 1 }, { type: 'LIVE_OK', id: 1, live: LIVE, at: 1000 });
    const next = reducer(s, { type: 'SET_DIRECTION', direction: 'to_denmark' });
    expect(next.direction).toBe('to_denmark');
    expect(next.live).toBe(LIVE);
  });

  it('SET_DAY_RANGE sets the range and clears history + stats + punctuality for refetch', () => {
    const s = run(
      createInitialState(),
      { type: 'HISTORY_START', id: 1 },
      { type: 'HISTORY_OK', id: 1, history: HISTORY },
      { type: 'STATS_START', id: 2 },
      { type: 'STATS_OK', id: 2, stats: STATS },
      { type: 'PUNCTUALITY_START', id: 3 },
      { type: 'PUNCTUALITY_OK', id: 3, punctuality: PUNCTUALITY },
    );
    const next = reducer(s, { type: 'SET_DAY_RANGE', dayRange: 14 });
    expect(next.dayRange).toBe(14);
    expect(next.history).toBeNull();
    expect(next.stats).toBeNull();
    expect(next.punctuality).toBeNull();
    expect(next.punctualityError).toBeNull();
  });

  it('LIVE_OK stores the snapshot and records the refresh time', () => {
    const s = run(createInitialState(), { type: 'LIVE_START', id: 7 }, { type: 'LIVE_OK', id: 7, live: LIVE, at: 12345 });
    expect(s.live).toBe(LIVE);
    expect(s.liveState).toBe('ok');
    expect(s.liveError).toBeNull();
    expect(s.lastRefresh).toBe(12345);
  });

  it('LIVE_NO_DATA marks the empty state instead of an error', () => {
    const s = run(createInitialState(), { type: 'LIVE_START', id: 1 }, { type: 'LIVE_NO_DATA', id: 1, at: 10 });
    expect(s.liveState).toBe('no_data');
    expect(s.live).toBeNull();
    expect(s.liveError).toBeNull();
  });

  it('LIVE_ERROR keeps existing live data (per-section errors do not blank the page)', () => {
    const s = run(
      createInitialState(),
      { type: 'LIVE_START', id: 1 },
      { type: 'LIVE_OK', id: 1, live: LIVE, at: 1 },
      { type: 'LIVE_START', id: 2 },
      { type: 'LIVE_ERROR', id: 2, message: 'boom' },
    );
    expect(s.live).toBe(LIVE);
    expect(s.liveState).toBe('error');
    expect(s.liveError).toBe('boom');
  });

  it('LIVE_ERROR without data marks the section errored', () => {
    const s = run(createInitialState(), { type: 'LIVE_START', id: 1 }, { type: 'LIVE_ERROR', id: 1, message: 'boom' });
    expect(s.liveState).toBe('error');
    expect(s.live).toBeNull();
  });

  it('HISTORY_OK populates history and clears the error', () => {
    const s = run(
      createInitialState(),
      { type: 'HISTORY_START', id: 1 },
      { type: 'HISTORY_ERROR', id: 1, message: 'boom' },
      { type: 'HISTORY_START', id: 2 },
      { type: 'HISTORY_OK', id: 2, history: HISTORY },
    );
    expect(s.history).toBe(HISTORY);
    expect(s.historyError).toBeNull();
  });

  it('DISRUPTIONS_OK replaces the disruption list and marks the section ok', () => {
    const s = run(
      createInitialState(),
      { type: 'DISRUPTIONS_START', id: 1 },
      { type: 'DISRUPTIONS_OK', id: 1, disruptions: [DISRUPTION] },
    );
    expect(s.disruptions).toEqual([DISRUPTION]);
    expect(s.disruptionsState).toBe('ok');
    expect(s.disruptionsError).toBeNull();
  });

  it('DISRUPTIONS_ERROR marks the section errored and keeps prior data', () => {
    const s = run(
      createInitialState(),
      { type: 'DISRUPTIONS_START', id: 1 },
      { type: 'DISRUPTIONS_OK', id: 1, disruptions: [DISRUPTION] },
      { type: 'DISRUPTIONS_START', id: 2 },
      { type: 'DISRUPTIONS_ERROR', id: 2, message: 'boom' },
    );
    expect(s.disruptionsState).toBe('error');
    expect(s.disruptions).toEqual([DISRUPTION]);
  });

  it('STATS_OK populates stats and clears the error', () => {
    const s = run(
      createInitialState(),
      { type: 'STATS_START', id: 1 },
      { type: 'STATS_ERROR', id: 1, message: 'boom' },
      { type: 'STATS_START', id: 2 },
      { type: 'STATS_OK', id: 2, stats: STATS },
    );
    expect(s.stats).toBe(STATS);
    expect(s.statsError).toBeNull();
  });

  it('PUNCTUALITY_OK populates punctuality and clears the error', () => {
    const s = run(
      createInitialState(),
      { type: 'PUNCTUALITY_START', id: 1 },
      { type: 'PUNCTUALITY_ERROR', id: 1, message: 'boom' },
      { type: 'PUNCTUALITY_START', id: 2 },
      { type: 'PUNCTUALITY_OK', id: 2, punctuality: PUNCTUALITY },
    );
    expect(s.punctuality).toBe(PUNCTUALITY);
    expect(s.punctualityError).toBeNull();
  });

  it('PUNCTUALITY_ERROR marks the error and keeps prior data', () => {
    const s = run(
      createInitialState(),
      { type: 'PUNCTUALITY_START', id: 1 },
      { type: 'PUNCTUALITY_OK', id: 1, punctuality: PUNCTUALITY },
      { type: 'PUNCTUALITY_START', id: 2 },
      { type: 'PUNCTUALITY_ERROR', id: 2, message: 'boom' },
    );
    expect(s.punctuality).toBe(PUNCTUALITY);
    expect(s.punctualityError).toBe('boom');
  });

  it('starts with no heatmap baseline', () => {
    const s = createInitialState();
    expect(s.heatmapHistory).toBeNull();
    expect(s.heatmapError).toBeNull();
  });

  it('HEATMAP_HISTORY_OK stores the 30-day baseline and clears its error', () => {
    const s = run(
      createInitialState(),
      { type: 'HEATMAP_HISTORY_START', id: 1 },
      { type: 'HEATMAP_HISTORY_ERROR', id: 1, message: 'boom' },
      { type: 'HEATMAP_HISTORY_START', id: 2 },
      { type: 'HEATMAP_HISTORY_OK', id: 2, history: HISTORY },
    );
    expect(s.heatmapHistory).toBe(HISTORY);
    expect(s.heatmapError).toBeNull();
  });

  it('SET_DAY_RANGE does NOT clear the heatmap baseline (stable 30-day window)', () => {
    const s = run(
      createInitialState(),
      { type: 'HEATMAP_HISTORY_START', id: 1 },
      { type: 'HEATMAP_HISTORY_OK', id: 1, history: HISTORY },
    );
    const next = reducer(s, { type: 'SET_DAY_RANGE', dayRange: 90 });
    expect(next.heatmapHistory).toBe(HISTORY);
    expect(next.history).toBeNull();
  });
});

describe('disruptionsMode', () => {
  it('starts in today mode', () => {
    expect(createInitialState().disruptionsMode).toBe('today');
  });

  it('SET_DISRUPTIONS_MODE switches to archive and back', () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: 'SET_DISRUPTIONS_MODE', mode: 'archive' });
    expect(s1.disruptionsMode).toBe('archive');
    expect(s1.disruptionsState).toBe('loading');
    const s2 = reducer(s1, { type: 'SET_DISRUPTIONS_MODE', mode: 'today' });
    expect(s2.disruptionsMode).toBe('today');
  });

  it('DISRUPTIONS_OK preserves the current mode', () => {
    const s1 = reducer(createInitialState(), { type: 'SET_DISRUPTIONS_MODE', mode: 'archive' });
    const s2 = reducer(s1, { type: 'DISRUPTIONS_START', id: 1 });
    const s3 = reducer(s2, { type: 'DISRUPTIONS_OK', id: 1, disruptions: [] });
    expect(s3.disruptionsMode).toBe('archive');
    expect(s3.disruptionsState).toBe('ok');
  });
});

describe('request identity on every board fetch (audit4 N-M11)', () => {
  /** A section's fetch as main.ts runs it: START, then the reply. */
  const load = (id: number): Action[] => [
    { type: 'HISTORY_START', id },
    { type: 'HISTORY_OK', id, history: HISTORY },
  ];

  it('applies a reply while its request is the current one', () => {
    const s = run(createInitialState(), ...load(1));
    expect(s.history).toBe(HISTORY);
    expect(s.historyRequestId).toBe(1);
  });

  it('drops a reply for a day range the visitor has already left', () => {
    // 7-day request in flight, the visitor switches to 30, then the 7-day
    // reply lands: neither the data nor the failure may show.
    let s = run(createInitialState(), { type: 'HISTORY_START', id: 1 });
    s = reducer(s, { type: 'SET_DAY_RANGE', dayRange: 30 });
    s = reducer(s, { type: 'HISTORY_OK', id: 1, history: HISTORY });
    expect(s.history).toBeNull();
    expect(s.dayRange).toBe(30);
    s = reducer(s, { type: 'HISTORY_ERROR', id: 1, message: 'boom' });
    expect(s.historyError).toBeNull();
    // The range's own reply still lands.
    s = run(s, { type: 'HISTORY_START', id: 2 }, { type: 'HISTORY_OK', id: 2, history: HISTORY });
    expect(s.history).toBe(HISTORY);
  });

  it('keeps a slow stats reply from overwriting a newer one of the same section', () => {
    const newer = { ...STATS, total_departures: 99 };
    let s = run(
      createInitialState(),
      { type: 'STATS_START', id: 1 },
      { type: 'STATS_START', id: 2 },
      { type: 'STATS_OK', id: 2, stats: newer },
    );
    expect(s.stats).toBe(newer);
    s = reducer(s, { type: 'STATS_OK', id: 1, stats: STATS });
    expect(s.stats).toBe(newer);
    // …and a stale failure cannot mark a healthy section errored either.
    s = reducer(s, { type: 'STATS_ERROR', id: 1, message: 'boom' });
    expect(s.statsError).toBeNull();
    expect(s.stats).toBe(newer);
  });

  it('drops a punctuality reply that belongs to the previous range', () => {
    let s = run(createInitialState(), { type: 'PUNCTUALITY_START', id: 1 });
    s = reducer(s, { type: 'SET_DAY_RANGE', dayRange: 90 });
    s = reducer(s, { type: 'PUNCTUALITY_OK', id: 1, punctuality: PUNCTUALITY });
    expect(s.punctuality).toBeNull();
    expect(s.punctualityRequestId).toBeNull();
  });

  it('drops a disruption list fetched for the other mode', () => {
    let s = run(createInitialState(), { type: 'DISRUPTIONS_START', id: 1 });
    s = reducer(s, { type: 'SET_DISRUPTIONS_MODE', mode: 'archive' });
    s = reducer(s, { type: 'DISRUPTIONS_OK', id: 1, disruptions: [DISRUPTION] });
    expect(s.disruptions).toEqual([]);
    expect(s.disruptionsState).toBe('loading');
    expect(s.disruptionsRequestId).toBeNull();
    // The archive list itself still lands.
    s = run(s, { type: 'DISRUPTIONS_START', id: 2 }, { type: 'DISRUPTIONS_OK', id: 2, disruptions: [DISRUPTION] });
    expect(s.disruptions).toEqual([DISRUPTION]);
    expect(s.disruptionsState).toBe('ok');
  });

  it('a second LIVE_START supersedes the first, whose reply is then stale', () => {
    let s = run(createInitialState(), { type: 'LIVE_START', id: 1 }, { type: 'LIVE_START', id: 2 });
    s = reducer(s, { type: 'LIVE_OK', id: 2, live: LIVE, at: 50 });
    expect(s.live).toBe(LIVE);
    expect(s.lastRefresh).toBe(50);
    const stale = reducer(s, { type: 'LIVE_OK', id: 1, live: LIVE, at: 10 });
    expect(stale.lastRefresh).toBe(50);
    const staleFailure = reducer(s, { type: 'LIVE_ERROR', id: 1, message: 'boom' });
    expect(staleFailure.liveState).toBe('ok');
  });

  it('the heatmap baseline is identity-guarded too, though its window never changes', () => {
    const baseline = { ...HISTORY, days: 30 as const };
    let s = run(
      createInitialState(),
      { type: 'HEATMAP_HISTORY_START', id: 1 },
      { type: 'HEATMAP_HISTORY_START', id: 2 },
      { type: 'HEATMAP_HISTORY_OK', id: 2, history: baseline },
    );
    s = reducer(s, { type: 'HEATMAP_HISTORY_ERROR', id: 1, message: 'boom' });
    expect(s.heatmapHistory).toBe(baseline);
    expect(s.heatmapError).toBeNull();
  });
});

const STATION_HYLLIE: StationResponse = {
  slug: 'hyllie',
  stop_id: '740001586',
  stop_name: 'Malmö Hyllie',
  days: 30,
  date_from: '2026-08-05',
  date_to: '2026-09-03',
  total_departures: 486,
  on_time_count: 385,
  delayed_count: 97,
  canceled_count: 4,
  on_time_pct: 79.2,
  avg_delay_seconds: 158,
  recent: [],
};

const STATION_KASTRUP: StationResponse = {
  ...STATION_HYLLIE,
  slug: 'kastrup',
  stop_id: '740001588',
  total_departures: 902,
};

describe('station request identity (refreshStation overlaps)', () => {
  // Every request starts from SET_STATION, which leaves no outstanding id —
  // the ids below are what main.ts stamps on STATION_START / STATION_OK /
  // STATION_ERROR for the fetch it is about to run.
  const pick = (slug: StationScope): AppState =>
    reducer(createInitialState(), { type: 'SET_STATION', station: slug });

  it('applies the reply of the request that is still current', () => {
    let s = pick('hyllie');
    s = reducer(s, { type: 'STATION_START', id: 1, scope: 'hyllie' });
    s = reducer(s, { type: 'STATION_OK', id: 1, scope: 'hyllie', station: STATION_HYLLIE });
    expect(s.stationRequestId).toBe(1);
    expect(s.stationData).toBe(STATION_HYLLIE);
    expect(s.stationState).toBe('ok');
    expect(s.stationError).toBeNull();
  });

  it('STATION_START records the new identity without disturbing what is on screen', () => {
    let s = pick('hyllie');
    s = reducer(s, { type: 'STATION_START', id: 1, scope: 'hyllie' });
    s = reducer(s, { type: 'STATION_OK', id: 1, scope: 'hyllie', station: STATION_HYLLIE });
    // The refresh interval opens a second request on a populated section.
    const next = reducer(s, { type: 'STATION_START', id: 2, scope: 'hyllie' });
    expect(next.stationRequestId).toBe(2);
    expect(next.stationState).toBe('ok');
    expect(next.stationData).toBe(STATION_HYLLIE);
  });

  it('drops a late reply for a station the visitor has left (A → B)', () => {
    let s = pick('hyllie');
    s = reducer(s, { type: 'STATION_START', id: 1, scope: 'hyllie' });
    s = reducer(s, { type: 'SET_STATION', station: 'kastrup' });
    s = reducer(s, { type: 'STATION_START', id: 2, scope: 'kastrup' });
    // Station A's reply lands after the switch: neither its rows nor its
    // failure may show under station B's name.
    s = reducer(s, { type: 'STATION_OK', id: 1, scope: 'hyllie', station: STATION_HYLLIE });
    expect(s.stationData).toBeNull();
    expect(s.stationState).toBe('loading');
    s = reducer(s, { type: 'STATION_ERROR', id: 1, scope: 'hyllie', message: 'boom' });
    expect(s.stationState).toBe('loading');
    expect(s.stationError).toBeNull();
    // Station B's own reply still lands normally.
    s = reducer(s, { type: 'STATION_OK', id: 2, scope: 'kastrup', station: STATION_KASTRUP });
    expect(s.stationData).toBe(STATION_KASTRUP);
    expect(s.stationState).toBe('ok');
    expect(s.stationError).toBeNull();
  });

  it('does not mark the current station failed because a left station errored', () => {
    let s = pick('hyllie');
    s = reducer(s, { type: 'STATION_START', id: 1, scope: 'hyllie' });
    s = reducer(s, { type: 'STATION_OK', id: 1, scope: 'hyllie', station: STATION_HYLLIE });
    s = reducer(s, { type: 'SET_STATION', station: 'kastrup' });
    s = reducer(s, { type: 'STATION_START', id: 2, scope: 'kastrup' });
    s = reducer(s, { type: 'STATION_OK', id: 2, scope: 'kastrup', station: STATION_KASTRUP });
    const next = reducer(s, { type: 'STATION_ERROR', id: 1, scope: 'hyllie', message: 'boom' });
    expect(next.stationState).toBe('ok');
    expect(next.stationData).toBe(STATION_KASTRUP);
    expect(next.stationError).toBeNull();
  });

  it('an older same-station reply arriving after a newer one must not win', () => {
    const newer = { ...STATION_HYLLIE, total_departures: 512 };
    let s = pick('hyllie');
    // Two overlapping fetches for the same stop: the interval timer, then a re-pick.
    s = reducer(s, { type: 'STATION_START', id: 1, scope: 'hyllie' });
    s = reducer(s, { type: 'STATION_START', id: 2, scope: 'hyllie' });
    s = reducer(s, { type: 'STATION_OK', id: 2, scope: 'hyllie', station: newer });
    expect(s.stationData).toBe(newer);
    // The slower first fetch resolves last — its data and its failure are both stale.
    s = reducer(s, { type: 'STATION_OK', id: 1, scope: 'hyllie', station: STATION_HYLLIE });
    expect(s.stationData).toBe(newer);
    expect(s.stationState).toBe('ok');
    s = reducer(s, { type: 'STATION_ERROR', id: 1, scope: 'hyllie', message: 'boom' });
    expect(s.stationState).toBe('ok');
    expect(s.stationError).toBeNull();
  });

  it('still drops a reply once the board is back on the corridor', () => {
    let s = pick('hyllie');
    s = reducer(s, { type: 'STATION_START', id: 1, scope: 'hyllie' });
    s = reducer(s, { type: 'SET_STATION', station: 'all' });
    const next = reducer(s, { type: 'STATION_OK', id: 1, scope: 'hyllie', station: STATION_HYLLIE });
    expect(next.stationRequestId).toBeNull();
    expect(next.stationData).toBeNull();
    expect(next.stationState).toBe('idle');
  });

  it('never records a request identity for a scope the board is not on', () => {
    const next = reducer(createInitialState(), { type: 'STATION_START', id: 1, scope: 'hyllie' });
    expect(next.station).toBe('all');
    expect(next.stationRequestId).toBeNull();
  });
});
