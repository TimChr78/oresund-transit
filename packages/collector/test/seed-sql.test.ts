import { describe, expect, it } from 'vitest';
import { esc, disruptionInsert, departureInsert } from '../scripts/seed-sql.js';

describe('esc', () => {
  it('passes numbers through unquoted', () => {
    expect(esc(670)).toBe('670');
  });

  it('emits NULL for null/undefined', () => {
    expect(esc(null)).toBe('NULL');
    expect(esc(undefined)).toBe('NULL');
  });

  it('quotes strings and escapes single quotes', () => {
    expect(esc("København H")).toBe("'København H'");
    expect(esc("it's")).toBe("'it''s'");
  });
});

describe('disruptionInsert', () => {
  it('builds a valid statement with all columns', () => {
    const sql = disruptionInsert({
      timestamp: '2026-07-11 05:00:00',
      line: '804',
      type: 'delay',
      cause: 'unknown',
      route_section: 'Gottorp->Hyllie',
      severity: 'minor',
      delay_seconds: 670,
      raw_text: "DELAY 04:58 16 -> Hyllie: +11min forsening",
      dep_key: null,
      first_seen: null,
      last_updated: null,
      direction: 'bus',
      technical_number: null,
      sched_time: null,
    });
    expect(sql).toContain('INSERT INTO disruptions');
    expect(sql).toContain("'2026-07-11 05:00:00'");
    expect(sql).toContain('670');
    expect(sql).toContain('NULL');
    expect(sql).toMatch(/;\s*$/);
  });

  it('escapes apostrophes in raw text', () => {
    const sql = disruptionInsert({
      timestamp: '2026-08-01 10:00:00', line: '11', type: 'alert',
      cause: 'unknown', route_section: 'x', severity: 'minor',
      delay_seconds: 0, raw_text: "it's delayed", dep_key: null,
      first_seen: null, last_updated: null, direction: null,
      technical_number: null, sched_time: null,
    });
    expect(sql).toContain("'it''s delayed'");
  });
});

describe('departureInsert', () => {
  it('builds a valid statement with all columns', () => {
    const sql = departureInsert({
      stop_id: 'Hyl', stop_name: 'Hyllie', line: '804', destination: 'Østerport',
      sched_time: '06:59', delay_seconds: 0, canceled: 0, status: 'on_time',
      technical_number: null, dep_key: '804_06:59_Østerport',
      first_seen: '2026-08-06 06:40:00', last_updated: '2026-08-06 06:40:00',
    });
    expect(sql).toContain('INSERT INTO departures');
    expect(sql).toContain("'Østerport'");
    expect(sql).toContain("'on_time'");
  });
});
