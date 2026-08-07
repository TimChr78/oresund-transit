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

/** Render an HH:MM time per locale (DA uses a dot separator). Empty when unparseable. */
export function formatTime(value: string, lang: Lang): string {
  const m = /(?:^|T)(\d{2}):(\d{2})/.exec(value);
  const hour = m?.[1];
  const minute = m?.[2];
  if (!hour || !minute) return '';
  if (Number(hour) > 23 || Number(minute) > 59) return '';
  return lang === 'da' ? `${hour}.${minute}` : `${hour}:${minute}`;
}

/** Render a delay in seconds as whole minutes ("4 min", DA "4 min."). */
export function formatDelaySeconds(seconds: number | null, lang: Lang): string {
  if (seconds === null) return '—';
  const minutes = Math.max(0, Math.round(seconds / 60));
  return lang === 'da' ? `${minutes} min.` : `${minutes} min`;
}

/** Render a percentage with one decimal, locale decimal separator. */
export function formatPct(value: number, lang: Lang): string {
  if (!Number.isFinite(value)) return '—';
  const sep = lang === 'en' ? '.' : ',';
  return `${value.toFixed(1).replace('.', sep)}%`;
}
