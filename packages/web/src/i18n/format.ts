import type { Lang } from './keys';

/**
 * Locale-aware date/time formatting. A transit board uses 24h times in every
 * language; only the date day/month order and the time separator differ:
 *   SV/EN:  2026-08-06  ·  21:59
 *   DA:     06-08-2026  ·  21.59
 * Inputs are the API's naive local ISO strings ("2026-08-06" or
 * "2026-08-06T21:59:27"); no timezone conversion is applied.
 */

/** Render an ISO date (or date-time) per locale. Empty string when unparseable. */
export function formatDate(value: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const year = m?.[1];
  const month = m?.[2];
  const day = m?.[3];
  if (!year || !month || !day) return '';
  return lang === 'da' ? `${day}-${month}-${year}` : `${year}-${month}-${day}`;
}

/**
 * Normalize a timestamp to ISO-T form ("2026-08-06T15:35:11"). The API data
 * carries BOTH the space-separated ("2026-08-06 15:35:11") and ISO-T formats;
 * normalizing the separator in one place keeps formatTime/formatDate simple.
 * Empty string when unparseable (bare "21:59" included — callers fall back).
 */
export function normalizeTs(ts: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(ts);
  return m ? `${m[1]}T${m[2]}` : '';
}

/** Render an HH:MM time per locale (DA uses a dot separator). Empty when unparseable. */
export function formatTime(value: string, lang: Lang): string {
  const normalized = normalizeTs(value) || value;
  const m = /(?:^|T)(\d{2}):(\d{2})/.exec(normalized);
  const hour = m?.[1];
  const minute = m?.[2];
  if (!hour || !minute) return '';
  if (Number(hour) > 23 || Number(minute) > 59) return '';
  return lang === 'da' ? `${hour}.${minute}` : `${hour}:${minute}`;
}

/** Render a delay in seconds: sub-minute values as seconds ("21 s"), the rest as whole minutes ("4 min", DA "4 min."). */
export function formatDelaySeconds(seconds: number | null, lang: Lang): string {
  if (seconds === null) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return lang === 'da' ? `${s} sek.` : `${s} s`;
  const minutes = Math.round(s / 60);
  return lang === 'da' ? `${minutes} min.` : `${minutes} min`;
}

/** Render a positive delay as "+N min" ("+11 min", DA "+11 min."). Empty when not positive. */
export function formatDelayPlus(seconds: number | null | undefined, lang: Lang): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return '';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return lang === 'da' ? `+${minutes} min.` : `+${minutes} min`;
}

/**
 * Render a delay WITHOUT rounding — minutes plus leftover seconds ("8 min 12 s",
 * DA "8 min. 12 sek.") — for the delay badge's title tooltip, where the exact
 * value lives once the visible cell shows only the band (audit3 H1).
 */
export function formatExactDelay(seconds: number | null | undefined, lang: Lang): string {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Math.round(seconds));
  const sek = lang === 'da' ? 'sek.' : 's';
  if (s < 60) return `${s} ${sek}`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  if (rest === 0) return lang === 'da' ? `${min} min.` : `${min} min`;
  return lang === 'da' ? `${min} min. ${rest} sek.` : `${min} min ${rest} s`;
}

/** Render a percentage with one decimal, locale decimal separator. */
export function formatPct(value: number, lang: Lang): string {
  if (!Number.isFinite(value)) return '—';
  const sep = lang === 'en' ? '.' : ',';
  return `${value.toFixed(1).replace('.', sep)}%`;
}
