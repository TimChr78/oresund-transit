import type { HistoryResponse } from '../api';
import { translate, type Lang } from '../i18n';
import { formatDelaySeconds } from '../i18n/format';
import { peakVsOffPeak, weekOverWeek } from '../lib/stats';
import { esc } from '../lib/html';

/** "+N%" / "-N%" / "—" for a whole-percent change. */
function signedPct(pct: number | null): string {
  if (pct === null) return '—';
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** Week-over-week card: needs at least 14 daily rows (days=14 or 30). */
function wowCard(history: HistoryResponse, lang: Lang): string {
  const wow = weekOverWeek(history.daily);
  if (!wow) return '';
  const delta = translate('insight_wow_delta', lang, { pct: signedPct(wow.changePct) });
  const counts = translate('insight_wow_counts', lang, { prev: wow.prevCount, curr: wow.currCount });
  const delay = translate('insight_avg_delay', lang, {
    a: formatDelaySeconds(wow.prevAvgDelay, lang),
    b: formatDelaySeconds(wow.currAvgDelay, lang),
  });
  return `
  <div class="insight">
    <h3 class="insight-title">${translate('insight_wow', lang)}</h3>
    <span class="insight-value">${esc(delta)}</span>
    <span class="insight-sub">${esc(counts)}</span>
    <span class="insight-sub">${esc(delay)}</span>
  </div>`;
}

/** Peak vs off-peak card: skipped when there are no by_hour rows at all. */
function peakCard(history: HistoryResponse, lang: Lang): string {
  const peak = peakVsOffPeak(history.by_hour);
  if (peak.totalCount === 0) return '';
  const share = translate('insight_peak_share', lang, { pct: `${peak.rushSharePct}%` });
  const delay = translate('insight_peak_avg', lang, {
    peak: formatDelaySeconds(peak.rushAvgDelay, lang),
    off: formatDelaySeconds(peak.offPeakAvgDelay, lang),
  });
  return `
  <div class="insight">
    <h3 class="insight-title">${translate('insight_peak', lang)}</h3>
    <p class="chart-hint">${esc(translate('hist_peak_hint', lang))}</p>
    <span class="insight-value">${esc(share)}</span>
    <span class="insight-sub">${esc(delay)}</span>
  </div>`;
}

/** Two compact insight cards (week-over-week, peak vs off-peak). */
export function renderInsightCards(history: HistoryResponse, lang: Lang): string {
  const cards = [wowCard(history, lang), peakCard(history, lang)].filter(Boolean).join('');
  if (!cards) return '';
  return `<div class="insights">${cards}</div>`;
}
