import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Departure } from '@oresund/shared';
import type { StationResponse } from '../src/api';
import {
  parseStationScope,
  renderStationPicker,
  stationNames,
  stationScopeFromSearch,
  stationScopeLabel,
  type StationScope,
} from '../src/components/StationPicker';
import { createInitialState, reducer } from '../src/state';
import { renderStationDepartures } from '../src/components/StationDepartures';

const DEPARTURE: Departure = {
  id: 87113,
  stop_id: '740001586',
  stop_name: 'Malmö Hyllie',
  line: '803',
  destination: 'Østerport',
  sched_time: '2026-09-03T06:14:00',
  delay_seconds: 650,
  canceled: 0,
  status: 'delayed',
  technical_number: '1017',
  dep_key: '2026-09-03_803_06:14_Østerport',
  first_seen: '2026-09-03T05:15:14',
  last_updated: '2026-09-03T05:25:14',
};

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
  recent: [DEPARTURE],
};

describe('parseStationScope (backlog A1)', () => {
  it('accepts the four monitored slugs', () => {
    expect(parseStationScope('hyllie')).toBe('hyllie');
    expect(parseStationScope('malmo-c')).toBe('malmo-c');
    expect(parseStationScope('kastrup')).toBe('kastrup');
    expect(parseStationScope('kobenhavn-h')).toBe('kobenhavn-h');
  });

  it('collapses everything else to the whole corridor', () => {
    // Untrusted input: ?station= comes from the address bar.
    expect(parseStationScope(null)).toBe('all');
    expect(parseStationScope(undefined)).toBe('all');
    expect(parseStationScope('')).toBe('all');
    expect(parseStationScope('ALL')).toBe('all');
    expect(parseStationScope('../etc')).toBe('all');
    expect(parseStationScope('hyllie OR 1=1')).toBe('all');
  });
});

describe('stationScopeLabel (backlog A1)', () => {
  it('names the picked station instead of the four-station list', () => {
    expect(stationScopeLabel('en', 'hyllie')).toBe('Malmö Hyllie');
    expect(stationScopeLabel('sv', 'kobenhavn-h')).toBe('Köpenhamn H');
  });

  it('keeps the four-station list for the corridor', () => {
    expect(stationScopeLabel('en')).toBe(stationNames('en').join(' · '));
    expect(stationScopeLabel('en', 'all')).toBe(stationScopeLabel('en'));
  });
});

describe('renderStationPicker (backlog A1)', () => {
  it('leads with the All reset and links it to the board itself', () => {
    const html = renderStationPicker('en');
    expect(html).toContain('<a href="/" aria-current="page" data-action="set-station" data-value="all">All</a>');
    expect(html.indexOf('data-value="all"')).toBeLessThan(html.indexOf('data-value="hyllie"'));
  });

  it('marks the active option with aria-current, the link form of the state attribute', () => {
    const html = renderStationPicker('en', 'kastrup');
    expect(html).toContain('<a href="/station/kastrup" aria-current="page"');
    // Exactly one active entry: the others must not carry a stale aria-current.
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-pressed');
  });

  it('keeps every entry a real href so no-JS visitors and middle-clicks still work', () => {
    const html = renderStationPicker('sv');
    for (const slug of ['hyllie', 'malmo-c', 'kastrup', 'kobenhavn-h']) {
      expect(html).toContain(`href="/sv/station/${slug}"`);
    }
  });

  it('stays in lockstep with the hand-written nav in index.html', () => {
    const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(shell).toContain(renderStationPicker('en'));
  });
});

describe('renderStationDepartures (backlog A1)', () => {
  it('renders the KPI row from the station punctuality window', () => {
    const html = renderStationDepartures(STATION, 'en');
    expect(html).toContain('79.2%');
    expect(html).toContain('486');
    expect(html).toContain('4');
    // avg_delay_seconds is a whole-second figure rendered as whole minutes.
    expect(html).toContain('3 min');
  });

  it('renders one row per observed departure with the board delay-band scale', () => {
    const html = renderStationDepartures(STATION, 'en');
    expect(html).toContain('<td class="num">06:14</td>');
    expect(html).toContain('<td class="line">803</td>');
    expect(html).toContain('#1017');
    expect(html).toContain('<td>Østerport</td>');
    // 650 s sits in the 10–15 min band under the audit4 N-H2 edges (240/600/900).
    expect(html).toContain('badge-band-moderate');
    expect(html).toContain('>10–15 min<');
  });

  it('renders a cancellation as a badge, not a banded zero delay', () => {
    const canceled = renderStationDepartures(
      { ...STATION, recent: [{ ...DEPARTURE, status: 'canceled', canceled: 1, delay_seconds: 0 }] },
      'sv',
    );
    expect(canceled).toContain('badge-cancellation');
    expect(canceled).not.toContain('badge-band-');
  });

  it('localizes the station name from the slug, not the API stop_name', () => {
    // station_scope_heading lives in App.ts; the section body carries the name too.
    const html = renderStationDepartures(STATION, 'da');
    expect(html).toContain('Afgange observeret på Malmö Hyllie.');
    expect(html).toContain('Punktualitetsarkiv for Malmö Hyllie');
  });

  it('renders the empty state when the stop has no observed departures', () => {
    const html = renderStationDepartures({ ...STATION, recent: [] }, 'en');
    expect(html).toContain('No departures observed at Malmö Hyllie yet.');
    expect(html).not.toContain('<table');
  });

  it('carries a real link down to the station page', () => {
    const html = renderStationDepartures(STATION, 'sv');
    expect(html).toContain('href="/sv/station/hyllie"');
  });
});

describe('station scope coverage (backlog A1)', () => {
  it('every monitored slug renders a picker entry in every language', () => {
    for (const lang of ['sv', 'da', 'en'] as const) {
      for (const slug of ['hyllie', 'malmo-c', 'kastrup', 'kobenhavn-h'] as const) {
        const html = renderStationPicker(lang, slug as StationScope);
        expect(html).toContain(`data-value="${slug}"`);
        expect(stationScopeLabel(lang, slug).trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('renderStationDepartures — window note dates (audit6)', () => {
  it('localizes a real window (da uses dd-mm-yyyy)', () => {
    expect(renderStationDepartures(STATION, 'en')).toContain(
      'Observed departures over the last 7 days (2026-08-28–2026-09-03).',
    );
    expect(renderStationDepartures(STATION, 'da')).toContain('(28-08-2026–03-09-2026)');
  });

  it.each([
    ['an impossible month', '2026-99-99'],
    ['a day the month has no room for', '2026-02-30'],
  ])('keeps the raw %s in the note instead of an empty interpolation', (_label, bad) => {
    // formatDate returns '' for an impossible date; the raw string is the
    // fallback, so the note still names the window it covers rather than
    // rendering "(–)".
    const html = renderStationDepartures({ ...STATION, date_from: bad, date_to: bad }, 'en');
    expect(html).toContain(`(${bad}–${bad})`);
    expect(html).not.toContain('(–)');
  });

  it('keeps a valid end beside an impossible one, each rendered on its own terms', () => {
    const html = renderStationDepartures({ ...STATION, date_from: '2026-99-99', date_to: '2026-09-03' }, 'en');
    expect(html).toContain('(2026-99-99–2026-09-03)');
  });
});

describe('stationScopeFromSearch (audit4 N-M10)', () => {
  it('resolves the four monitored slugs out of a query string', () => {
    expect(stationScopeFromSearch('?station=hyllie')).toBe('hyllie');
    expect(stationScopeFromSearch('?station=malmo-c&days=7')).toBe('malmo-c');
    expect(stationScopeFromSearch('?x=1&station=kastrup')).toBe('kastrup');
    expect(stationScopeFromSearch('station=kobenhavn-h')).toBe('kobenhavn-h');
  });

  it.each([
    ['a slug that is not monitored', '?station=not-a-station'],
    ['a differently-cased slug', '?station=Hyllie'],
    ['a URL-encoded unknown', '?station=malmo%20central'],
    ['an empty value', '?station='],
    ['a bare parameter', '?station'],
    ['no station parameter at all', '?days=7'],
    ['an empty query string', ''],
  ])('falls back to All for %s, so the board cannot wedge in its loading state', (_label, search) => {
    expect(stationScopeFromSearch(search)).toBe('all');
    expect(stationScopeFromSearch(undefined)).toBe('all');
    expect(stationScopeFromSearch(null)).toBe('all');
  });

  it('an All fallback never puts the station section into the loading state it could not leave', () => {
    // The wedge: SET_STATION to a stop no endpoint serves leaves the section
    // 'loading' forever. 'all' is idle by construction.
    const scope = stationScopeFromSearch('?station=not-a-station');
    const state = reducer(createInitialState(), { type: 'SET_STATION', station: scope });
    expect(state.station).toBe('all');
    expect(state.stationState).toBe('idle');
    expect(state.stationData).toBeNull();
  });
});
