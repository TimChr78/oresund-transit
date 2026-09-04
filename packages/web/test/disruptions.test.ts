import { describe, expect, it } from 'vitest';
import type { Disruption } from '@oresund/shared';
import { renderDisruptionsTable } from '../src/components/DisruptionsTable';
import { localToday } from '../src/lib/stats';

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

  it('names the direction when a narrowed board has zero rows (backlog B4)', () => {
    const html = renderDisruptionsTable([], 'en', 'today', 'to_sweden');
    expect(html).not.toContain('<table');
    expect(html).toContain('No disruptions in this direction today.');
    // The corridor-wide all-clear would over-claim under a filter.
    expect(html).not.toContain('All clear');
  });

  it('gives the direction empty state its own SV/DA copy', () => {
    expect(renderDisruptionsTable([], 'sv', 'today', 'to_denmark')).toContain('Inga störningar i den här riktningen idag.');
    expect(renderDisruptionsTable([], 'da', 'today', 'to_sweden')).toContain('Ingen forstyrrelser i denne retning i dag.');
  });

  it('keeps the corridor all-clear for the unfiltered board (backlog B4)', () => {
    expect(renderDisruptionsTable([], 'en', 'today', 'all')).toContain('All clear');
  });
});

describe('renderDisruptionsTable — scheduled vs expected time pair (backlog B1)', () => {
  it('pairs the scheduled slot with the delay-implied expectation', () => {
    const html = renderDisruptionsTable([disruption({ delay_seconds: 650 })], 'en');
    expect(html).toContain('<span class="time-sched">21:59</span>');
    expect(html).toContain('→ 22:10</span>');
  });

  it('explains the pair in the tooltip, with the exact delay', () => {
    const html = renderDisruptionsTable([disruption({ delay_seconds: 650 })], 'en');
    expect(html).toContain('title="Scheduled 21:59 · expected 22:10 (+11 min)"');
  });

  it('localizes the expectation separator and the tooltip', () => {
    const html = renderDisruptionsTable([disruption({ delay_seconds: 650 })], 'da');
    expect(html).toContain('<span class="time-sched">21.59</span>');
    expect(html).toContain('→ 22.10</span>');
    expect(html).toContain('Planlagt 21.59 · forventet 22.10');
  });

  it('wraps past midnight without going negative', () => {
    const html = renderDisruptionsTable(
      [disruption({ sched_time: '2026-08-06T23:55:00', delay_seconds: 900 })],
      'en',
    );
    expect(html).toContain('→ 00:10</span>');
  });

  it('keeps a single time when there is no measured delay', () => {
    const html = renderDisruptionsTable([disruption({ delay_seconds: 0 })], 'en');
    expect(html).toContain('<span class="time-sched">21:59</span>');
    expect(html).not.toContain('time-actual');
  });

  it('keeps a single time when the delay is unknown (cancellations, alerts)', () => {
    const html = renderDisruptionsTable([disruption({ delay_seconds: null, type: 'cancellation' })], 'en');
    expect(html).toContain('<span class="time-sched">21:59</span>');
    expect(html).not.toContain('time-actual');
  });
});

describe('renderDisruptionsTable — route_section (backlog B1)', () => {
  it('renders the affected stretch as a second line in the Line cell', () => {
    const html = renderDisruptionsTable([disruption({ route_section: 'Hyllie->Østerport' })], 'en');
    expect(html).toContain('<td class="line">804<span class="train-no">#1143</span><span class="route-section" title="Affected section">Hyllie-&gt;Østerport</span></td>');
  });

  it('escapes the section text', () => {
    const html = renderDisruptionsTable([disruption({ route_section: '<Hyllie & CPH>' })], 'en');
    expect(html).toContain('&lt;Hyllie &amp; CPH&gt;');
    expect(html).not.toContain('<Hyllie');
  });

  it('omits the line entirely when the feed populated no section', () => {
    const html = renderDisruptionsTable([disruption({ route_section: null })], 'en');
    expect(html).not.toContain('route-section');
  });

  it('localizes the section hint across SV/DA/EN', () => {
    expect(renderDisruptionsTable([disruption({ route_section: 'Hyllie->Østerport' })], 'sv')).toContain('title="Berörd sträcka"');
    expect(renderDisruptionsTable([disruption({ route_section: 'Hyllie->Østerport' })], 'da')).toContain('title="Berørt strækning"');
    expect(renderDisruptionsTable([disruption({ route_section: 'Hyllie->Østerport' })], 'en')).toContain('title="Affected section"');
  });
});

describe('renderDisruptionsTable — archive mode (date separators)', () => {
  it('inserts a date-separator row when the date changes', () => {
    const rows = [
      disruption({ sched_time: '2026-08-06T21:59:00', timestamp: '2026-08-06T21:59:27' }),
      disruption({ sched_time: '2026-08-05T08:10:00', timestamp: '2026-08-05T08:10:12' }),
    ];
    const html = renderDisruptionsTable(rows, 'en', 'archive');
    expect(html).toContain('date-sep');
    // Both dates get a separator (archive starts fresh)
    expect(html).toContain('2026-08-06');
    expect(html).toContain('2026-08-05');
  });

  it('emits no separators for rows all on the same date', () => {
    const rows = [
      disruption({ sched_time: '2026-08-06T21:59:00' }),
      disruption({ sched_time: '2026-08-06T08:10:00' }),
    ];
    const html = renderDisruptionsTable(rows, 'en', 'archive');
    expect(html.match(/date-sep/g) ?? []).toHaveLength(1);
  });

  it('renders no separators at all in today mode (default)', () => {
    const rows = [
      disruption({ sched_time: '2026-08-06T21:59:00' }),
      disruption({ sched_time: '2026-08-05T08:10:00' }),
    ];
    const html = renderDisruptionsTable(rows, 'en');
    expect(html).not.toContain('date-sep');
  });

  it('labels today\'s separator with the translated Today, not the raw date', () => {
    const iso = localToday();
    const html = renderDisruptionsTable(
      [disruption({ sched_time: iso + 'T09:00:00', timestamp: iso + 'T09:00:05' })],
      'sv',
      'archive',
    );
    expect(html).toContain('Idag');
    expect(html).not.toContain('>' + iso + '<');
  });

  it('formats archive dates per locale (da uses dd-mm-yyyy)', () => {
    const rows = [
      disruption({ sched_time: '2026-08-05T08:10:00', timestamp: '2026-08-05T08:10:12' }),
    ];
    const html = renderDisruptionsTable(rows, 'da', 'archive');
    expect(html).toContain('05-08-2026');
  });

  it('groups separators by sched_time date, falling back to timestamp', () => {
    const rows = [
      disruption({ sched_time: null, timestamp: '2026-07-20T22:15:00' }),
    ];
    const html = renderDisruptionsTable(rows, 'en', 'archive');
    expect(html).toContain('2026-07-20');
  });

  it.each([
    ['an impossible month', '2026-99-99'],
    ['a day the month has no room for', '2026-02-30'],
  ])('falls back to the raw date for %s instead of an empty separator', (_label, bad) => {
    // The separator labels the group, so an empty interpolation left a
    // date-sep row with nothing in it. The raw string is the honest fallback.
    const html = renderDisruptionsTable([disruption({ sched_time: `${bad}T09:00:00` })], 'en', 'archive');
    expect(html).toContain('date-sep');
    // The separator cell carries the raw date, so the group is still labelled.
    expect(html).toContain(`>${bad}<`);
  });

  it('keeps raw and localized separators apart when both appear', () => {
    const html = renderDisruptionsTable(
      [disruption({ sched_time: '2026-08-06T09:00:00' }), disruption({ id: 2, sched_time: '2026-99-99T09:00:00' })],
      'en',
      'archive',
    );
    expect((html.match(/date-sep/g) ?? [])).toHaveLength(2);
    expect(html).toContain('>2026-08-06<');
    expect(html).toContain('>2026-99-99<');
  });
});

describe('renderDisruptionsTable — empty archive', () => {
  it('archive empty state does not say "today"', () => {
    const html = renderDisruptionsTable([], 'en', 'archive');
    expect(html).not.toContain('today');
    expect(html).toContain('No disruptions logged');
  });
});

describe('renderDisruptionsTable — delay band badges (audit3 H1)', () => {
  it('renders the delay band badge instead of raw seconds', () => {
    const html = renderDisruptionsTable([disruption({ delay_seconds: 480 })], 'en');
    expect(html).toContain('badge-band-minor');
    expect(html).toContain('>4–10 min<');
    expect(html).not.toContain('>8 min<');
  });

  it('keeps the exact delay in the badge title tooltip', () => {
    const html = renderDisruptionsTable([disruption({ delay_seconds: 492 })], 'en');
    expect(html).toContain('title="8 min 12 s"');
  });

  it('picks the band from delay_seconds, not the collector severity', () => {
    // severity is near-constant (93.5% "minor" live) and no longer rendered
    const html = renderDisruptionsTable([disruption({ delay_seconds: 60, severity: 'moderate' })], 'en');
    expect(html).toContain('badge-band-on-time');
    expect(html).toContain('>On time<');
    expect(html).not.toContain('badge-sev-');
  });

  it('localizes the band labels across SV/DA/EN', () => {
    expect(renderDisruptionsTable([disruption({ delay_seconds: 0 })], 'sv')).toContain('>I tid<');
    expect(renderDisruptionsTable([disruption({ delay_seconds: 0 })], 'da')).toContain('>Til tiden<');
    expect(renderDisruptionsTable([disruption({ delay_seconds: 2000 })], 'sv')).toContain('>15+ min<');
  });

  it('renders the no-data mark when no delay was measured', () => {
    const html = renderDisruptionsTable([disruption({ delay_seconds: null, type: 'cancellation' })], 'en');
    expect(html).toContain('<td class="num">—</td>');
    expect(html).not.toContain('badge-band-');
  });

  it('drops the severity column (6 columns, date separators span them all)', () => {
    const html = renderDisruptionsTable([disruption()], 'en', 'archive');
    expect(html).toContain('<th scope="col">Time</th><th scope="col">Line</th><th scope="col">Type</th><th scope="col">Delay</th><th scope="col">Direction</th><th scope="col">Reason</th>');
    expect(html).toContain('colspan="6"');
    expect(html).not.toContain('colspan="7"');
    expect(html).not.toContain('<th>Severity</th>');
  });
});

describe('renderDisruptionsTable — on-time band gating (audit4 N-H3)', () => {
  it('never bands a cancellation green, even with a zero delay', () => {
    const html = renderDisruptionsTable(
      [disruption({ type: 'cancellation', delay_seconds: 0 })],
      'en',
    );
    expect(html).toContain('>Cancellation<');
    expect(html).not.toContain('badge-band-on-time');
    expect(html).not.toContain('>On time<');
    // No delay to report → the no-data mark, not a badge with empty text.
    expect(html).toContain('<td class="num">—</td>');
  });

  it('never bands an alert green, even with a zero delay', () => {
    const html = renderDisruptionsTable([disruption({ type: 'alert', delay_seconds: 0 })], 'en');
    expect(html).toContain('>Alert<');
    expect(html).not.toContain('badge-band-on-time');
    expect(html).not.toContain('>On time<');
  });

  it('keeps a real delay band on an alert row (only the green claim is gated)', () => {
    const html = renderDisruptionsTable([disruption({ type: 'alert', delay_seconds: 660 })], 'en');
    expect(html).toContain('badge-band-moderate');
    expect(html).toContain('>10–15 min<');
    expect(html).not.toContain('badge-band-on-time');
  });

  it('keeps the on-time band on a plain delay row', () => {
    const html = renderDisruptionsTable([disruption({ type: 'delay', delay_seconds: 120 })], 'en');
    expect(html).toContain('badge-band-on-time');
    expect(html).toContain('>On time<');
  });

  it('does not fall back to the band in the reason cell of a gated row', () => {
    // A cancellation with an unclassifiable cause used to read "+0 min · On time".
    const html = renderDisruptionsTable(
      [disruption({ type: 'cancellation', delay_seconds: 0, cause: 'unknown', raw_text: null })],
      'en',
    );
    expect(html).not.toContain('>On time<');
    expect(html).not.toContain('On time');
  });
});

describe('renderDisruptionsTable — cause gating (audit3 H1)', () => {
  it('renders no cause badge for the unknown cause', () => {
    const html = renderDisruptionsTable([disruption({ cause: 'unknown', raw_text: null })], 'en');
    expect(html).not.toContain('badge-cause');
    expect(html).not.toContain('>Unknown<');
  });

  it('derives the reason from the delay band when the cause is unknown', () => {
    const html = renderDisruptionsTable([disruption({ cause: 'unknown', raw_text: null, delay_seconds: 660 })], 'en');
    expect(html).toContain('+11 min · 10–15 min');
    expect(html).not.toContain('Unknown');
  });

  it('keeps the cause badge for a classified cause', () => {
    const html = renderDisruptionsTable([disruption({ cause: 'signal_failure' })], 'en');
    expect(html).toContain('badge-cause');
    expect(html).toContain('>Signal failure<');
    // the reason carries the cause, not the band
    expect(html).toContain('+11 min · Signal failure');
  });

  it('falls back to the no-data mark only when neither cause nor delay is known', () => {
    const html = renderDisruptionsTable(
      [disruption({ cause: 'unknown', raw_text: null, delay_seconds: null })],
      'en',
    );
    expect(html).toContain('<td class="reason" title="—">—</td>');
  });
});

describe('train technical_number (audit3 H2)', () => {
  const base = {
    id: 1,
    timestamp: '2026-08-06T21:59:27',
    line: '804',
    type: 'delay' as const,
    cause: 'signal_failure',
    route_section: null,
    severity: 'minor',
    delay_seconds: 300,
    raw_text: 'Signalfel',
    dep_key: '804_21:59_Østerport',
    first_seen: null,
    last_updated: null,
    direction: 'to_denmark',
    technical_number: '1132',
    sched_time: '2026-08-06T21:59:00',
  };

  it('renders the train number as a secondary token in the Line cell', () => {
    const html = renderDisruptionsTable([base], 'en');
    expect(html).toContain('<td class="line">804<span class="train-no">#1132</span></td>');
    // No eighth column: the table stays phone-sized.
    expect(html).toMatch(/<th scope="col">Line<\/th><th scope="col">Type<\/th>/);
  });

  it('omits the token when a row has no train number', () => {
    const html = renderDisruptionsTable([{ ...base, technical_number: null }], 'en');
    expect(html).toContain('<td class="line">804</td>');
    expect(html).not.toContain('train-no');
  });
});
