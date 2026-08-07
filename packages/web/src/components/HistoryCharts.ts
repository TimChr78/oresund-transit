import type { HistoryResponse, PunctualityResponse } from '../api';
import { translate, type Key, type Lang } from '../i18n';
import { causeLabel } from '../lib/causes';
import { formatDelaySeconds, formatPct } from '../i18n/format';
import {
  byWeekday,
  dailyBarSegments,
  dailyLabelPlan,
  hBarWidth,
  heatColor,
  heatmapBuckets,
  heatmapShare,
  movingAverage,
  type DayRange,
} from '../lib/stats';
import { renderPunctualityChart } from './PunctualityChart';
import { renderInsightCards } from './InsightCards';
import { esc } from '../lib/html';

/** Static line → route label map (Øresundståg cross-border services). */
const LINE_ROUTES: Record<string, string> = {
  '801': 'Øresundståg Göteborg–København',
  '802': 'Øresundståg Kristianstad–København',
  '803': 'Øresundståg København–Hässleholm',
  '804': 'Øresundståg Malmö–København',
};

/** weekday_<key> translation suffix for Mon..Sun. */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

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

/** By Line rows: line + route label, count, and avg/max delay meta. */
function byLineBars(lines: HistoryResponse['by_line'], lang: Lang): string {
  const max = Math.max(0, ...lines.map((l) => l.count));
  if (lines.length === 0) return `<div class="empty">${translate('empty_disruptions', lang)}</div>`;
  return lines
    .map((l) => {
      const label = l.line === 'unknown' ? '—' : l.line;
      const route = LINE_ROUTES[l.line ?? ''];
      const delay = translate('hist_line_delay', lang, {
        a: l.avg_delay === null ? '—' : formatDelaySeconds(l.avg_delay, lang),
        b: l.max_delay === null ? '—' : formatDelaySeconds(l.max_delay, lang),
      });
      return `
    <div class="hbar hbar-line">
      <span class="hbar-label" title="${esc(route ?? label)}">${esc(label)}${route ? `<span class="hbar-route">${esc(route)}</span>` : ''}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(hBarWidth(l.count, max) * 100).toFixed(1)}%"></span></span>
      <span class="hbar-count">${l.count}</span>
      <span class="hbar-meta">${esc(delay)}</span>
    </div>`;
    })
    .join('');
}

/** By Weekday rows: Mon..Sun counts + avg delay, translated labels. */
function byWeekdayBars(daily: HistoryResponse['daily'], lang: Lang): string {
  const wd = byWeekday(daily);
  const max = Math.max(0, ...wd.counts);
  return WEEKDAY_KEYS.map((key, i) => {
    const count = wd.counts[i] ?? 0;
    const avg = wd.avgDelays[i] ?? null;
    const label = translate(`weekday_${key}` as Key, lang);
    const meta = avg === null ? '—' : formatDelaySeconds(avg, lang);
    return `
    <div class="hbar">
      <span class="hbar-label">${label}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(hBarWidth(count, max) * 100).toFixed(1)}%"></span></span>
      <span class="hbar-count">${count}</span>
      <span class="hbar-meta">${esc(meta)}</span>
    </div>`;
  }).join('');
}

/**
 * All hand-rolled CSS bars — the math (heights, segments, heatmap shares)
 * lives in src/lib/stats.ts so it stays unit-testable.
 *
 * `heatmapHistory` is the separate 30-day baseline for the by-hour heatmap
 * (stable across the 7/14/30/90 toggle). When null the main history's own
 * by_hour data is used as a fallback.
 */
export function renderHistoryCharts(
  history: HistoryResponse,
  punctuality: PunctualityResponse | null,
  dayRange: DayRange,
  lang: Lang,
  heatmapHistory: HistoryResponse | null = null,
): string {
  const segments = dailyBarSegments(history.daily);
  const max = Math.max(0, ...history.daily.map((d) => d.count));
  const pct = (v: number): number => (max > 0 ? (v / max) * 100 : 0);

  // X-axis labels: localized month names, month starts always labeled, bare
  // day-of-month elsewhere; long ranges stride so labels never crowd.
  const monthNames = Array.from({ length: 12 }, (_, i) => translate(`month_${i + 1}` as Key, lang));
  const labelPlan = dailyLabelPlan(history.daily.map((d) => d.date), dayRange, monthNames);
  const labelTexts = new Map(labelPlan.map((l) => [l.index, l.text]));

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
      <span class="bar-label">${esc(labelTexts.get(i) ?? '')}</span>
    </div>`;
    })
    .join('');

  // Horizontal gridlines at 25/50/75% of the plot, behind the bars.
  const n = history.daily.length;
  const grid =
    n > 0
      ? `<svg class="daily-grid" viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true">${[25, 50, 75]
          .map(
            (g) =>
              `<line x1="0" y1="${100 - g}" x2="${n}" y2="${100 - g}" vector-effect="non-scaling-stroke" />`,
          )
          .join('')}</svg>`
      : '';
  const maxLabel =
    max > 0 ? `<span class="plot-max">${esc(translate('hist_daily_max', lang, { n: max }))}</span>` : '';

  // 3-day moving-average overlay, aligned to the bar x-centers (viewBox is
  // n units wide × 100 tall, stretched over the bar plot area).
  const trend = movingAverage(history.daily.map((d) => d.count), 3);
  const trendPoints =
    max > 0 && n > 0
      ? trend
          .map((v, i) => `${(i + 0.5).toFixed(2)},${(100 - (v / max) * 100).toFixed(1)}`)
          .join(' ')
      : '';
  const trendLayer = trendPoints
    ? `<svg class="trend-layer" viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${trendPoints}" vector-effect="non-scaling-stroke" class="trend-line" /></svg>`
    : '';

  // By-hour heatmap: SHARE of the window total per hour (not raw counts),
  // colored green (low) → red (high). Drawn from the stable 30-day baseline
  // when available, independent of the range toggle.
  const heatmapSource = heatmapHistory ?? history;
  const buckets = heatmapBuckets(heatmapSource.by_hour);
  const shares = heatmapShare(heatmapSource.by_hour);
  const maxShare = Math.max(0, ...shares);
  const cells = buckets
    .map((count, hour) => {
      const share = shares[hour] ?? 0;
      const ratio = maxShare > 0 ? share / maxShare : 0;
      const title = translate('heat_tooltip', lang, {
        hour: String(hour).padStart(2, '0'),
        pct: formatPct(share, lang),
        n: count,
      });
      // share === 0 -> invisible cell ("no disruptions this hour"), so
      // "none" is never read as a faint low-but-present green.
      const opacity = share <= 0 ? 0 : 0.35 + 0.65 * ratio;
      return `<span class="cell" style="background-color:${heatColor(share, maxShare)};opacity:${opacity.toFixed(3)}" title="${esc(title)}"></span>`;
    })
    .join('');

  const ranges: DayRange[] = [7, 14, 30, 90];
  const toggles = ranges
    .map(
      (r) => `
    <button type="button" class="day-toggle-btn${r === dayRange ? ' active' : ''}"
      data-action="set-days" data-value="${r}" aria-pressed="${r === dayRange}">
      ${translate(r === 7 ? 'days_7' : r === 14 ? 'days_14' : r === 90 ? 'days_90' : 'days_30', lang)}
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
        ${grid}
        ${dayBars}
        ${trendLayer}
        ${maxLabel}
      </div>
      </div>
      ${legend(lang)}
    </div>

    ${punctuality ? renderPunctualityChart(punctuality, lang) : ''}

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_line', lang)}</h3>
      <div class="hbars">${byLineBars(history.by_line, lang)}</div>
    </div>

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_weekday', lang)}</h3>
      <div class="hbars">${byWeekdayBars(history.daily, lang)}</div>
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
      ${heatmapHistory ? `<div class="heat-caption">${translate('heat_caption', lang)}</div>` : ''}
    </div>
  </section>`;
}
