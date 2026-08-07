import { describe, expect, it } from 'vitest';
import type { Disruption } from '@oresund/shared';
import { renderDisruptionsTable } from '../src/components/DisruptionsTable';

/** A full disruption row as served by /api/transit/disruptions. */
function disruption(overrides: Partial<Disruption> = {}): Disruption {
  return {
    id: 1,
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
    ...overrides,
  };
}

describe('renderDisruptionsTable — TIME cell', () => {
  it('renders sched_time with an ISO-T separator', () => {
    const html = renderDisruptionsTable([disruption()], 'en');
    expect(html).toContain('>21:59<');
  });

  it('renders sched_time with a space separator (2026-08-06 15:35:11)', () => {
    const html = renderDisruptionsTable(
      [disruption({ sched_time: '2026-08-06 15:35:11', timestamp: '2026-08-06T15:35:11' })],
      'en',
    );
    expect(html).toContain('>15:35<');
  });

  it('falls back to timestamp when sched_time is null', () => {
    const html = renderDisruptionsTable([disruption({ sched_time: null })], 'en');
    expect(html).toContain('>21:59<');
  });

  it('falls back to a space-separated timestamp when sched_time is null', () => {
    const html = renderDisruptionsTable([disruption({ sched_time: null, timestamp: '2026-08-06 15:35:11' })], 'en');
    expect(html).toContain('>15:35<');
  });
});

describe('renderDisruptionsTable — empty state (today only)', () => {
  it('shows a calm all-clear message when today has zero disruptions', () => {
    const html = renderDisruptionsTable([], 'en');
    expect(html).not.toContain('<table');
    expect(html).toContain('All clear');
  });

  it('uses the trilingual all-clear message', () => {
    expect(renderDisruptionsTable([], 'sv')).toContain('störningar idag');
    expect(renderDisruptionsTable([], 'da')).toContain('forstyrrelse i dag');
  });
});
