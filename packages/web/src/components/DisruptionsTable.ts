import type { Disruption } from '@oresund/shared';
import { formatDelaySeconds, formatTime } from '../i18n/format';
import { translate, type Key, type Lang } from '../i18n';
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

function row(d: Disruption, lang: Lang): string {
  const time = formatTime(d.sched_time ?? d.timestamp, lang);
  const delay = d.delay_seconds !== null ? formatDelaySeconds(d.delay_seconds, lang) : '—';
  const reason = d.raw_text || d.cause || '—';
  return `
  <tr>
    <td class="num">${esc(time)}</td>
    <td class="line">${esc(d.line ?? '—')}</td>
    <td><span class="badge ${badgeClass(d.type)}">${translate(typeKey(d.type), lang)}</span></td>
    <td><span class="badge ${severityBadgeClass(d.severity)}">${translate(severityKey(d.severity), lang)}</span></td>
    <td class="num">${esc(delay)}</td>
    <td>${esc(d.destination ?? '—')}</td>
    <td class="reason" title="${esc(reason)}">${esc(reason)}</td>
  </tr>`;
}

/** Dense departure-board table: Time / Line / Type / Severity / Delay / Destination / Reason. */
export function renderDisruptionsTable(disruptions: Disruption[], lang: Lang): string {
  if (disruptions.length === 0) {
    return `<div class="empty">${translate('empty_disruptions', lang)}</div>`;
  }
  const headers: Key[] = [
    'th_time',
    'th_line',
    'th_type',
    'th_severity',
    'th_delay',
    'th_destination',
    'th_reason',
  ];
  return `
  <div class="table-wrap">
    <table class="board-table">
      <thead>
        <tr>${headers.map((h) => `<th>${translate(h, lang)}</th>`).join('')}</tr>
      </thead>
      <tbody>${disruptions.map((d) => row(d, lang)).join('')}</tbody>
    </table>
  </div>`;
}
