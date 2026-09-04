import type { Disruption } from '@oresund/shared';
import { actualTime, formatDate, formatDelayPlus, formatExactDelay, formatTime } from '../i18n/format';
import { BAND_BADGE_CLASS, delayBand, localToday, type DelayBand, type Direction } from '../lib/stats';
import { translate, type Key, type Lang } from '../i18n';
import { causeLabel, cleanReason, effectiveCause } from '../lib/causes';
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

/**
 * Whether the row may be banded "On time" (audit4 N-H3). A cancellation did
 * not run, and an alert is a service notice whose delay field can be 0 while
 * the row still describes a problem — banding either of those green would put
 * "On time" one cell away from the "Cancellation"/"Alert" badge saying the
 * opposite. A real, non-zero delay on an alert row keeps its band: it is
 * measured, and amber/red says nothing that contradicts the type.
 */
function showsOnTimeBand(d: Disruption): boolean {
  return d.type !== 'cancellation' && d.type !== 'alert';
}

/**
 * The TIME cell (backlog B1): the scheduled slot, plus the expected time the
 * delay implies when the row carries both a scheduled time and a measured,
 * non-zero delay. The pair is the feed's own two fields — the expected value
 * is their sum, not a new source. Rows without both keep a single time, and a
 * zero delay is not paired with itself.
 */
function timeCell(d: Disruption, lang: Lang): string {
  const sched = formatTime(d.sched_time ?? d.timestamp, lang) || '—';
  if (!d.sched_time || !d.delay_seconds || d.delay_seconds <= 0) {
    return `<span class="time-sched">${esc(sched)}</span>`;
  }
  const expected = actualTime(d.sched_time, d.delay_seconds, lang);
  if (!expected) return `<span class="time-sched">${esc(sched)}</span>`;
  const title = translate('time_pair_title', lang, {
    sched,
    actual: expected,
    delay: formatDelayPlus(d.delay_seconds, lang) || formatExactDelay(d.delay_seconds, lang),
  });
  return `<span class="time-sched">${esc(sched)}</span><span class="time-actual" title="${esc(title)}">→ ${esc(expected)}</span>`;
}

/**
 * The LINE cell: the line, the train number, and — when the feed populated it
 * — the affected stretch as a second line (backlog B1). The collector writes
 * route_section only when the operator names one, so the extra line stays
 * absent rather than an empty stub on the rows that have none.
 */
function lineCell(d: Disruption, lang: Lang): string {
  const section = d.route_section
    ? `<span class="route-section" title="${esc(translate('route_section_hint', lang))}">${esc(d.route_section)}</span>`
    : '';
  return `${esc(d.line ?? '—')}${trainNumber(d.technical_number)}${section}`;
}

/** Disruptions have no destination field — show the affected direction instead. */
function directionText(direction: string | null, lang: Lang): string {
  if (direction === 'to_denmark') return translate('tab_to_denmark', lang);
  if (direction === 'to_sweden') return translate('tab_to_sweden', lang);
  return '—';
}

/**
 * The physical train's number (audit3 H2) — populated on every row, and the
 * one field that identifies "is this MY train" across consecutive slots, since
 * the same technical_number repeats on back-to-back departures. Rendered as a
 * muted token inside the LINE cell rather than an eighth column: the table is
 * already at the edge of fitting a phone, and a hidden-by-overflow column
 * would carry no information at all.
 */
function trainNumber(technicalNumber: string | null): string {
  if (!technicalNumber) return '';
  return `<span class="train-no">#${esc(technicalNumber)}</span>`;
}

/**
 * A row's stable identity (audit4 N-H7): the board is re-rendered on every
 * 120-second refresh, and `dep_key` (date, line, time, destination) names the
 * same departure from one snapshot to the next. The reconciler matches on it,
 * so a row that merely moved is relocated rather than deleted and rebuilt.
 * `dep_key` is nullable on legacy rows — the database id stands in.
 */
function rowKey(d: Disruption): string {
  return d.dep_key ?? `id-${d.id}`;
}

function row(d: Disruption, lang: Lang): string {
  // TIME: the scheduled slot paired with the delay-implied expectation (B1).
  const time = timeCell(d, lang);
  // DELAY: a banded badge instead of raw seconds (audit3 H1) — the exact
  // delay moves into the badge's title tooltip. Rows with no measured delay
  // keep the no-data mark, and cancelled/alert rows never read "On time"
  // (audit4 N-H3).
  const band = delayBand(d.delay_seconds);
  const shown: DelayBand | null = band === 'on_time' && !showsOnTimeBand(d) ? null : band;
  const bandLabel = shown ? translate(bandKey(shown), lang) : '';
  const delay = shown
    ? `<span class="badge ${BAND_BADGE_CLASS[shown]}" title="${esc(formatExactDelay(d.delay_seconds, lang))}">${esc(bandLabel)}</span>`
    : '—';
  // LINE: line + train number + the affected stretch when the feed named one (B1).
  const line = lineCell(d, lang);
  // REASON: delay + translated cause summary + cleaned raw text (full raw
  // text stays available in the title tooltip). The cause is the collector's
  // verdict, re-classified from the alert text when it stored `unknown` (B2).
  // Whatever is left unknown shows the delay band instead, so the reason is
  // always derived from what is actually measured.
  const clean = cleanReason(d.raw_text, lang);
  const resolved = effectiveCause(d.cause, d.raw_text);
  const knownCause = hasKnownCause(resolved);
  const cause = causeLabel(resolved, lang);
  const reason =
    [formatDelayPlus(d.delay_seconds, lang), knownCause ? cause : bandLabel, clean]
      .filter(Boolean)
      .join(' · ') || '—';
  return `
  <tr data-key="${esc(rowKey(d))}">
    <td class="num">${time}</td>
    <td class="line">${line}</td>
    <td>
      <span class="badge ${badgeClass(d.type)}">${translate(typeKey(d.type), lang)}</span>
      ${knownCause ? `<span class="badge badge-cause" title="${esc(resolved)}">${esc(cause)}</span>` : ''}
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
  // The raw string is the fallback (audit6 L1): formatDate returns '' for an
  // impossible date, and an empty interpolation here rendered a date-separator
  // row with no text in it at all.
  return formatDate(date, lang) || date;
}

/**
 * Dense departure-board table: Time / Line / Type / Delay band / Direction /
 * Reason. `direction` is the filter the caller applied to reach this list
 * (backlog B4): a narrowed board with zero rows gets copy that names the
 * direction, because the corridor-wide "all clear" would over-claim.
 */
export function renderDisruptionsTable(
  disruptions: Disruption[],
  lang: Lang,
  mode: DisruptionViewMode = 'today',
  direction: Direction = 'all',
): string {
  if (disruptions.length === 0) {
    const key: Key =
      mode === 'archive'
        ? 'disruptions_none_archive'
        : direction === 'all'
          ? 'disruptions_none_today'
          : 'disruptions_none_today_dir';
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
  // The table has no visible heading of its own (the section title sits above
  // the tabs), so the caption names it for a screen reader. It stays sr-only:
  // a second visible "Disruptions" would duplicate the section heading.
  const captionKey: Key = mode === 'archive' ? 'disruptions_caption_archive' : 'disruptions_caption_today';
  let prevDate = '';
  const bodyRows: string[] = [];
  for (const d of disruptions) {
    const date = rowDate(d);
    if (mode === 'archive' && date && date !== prevDate) {
      bodyRows.push(
        `<tr class="date-sep" data-key="sep:${esc(date)}"><td colspan="6">${esc(dateSepLabel(date, lang))}</td></tr>`,
      );
    }
    prevDate = date;
    bodyRows.push(row(d, lang));
  }
  return `
  <div class="table-wrap" id="disruptions-table">
    <table class="board-table">
      <caption class="sr-only">${esc(translate(captionKey, lang))}</caption>
      <thead>
        <tr>${headers.map((h) => `<th scope="col">${translate(h, lang)}</th>`).join('')}</tr>
      </thead>
      <tbody>${bodyRows.join('')}</tbody>
    </table>
  </div>`;
}
