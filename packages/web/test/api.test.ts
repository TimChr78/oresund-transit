import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Disruption, LiveStatus } from '@oresund/shared';
import {
  ApiError,
  configureFetch,
  fetchDelayStats,
  fetchDisruptions,
  fetchHistory,
  fetchLiveStatus,
  fetchPunctuality,
  fetchStation,
  parsePunctualityResponse,
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

  it('fetchDisruptions passes the from/to today-window query params', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ disruptions: [] }));
    configureFetch(fetchMock);
    await fetchDisruptions(50, '2026-08-07', '2026-08-08');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transit/disruptions?limit=50&from=2026-08-07&to=2026-08-08',
      { method: 'GET' },
    );
  });

  it('fetchDisruptions omits from/to when only a limit is given', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ disruptions: [] }));
    configureFetch(fetchMock);
    await fetchDisruptions(50);
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

  it('fetchPunctuality GETs /api/transit/punctuality?days=7 and parses the response', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        days: 7,
        date_from: '2026-07-31',
        date_to: '2026-08-06',
        daily: [
          {
            date: '2026-07-31',
            total: 0,
            on_time: 0,
            delayed: 0,
            canceled: 0,
            on_time_pct: 0,
            avg_delay_seconds: null,
          },
          {
            date: '2026-08-06',
            total: 10,
            on_time: 9,
            delayed: 1,
            canceled: 0,
            on_time_pct: 90,
            avg_delay_seconds: 65,
          },
        ],
      }),
    );
    configureFetch(fetchMock);
    const result = await fetchPunctuality(7);
    expect(fetchMock).toHaveBeenCalledWith('/api/transit/punctuality?days=7', { method: 'GET' });
    expect(result.days).toBe(7);
    expect(result.daily).toHaveLength(2);
    expect(result.daily[1]?.on_time_pct).toBe(90);
    expect(result.daily[1]?.avg_delay_seconds).toBe(65);
  });

  it('rejects a malformed punctuality payload', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ days: 7 }));
    configureFetch(fetchMock);
    await expect(fetchPunctuality(7)).rejects.toThrow(TypeError);
  });

  it('throws ApiError with the status on non-2xx (503)', async () => {    const fetchMock = vi
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

describe('parsePunctualityResponse (audit6 M8)', () => {
  /** A row the collector writes for a day that had departures. */
  const row = { date: '2026-08-06', total: 40, on_time: 37, delayed: 2, canceled: 1, on_time_pct: 92.5, avg_delay_seconds: 120 };
  const ok = (daily: unknown[]) => ({ days: 7, date_from: '2026-07-31', date_to: '2026-08-06', daily });

  it('keeps a well-formed window and its rows', () => {
    const parsed = parsePunctualityResponse(ok([row]));
    expect(parsed.daily).toEqual([row]);
  });

  it('throws on a window that is not the punctuality shape', () => {
    expect(() => parsePunctualityResponse(null)).toThrow(TypeError);
    expect(() => parsePunctualityResponse(ok('nope' as unknown as never))).toThrow(TypeError);
  });

  // The board's chart interpolates on_time_pct into an SVG <title> and a legend
  // <span>, and svgY() coerces with .toFixed(1) — so a bad value reached the DOM
  // without anything throwing. The server-side parse of the same endpoint
  // (archive-http.ts) has validated per row all along; this closes the gap
  // between the two paths.
  it.each([
    ['a non-finite share', { ...row, on_time_pct: Number.NaN }],
    ['a string share', { ...row, on_time_pct: '92.5' }],
    ['a string total', { ...row, total: '40' }],
    ['an impossible share', { ...row, on_time: 41 }],
    ['a negative count', { ...row, delayed: -1 }],
    ['a row that is not an object', 'nope'],
    ['a row with no date', { ...row, date: undefined }],
    // Counts the collector derives: total is their sum, so a row that breaks
    // the identity is a broken aggregation, not a measurement.
    ['counts that do not add up to total', { ...row, canceled: 2 }],
    ['a fractional count', { ...row, total: 40.5, on_time_pct: 91.3 }],
    ['a share over 100', { ...row, on_time_pct: 120 }],
    ['a negative share', { ...row, on_time_pct: -1 }],
    ['an average delay that is not a number', { ...row, avg_delay_seconds: '120' }],
    ['an average delay of NaN', { ...row, avg_delay_seconds: Number.NaN }],
    ['an average delay that is missing', { ...row, avg_delay_seconds: undefined }],
    ['an impossible date', { ...row, date: '2026-99-06' }],
    ['a day the month has no room for', { ...row, date: '2026-02-30' }],
    ['a date that is not the declared shape', { ...row, date: '06/08/2026' }],
  ])('drops a row that is %s', (label, bad) => {
    const parsed = parsePunctualityResponse(ok([bad]));
    expect(parsed.daily, label).toEqual([]);
  });

  it('keeps a no-measurement day: zero counts that sum to zero and a null average', () => {
    // The collector zero-fills every day in the window, so the empty day is the
    // common case, not the edge case.
    const empty = { date: '2026-08-06', total: 0, on_time: 0, delayed: 0, canceled: 0, on_time_pct: 0, avg_delay_seconds: null };
    expect(parsePunctualityResponse(ok([empty])).daily).toEqual([empty]);
  });

  it('keeps the boundary shares 0 and 100', () => {
    const bottom = { ...row, on_time: 0, delayed: 40, canceled: 0, on_time_pct: 0 };
    const top = { ...row, on_time: 40, delayed: 0, canceled: 0, on_time_pct: 100 };
    expect(parsePunctualityResponse(ok([bottom, top])).daily).toHaveLength(2);
  });
});

describe('fetchStation (backlog A1)', () => {
  afterEach(() => {
    configureFetch(() => Promise.reject(new Error('no fetch configured in test')));
  });

  const PAYLOAD = {
    slug: 'hyllie',
    stop_id: '740001586',
    stop_name: 'Malmö Hyllie',
    days: 7,
    date_from: '2026-08-28',
    date_to: '2026-09-03',
    total_departures: 486,
    on_time_count: 385,
    delayed_count: 97,
    canceled_count: 4,
    on_time_pct: 79.2,
    avg_delay_seconds: 158,
    daily: [],
    recent: [],
  };

  it('GETs /api/transit/station/{slug} with the days window', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(PAYLOAD));
    configureFetch(fetchMock);
    const result = await fetchStation('hyllie', 7);
    expect(fetchMock).toHaveBeenCalledWith('/api/transit/station/hyllie?days=7', { method: 'GET' });
    expect(result.slug).toBe('hyllie');
    expect(result.on_time_pct).toBe(79.2);
  });

  it('encodes a slug with a character the query grammar reserves', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(PAYLOAD));
    configureFetch(fetchMock);
    await fetchStation('a b', 30);
    expect(fetchMock).toHaveBeenCalledWith('/api/transit/station/a%20b?days=30', { method: 'GET' });
  });

  it('rejects a payload without the per-stop departures', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ slug: 'hyllie' }));
    configureFetch(fetchMock);
    await expect(fetchStation('hyllie')).rejects.toThrow(TypeError);
  });

  it('rejects a payload whose punctuality fields are missing', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ slug: 'hyllie', stop_id: '740001586', days: 7, recent: [] }));
    configureFetch(fetchMock);
    await expect(fetchStation('hyllie')).rejects.toThrow(TypeError);
  });

  it('rejects a payload that omits canceled_count (rendered straight into the KPI row)', async () => {
    // An omitted-but-consumed field would reach the board as "undefined".
    const withoutCanceled: Record<string, unknown> = { ...PAYLOAD };
    delete withoutCanceled.canceled_count;
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(withoutCanceled));
    configureFetch(fetchMock);
    await expect(fetchStation('hyllie')).rejects.toThrow(TypeError);
  });

  it('rejects a payload whose window bounds are not the declared strings', async () => {
    const badDates: Record<string, unknown> = { ...PAYLOAD, date_from: 20260828, date_to: null };
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(badDates));
    configureFetch(fetchMock);
    await expect(fetchStation('hyllie')).rejects.toThrow(TypeError);
  });

  it('accepts a null avg_delay_seconds (the declared no-measurement value)', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ ...PAYLOAD, avg_delay_seconds: null }));
    configureFetch(fetchMock);
    const result = await fetchStation('hyllie');
    expect(result.avg_delay_seconds).toBeNull();
  });

  it('rejects a non-numeric avg_delay_seconds', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ ...PAYLOAD, avg_delay_seconds: '158' }));
    configureFetch(fetchMock);
    await expect(fetchStation('hyllie')).rejects.toThrow(TypeError);
  });

  // as_of is rendered verbatim under the departures heading, so a stamp the
  // collector mangled must be dropped rather than shown as an observed time.
  it('keeps a complete local as_of stamp', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ ...PAYLOAD, as_of: '2026-09-03T21:59:27' }));
    configureFetch(fetchMock);
    expect((await fetchStation('hyllie')).as_of).toBe('2026-09-03T21:59:27');
  });

  it.each([
    ['a truncated stamp', '2026-09-03T21:59'],
    ['a space-separated stamp', '2026-09-03 21:59:27'],
    ['an out-of-range month', '2026-99-03T21:59:27'],
    ['an out-of-range day', '2026-09-99T21:59:27'],
    ['a day the month has no room for', '2026-02-30T21:59:27'],
    ['an out-of-range hour', '2026-09-03T99:59:27'],
    ['an out-of-range minute', '2026-09-03T21:99:27'],
    ['plain garbage', 'not-a-timestamp'],
  ])('drops the as_of stamp when it is %s', async (_label, asOf) => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ ...PAYLOAD, as_of: asOf }));
    configureFetch(fetchMock);
    const result = await fetchStation('hyllie');
    expect(result.as_of).toBeUndefined();
    // The punctuality window itself still renders — only the stamp is dropped.
    expect(result.on_time_pct).toBe(79.2);
  });

  it('treats a Feb 29 stamp in a leap year as a real date and in a common year as garbage', async () => {
    const leap = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ ...PAYLOAD, as_of: '2028-02-29T06:00:00' }));
    configureFetch(leap);
    expect((await fetchStation('hyllie')).as_of).toBe('2028-02-29T06:00:00');
    const common = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ ...PAYLOAD, as_of: '2026-02-29T06:00:00' }));
    configureFetch(common);
    expect((await fetchStation('hyllie')).as_of).toBeUndefined();
  });
});
