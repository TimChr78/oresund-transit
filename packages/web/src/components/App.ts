import type { AppState } from '../state';
import { translate, type Lang } from '../i18n';
import { esc } from '../lib/html';
import { localizedPath } from '../lib/seo';
import { filterByDirection, sortNewestFirst } from '../lib/stats';
import { renderArchiveHubLinks } from './ArchiveLinks';
import { renderDirectionTabs } from './DirectionTabs';
import { renderDisruptionsHero } from './DisruptionsHero';
import { renderDisruptionsTable } from './DisruptionsTable';
import { renderFooter } from './Footer';
import { renderHistoryCharts } from './HistoryCharts';
import { renderStationDepartures } from './StationDepartures';
import { renderStationPicker, stationNameKey, stationScopeLabel } from './StationPicker';
import { renderStatCards } from './StatCards';
import { renderStatusBanner } from './StatusBanner';

/** Per-section loading / error / empty placeholder (kept static, no motion). */
function placeholder(kind: 'loading' | 'error' | 'empty', lang: Lang, retryAction?: string): string {
  if (kind === 'loading') return `<div class="empty">${translate('empty_loading', lang)}</div>`;
  if (kind === 'error') {
    return `
    <div class="empty">
      <span>${translate('empty_error', lang)}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-action="${retryAction ?? ''}">${translate('empty_retry', lang)}</button>
    </div>`;
  }
  return `<div class="empty">${translate('empty_no_data', lang)}</div>`;
}

/**
 * Pure render of the whole board. Sections render independently: one failing
 * endpoint shows its own error/empty state while the rest stays live.
 *
 * No consent banner (audit4 N-M16): the one measurement on this site is
 * cookieless, anonymised Umami (see the methodology page's analytics section),
 * so there is nothing to opt into and no dialog to dismiss.
 */
export function renderApp(state: AppState, lang: Lang): string {
  // Banner first — the signature element.
  let banner: string;
  if (state.live) {
    banner = renderStatusBanner(state.live, lang);
  } else if (state.liveState === 'no_data') {
    banner = placeholder('empty', lang);
  } else if (state.liveState === 'error') {
    banner = placeholder('error', lang, 'retry-live');
  } else {
    banner = placeholder('loading', lang);
  }

  const stats = state.stats
    ? renderStatCards(state.stats, lang)
    : state.statsError
      ? placeholder('error', lang, 'retry-stats')
      : placeholder('loading', lang);

  const history = state.history
    ? renderHistoryCharts(state.history, state.punctuality, state.dayRange, lang, state.heatmapHistory)
    : state.historyError
      ? placeholder('error', lang, 'retry-history')
      : placeholder('loading', lang);

  let disruptions: string;
  if (state.disruptionsState === 'error') {
    disruptions = placeholder('error', lang, 'retry-disruptions');
  } else if (state.disruptionsState === 'loading') {
    disruptions = placeholder('loading', lang);
  } else {
    disruptions = renderDisruptionsTable(
      sortNewestFirst(filterByDirection(state.disruptions, state.direction)),
      lang,
      state.disruptionsMode,
      state.direction,
    );
  }

  /**
   * Station scope (backlog A1): the picked stop's own departures, above the
   * corridor sections it does not touch. The section renders only once a
   * station is picked — at 'all' the board is exactly what it always was — and
   * the previous stop's rows are already gone by the time this runs, because
   * SET_STATION clears stationData before the new fetch starts.
   */
  const stationScope = (() => {
    if (state.station === 'all') return '';
    const title = esc(
      translate('station_scope_heading', lang, {
        name: translate(stationNameKey(state.station), lang),
      }),
    );
    const body =
      state.stationState === 'error'
        ? placeholder('error', lang, 'retry-station')
        : state.stationData
          ? renderStationDepartures(state.stationData, lang)
          : placeholder('loading', lang);
    return `
      <section class="station-scope">
        <h2 class="section-title">${title}</h2>
        ${body}
      </section>`;
  })();

  // Hero strip: surface the newest ACTIVE disruptions above the table while
  // the live snapshot reports disruptions (> 0) and the today list has rows.
  // The live snapshot and the today table are fetched independently (no shared
  // snapshot ID, Disruption has no active marker), so disruption_count is the
  // only signal of how many rows are still active. The hero therefore slices
  // the newest disruptions to min(3, disruption_count) and drops any today row
  // that was not updated on the live snapshot date -- otherwise a resolved
  // row that is still in today table would be shown under "Active now".
  // Links down to the table (href="#disruptions-table"); hidden in archive
  // mode, where the rows shown are historical, not active.
  const hero = (() => {
    if (!state.live || state.live.disruption_count === 0 || state.disruptions.length === 0) return '';
    if (state.disruptionsMode !== 'today') return '';
    const liveDate = state.live.timestamp.slice(0, 10);
    const active = state.disruptions.filter((d) => (d.last_updated ?? d.timestamp)?.startsWith(liveDate)).slice(0, state.live.disruption_count);
    if (active.length === 0) return '';
    return renderDisruptionsHero(active, lang);
  })();


  const archiveToggleLabel = translate(
    state.disruptionsMode === 'archive' ? 'disruptions_back_to_today' : 'disruptions_show_all',
    lang,
  );
  const archiveToggleTarget = state.disruptionsMode === 'archive' ? 'today' : 'archive';
  const modeToggle = `
    <button type="button" class="btn mode-toggle"
      data-action="set-disruptions-mode" data-value="${archiveToggleTarget}">
      ${esc(archiveToggleLabel)}
    </button>`;

  return `
  <div class="wrap">
    <header class="topbar">
      <a class="brand" href="${esc(localizedPath('/', lang))}" lang="da">${translate('brand_name', lang)}</a>
      <span class="board-label">${esc(stationScopeLabel(lang, state.station))}</span>
    </header>
    ${renderStationPicker(lang, state.station)}
    <h1 class="lead">${translate('lead_tagline', lang)}</h1>
    ${banner}
    <main class="board">
      ${stationScope}
      ${stats}
      <section class="disruptions">
        <h2 class="section-title">${translate('section_disruptions', lang)}</h2>
        ${hero}
        ${renderDirectionTabs(
          state.disruptionsState === 'ok' ? state.disruptions : null,
          state.direction,
          lang,
        )}
        ${disruptions}
        ${modeToggle}
      </section>
      ${history}
      <section class="archives">
        <h2 class="section-title">${esc(translate('board_archives_heading', lang))}</h2>
        <p class="section-intro">${esc(translate('board_archives_intro', lang))}</p>
        ${renderArchiveHubLinks(lang, 'archive-links')}
      </section>
    </main>
    ${renderFooter(lang)}
  </div>`;
}
