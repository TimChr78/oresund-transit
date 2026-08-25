import type { AppState } from '../state';
import { translate, type Lang } from '../i18n';
import { esc } from '../lib/html';
import { filterByDirection, sortNewestFirst } from '../lib/stats';
import { renderConsentBanner } from './ConsentBanner';
import { renderDirectionTabs } from './DirectionTabs';
import { renderDisruptionsHero } from './DisruptionsHero';
import { renderDisruptionsTable } from './DisruptionsTable';
import { renderFooter } from './Footer';
import { renderHistoryCharts } from './HistoryCharts';
import { renderStatCards } from './StatCards';
import { renderStatusBanner } from './StatusBanner';

export type ConsentState = 'accepted' | 'declined' | null;

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
 */
export function renderApp(state: AppState, lang: Lang, consent: ConsentState): string {
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
    );
  }

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
      <div class="brand">${translate('brand_name', lang)} <span class="brand-sub">${translate('brand_sub', lang)}</span></div>
      <span class="board-label">Hyllie ↔ København H</span>
    </header>
    <h1 class="lead">${translate('lead_tagline', lang)}</h1>
    ${banner}
    <main class="board">
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
    </main>
    ${consent === null ? renderConsentBanner(lang) : ''}
    ${renderFooter(lang)}
  </div>`;
}
