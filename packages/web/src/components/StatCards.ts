import type { DelayStats } from '@oresund/shared';
import { formatDelaySeconds, formatPct } from '../i18n/format';
import { translate, type Lang } from '../i18n';
import { esc } from '../lib/html';

/** Compact stat blocks from the today delay-stats response. */
export function renderStatCards(stats: DelayStats, lang: Lang): string {
  const stat = (value: string, label: string): string => `
    <div class="stat">
      <span class="stat-value">${esc(value)}</span>
      <span class="stat-label">${esc(label)}</span>
    </div>`;
  return `
  <section class="stats-grid">
    ${stat(formatPct(stats.on_time_pct, lang), translate('stat_on_time', lang))}
    ${stat(formatPct(stats.delayed_pct, lang), translate('stat_delayed', lang))}
    ${stat(formatPct(stats.canceled_pct, lang), translate('stat_canceled', lang))}
    ${stat(formatDelaySeconds(stats.avg_delay_seconds, lang), translate('stat_avg_delay', lang))}
    ${stat(String(stats.total_departures), translate('stat_departures', lang))}
  </section>`;
}
