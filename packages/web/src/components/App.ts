import type { AppState } from '../state';
import { translate, type Lang } from '../i18n';
import { filterByDirection, sortNewestFirst } from '../lib/stats';
import { renderConsentBanner } from './ConsentBanner';
import { renderDirectionTabs } from './DirectionTabs';
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
    ? renderHistoryCharts(state.history, state.punctuality, state.dayRange, lang)
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
    );
  }

  return `
  <div class="wrap">
    <header class="topbar">
      <h1 class="brand">Øresund <span class="brand-sub">live</span></h1>
      <span class="board-label">Hyllie ↔ København H</span>
    </header>
    ${banner}
    <main class="board">
      ${stats}
      <section class="disruptions">
        <h2 class="section-title">${translate('section_disruptions', lang)}</h2>
        ${renderDirectionTabs(state.live, state.direction, lang)}
        ${disruptions}
      </section>
      ${history}
    </main>
    ${consent === null ? renderConsentBanner(lang) : ''}
    ${renderFooter(lang)}
  </div>`;
}
