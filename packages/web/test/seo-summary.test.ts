import { describe, expect, it, vi } from 'vitest';
import type { Disruption, LiveStatus } from '@oresund/shared';
import {
  cancellationBuckets,
  fetchBuildSummary,
  naiveLocalStamp,
  summarizeHome,
  summaryStatusKey,
  trendKeyFor,
} from '../src/lib/seo-summary';

/**
 * A build-time fixture: 2026-08-21 12:00 corridor time. Built from a UTC
 * instant so the expectation holds on any machine — the stamps naiveLocalStamp
 * emits are Europe/Stockholm wall clock (audit5 M6), 10:00Z = 12:00 CEST.
 */
const NOW = new Date(Date.UTC(2026, 7, 21, 10, 0, 0));

/** A live snapshot fixture (all required LiveStatus fields). */
function mkLive(overrides: Partial<LiveStatus> = {}): LiveStatus {
  return {
    status: 'green',
    status_text: '',
    timestamp: '2026-08-21T12:00:00',
    time_short: '12:00',
    disruption_count: 0,
    departure_counts: { to_denmark: 20, to_sweden: 20, bus: 0 },
    service_shutdown: false,
    directions: { to_denmark: [], to_sweden: [], bus: [] },
    ...overrides,
  };
}

/** A disruption fixture with a naive local timestamp. */
function mkDisruption(timestamp: string, type: Disruption['type'] = 'cancellation'): Disruption {
  return {
    id: 1,
    timestamp,
    line: '804',
    type,
    cause: null,
    route_section: null,
    severity: null,
    delay_seconds: null,
    raw_text: null,
    dep_key: null,
    first_seen: timestamp,
    last_updated: timestamp,
    direction: 'to_denmark',
    technical_number: null,
    sched_time: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('naiveLocalStamp', () => {
  it('formats a Date as a naive corridor-time ISO stamp with T separator', () => {
    expect(naiveLocalStamp(NOW)).toBe('2026-08-21T12:00:00');
  });

  it('pads month/day/hour/minute/second to two digits', () => {
    // 02:04:05Z = 03:04:05 CET in January.
    const d = new Date(Date.UTC(2026, 0, 5, 2, 4, 5));
    expect(naiveLocalStamp(d)).toBe('2026-01-05T03:04:05');
  });

  it('supports the space separator used by the collector query bounds', () => {
    expect(naiveLocalStamp(NOW, ' ')).toBe('2026-08-21 12:00:00');
  });

  it('is the corridor wall clock, not the machine running the build', () => {
    // 2026-08-21 22:30 UTC is already 2026-08-22 in Stockholm — the date a
    // Stockholm-stamped row would compare against.
    expect(naiveLocalStamp(new Date(Date.UTC(2026, 7, 21, 22, 30, 0)))).toBe('2026-08-22T00:30:00');
  });
});

describe('summaryStatusKey', () => {
  it('maps green to the normal-service sentence', () => {
    expect(summaryStatusKey(mkLive({ status: 'green' }))).toBe('seo_status_normal');
  });

  it('maps amber to the delays sentence', () => {
    expect(summaryStatusKey(mkLive({ status: 'amber' }))).toBe('seo_status_delayed');
  });

  it('maps red to the disruptions/cancellations sentence', () => {
    expect(summaryStatusKey(mkLive({ status: 'red' }))).toBe('seo_status_cancellations');
  });

  it('maps blue to the alerts sentence', () => {
    expect(summaryStatusKey(mkLive({ status: 'blue' }))).toBe('seo_status_alerts');
  });

  it('service shutdown wins over every status', () => {
    expect(summaryStatusKey(mkLive({ status: 'green', service_shutdown: true }))).toBe('seo_status_shutdown');
    expect(summaryStatusKey(mkLive({ status: 'red', service_shutdown: true }))).toBe('seo_status_shutdown');
  });
});

describe('cancellationBuckets', () => {
  it('counts cancellations in the last 24h vs the previous 24h (half-open bound)', () => {
    const disruptions = [
      mkDisruption('2026-08-21T11:59:00'), // < 24h ago -> last24
      mkDisruption('2026-08-20T12:00:00'), // exactly 24h ago -> last24 (>= bound)
      mkDisruption('2026-08-20T11:59:59'), // just past 24h -> prev24
      mkDisruption('2026-08-19T13:00:00'), // older, but inside the 48h window -> prev24
    ];
    expect(cancellationBuckets(disruptions, NOW)).toEqual({ last24: 2, prev24: 2 });
  });

  it('skips cancellations outside the 48h window entirely', () => {
    const disruptions = [
      mkDisruption('2026-08-21T10:00:00'), // last24
      mkDisruption('2026-08-19T12:00:00'), // exactly at now-48h -> prev24 (inclusive lower bound)
      mkDisruption('2026-08-19T11:59:59'), // just before now-48h -> neither bucket
      mkDisruption('2026-08-17T00:00:00'), // far outside the window -> neither bucket
    ];
    expect(cancellationBuckets(disruptions, NOW)).toEqual({ last24: 1, prev24: 1 });
  });

  it('ignores non-cancellation disruptions and unparseable timestamps', () => {
    const disruptions = [
      mkDisruption('2026-08-21T11:00:00', 'delay'),
      mkDisruption('2026-08-21T10:00:00', 'alert'),
      mkDisruption('2026-08-21T10:30:00'), // cancellation counts
      mkDisruption('garbage', 'cancellation'),
      mkDisruption(null as unknown as string, 'cancellation'),
    ];
    expect(cancellationBuckets(disruptions, NOW)).toEqual({ last24: 1, prev24: 0 });
  });

  it('understands both "T" and space-separated naive timestamps from the API', () => {
    const disruptions = [mkDisruption('2026-08-21 11:00:00'), mkDisruption('2026-08-20 11:00:00')];
    expect(cancellationBuckets(disruptions, NOW)).toEqual({ last24: 1, prev24: 1 });
  });

  it('drops a CALENDAR-VALID future stamp instead of counting it as the last 24h (audit6 M9)', () => {
    // Wave B's validation closed the impossible half ("2026-99-99" sorts above
    // every real date) but left the ceiling open: any well-formed future stamp
    // also sorts above every real date and satisfied `ts >= boundary`, so the
    // failure mode survived with only its trigger moved.
    const disruptions = [
      mkDisruption('2099-01-01T00:00:00'),
      mkDisruption('2078-12-31T23:59:59'),
      mkDisruption('2026-08-22T11:00:00'), // one second in the future
      mkDisruption('2026-08-21T10:00:00'), // a real row, still counted
    ];
    expect(cancellationBuckets(disruptions, NOW)).toEqual({ last24: 1, prev24: 0 });
  });
});

describe('trendKeyFor', () => {
  it('reports up / down / flat', () => {
    expect(trendKeyFor(3, 1)).toBe('seo_trend_up');
    expect(trendKeyFor(1, 3)).toBe('seo_trend_down');
    expect(trendKeyFor(3, 3)).toBe('seo_trend_flat');
    expect(trendKeyFor(0, 0)).toBe('seo_trend_flat');
  });
});

describe('summarizeHome', () => {
  it('combines the live status, 24h cancellation count and trend into one summary', () => {
    const summary = summarizeHome(
      mkLive({ status: 'amber' }),
      [mkDisruption('2026-08-21T11:00:00'), mkDisruption('2026-08-20T11:00:00')],
      NOW,
    );
    expect(summary).toEqual({ statusKey: 'seo_status_delayed', cancellations24h: 1, trendKey: 'seo_trend_flat' });
  });
});

describe('fetchBuildSummary', () => {
  it('fetches live + disruptions from the collector and builds the summary', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/live')) return jsonResponse(mkLive({ status: 'red' }));
      if (url.includes('/disruptions')) {
        return jsonResponse({
          disruptions: [
            mkDisruption('2026-08-21T10:00:00'),
            mkDisruption('2026-08-21T09:00:00'),
            mkDisruption('2026-08-20T10:00:00'),
          ],
        });
      }
      throw new Error(`no stub for ${url}`);
    });
    const summary = await fetchBuildSummary('https://collector.test/api/transit', fetchImpl as never, NOW);
    expect(summary).toEqual({ statusKey: 'seo_status_cancellations', cancellations24h: 2, trendKey: 'seo_trend_up' });
  });

  it('requests the last 48h of disruptions (limit 200) with space-form naive bounds', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url);
      if (url.includes('/live')) return jsonResponse(mkLive());
      if (url.includes('/disruptions')) return jsonResponse({ disruptions: [] });
      throw new Error(`no stub for ${url}`);
    });
    await fetchBuildSummary('https://collector.test/api/transit', fetchImpl as never, NOW);
    const dUrl = seen.find((u) => u.includes('/disruptions'));
    expect(dUrl).toBeDefined();
    expect(dUrl).toContain('limit=200');
    expect(dUrl).toContain('from=2026-08-19%2012%3A00%3A00'); // now - 48h, space form, encoded
    expect(dUrl).toContain('to=2026-08-21%2012%3A00%3A00');
  });

  it('returns null instead of throwing when the collector is unreachable', async () => {
    const summary = await fetchBuildSummary(
      'https://collector.test/api/transit',
      (async () => {
        throw new Error('down');
      }) as never,
      NOW,
    );
    expect(summary).toBeNull();
  });

  it('returns null when the live endpoint answers 503 (no snapshot yet)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/live')) return jsonResponse({ error: 'no snapshot' }, 503);
      return jsonResponse({ disruptions: [] });
    });
    const summary = await fetchBuildSummary('https://collector.test/api/transit', fetchImpl as never, NOW);
    expect(summary).toBeNull();
  });
});