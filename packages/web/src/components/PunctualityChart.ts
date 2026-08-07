import type { PunctualityResponse } from '../api';
import { translate, type Lang } from '../i18n';
import { svgLinePoints, svgY } from '../lib/stats';
import { esc } from '../lib/html';

/** Day-of-month tick label ("06") for the x-axis. */
function dayLabel(date: string): string {
  return /^\d{4}-\d{2}-(\d{2})$/.exec(date)?.[1] ?? date;
}

const W = 560;
const H = 140;

/**
 * Delay-% over time: a hand-rolled SVG area+line for the daily on-time
 * percentage. Gridlines at 25% steps, day labels on the x-axis, per-day %
 * in a <title> tooltip, and the latest % inline. Zero-filled sparse days
 * (data collection started ~2026-08-06) render as a flat bottom line.
 */
export function renderPunctualityChart(punctuality: PunctualityResponse, lang: Lang): string {
  if (punctuality.daily.length === 0) {
    return `<div class="chart"><h3 class="chart-title">${translate('hist_punctuality', lang)}</h3><div class="empty">${translate('empty_disruptions', lang)}</div></div>`;
  }

  const values = punctuality.daily.map((d) => d.on_time_pct);
  const points = svgLinePoints(values, W, H);
  const area = `${0},${H} ${points} ${W},${H}`;
  const last = punctuality.daily[punctuality.daily.length - 1]!;

  // x-axis ticks: first, middle, last day
  const mid = punctuality.daily[Math.floor((punctuality.daily.length - 1) / 2)]!;
  const tick = (d: { date: string }): string => `<span>${esc(dayLabel(d.date))}</span>`;
  const ticks = [punctuality.daily[0]!, mid, last].map(tick).join('');

  const grid = [0, 25, 50, 75, 100]
    .map((g) => `<line x1="0" y1="${svgY(g, H).toFixed(1)}" x2="${W}" y2="${svgY(g, H).toFixed(1)}" class="punct-grid" />`)
    .join('');

  const dots = punctuality.daily
    .map((d, i) => {
      const x = values.length > 1 ? (i * W) / (values.length - 1) : 0;
      return `<circle cx="${x.toFixed(1)}" cy="${svgY(d.on_time_pct, H).toFixed(1)}" r="2.5" class="punct-dot"><title>${esc(d.date)} — ${d.on_time_pct}%</title></circle>`;
    })
    .join('');

  return `
  <div class="chart">
    <h3 class="chart-title">${translate('hist_punctuality', lang)}</h3>
    <div class="punct-chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(translate('hist_punctuality', lang))}">
        ${grid}
        <polygon points="${area}" class="punct-area" />
        <polyline points="${points}" class="punct-line" />
        ${dots}
      </svg>
      <div class="punct-ticks">${ticks}</div>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="legend-dot dot-punct"></span>${translate('stat_on_time', lang)}</span>
      <span class="legend-item punct-latest">${last.on_time_pct}%</span>
    </div>
  </div>`;
}
