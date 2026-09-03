import type { PunctualityResponse } from '../api';
import { translate, type Key, type Lang } from '../i18n';
import { punctualitySeries, svgY } from '../lib/stats';
import { renderSrTable } from '../lib/sr-table';
import { formatDate, formatDelaySeconds, formatPct } from '../i18n/format';
import { esc } from '../lib/html';

/** Day-of-month tick label ("06") for the x-axis. */
function dayLabel(date: string): string {
  return /^\d{4}-\d{2}-(\d{2})$/.exec(date)?.[1] ?? date;
}

/** Caption for the chart's visually-hidden data table (N-M15). */
function srCaption(lang: Lang): string {
  return `${translate('hist_punctuality', lang)}: ${translate('sr_data_table', lang)}`;
}

/**
 * One row per day in the source window, including the days the line skips.
 * A day with no departures shows an em dash for every measured column, so the
 * table agrees with the break in the line and with the "data since" note
 * instead of implying the day was punctual.
 */
function punctualityRows(punctuality: PunctualityResponse, lang: Lang): string[][] {
  return punctuality.daily.map((d) => [
    formatDate(d.date, lang) || d.date,
    d.total > 0 ? formatPct(d.on_time_pct, lang) : '—',
    d.total > 0 ? String(d.on_time) : '—',
    d.total > 0 ? String(d.delayed) : '—',
    d.total > 0 ? String(d.canceled) : '—',
    formatDelaySeconds(d.avg_delay_seconds, lang),
  ]);
}

const PUNCT_HEADERS: Key[] = [
  'th_date',
  'th_on_time_pct',
  'stat_on_time',
  'stat_delayed',
  'stat_canceled',
  'stat_avg_delay',
];

const W = 560;
const H = 140;

/** Gridlines + y-axis labels share these stops (0..100 in 25% steps). */
const Y_STOPS = [0, 25, 50, 75, 100];

/**
 * Delay-% over time: a hand-rolled SVG area+line for the daily on-time
 * percentage. Gridlines at 25% steps with y-axis % labels on the left,
 * day labels on the x-axis, per-day % in a <title> tooltip, and the latest
 * % inline. Days without departures (total === 0) are NO-DATA: the line and
 * area break across the gap (one polyline/polygon per contiguous run) and a
 * "data since …" note explains it — never a misleading flat 0% line.
 */
export function renderPunctualityChart(punctuality: PunctualityResponse, lang: Lang): string {
  if (punctuality.daily.length === 0) {
    return `<div class="chart"><h3 class="chart-title">${translate('hist_punctuality', lang)}</h3><p class="chart-hint">${esc(translate('hist_punctuality_hint', lang))}</p><div class="empty">${translate('empty_disruptions', lang)}</div></div>`;
  }

  const series = punctualitySeries(punctuality.daily);
  const n = punctuality.daily.length;
  const step = n > 1 ? W / (n - 1) : 0;
  const xOf = (index: number): number => index * step;

  // Split the data days into contiguous runs; x keeps its original position
  // so no-data gaps stay visible as breaks, not compressed-away.
  const runs: { pts: string[]; x0: number; x1: number }[] = [];
  let run: { pts: string[]; x0: number; x1: number } | null = null;
  series.indices.forEach((idx, k) => {
    const day = series.days[k]!;
    const x = xOf(idx);
    const y = svgY(day.on_time_pct, H).toFixed(1);
    if (run && run.x1 === idx - 1) {
      run.x1 = idx;
      run.pts.push(`${x.toFixed(1)},${y}`);
    } else {
      if (run) runs.push(run);
      run = { pts: [`${x.toFixed(1)},${y}`], x0: idx, x1: idx };
    }
  });
  if (run) runs.push(run);

  const lines = runs
    .map((r) => `<polyline points="${r.pts.join(' ')}" class="punct-line" />`)
    .join('');
  const areas = runs
    .map(
      (r) =>
        `<polygon points="${xOf(r.x0).toFixed(1)},${H} ${r.pts.join(' ')} ${xOf(r.x1).toFixed(1)},${H}" class="punct-area" />`,
    )
    .join('');

  const dots = series.days
    .map((d, k) => {
      const x = xOf(series.indices[k]!);
      return `<circle cx="${x.toFixed(1)}" cy="${svgY(d.on_time_pct, H).toFixed(1)}" r="2.5" class="punct-dot"><title>${esc(d.date)} — ${d.on_time_pct}%</title></circle>`;
    })
    .join('');

  // x-axis ticks: first, middle, last day
  const mid = punctuality.daily[Math.floor((n - 1) / 2)]!;
  const tick = (d: { date: string }): string => `<span>${esc(dayLabel(d.date))}</span>`;
  const ticks = [punctuality.daily[0]!, mid, punctuality.daily[n - 1]!].map(tick).join('');

  const grid = Y_STOPS.map(
    (g) => `<line x1="0" y1="${svgY(g, H).toFixed(1)}" x2="${W}" y2="${svgY(g, H).toFixed(1)}" class="punct-grid" />`,
  ).join('');
  // Left-side y-axis % labels, aligned to the same stops as the gridlines.
  // Gridline g sits (100 - g)% from the top (svgY: 100 -> top, 0 -> bottom).
  const yLabels = Y_STOPS.map((g) => `<span style="top:${100 - g}%">${g}%</span>`).join('');

  const latest = series.days[series.days.length - 1] ?? null;
  const note =
    series.noDataCount > 0 && series.days.length > 0
      ? `<div class="punct-note">${esc(translate('punct_data_since', lang, { date: series.days[0]!.date }))}</div>`
      : '';

  return `
  <div class="chart">
    <h3 class="chart-title">${translate('hist_punctuality', lang)}</h3>
    <p class="chart-hint">${esc(translate('hist_punctuality_hint', lang))}</p>
    <div class="punct-chart">
      <div class="punct-ylabels" aria-hidden="true">${yLabels}</div>
      <!-- Decorative for assistive tech (N-M15): the % values live in the data
           table below, and the dots' <title> tooltips still fire on hover. -->
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
        ${grid}
        ${areas}
        ${lines}
        ${dots}
      </svg>
      ${note}
      <div class="punct-ticks" aria-hidden="true">${ticks}</div>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="legend-dot dot-punct"></span>${translate('stat_on_time', lang)}</span>
      ${latest ? `<span class="legend-item punct-latest">${latest.on_time_pct}%</span>` : ''}
    </div>
    ${renderSrTable({
      caption: srCaption(lang),
      headers: PUNCT_HEADERS.map((key) => translate(key, lang)),
      rows: punctualityRows(punctuality, lang),
    })}
  </div>`;
}
