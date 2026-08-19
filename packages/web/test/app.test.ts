import { describe, expect, it } from 'vitest';
import { renderApp } from '../src/components/App';
import { createInitialState } from '../src/state';
import type { Disruption, LiveStatus } from '@oresund/shared';

describe('renderApp — disruptions mode toggle', () => {
  it('shows a "Show all" toggle in today mode', () => {
    const html = renderApp(createInitialState(), 'en', 'declined');
    expect(html).toContain('data-action="set-disruptions-mode"');
    expect(html).toContain('data-value="archive"');
    expect(html).toContain('Show all disruptions');
  });

  it('archive mode flips the toggle to "Back to today"', () => {
    const state = { ...createInitialState(), disruptionsMode: 'archive' as const };
    const html = renderApp(state, 'en', 'declined');
    expect(html).toContain('data-value="today"');
    expect(html).toContain('Back to today');
  });

  it('toggle is trilingual', () => {
    expect(renderApp(createInitialState(), 'sv', 'declined')).toContain('Visa alla störningar');
    expect(renderApp(createInitialState(), 'da', 'declined')).toContain('Vis alle forstyrrelser');
  });
});

describe('renderApp — disruption hero strip', () => {
  const live: LiveStatus = {
    status: 'amber',
    status_text: 'Delays',
    timestamp: '2026-08-06T21:59:27',
    time_short: '21:59',
    disruption_count: 2,
    departure_counts: { to_denmark: 0, to_sweden: 0, bus: 0 },
    service_shutdown: false,
    directions: { to_denmark: [], to_sweden: [], bus: [] },
  };
  const newDisruption: Disruption = {
    id: 2,
    timestamp: '2026-08-06T21:59:27',
    line: '804',
    type: 'delay',
    cause: 'signal_failure',
    route_section: null,
    severity: 'minor',
    delay_seconds: 300,
    raw_text: 'Signalfel',
    dep_key: '804_21:59_Østerport',
    first_seen: '2026-08-06T21:59:27',
    last_updated: '2026-08-06T21:59:27',
    direction: 'to_denmark',
    technical_number: '1143',
    sched_time: '2026-08-06T21:59:00',
  };
  const olderDisruption: Disruption = {
    ...newDisruption,
    id: 1,
    timestamp: '2026-08-06T21:30:00',
    line: '803',
    cause: 'vehicle',
    raw_text: 'Vagnbrist',
    dep_key: '803_21:30_Østerport',
    first_seen: '2026-08-06T21:30:00',
    last_updated: '2026-08-06T21:30:00',
    sched_time: '2026-08-06T21:30:00',
  };

  it('renders the newest active disruptions above the table when disruption_count > 0', () => {
    const state = {
      ...createInitialState(),
      live,
      disruptions: [olderDisruption, newDisruption],
      disruptionsState: 'ok' as const,
    };
    const html = renderApp(state, 'en', 'declined');

    expect(html).toContain('class="hero-strip"');
    expect(html).toContain('Active now');
    expect(html).toContain('href="#disruptions-table"');
    // newest first: 804 at 21:59 before the older 803
    expect(html.indexOf('804')).toBeLessThan(html.indexOf('803'));
    expect(html).toContain('21:59');
    // cause badge uses the translated cause label
    expect(html).toContain('Signal failure');
    expect(html).toContain('Vehicle fault');
    // the table itself carries the anchor target
    expect(html).toContain('id="disruptions-table"');
  });

  it('caps the hero strip at the 3 newest disruptions', () => {
    const state = {
      ...createInitialState(),
      live: { ...live, disruption_count: 4 },
      disruptions: [olderDisruption, newDisruption, { ...olderDisruption, id: 3, line: '802', timestamp: '2026-08-06T21:20:00' }, { ...olderDisruption, id: 4, line: '801', timestamp: '2026-08-06T21:10:00' }],
      disruptionsState: 'ok' as const,
    };
    const html = renderApp(state, 'en', 'declined');
    const itemCount = (html.match(/class="hero-strip-item"/g) ?? []).length;
    expect(itemCount).toBe(3);
  });

  it('is hidden when disruption_count is 0 or the today list is empty', () => {
    const noCount = { ...createInitialState(), live: { ...live, disruption_count: 0 }, disruptions: [newDisruption], disruptionsState: 'ok' as const };
    expect(renderApp(noCount, 'en', 'declined')).not.toContain('class="hero-strip"');

    const noRows = { ...createInitialState(), live, disruptions: [], disruptionsState: 'ok' as const };
    expect(renderApp(noRows, 'en', 'declined')).not.toContain('class="hero-strip"');
  });

  it('is hidden in archive mode (rows shown are historical, not active)', () => {
    const state = {
      ...createInitialState(),
      live,
      disruptions: [newDisruption],
      disruptionsState: 'ok' as const,
      disruptionsMode: 'archive' as const,
    };
    expect(renderApp(state, 'en', 'declined')).not.toContain('class="hero-strip"');
  });

  it('hero label is trilingual', () => {
    const state = { ...createInitialState(), live, disruptions: [newDisruption], disruptionsState: 'ok' as const };
    expect(renderApp(state, 'sv', 'declined')).toContain('Just nu');
    expect(renderApp(state, 'da', 'declined')).toContain('Lige nu');
  });
});

describe('renderApp — SEO lead (H2 under the brand)', () => {
  it('renders the lead tagline under the H1 with train + Øresundståg wording', () => {
    const html = renderApp(createInitialState(), 'en', 'declined');
    expect(html).toContain('<h2 class="lead">');
    expect(html).toMatch(/Live Øresundståg \/ train departures Hyllie ↔ København H/);
    // H1 (brand) comes before the H2 lead
    expect(html.indexOf('<h1 class="brand">')).toBeLessThan(html.indexOf('<h2 class="lead">'));
  });

  it('the lead is trilingual', () => {
    expect(renderApp(createInitialState(), 'sv', 'declined')).toMatch(/tågavgångar/);
    expect(renderApp(createInitialState(), 'da', 'declined')).toMatch(/togafgange/);
  });
});
