import { describe, expect, it } from 'vitest';
import { parseHistoryResponse, type HistoryResponse } from '../src/api';

// Inline fixture matching the Phase 3a /api/transit/history contract
// (packages/collector/src/db.ts -> queryHistory / HistoryStats).
const HISTORY_FIXTURE = {
  days: 7,
  date_from: '2026-07-31',
  date_to: '2026-08-06',
  total_disruptions: 12,
  daily: [
    { date: '2026-07-31', count: 1, cancellations: 0, delays: 1, alerts: 0 },
    { date: '2026-08-06', count: 11, cancellations: 4, delays: 5, alerts: 2 },
  ],
  by_line: [
    { line: '801', count: 7 },
    { line: '804', count: 5 },
  ],
  by_cause: [
    { cause: 'Signalfel', count: 6 },
    { cause: 'Annan', count: 6 },
  ],
  by_hour: [
    { hour: 8, count: 4 },
    { hour: 17, count: 8 },
  ],
} satisfies HistoryResponse;

describe('parseHistoryResponse', () => {
  it('parses the Phase 3a history JSON shape', () => {
    const parsed = parseHistoryResponse(HISTORY_FIXTURE);
    expect(parsed).toEqual(HISTORY_FIXTURE);
    expect(parsed.days).toBe(7);
    expect(parsed.daily[0]?.date).toBe('2026-07-31');
    expect(parsed.by_line[1]?.count).toBe(5);
    expect(parsed.by_hour[1]?.hour).toBe(17);
  });

  it('rejects a malformed payload', () => {
    expect(() => parseHistoryResponse({ days: 7 })).toThrow(TypeError);
    expect(() => parseHistoryResponse(null)).toThrow(TypeError);
    expect(() => parseHistoryResponse('nope')).toThrow(TypeError);
  });
});
