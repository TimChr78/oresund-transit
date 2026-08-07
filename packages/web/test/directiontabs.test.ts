import { describe, expect, it } from 'vitest';
import type { Disruption } from '@oresund/shared';
import { renderDirectionTabs, tabDefs } from '../src/components/DirectionTabs';

function disruption(overrides: Partial<Disruption> = {}): Disruption {
  return {
    id: 1,
    timestamp: '2026-08-07T08:00:00',
    line: '801',
    type: 'delay',
    cause: null,
    route_section: null,
    severity: 'moderate',
    delay_seconds: 0,
    raw_text: null,
    dep_key: null,
    first_seen: null,
    last_updated: null,
    direction: 'to_denmark',
    technical_number: null,
    sched_time: null,
    ...overrides,
  };
}

describe('tabDefs — today disruption counts', () => {
  it('counts today disruptions per direction (all = total, nulls in all only)', () => {
    const disruptions = [
      disruption({ id: 1, direction: 'to_denmark' }),
      disruption({ id: 2, direction: 'to_denmark' }),
      disruption({ id: 3, direction: 'to_sweden' }),
      disruption({ id: 4, direction: null }),
    ];
    const tabs = tabDefs(disruptions, 'all', 'en');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toMatchObject({ value: 'all', count: 4 });
    expect(tabs[1]).toMatchObject({ value: 'to_denmark', count: 2 });
    expect(tabs[2]).toMatchObject({ value: 'to_sweden', count: 1 });
  });

  it('shows null counts before disruptions have loaded', () => {
    const tabs = tabDefs(null, 'all', 'en');
    expect(tabs.every((t) => t.count === null)).toBe(true);
  });

  it('keeps the active tab marker on the selected direction', () => {
    const tabs = tabDefs([disruption()], 'to_sweden', 'en');
    expect(tabs.find((t) => t.value === 'to_sweden')?.active).toBe(true);
    expect(tabs.find((t) => t.value === 'all')?.active).toBe(false);
  });
});

describe('renderDirectionTabs — counts in the tab HTML', () => {
  it('renders the per-direction disruption counts next to the labels', () => {
    const html = renderDirectionTabs(
      [disruption(), disruption({ id: 2, direction: 'to_sweden' })],
      'all',
      'en',
    );
    expect(html).toContain('tab-count');
    expect(html).toContain('>2<'); // All
    expect(html).toContain('>1<'); // each direction
  });
});
