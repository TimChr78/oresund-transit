import type { Disruption } from '@oresund/shared';
import { formatDate, formatDelayPlus, formatDelaySeconds, formatTime } from '../i18n/format';
import { localToday } from '../lib/stats';
import { translate, type Key, type Lang } from '../i18n';
import { causeLabel, cleanReason } from '../lib/causes';
import { esc } from '../lib/html';

function typeKey(type: string | null): Key {
  if (type === 'cancellation') return 'type_cancellation';
  if (type === 'alert') return 'type_alert';
  return 'type_delay';
}

function severityKey(severity: string | null): Key {
  if (severity === 'major') return 'sev_major';
  if (severity === 'minor') return 'sev_minor';
  return 'sev_moderate';
}

function badgeClass(type: string | null): string {
  if (type === 'cancellation') return 'badge-cancellation';
  if (type === 'alert') return 'badge-alert';
  return 'badge-delay';
}

function severityBadgeClass(severity: string | null): string {
  if (severity === 'major' || severity === 'minor') return `badge-sev-${severity}`;
  return 'badge-sev-moderate';
}

/** Disruptions have no destination field — show the affected direction instead. */
function directionText(direction: string | null, lang: Lang): string {
  if (direction === 'to_denmark') return translate('tab_to_denmark', lang);
  if (direction === 'to_sweden') return translate('tab_to_sweden', lang);
  return '—';
}

function row(d: Disruption, lang: Lang): string {
  const time = formatTime(d.sched_time ?? d.timestamp, lang);
  const delay = d.delay_seconds !== null ? formatDelaySeconds(d.delay_seconds, lang) : '—';
  // REASON: delay + translated cause summary + cleaned raw text (full raw
  // text stays available in the title tooltip).
  const clean = cleanReason(d.raw_text, lang);
  const cause = causeLabel(d.cause, lang);
  const reason = [formatDelayPlus(d.delay_seconds, lang), cause, clean].filter(Boolean).join(' · ') || '—';
  return `
  <tr>
    <td class="num">${esc(time)}</td>
    <td class="line">${esc(d.line ?? '—')}</td>
    <td>
      <span class="badge ${badgeClass(d.type)}">${translate(typeKey(d.type), lang)}</span>
      ${d.cause ? `<span class="badge badge-cause" title="${esc(d.cause)}">${esc(cause)}</span>` : ''}
    </td>
    <td><span class="badge ${severityBadgeClass(d.severity)}">${translate(severityKey(d.severity), lang)}</span></td>
    <td class="num">${esc(delay)}</td>
    <td>${esc(directionText(d.direction, lang))}</td>
    <td class="reason" title="${esc(d.raw_text ?? reason)}">${esc(reason)}</td>
  </tr>`;
}

/** Table scope: the live board shows only today; archive shows recent history date-grouped. */
export type DisruptionViewMode = 'today' | 'archive';

/** Calendar date (YYYY-MM-DD) of a row: sched_time preferred, timestamp as fallback. */
function rowDate(d: Disruption): string {
  const src = d.sched_time ?? d.timestamp;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(src ?? '');
  return m?.[1] ?? '';
}

/** Label for a date-separator row: "Today" for the current local day, else a locale date. */
function dateSepLabel(date: string, lang: Lang): string {
  if (date === localToday()) return translate('disruptions_today_sep', lang);
  return formatDate(date, lang);
}

/** Dense departure-board table: Time / Line / Type / Severity / Delay / Direction / Reason. */
export function renderDisruptionsTable(
  disruptions: Disruption[],
  lang: Lang,
  mode: DisruptionViewMode = 'today',
): string {
  if (disruptions.length === 0) {
    const key: Key = mode === 'archive' ? 'disruptions_none_archive' : 'disruptions_none_today';
    return `<div class="empty">${translate(key, lang)}</div>`;
  }
  const headers: Key[] = [
    'th_time',
    'th_line',
    'th_type',
    'th_severity',
    'th_delay',
    'th_direction',
    'th_reason',
  ];
  let prevDate = '';
  const bodyRows: string[] = [];
  for (const d of disruptions) {
    const date = rowDate(d);
    if (mode === 'archive' && date && date !== prevDate) {
      bodyRows.push(
        `<tr class="date-sep"><td colspan="7">${esc(dateSepLabel(date, lang))}</td></tr>`,
      );
    }
    prevDate = date;
    bodyRows.push(row(d, lang));
  }
  return `
  <div class="table-wrap">
    <table class="board-table">
      <thead>
        <tr>${headers.map((h) => `<th>${translate(h, lang)}</th>`).join('')}</tr>
      </thead>
      <tbody>${bodyRows.join('')}</tbody>
    </table>
  </div>`;
}
