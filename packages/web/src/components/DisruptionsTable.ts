import type { Disruption } from '@oresund/shared';
import { formatDate, formatDelayPlus, formatExactDelay, formatTime } from '../i18n/format';
import { delayBand, localToday, type DelayBand } from '../lib/stats';
import { translate, type Key, type Lang } from '../i18n';
import { causeLabel, cleanReason } from '../lib/causes';
import { esc } from '../lib/html';

function typeKey(type: string | null): Key {
  if (type === 'cancellation') return 'type_cancellation';
  if (type === 'alert') return 'type_alert';
  return 'type_delay';
}

function badgeClass(type: string | null): string {
  if (type === 'cancellation') return 'badge-cancellation';
  if (type === 'alert') return 'badge-alert';
  return 'badge-delay';
}

function bandKey(band: DelayBand): Key {
  return `delay_band_${band}` as Key;
}

/** Badge colour per band: green → amber → red → solid red as the delay grows. */
const BAND_BADGE_CLASS: Record<DelayBand, string> = {
  on_time: 'badge-band-on-time',
  minor: 'badge-band-minor',
  moderate: 'badge-band-moderate',
  major: 'badge-band-major',
};

/**
 * A cause worth a badge. 'unknown' (and null) render no chip at all: with no
 * alert text the collector structurally cannot classify a plain late train,
 * so 78% of live rows would otherwise repeat a meaningless "Unknown" (audit3
 * H1). Legacy free-text causes keep their badge — causeLabel passes them
 * through verbatim.
 */
function hasKnownCause(cause: string | null): boolean {
  return !!cause && cause !== 'unknown';
}

/** Disruptions have no destination field — show the affected direction instead. */
function directionText(direction: string | null, lang: Lang): string {
  if (direction === 'to_denmark') return translate('tab_to_denmark', lang);
  if (direction === 'to_sweden') return translate('tab_to_sweden', lang);
  return '—';
}

function row(d: Disruption, lang: Lang): string {
  const time = formatTime(d.sched_time ?? d.timestamp, lang);
  // DELAY: a banded badge instead of raw seconds (audit3 H1) — the exact
  // delay moves into the badge's title tooltip. Rows with no measured delay
  // (cancellations, alerts) keep the no-data mark.
  const band = delayBand(d.delay_seconds);
  const bandLabel = band ? translate(bandKey(band), lang) : '';
  const delay = band
    ? `<span class="badge ${BAND_BADGE_CLASS[band]}" title="${esc(formatExactDelay(d.delay_seconds, lang))}">${esc(bandLabel)}</span>`
    : '—';
  // REASON: delay + translated cause summary + cleaned raw text (full raw
  // text stays available in the title tooltip). When the cause is unknown the
  // delay band stands in for the "Unknown" marker, so the reason is derived
  // from what is actually measured.
  const clean = cleanReason(d.raw_text, lang);
  const knownCause = hasKnownCause(d.cause);
  const cause = causeLabel(d.cause, lang);
  const reason =
    [formatDelayPlus(d.delay_seconds, lang), knownCause ? cause : bandLabel, clean]
      .filter(Boolean)
      .join(' · ') || '—';
  return `
  <tr>
    <td class="num">${esc(time)}</td>
    <td class="line">${esc(d.line ?? '—')}</td>
    <td>
      <span class="badge ${badgeClass(d.type)}">${translate(typeKey(d.type), lang)}</span>
      ${knownCause ? `<span class="badge badge-cause" title="${esc(d.cause ?? '')}">${esc(cause)}</span>` : ''}
    </td>
    <td class="num">${delay}</td>
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

/** Dense departure-board table: Time / Line / Type / Delay band / Direction / Reason. */
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
        `<tr class="date-sep"><td colspan="6">${esc(dateSepLabel(date, lang))}</td></tr>`,
      );
    }
    prevDate = date;
    bodyRows.push(row(d, lang));
  }
  return `
  <div class="table-wrap" id="disruptions-table">
    <table class="board-table">
      <thead>
        <tr>${headers.map((h) => `<th>${translate(h, lang)}</th>`).join('')}</tr>
      </thead>
      <tbody>${bodyRows.join('')}</tbody>
    </table>
  </div>`;
}
