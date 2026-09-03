import { describe, expect, it } from 'vitest';
import { renderApp } from '../src/components/App';
import { renderDirectionTabs } from '../src/components/DirectionTabs';
import { renderDisruptionsTable } from '../src/components/DisruptionsTable';
import { renderFooter } from '../src/components/Footer';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { renderStationDepartures } from '../src/components/StationDepartures';
import { renderHistoryCharts } from '../src/components/HistoryCharts';
import type { HistoryResponse } from '../src/api';
import type { StationResponse } from '../src/api';
import { createInitialState } from '../src/state';
import { getDict, type Lang } from '../src/i18n';

/**
 * Markup semantics from the audit4 LOW sweep (wave 4): table header scoping,
 * filter-group roles, localized internal links and the footer's separator
 * characters. Each is small on its own; together they are what a screen
 * reader actually hears on the board.
 */

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
      sched_time: '2026-09-03T18:14:00',
      delay_seconds: 0,
      canceled: 0,
      status: 'on_time',
      technical_number: '1017',
      dep_key: '2026-09-03_803_18:14_Østerport',
      first_seen: '2026-09-03T17:15:14',
      last_updated: '2026-09-03T17:25:14',
    },
  ],
};

const LANGS: Lang[] = ['sv', 'da', 'en'];

/** A one-day history, so the history section (and its range filter) renders. */
const HISTORY: HistoryResponse = {
  days: 7,
  date_from: '2026-08-28',
  date_to: '2026-09-03',
  total_disruptions: 2,
  daily: [{ date: '2026-09-03', count: 2, cancellations: 1, delays: 1, alerts: 0, avg_delay: 300 }],
  by_line: [{ line: '804', count: 2, avg_delay: 300, max_delay: 300 }],
  by_cause: [{ cause: 'signal_failure', count: 2 }],
  by_hour: [{ hour: 17, count: 2, avg_delay: 300 }],
};

const DISRUPTIONS = [
  {
    id: 1,
    timestamp: '2026-09-03T18:00:00',
    line: '804',
    type: 'delay' as const,
    cause: 'signal_failure',
    route_section: null,
    severity: 'minor',
    delay_seconds: 600,
    raw_text: 'Signalfel',
    dep_key: 'k1',
    first_seen: '2026-09-03T18:00:00',
    last_updated: '2026-09-03T18:00:00',
    direction: 'to_denmark' as const,
    technical_number: '1143',
    sched_time: '2026-09-03T18:00:00',
  },
];

describe('table semantics', () => {
  it('scopes every header cell of every table on the site', () => {
    expect(renderDisruptionsTable(DISRUPTIONS, 'en')).toMatch(/<th scope="col">Time<\/th>/);
    expect(renderDisruptionsTable(DISRUPTIONS, 'en')).not.toMatch(/<th>[^<]/);
    expect(renderStationDepartures(STATION, 'en')).toMatch(/<th scope="col">Line<\/th>/);
    const meth = renderMethodologyPage('en', getDict('en'));
    expect(meth).toContain('<th scope="col">KPI</th>');
    // The KPI names the row, so they are row headings, not body cells.
    expect(meth).toContain('<th scope="row">On time</th>');
    expect(meth).not.toContain('<td>On time</td>');
  });

  it('names each data table, since no visible heading sits inside its wrapper', () => {
    expect(renderDisruptionsTable(DISRUPTIONS, 'en')).toContain('<caption class="sr-only">Disruptions today</caption>');
    expect(
      renderDisruptionsTable(DISRUPTIONS, 'en', 'archive'),
    ).toContain('<caption class="sr-only">Disruptions on record</caption>');
    expect(renderStationDepartures(STATION, 'en')).toContain('<caption class="sr-only">Latest observed departures</caption>');
    expect(renderMethodologyPage('en', getDict('en'))).toContain('<caption class="sr-only">KPI definitions</caption>');
  });

  it('localizes those captions for sv and da', () => {
    expect(renderDisruptionsTable(DISRUPTIONS, 'sv')).toContain('Störningar idag');
    expect(renderDisruptionsTable(DISRUPTIONS, 'da', 'archive')).toContain('Forstyrrelser i arkivet');
    expect(renderStationDepartures(STATION, 'sv')).toContain('Senast observerade avgångar');
  });
});

describe('filter groups', () => {
  it('renders the direction filter as a pressed button group, not a tablist', () => {
    const tabs = renderDirectionTabs(null, 'all', 'en');
    expect(tabs).toContain('role="group"');
    expect(tabs).toContain('aria-pressed="true"');
    expect(tabs).not.toContain('role="tablist"');
    expect(tabs).not.toContain('role="tab"');
    expect(tabs).not.toContain('aria-selected');
  });

  it('names both filter groups in the page language', () => {
    expect(renderDirectionTabs(null, 'all', 'sv')).toContain('Filtrera störningar efter riktning');
    expect(renderApp(createInitialState(), 'da')).toContain('Filtrér forstyrrelser efter retning');
    expect(renderHistoryCharts(HISTORY, null, 7, 'en')).toContain('aria-label="History range"');
  });
});

describe('localized internal links', () => {
  it('keeps the footer and the back link on the page’s own language path', () => {
    const paths: Record<Lang, string> = { en: '', sv: '/sv', da: '/da' };
    for (const lang of LANGS) {
      const prefix = paths[lang];
      const footer = renderFooter(lang);
      expect(footer, `${lang} footer privacy`).toContain(`href="${prefix}/privacy"`);
      expect(footer, `${lang} footer methodology`).toContain(`href="${prefix}/methodology"`);
      expect(renderPrivacyPage(lang, getDict(lang)), `${lang} back`).toContain(`href="${prefix}/"`);
      expect(renderMethodologyPage(lang, getDict(lang)), `${lang} back`).toContain(`href="${prefix}/"`);
    }
  });

  it('drops the <a>-invalid type attribute from the RSS link', () => {
    expect(renderFooter('en')).toContain('<a href="/feed.xml">');
    expect(renderFooter('en')).not.toMatch(/<a[^>]*type=/);
  });

  it('marks the footer separators decorative, like every other · on the site', () => {
    const footer = renderFooter('en');
    const seps = footer.match(/<span class="sep"[^>]*>·<\/span>/g) ?? [];
    expect(seps.length).toBeGreaterThan(0);
    for (const sep of seps) expect(sep).toContain('aria-hidden="true"');
  });

  it('uses the aria-current="page" token for the current station link', () => {
    expect(renderApp(createInitialState(), 'en')).toContain('aria-current="page"');
    expect(renderApp(createInitialState(), 'en')).not.toContain('aria-current="true"');
  });
});
