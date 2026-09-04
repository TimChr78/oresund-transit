import type { Departure } from '@oresund/shared';
import type { StationResponse } from '../api';
import { formatDelaySeconds, formatDate, formatExactDelay, formatPct, formatTime } from '../i18n/format';
import { translate, type Key, type Lang } from '../i18n';
import { localizedPath } from '../lib/seo';
import { esc } from '../lib/html';
import { BAND_BADGE_CLASS, delayBand, type DelayBand } from '../lib/stats';
import { stationNameKey } from './StationPicker';

/**
 * The station-scoped section the board shows while one stop is picked in the
 * station picker (backlog A1). The corridor disruption feed cannot be filtered
 * by station — `Disruption` carries no `stop_id` — so a scope switch renders
 * the one thing the collector does expose per stop: `/api/transit/station/
 * {slug}`'s punctuality window plus its latest observed departures (the same
 * table the static /station/{slug} page renders, driven by the same endpoint).
 */

/** Status badge for one observed departure — the board's delay-band scale. */
function statusBadge(d: Departure, lang: Lang): string {
  if (d.status === 'canceled' || d.canceled === 1) {
    return `<span class="badge badge-cancellation">${esc(translate('type_cancellation', lang))}</span>`;
  }
  const band: DelayBand | null = delayBand(d.delay_seconds);
  if (!band) return '—';
  return `<span class="badge ${BAND_BADGE_CLASS[band]}" title="${esc(formatExactDelay(d.delay_seconds, lang))}">${esc(translate(`delay_band_${band}` as Key, lang))}</span>`;
}

function departureRow(d: Departure, lang: Lang): string {
  const time = formatTime(d.sched_time ?? '', lang) || '—';
  return `
  <tr data-key="${esc(d.dep_key)}">
    <td class="num">${esc(time)}</td>
    <td class="line">${esc(d.line ?? '—')}</td>
    <td class="num">${d.technical_number ? `#${esc(d.technical_number)}` : '—'}</td>
    <td>${esc(d.destination ?? '—')}</td>
    <td>${statusBadge(d, lang)}</td>
    <td class="num">${esc(d.status === 'canceled' ? '—' : formatDelaySeconds(d.delay_seconds, lang))}</td>
  </tr>`;
}

/** The board's station-scope section: KPI row + latest observed departures. */
export function renderStationDepartures(data: StationResponse, lang: Lang): string {
  const name = translate(stationNameKey(data.slug), lang);
  const rows = data.recent.map((d) => departureRow(d, lang)).join('');
  const head = ['th_time', 'th_line', 'th_train', 'station_col_destination', 'th_status', 'th_delay']
    .map((k) => `<th scope="col">${translate(k as Key, lang)}</th>`)
    .join('');
  const stat = (value: string, label: string): string =>
    `<div class="stat"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span></div>`;
  return `
  <p class="section-intro">${esc(translate('station_scope_intro', lang, { name }))}</p>
  <section class="stats-grid">
    ${stat(formatPct(data.on_time_pct, lang), translate('stat_on_time', lang))}
    ${stat(String(data.total_departures), translate('stat_departures', lang))}
    ${stat(String(data.canceled_count), translate('th_canceled', lang))}
    ${stat(formatDelaySeconds(data.avg_delay_seconds, lang), translate('stat_avg_delay', lang))}
  </section>
  <p class="scope-meta">${esc(
    translate('station_sub', lang, {
      days: data.days,
      // The raw string is the fallback (audit6 L1): an impossible date used to
      // render as "(–)" in the window note.
      from: formatDate(data.date_from, lang) || data.date_from,
      to: formatDate(data.date_to, lang) || data.date_to,
    }),
  )}</p>
  ${
    data.as_of
      ? `<p class="scope-meta">${esc(
          translate('station_as_of', lang, {
            time: formatTime(data.as_of, lang) || '—',
            date: formatDate(data.as_of, lang) || '—',
          }),
        )}</p>`
      : ''
  }
  ${
    rows
      ? `<div class="table-wrap"><table class="board-table">
      <caption class="sr-only">${esc(translate('station_departures_heading', lang))}</caption>
      <thead><tr>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`
      : `<div class="empty">${esc(translate('station_scope_empty', lang, { name }))}</div>`
  }
  <p class="scope-meta">${esc(translate('station_observed_note', lang))}</p>
  <p class="scope-link"><a href="${esc(localizedPath(`/station/${data.slug}`, lang))}">${esc(
    translate('station_scope_archive_link', lang, { name }),
  )}</a></p>`;
}
