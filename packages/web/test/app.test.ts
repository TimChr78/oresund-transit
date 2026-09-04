import { describe, expect, it } from 'vitest';
import { renderApp } from '../src/components/App';
import { createInitialState } from '../src/state';
import type { StationResponse } from '../src/api';
import type { Disruption, LiveStatus } from '@oresund/shared';

/** A /api/transit/station/{slug} reply as the collector serves it (A1). */
const STATION: StationResponse = {
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
  recent: [
    {
      id: 87113,
      stop_id: '740001586',
      stop_name: 'Malmö Hyllie',
      line: '803',
      destination: 'Østerport',
      sched_time: '2026-09-03T06:14:00',
      delay_seconds: 0,
      canceled: 0,
      status: 'on_time',
      technical_number: '1017',
      dep_key: '2026-09-03_803_06:14_Østerport',
      first_seen: '2026-09-03T05:15:14',
      last_updated: '2026-09-03T05:25:14',
    },
  ],
};

describe('renderApp — disruptions mode toggle', () => {
  it('shows a "Show all" toggle in today mode', () => {
    const html = renderApp(createInitialState(), 'en');
    expect(html).toContain('data-action="set-disruptions-mode"');
    expect(html).toContain('data-value="archive"');
    expect(html).toContain('Show all disruptions');
  });

  it('archive mode flips the toggle to "Back to today"', () => {
    const state = { ...createInitialState(), disruptionsMode: 'archive' as const };
    const html = renderApp(state, 'en');
    expect(html).toContain('data-value="today"');
    expect(html).toContain('Back to today');
  });

  it('toggle is trilingual', () => {
    expect(renderApp(createInitialState(), 'sv')).toContain('Visa alla störningar');
    expect(renderApp(createInitialState(), 'da')).toContain('Vis alle forstyrrelser');
  });
});

describe('renderApp — archive hub links (audit3 C3)', () => {
  it('links the archive hubs from the board body, not only the footer', () => {
    const html = renderApp(createInitialState(), 'en');
    expect(html).toContain('History &amp; archives');
    expect(html).toContain('href="/station"');
    expect(html).toContain('href="/line"');
    // audit5 H2: the hub's own URL, not the child window /history/30.
    expect(html).toContain('href="/history"');
    // Each hub carries a one-line description, so the anchor is contextual.
    expect(html).toContain('Station archives</a> <span class="why">');
  });

  it('localizes the section with the rest of the board', () => {
    expect(renderApp(createInitialState(), 'sv')).toContain('Historik &amp; arkiv');
    expect(renderApp(createInitialState(), 'da')).toContain('Historik &amp; arkiver');
    expect(renderApp(createInitialState(), 'sv')).toContain('Stationsarkiv');
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
    const html = renderApp(state, 'en');

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
    const html = renderApp(state, 'en');
    const itemCount = (html.match(/class="hero-strip-item"/g) ?? []).length;
    expect(itemCount).toBe(3);
  });

  it('is hidden when disruption_count is 0 or the today list is empty', () => {
    const noCount = { ...createInitialState(), live: { ...live, disruption_count: 0 }, disruptions: [newDisruption], disruptionsState: 'ok' as const };
    expect(renderApp(noCount, 'en')).not.toContain('class="hero-strip"');

    const noRows = { ...createInitialState(), live, disruptions: [], disruptionsState: 'ok' as const };
    expect(renderApp(noRows, 'en')).not.toContain('class="hero-strip"');
  });

  it('is hidden in archive mode (rows shown are historical, not active)', () => {
    const state = {
      ...createInitialState(),
      live,
      disruptions: [newDisruption],
      disruptionsState: 'ok' as const,
      disruptionsMode: 'archive' as const,
    };
    expect(renderApp(state, 'en')).not.toContain('class="hero-strip"');
  });


  it('hero excludes a resolved today row (not updated on live date) under Active now', () => {
    const liveResolved: LiveStatus = {
      status: 'amber',
      status_text: 'Delays',
      timestamp: '2026-08-06T21:59:27',
      time_short: '21:59',
      disruption_count: 2,
      departure_counts: { to_denmark: 0, to_sweden: 0, bus: 0 },
      service_shutdown: false,
      directions: { to_denmark: [], to_sweden: [], bus: [] },
    };
    const state = {
      ...createInitialState(),
      live: liveResolved,
      liveState: 'ok' as const,
      disruptions: [
        newDisruption,
        { ...olderDisruption, last_updated: '2026-08-05T22:00:00', timestamp: '2026-08-05T22:00:00' },
      ],
      disruptionsState: 'ok' as const,
    };
    const html = renderApp(state, 'en');
    expect(html).toContain('Active now');
    const heroIdx = html.indexOf('hero-strip');
    const heroSlice = html.slice(heroIdx, heroIdx + 800);
    expect(heroSlice).toContain('804');
    expect(heroSlice).not.toContain('803');
  });

  it('hero slices to disruption_count — does not show more than live reports as active', () => {
    const baseLive: LiveStatus = {
      status: 'amber',
      status_text: 'Delays',
      timestamp: '2026-08-06T21:59:27',
      time_short: '21:59',
      disruption_count: 2,
      departure_counts: { to_denmark: 0, to_sweden: 0, bus: 0 },
      service_shutdown: false,
      directions: { to_denmark: [], to_sweden: [], bus: [] },
    };
    const liveOne: LiveStatus = { ...baseLive, disruption_count: 1 };
    const state = {
      ...createInitialState(),
      live: liveOne,
      liveState: 'ok' as const,
      disruptions: [newDisruption, olderDisruption],
      disruptionsState: 'ok' as const,
    };
    const html = renderApp(state, 'en');
    const heroIdx = html.indexOf('hero-strip');
    const heroSlice = html.slice(heroIdx, heroIdx + 800);
    expect(heroSlice).toContain('804');
    expect(heroSlice).not.toContain('803');
  });
  it('hero label is trilingual', () => {
    const state = { ...createInitialState(), live, disruptions: [newDisruption], disruptionsState: 'ok' as const };
    expect(renderApp(state, 'sv')).toContain('Just nu');
    expect(renderApp(state, 'da')).toContain('Lige nu');
  });
});

describe('renderApp — descriptive H1 (SEO audit H3)', () => {
  it('renders exactly one H1: the keyword-bearing lead sentence, never the bare brand', () => {
    const html = renderApp(createInitialState(), 'en');
    const h1s = html.match(/<h1\b[^>]*>/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toContain('class="lead"');
    expect(html).toContain('<div class="brand">');
    expect(html).not.toContain('<h1 class="brand">');
  });
});
describe('renderApp — station picker + board scope (audit3 C1, backlog A1)', () => {
  it('renders a nav of links to all four station pages, crawler-visible in the board body', () => {
    const html = renderApp(createInitialState(), 'en');
    expect(html).toContain('<nav class="station-nav" aria-label="Monitored stations">');
    expect(html).toContain('href="/station/hyllie"');
    expect(html).toContain('href="/station/malmo-c"');
    expect(html).toContain('href="/station/kastrup"');
    expect(html).toContain('href="/station/kobenhavn-h"');
    // Real links, not buttons: without JS they still resolve to the station
    // pages, and a middle-click / open-in-tab keeps working.
    expect(html).toMatch(/<a href="\/station\/hyllie"[^>]*>Malmö Hyllie<\/a>/);
    // Every entry carries the hook the board's click handler switches on.
    expect(html).toContain('data-action="set-station" data-value="hyllie"');
    // "All" is the corridor reset and links to the board itself.
    expect(html).toMatch(/<a href="\/"[^>]*>All<\/a>/);
  });

  it('names all four monitored stations in the scope label instead of two', () => {
    const html = renderApp(createInitialState(), 'en');
    expect(html).toContain('<span class="board-label">Malmö Hyllie · Malmö C · Københavns Lufthavn (Kastrup) · København H</span>');
    // The two-station under-claim is gone from the label (the H1 lead still
    // names the corridor, which is a different, documented scope).
    expect(html).not.toContain('<span class="board-label">Hyllie ↔ København H</span>');
  });

  it('localizes the picker and the scope label', () => {
    expect(renderApp(createInitialState(), 'sv')).toContain('href="/sv/station/hyllie"');
    expect(renderApp(createInitialState(), 'sv')).toContain('Malmö Hyllie · Malmö C · Kastrup flygplats · Köpenhamn H');
    expect(renderApp(createInitialState(), 'da')).toContain('Malmö Hyllie · Malmö C · Kastrup Lufthavn · København H');
  });

  it('marks the active option with aria-current and leaves the others unmarked', () => {
    const all = renderApp(createInitialState(), 'en');
    expect(all).toContain('<a href="/" aria-current="page" data-action="set-station" data-value="all">');
    expect(all).not.toContain('<a href="/station/hyllie" aria-current="page"');

    const scoped = renderApp({ ...createInitialState(), station: 'hyllie' }, 'en');
    expect(scoped).toContain('<a href="/station/hyllie" aria-current="page"');
    expect(scoped).not.toContain('<a href="/" aria-current="page"');
  });

  it('replaces the four-station label with the picked station name', () => {
    const html = renderApp({ ...createInitialState(), station: 'malmo-c' }, 'en');
    expect(html).toContain('<span class="board-label">Malmö C</span>');
    expect(html).not.toContain('Malmö C · Københavns Lufthavn (Kastrup)');
  });

  it('renders no station section while the whole corridor is in scope', () => {
    const html = renderApp(createInitialState(), 'en');
    expect(html).not.toContain('station-scope');
    expect(html).not.toContain('station_scope_heading');
  });

  it('shows the station section loading while the per-station fetch is in flight', () => {
    const html = renderApp({ ...createInitialState(), station: 'hyllie', stationState: 'loading' }, 'en');
    expect(html).toContain('class="station-scope"');
    expect(html).toContain('Latest departures at Malmö Hyllie');
    expect(html).not.toContain('board-table');
  });

  it('renders the picked station departures, KPIs and onward link', () => {
    const html = renderApp(
      { ...createInitialState(), station: 'hyllie', stationState: 'ok', stationData: STATION },
      'en',
    );
    expect(html).toContain('Latest departures at Malmö Hyllie');
    expect(html).toContain('Departures observed at Malmö Hyllie.');
    // KPI row + the departures table itself.
    expect(html).toContain('79.2%');
    expect(html).toContain('class="board-table"');
    expect(html).toContain('#1017');
    expect(html).toContain('Punctuality archive for Malmö Hyllie');
    // The scoped table never masquerades as the corridor disruption table.
    expect(html).not.toContain('id="disruptions-table"');
  });

  it('shows the empty state when the stop has no observed departures', () => {
    const html = renderApp(
      { ...createInitialState(), station: 'kastrup', stationState: 'ok', stationData: { ...STATION, slug: 'kastrup', stop_name: 'Københavns Lufthavn (Kastrup)', recent: [], total_departures: 0 } },
      'en',
    );
    expect(html).toContain('No departures observed at Københavns Lufthavn (Kastrup) yet.');
    expect(html).not.toContain('class="board-table"');
  });

  it('gives the station section its own retry that does not touch the corridor sections', () => {
    const html = renderApp({ ...createInitialState(), station: 'hyllie', stationState: 'error', stationError: 'boom' }, 'en');
    expect(html).toContain('data-action="retry-station"');
    expect(html).not.toContain('data-action="retry-disruptions"');
  });
});

describe('renderApp — landmarks', () => {
  it('renders exactly one <footer> (audit4 N-M2: the shell ships a second one that boot() drops)', () => {
    expect(renderApp(createInitialState(), 'en').match(/<footer/g)).toHaveLength(1);
    expect(renderApp(createInitialState(), 'sv').match(/<footer/g)).toHaveLength(1);
  });
});
