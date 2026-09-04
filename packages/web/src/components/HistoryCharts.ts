import type { HistoryResponse, PunctualityResponse } from '../api';
import { translate, type Key, type Lang } from '../i18n';
import { causeLabel } from '../lib/causes';
import {
  barHeightPct,
  byWeekday,
  dailyBarSegments,
  dailyLabelPlan,
  hBarWidth,
  heatColor,
  heatmapBuckets,
  heatmapShare,
  movingAverage,
  segHeightPct,
  yAxisTicks,
  type DayRange,
} from '../lib/stats';
import { renderPunctualityChart } from './PunctualityChart';
import { renderInsightCards } from './InsightCards';
import { renderSrTable } from '../lib/sr-table';
import { esc } from '../lib/html';
import { formatDate, formatDelaySeconds, formatPct } from '../i18n/format';

/** Static line → route label map (Øresundståg cross-border services). */
const LINE_ROUTES: Record<string, string> = {
  '801': 'Øresundståg Göteborg–København',
  '802': 'Øresundståg Kristianstad–København',
  '803': 'Øresundståg København–Hässleholm',
  '804': 'Øresundståg Malmö–København',
};

/** weekday_<key> translation suffix for Mon..Sun. */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** What renders in place of a value the collector never supplied. */
const NO_DATA_MARK = '—';

/** Muted one-liner under a chart title defining what the chart shows. */
function chartHint(key: Key, lang: Lang): string {
  return `<p class="chart-hint">${esc(translate(key, lang))}</p>`;
}

/** Caption for a chart's visually-hidden data table (N-M15). */
function srCaption(titleKey: Key, lang: Lang): string {
  return `${translate(titleKey, lang)}: ${translate('sr_data_table', lang)}`;
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
  // parseHistoryResponse only checks that `daily` IS an array — a row's date
  // can arrive missing, null or not a string at all, and esc() would throw on
  // it mid-render. The dates are normalized once, here, so the bar tooltip,
  // the x-axis labels, the weekday buckets and the screen-reader table all
  // read the same usable string: a row that lost its date keeps its bar and
  // carries the no-data mark instead.
  const daily = history.daily.map((d) => ({ ...d, date: typeof d.date === 'string' ? d.date : NO_DATA_MARK }));
  const segments = dailyBarSegments(daily);
  const max = Math.max(0, ...daily.map((d) => d.count));
  // Real y-axis: clean ticks from yAxisTicks; the TOP TICK is the axis
  // ceiling — bars, gridlines, trend and axis labels all scale against it.
  const ticks = yAxisTicks(max);
  const topTick = ticks[ticks.length - 1] ?? 0;

  // X-axis labels: localized month names, month starts always labeled, bare
  // day-of-month elsewhere; long ranges stride so labels never crowd.
  const monthNames = Array.from({ length: 12 }, (_, i) => translate(`month_${i + 1}` as Key, lang));
  const labelPlan = dailyLabelPlan(daily.map((d) => d.date), dayRange, monthNames);
  const labelTexts = new Map(labelPlan.map((l) => [l.index, l.text]));

  const dayBars = daily
    .map((d, i) => {
      const seg = segments[i] ?? { cancellations: 0, delays: 0, alerts: 0 };
      const dayFrac = max > 0 ? d.count / max : 0;
      const stackHeight = d.count > 0 ? Math.max(barHeightPct(d.count, topTick), 4) : 0;
      // Value labels above every bar at 7/14 days; at 30/90 days only at the
      // same stride as the x-labels so long ranges never crowd. 0 renders
      // nothing.
      const showValue = d.count > 0 && (dayRange <= 14 || labelTexts.has(i));
      // Both values are external (parseHistoryResponse only checks that `daily`
      // is an array), so they are escaped like every other interpolation here —
      // an attribute is the one place a quote still breaks out (audit5 M8).
      return `
    <div class="bar-group" title="${esc(d.date)}: ${esc(String(d.count))}">
      ${showValue ? `<span class="bar-value">${esc(String(d.count))}</span>` : ''}
      <div class="bar-stack" style="height:${stackHeight.toFixed(1)}%">
        <span class="seg seg-cancel" style="height:${segHeightPct(seg.cancellations, dayFrac).toFixed(1)}%"></span>
        <span class="seg seg-delay" style="height:${segHeightPct(seg.delays, dayFrac).toFixed(1)}%"></span>
        <span class="seg seg-alert" style="height:${segHeightPct(seg.alerts, dayFrac).toFixed(1)}%"></span>
      </div>
    </div>`;
    })
    .join('');

  // X-axis labels live in their own strip below the plot, so bars, gridlines
  // and the axis column share ONE scale against the plot band.
  const xLabels = daily
    .map((_, i) => `<span class="bar-label">${esc(labelTexts.get(i) ?? '')}</span>`)
    .join('');

  // Horizontal gridlines at every y-axis tick, behind the bars, scaled
  // against the top tick so the top gridline is the axis ceiling.
  const n = daily.length;
  const grid =
    n > 0 && topTick > 0
      ? `<svg class="daily-grid" viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true">${ticks
          .map((t) => {
            const y = 100 - (t / topTick) * 100;
            return `<line x1="0" y1="${y.toFixed(1)}" x2="${n}" y2="${y.toFixed(1)}" vector-effect="non-scaling-stroke" />`;
          })
          .join('')}</svg>`
      : '';

  // Left axis column: numeric tick labels at the same stops as the gridlines
  // (fixed-width flex sibling of the plot, not text floating over it).
  const axisLabels = ticks
    .map((t) => {
      const top = topTick > 0 ? 100 - (t / topTick) * 100 : 0;
      return `<span class="daily-tick" style="top:${top.toFixed(1)}%">${t}</span>`;
    })
    .join('');
  const axis = `<div class="daily-axis" aria-hidden="true"><div class="axis-inner">${axisLabels}</div></div>`;

  // 3-day moving-average overlay, aligned to the bar x-centers (viewBox is
  // n units wide × 100 tall, stretched over the plot band; scaled against
  // the top tick so it sits inside the axis).
  const trend = movingAverage(daily.map((d) => d.count), 3);
  const trendPoints =
    max > 0 && n > 0
      ? trend
          .map((v, i) => `${(i + 0.5).toFixed(2)},${(100 - (v / topTick) * 100).toFixed(1)}`)
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
      <div class="day-toggle" role="group" aria-label="${esc(translate('filter_range', lang))}">${toggles}</div>
    </header>

    ${renderInsightCards(history, lang)}

    <div class="chart">
      <h3 class="chart-title">${translate('hist_daily', lang)}</h3>
      ${chartHint('hist_daily_hint', lang)}
      <!-- The plot is geometry only (N-M15): every value it draws is in the
           data table below it, so the bars carry nothing a screen reader needs. -->
      <div class="bars" aria-hidden="true">
        ${axis}
        <div class="bar-plot">
          <div class="plot-band">
        ${grid}
        ${dayBars}
        ${trendLayer}
          </div>
          <div class="x-labels">${xLabels}</div>
        </div>
      </div>
      ${legend(lang)}
      ${renderSrTable({
        caption: srCaption('hist_daily', lang),
        headers: [
          translate('th_date', lang),
          translate('type_cancellation', lang),
          translate('type_delay', lang),
          translate('type_alert', lang),
          translate('th_total', lang),
        ],
        rows: daily.map((d) => [
          formatDate(d.date, lang) || d.date,
          String(d.cancellations),
          String(d.delays),
          String(d.alerts),
          String(d.count),
        ]),
      })}
    </div>

    ${punctuality ? renderPunctualityChart(punctuality, lang) : ''}

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_line', lang)}</h3>
      ${chartHint('hist_by_line_hint', lang)}
      <div class="hbars">${byLineBars(history.by_line, lang)}</div>
    </div>

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_weekday', lang)}</h3>
      ${chartHint('hist_by_weekday_hint', lang)}
      <div class="hbars">${byWeekdayBars(daily, lang)}</div>
    </div>

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_cause', lang)}</h3>
      ${chartHint('hist_by_cause_hint', lang)}
      <div class="hbars">${hbars(
        history.by_cause.map((c) => ({ label: causeLabel(c.cause, lang), count: c.count })),
        lang,
      )}</div>
    </div>

    <div class="chart">
      <h3 class="chart-title">${translate('hist_by_hour', lang)}</h3>
      ${chartHint('hist_by_hour_hint', lang)}
      <!-- Cells are colour-only (their values live in a title attribute no
           screen reader announces), so the grid is decorative and the table
           below carries the numbers (N-M15). -->
      <div class="heatmap" aria-hidden="true">${cells}</div>
      <div class="heat-ticks" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
      ${heatmapHistory ? `<div class="heat-caption">${translate('heat_caption', lang)}</div>` : ''}
      <div class="heat-legend" aria-hidden="true">
        <span class="heat-swatch heat-low"></span><span class="heat-label">${translate('heat_low', lang)}</span>
        <span class="heat-scale"></span>
        <span class="heat-swatch heat-high"></span><span class="heat-label">${translate('heat_high', lang)}</span>
      </div>
      ${renderSrTable({
        caption: srCaption('hist_by_hour', lang),
        // Exactly the two numbers the cells encode: the share of the window's
        // disruptions and the count behind it (meth_def_by_hour).
        headers: [
          translate('th_hour', lang),
          translate('th_share', lang),
          translate('th_count', lang),
        ],
        rows: buckets.map((count, hour) => [
          `${String(hour).padStart(2, '0')}:00`,
          formatPct(shares[hour] ?? 0, lang),
          String(count),
        ]),
      })}
    </div>
  </section>`;
}
