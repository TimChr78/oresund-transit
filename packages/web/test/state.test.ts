import { describe, expect, it } from 'vitest';
import type { DelayStats, Disruption, LiveStatus } from '@oresund/shared';
import { createInitialState, reducer } from '../src/state';
import type { HistoryResponse, PunctualityResponse } from '../src/api';

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
  });

  it('SET_DIRECTION changes the filter and leaves data intact', () => {
    const s = reducer(createInitialState(), { type: 'LIVE_OK', live: LIVE, at: 1000 });
    const next = reducer(s, { type: 'SET_DIRECTION', direction: 'to_denmark' });
    expect(next.direction).toBe('to_denmark');
    expect(next.live).toBe(LIVE);
  });

  it('SET_DAY_RANGE sets the range and clears history + stats + punctuality for refetch', () => {
    let s = reducer(createInitialState(), { type: 'HISTORY_OK', history: HISTORY });
    s = reducer(s, { type: 'STATS_OK', stats: STATS });
    s = reducer(s, { type: 'PUNCTUALITY_OK', punctuality: PUNCTUALITY });
    const next = reducer(s, { type: 'SET_DAY_RANGE', dayRange: 14 });
    expect(next.dayRange).toBe(14);
    expect(next.history).toBeNull();
    expect(next.stats).toBeNull();
    expect(next.punctuality).toBeNull();
    expect(next.punctualityError).toBeNull();
  });

  it('LIVE_OK stores the snapshot and records the refresh time', () => {
    const s = reducer(createInitialState(), { type: 'LIVE_OK', live: LIVE, at: 12345 });
    expect(s.live).toBe(LIVE);
    expect(s.liveState).toBe('ok');
    expect(s.liveError).toBeNull();
    expect(s.lastRefresh).toBe(12345);
  });

  it('LIVE_NO_DATA marks the empty state instead of an error', () => {
    const s = reducer(createInitialState(), { type: 'LIVE_NO_DATA', at: 10 });
    expect(s.liveState).toBe('no_data');
    expect(s.live).toBeNull();
    expect(s.liveError).toBeNull();
  });

  it('LIVE_ERROR keeps existing live data (per-section errors do not blank the page)', () => {
    let s = reducer(createInitialState(), { type: 'LIVE_OK', live: LIVE, at: 1 });
    s = reducer(s, { type: 'LIVE_ERROR', message: 'boom' });
    expect(s.live).toBe(LIVE);
    expect(s.liveState).toBe('error');
    expect(s.liveError).toBe('boom');
  });

  it('LIVE_ERROR without data marks the section errored', () => {
    const s = reducer(createInitialState(), { type: 'LIVE_ERROR', message: 'boom' });
    expect(s.liveState).toBe('error');
    expect(s.live).toBeNull();
  });

  it('HISTORY_OK populates history and clears the error', () => {
    let s = reducer(createInitialState(), { type: 'HISTORY_ERROR', message: 'boom' });
    s = reducer(s, { type: 'HISTORY_OK', history: HISTORY });
    expect(s.history).toBe(HISTORY);
    expect(s.historyError).toBeNull();
  });

  it('DISRUPTIONS_OK replaces the disruption list and marks the section ok', () => {
    const s = reducer(createInitialState(), { type: 'DISRUPTIONS_OK', disruptions: [DISRUPTION] });
    expect(s.disruptions).toEqual([DISRUPTION]);
    expect(s.disruptionsState).toBe('ok');
    expect(s.disruptionsError).toBeNull();
  });

  it('DISRUPTIONS_ERROR marks the section errored and keeps prior data', () => {
    let s = reducer(createInitialState(), { type: 'DISRUPTIONS_OK', disruptions: [DISRUPTION] });
    s = reducer(s, { type: 'DISRUPTIONS_ERROR', message: 'boom' });
    expect(s.disruptionsState).toBe('error');
    expect(s.disruptions).toEqual([DISRUPTION]);
  });

  it('STATS_OK populates stats and clears the error', () => {
    let s = reducer(createInitialState(), { type: 'STATS_ERROR', message: 'boom' });
    s = reducer(s, { type: 'STATS_OK', stats: STATS });
    expect(s.stats).toBe(STATS);
    expect(s.statsError).toBeNull();
  });

  it('PUNCTUALITY_OK populates punctuality and clears the error', () => {
    let s = reducer(createInitialState(), { type: 'PUNCTUALITY_ERROR', message: 'boom' });
    s = reducer(s, { type: 'PUNCTUALITY_OK', punctuality: PUNCTUALITY });
    expect(s.punctuality).toBe(PUNCTUALITY);
    expect(s.punctualityError).toBeNull();
  });

  it('PUNCTUALITY_ERROR marks the error and keeps prior data', () => {
    let s = reducer(createInitialState(), { type: 'PUNCTUALITY_OK', punctuality: PUNCTUALITY });
    s = reducer(s, { type: 'PUNCTUALITY_ERROR', message: 'boom' });
    expect(s.punctuality).toBe(PUNCTUALITY);
    expect(s.punctualityError).toBe('boom');
  });

  it('starts with no heatmap baseline', () => {
    const s = createInitialState();
    expect(s.heatmapHistory).toBeNull();
    expect(s.heatmapError).toBeNull();
  });

  it('HEATMAP_HISTORY_OK stores the 30-day baseline and clears its error', () => {
    let s = reducer(createInitialState(), { type: 'HEATMAP_HISTORY_ERROR', message: 'boom' });
    s = reducer(s, { type: 'HEATMAP_HISTORY_OK', history: HISTORY });
    expect(s.heatmapHistory).toBe(HISTORY);
    expect(s.heatmapError).toBeNull();
  });

  it('SET_DAY_RANGE does NOT clear the heatmap baseline (stable 30-day window)', () => {
    let s = reducer(createInitialState(), { type: 'HEATMAP_HISTORY_OK', history: HISTORY });
    s = reducer(s, { type: 'SET_DAY_RANGE', dayRange: 90 });
    expect(s.heatmapHistory).toBe(HISTORY);
    expect(s.history).toBeNull();
  });
});
