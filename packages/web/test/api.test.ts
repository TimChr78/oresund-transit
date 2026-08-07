import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Disruption, LiveStatus } from '@oresund/shared';
import {
  ApiError,
  configureFetch,
  fetchDelayStats,
  fetchDisruptions,
  fetchHistory,
  fetchLiveStatus,
  type FetchLike,
} from '../src/api';

const LIVE_FIXTURE: LiveStatus = {
  status: 'green',
  status_text: 'Normal service',
  timestamp: '2026-08-06T21:59:27',
  time_short: '21:59',
  disruption_count: 0,
  departure_counts: { to_denmark: 7, to_sweden: 5, bus: 0 },
  service_shutdown: false,
  directions: { to_denmark: ['Østerport'], to_sweden: ['Malmö'], bus: [] },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('api client', () => {
  afterEach(() => {
    // Never let a test hit the real network.
    configureFetch(() => Promise.reject(new Error('no fetch configured in test')));
  });

  it('fetchLiveStatus GETs /api/transit/live and parses LiveStatus', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(LIVE_FIXTURE));
    configureFetch(fetchMock);
    const result = await fetchLiveStatus();
    expect(fetchMock).toHaveBeenCalledWith('/api/transit/live', { method: 'GET' });
    expect(result).toEqual(LIVE_FIXTURE);
  });

  it('fetchDelayStats GETs /api/transit/delay-stats with from/to query', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
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
      }),
    );
    configureFetch(fetchMock);
    await fetchDelayStats('2026-08-06', '2026-08-06');
    expect(fetchMock).toHaveBeenCalledWith('/api/transit/delay-stats?from=2026-08-06&to=2026-08-06', {
      method: 'GET',
    });
  });

  it('fetchDisruptions GETs /api/transit/disruptions?limit=50 and unwraps {disruptions}', async () => {
    const disruptions: Disruption[] = [
      {
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
      },
    ];
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ disruptions }));
    configureFetch(fetchMock);
    const result = await fetchDisruptions(50);
    expect(fetchMock).toHaveBeenCalledWith('/api/transit/disruptions?limit=50', { method: 'GET' });
    expect(result).toEqual(disruptions);
  });

  it('fetchDisruptions defaults to limit 50', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ disruptions: [] }));
    configureFetch(fetchMock);
    await fetchDisruptions();
    expect(fetchMock).toHaveBeenCalledWith('/api/transit/disruptions?limit=50', { method: 'GET' });
  });

  it('fetchHistory GETs /api/transit/history?days=7', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        days: 7,
        date_from: '2026-07-31',
        date_to: '2026-08-06',
        total_disruptions: 0,
        daily: [],
        by_line: [],
        by_cause: [],
        by_hour: [],
      }),
    );
    configureFetch(fetchMock);
    const result = await fetchHistory(7);
    expect(fetchMock).toHaveBeenCalledWith('/api/transit/history?days=7', { method: 'GET' });
    expect(result.days).toBe(7);
  });

  it('throws ApiError with the status on non-2xx (503)', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ error: 'no live status snapshot yet' }, 503));
    configureFetch(fetchMock);
    await expect(fetchLiveStatus()).rejects.toMatchObject({ name: 'ApiError', status: 503 });
  });

  it('throws a readable ApiError on 500', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    configureFetch(fetchMock);
    const err = await fetchLiveStatus().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain('500');
  });

  it('propagates network failures', async () => {
    const fetchMock = vi.fn<FetchLike>().mockRejectedValue(new TypeError('fetch failed'));
    configureFetch(fetchMock);
    await expect(fetchLiveStatus()).rejects.toThrow('fetch failed');
  });
});
