import type { DelayStats } from '@oresund/shared';
import { formatDelaySeconds, formatPct } from '../i18n/format';
import { translate, type Lang } from '../i18n';
import { esc } from '../lib/html';

/** Compact stat blocks from the today delay-stats response. */
export function renderStatCards(stats: DelayStats, lang: Lang): string {
  // Optional third arg: a muted one-liner defining the number, rendered under
  // the label (Phase 8 KPI definitions).
  const stat = (value: string, label: string, hint?: string): string => `
    <div class="stat">
      <span class="stat-value">${esc(value)}</span>
      <span class="stat-label">${esc(label)}</span>
      ${hint ? `<span class="stat-hint">${esc(hint)}</span>` : ''}
    </div>`;
  return `
  <section class="stats-grid">
    ${stat(formatPct(stats.on_time_pct, lang), translate('stat_on_time', lang), translate('stat_on_time_hint', lang))}
    ${stat(formatPct(stats.delayed_pct, lang), translate('stat_delayed', lang), translate('stat_delayed_hint', lang))}
    ${stat(formatPct(stats.canceled_pct, lang), translate('stat_canceled', lang), translate('stat_canceled_hint', lang))}
    ${stat(formatDelaySeconds(stats.avg_delay_seconds, lang), translate('stat_avg_delay', lang), translate('stat_avg_delay_hint', lang))}
    ${stat(String(stats.total_departures), translate('stat_departures', lang), translate('stat_departures_hint', lang))}
  </section>`;
}
