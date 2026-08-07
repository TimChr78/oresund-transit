import type { HistoryResponse, PunctualityResponse } from '../api';
import { translate, type Lang } from '../i18n';
import { causeLabel } from '../lib/causes';
import {
  dailyBarSegments,
  hBarWidth,
  heatmapBuckets,
  heatmapIntensity,
  movingAverage,
  type DayRange,
} from '../lib/stats';
import { renderPunctualityChart } from './PunctualityChart';
import { renderInsightCards } from './InsightCards';
import { esc } from '../lib/html';

/** Day-of-month tick label ("06") for the daily bars. */
function dayLabel(date: string): string {
  return /^\d{4}-\d{2}-(\d{2})$/.exec(date)?.[1] ?? date;
}

function legend(lang: Lang): string {
  const item = (cls: string, key: 'type_cancellation' | 'type_delay' | 'type_alert'): string => `
    <span class="legend-item"><span class="legend-dot ${cls}"></span>${translate(key, lang)}</span>`;
  return `
  <div class="legend">
    ${item('dot-cancel', 'type_cancellation')}
    ${item('dot-delay', 'type_delay')}
    ${item('dot-alert', 'type_alert')}
    <span class="legend-item"><span class="legend-dot dot-trend"></span>${translate('trend_avg_3d', lang)}</span>
  </div>`;
}

function hbars(items: { label: string; count: number }[], lang: Lang): string {
  const max = Math.max(0, ...items.map((i) => i.count));
  if (items.length === 0) return `<div class="empty">${translate('empty_disruptions', lang)}</div>`;
  return items
    .map(
      (it) => `
    <div class="hbar">
      <span class="hbar-label" title="${esc(it.label)}">${esc(it.label)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(hBarWidth(it.count, max) * 100).toFixed(1)}%"></span></span>
      <span class="hbar-count">${it.count}</span>
    </div>`,
    )
    .join('');
}

/**
 * All hand-rolled CSS bars — the math (heights, segments, heatmap intensity)
 * lives in src/lib/stats.ts so it stays unit-testable.
 */
export function renderHistoryCharts(
  history: HistoryResponse,
  punctuality: PunctualityResponse | null,
  dayRange: DayRange,
  lang: Lang,
): string {
  const segments = dailyBarSegments(history.daily);
  const max = Math.max(0, ...history.daily.map((d) => d.count));
  const pct = (v: number): number => (max > 0 ? (v / max) * 100 : 0);

  const dayBars = history.daily
    .map((d, i) => {
      const seg = segments[i] ?? { cancellations: 0, delays: 0, alerts: 0 };
      const stackHeight = d.count > 0 ? Math.max(pct(d.count), 4) : 0;
      return `
    <div class="bar-group" title="${d.date}: ${d.count}">
      <div class="bar-stack" style="height:${stackHeight.toFixed(1)}%">
        <span class="seg seg-cancel" style="height:${pct(seg.cancellations).toFixed(1)}%"></span>
        <span class="seg seg-delay" style="height:${pct(seg.delays).toFixed(1)}%"></span>
        <span class="seg seg-alert" style="height:${pct(seg.alerts).toFixed(1)}%"></span>
      </div>
      <span class="bar-label">${esc(dayLabel(d.date))}</span>
    </div>`;
    })
    .join('');

  // 3-day moving-average overlay, aligned to the bar x-centers (viewBox is
  // n units wide × 100 tall, stretched over the bar plot area).
  const n = history.daily.length;
  const trend = movingAverage(history.daily.map((d) => d.count), 3);
  const trendPoints =
    max > 0 && n > 0
      ? trend
          .map((v, i) => `${(i + 0.5).toFixed(2)},${(100 - (v / max) * 100).toFixed(1)}`)
          .join(' ')
      : '';
  const trendLayer = trendPoints
    ? `<svg class="trend-layer" viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${trendPoints}" class="trend-line" /></svg>`
    : '';

  const buckets = heatmapBuckets(history.by_hour);
  const intensity = heatmapIntensity(buckets);
  const cells = buckets
    .map((count, hour) => {
      const value = intensity[hour] ?? 0;
      return `<span class="cell" style="--i:${value.toFixed(3)}" title="${String(hour).padStart(2, '0')}:00 — ${count}"></span>`;
    })
    .join('');

  const ranges: DayRange[] = [7, 14, 30];
  const toggles = ranges
    .map(
      (r) => `
    <button type="button" class="day-toggle-btn${r === dayRange ? ' active' : ''}"
      data-action="set-days" data-value="${r}" aria-pressed="${r === dayRange}">
      ${translate(r === 7 ? 'days_7' : r === 14 ? 'days_14' : 'days_30', lang)}
    </button>`,
    )
    .join('');

  return `
  <section class="history">
    <header class="section-head">
      <h2 class="section-title">${translate('section_history', lang)}</h2>
      <span class="total-chip">${translate('hist_total', lang, { n: history.total_disruptions })}</span>
      <div class="day-toggle" role="group" aria-label="range">${toggles}</div>
    </header>

    ${renderInsightCards(history, lang)}

    <div class="chart">
      <h3 class="chart-title">${translate('hist_daily', lang)}</h3>
      <div class="bars">
        <div class="bar-plot">
          ${dayBars}
          ${trendLayer}
        </div>
      </div>
      ${legend(lang)}
    </div>

    ${punctuality ? renderPunctualityChart(punctuality, lang) : ''}

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_line', lang)}</h3>
      <div class="hbars">${hbars(
        history.by_line.map((l) => ({ label: l.line === 'unknown' ? '—' : l.line, count: l.count })),
        lang,
      )}</div>
    </div>

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_cause', lang)}</h3>
      <div class="hbars">${hbars(
        history.by_cause.map((c) => ({ label: causeLabel(c.cause, lang), count: c.count })),
        lang,
      )}</div>
    </div>

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_hour', lang)}</h3>
      <div class="heatmap">${cells}</div>
      <div class="heat-ticks"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
    </div>
  </section>`;
}
