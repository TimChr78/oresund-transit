import type { Dict, Key, Lang } from '../i18n';
import { esc } from '../lib/html';
import { localizedPath } from '../lib/seo';
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
        <th scope="row">${esc(dict[name])}</th>
        <td>${esc(dict[def])}</td>
      </tr>`,
  ).join('');
  return `
  <div class="wrap privacy-wrap">
    <header class="topbar">
      <!-- lang="da" (audit6 L9): the wordmark is Danish, and a screen reader
           garbles the Ø without it. An <a>, not a div (audit7 L3): every other
           page's wordmark links home, and these two were the last ones that
           rendered the brand as inert text. -->
      <a class="brand" href="${esc(localizedPath('/', lang))}" lang="da">${esc(dict.brand_name)}</a>
      <a class="privacy-back" href="${esc(localizedPath('/', lang))}">${esc(dict.privacy_back)}</a>
    </header>
    <main class="privacy">
      <h1 class="privacy-title">${esc(dict.meth_title)}</h1>
      <p class="privacy-lead">${esc(dict.meth_intro)}</p>
      <!-- Section headings are h2 (audit4 N-M12): they follow the page's h1
           directly, and skipping to h3 broke the document outline for a screen
           reader navigating by heading. .meth-h carries the visual style, so
           the page renders identically. -->
      <h2 class="meth-h">${esc(dict.meth_defs_title)}</h2>
      <div class="table-wrap meth-table-wrap">
        <table class="meth-table">
          <caption class="sr-only">${esc(dict.meth_defs_title)}</caption>
          <thead>
            <tr>
              <th scope="col">${esc(dict.meth_col_kpi)}</th>
              <th scope="col">${esc(dict.meth_col_definition)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <h2 class="meth-h">${esc(dict.meth_thresholds_title)}</h2>
      <p>${esc(dict.meth_thresholds_body)}</p>
      <h2 class="meth-h">${esc(dict.meth_scope_title)}</h2>
      <p>${esc(dict.meth_scope_body)}</p>
      <h2 class="meth-h">${esc(dict.meth_source_title)}</h2>
      <p>${esc(dict.meth_source_body)}</p>
      <h2 class="meth-h">${esc(dict.meth_lag_title)}</h2>
      <p>${esc(dict.meth_lag_body)}</p>
      <!-- N-M16: the analytics disclosure lives here instead of a consent
           banner. The one measurement on the site is cookieless, anonymised
           Umami — no identifier, no personal data, no cross-site tracking — so
           there is nothing to opt into and no dialog to dismiss. Documented
           next to the numbers the measurement feeds, with the fuller statement
           one click away on the privacy page. -->
      <h2 class="meth-h">${esc(dict.meth_tracking_title)}</h2>
      <p>
        ${esc(dict.meth_tracking_body)}
        <a href="${esc(localizedPath('/privacy', lang))}">${esc(dict.nav_privacy)}</a>
      </p>
      <h2 class="meth-h">${esc(dict.meth_related_title)}</h2>
      <p>${esc(dict.meth_related_intro)}</p>
      ${renderRelatedPages(lang, 'archive-links')}
    </main>
    ${renderFooter(lang)}
  </div>`;
}
