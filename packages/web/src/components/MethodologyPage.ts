import type { Dict, Key, Lang } from '../i18n';
import { esc } from '../lib/html';
import { renderFooter } from './Footer';
import { renderRelatedPages } from './ArchiveLinks';

/**
 * The 12 KPIs on the board, in display order. Each row reuses the existing
 * label key for the KPI name (stat_*, hist_*, insight_peak) and a
 * meth_def_* key for its full definition.
 */
const METHODOLOGY_DEFS: { name: Key; def: Key }[] = [
  { name: 'stat_on_time', def: 'meth_def_on_time' },
  { name: 'stat_delayed', def: 'meth_def_delayed' },
  { name: 'stat_canceled', def: 'meth_def_canceled' },
  { name: 'stat_avg_delay', def: 'meth_def_avg_delay' },
  { name: 'stat_departures', def: 'meth_def_departures' },
  { name: 'hist_daily', def: 'meth_def_daily' },
  { name: 'hist_punctuality', def: 'meth_def_punctuality' },
  { name: 'hist_by_line', def: 'meth_def_by_line' },
  { name: 'hist_by_weekday', def: 'meth_def_by_weekday' },
  { name: 'hist_by_cause', def: 'meth_def_by_cause' },
  { name: 'hist_by_hour', def: 'meth_def_by_hour' },
  { name: 'insight_peak', def: 'meth_def_peak' },
];

/**
 * Methodology page — the full definitions of every metric, threshold, data
 * source and caveat. Same shell as the privacy page (topbar + back link,
 * plain-voice column, footer with the lang switcher).
 *
 * Takes `dict` explicitly (per the i18n rule: every render reads one language
 * dictionary) plus `lang` for the Footer.
 */
export function renderMethodologyPage(lang: Lang, dict: Dict): string {
  const rows = METHODOLOGY_DEFS.map(
    ({ name, def }) => `
      <tr>
        <td>${esc(dict[name])}</td>
        <td>${esc(dict[def])}</td>
      </tr>`,
  ).join('');
  return `
  <div class="wrap privacy-wrap">
    <header class="topbar">
      <div class="brand">${esc(dict.brand_name)} <span class="brand-sub">${esc(dict.brand_sub)}</span></div>
      <a class="privacy-back" href="/">${esc(dict.privacy_back)}</a>
    </header>
    <main class="privacy">
      <h1 class="privacy-title">${esc(dict.meth_title)}</h1>
      <p class="privacy-lead">${esc(dict.meth_intro)}</p>
      <h3 class="meth-h">${esc(dict.meth_defs_title)}</h3>
      <div class="table-wrap meth-table-wrap">
        <table class="meth-table">
          <thead>
            <tr>
              <th>${esc(dict.meth_col_kpi)}</th>
              <th>${esc(dict.meth_col_definition)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <h3 class="meth-h">${esc(dict.meth_thresholds_title)}</h3>
      <p>${esc(dict.meth_thresholds_body)}</p>
      <h3 class="meth-h">${esc(dict.meth_scope_title)}</h3>
      <p>${esc(dict.meth_scope_body)}</p>
      <h3 class="meth-h">${esc(dict.meth_source_title)}</h3>
      <p>${esc(dict.meth_source_body)}</p>
      <h3 class="meth-h">${esc(dict.meth_lag_title)}</h3>
      <p>${esc(dict.meth_lag_body)}</p>
      <h3 class="meth-h">${esc(dict.meth_related_title)}</h3>
      <p>${esc(dict.meth_related_intro)}</p>
      ${renderRelatedPages(lang, 'archive-links')}
    </main>
    ${renderFooter(lang)}
  </div>`;
}
