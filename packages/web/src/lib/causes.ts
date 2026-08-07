import { translate, type Key, type Lang } from '../i18n';

/**
 * Cause handling for the dashboard. The collector stores cause enum keys in
 * D1 (see categorizeCause in packages/collector/src/logic.ts) — this is the
 * definitive list, and every value must have a cause_<key> translation in
 * all three dictionaries (enforced by test/i18n.test.ts).
 */
export const CAUSE_KEYS = [
  'staffing',
  'person_on_tracks',
  'signal_failure',
  'vehicle',
  'police',
  'infrastructure',
  'congestion',
  'weather',
  'unknown',
] as const;

export type CauseKey = (typeof CAUSE_KEYS)[number];

/** Translation key for a cause enum value; anything outside the enum → unknown. */
export function causeKey(cause: string | null | undefined): Key {
  return cause && (CAUSE_KEYS as readonly string[]).includes(cause) ? (`cause_${cause}` as Key) : 'cause_unknown';
}

/**
 * Translated cause label. Known enum keys map to their dict entry; the
 * 'unknown' key (and null) map to cause_unknown; legacy non-enum values
 * (e.g. old seeds with raw Swedish text) pass through as-is.
 */
export function causeLabel(cause: string | null | undefined, lang: Lang): string {
  if (!cause || cause === 'unknown') return translate('cause_unknown', lang);
  const key = causeKey(cause);
  return key === 'cause_unknown' ? cause : translate(key, lang);
}

/**
 * Clean a disruption's raw_text for the REASON column. Strips the private
 * monitor's "DELAY HH:MM line -> dest: +Xmin forsening" prefix, normalizes
 * internal "|" segment separators, and trims trailing generic-advice
 * boilerplate. Returns '' when nothing meaningful remains — callers then
 * show the delay + translated cause summary instead. The full raw_text is
 * kept in the cell's title tooltip.
 */
export function cleanReason(raw: string | null | undefined, _lang: Lang): string {
  if (!raw) return '';
  let text = raw
    .replace(
      /^DELAY\s+\d{1,2}:\d{2}\s+\S+\s*->\s*[^:]+:\s*\+?\d+\s*min(?:\s+(?:forsening|försening|delay))?\s*/i,
      '',
    )
    .trim();
  // drop a leading separator left where the prefix was stripped
  text = text.replace(/^[|·,;:]\s*/, '');
  text = text.replace(/\s*\|\s*/g, ' · ').trim();
  // trailing generic-advice boilerplate (Swedish Trafikverket phrasing)
  text = text.replace(/\s*·\s*vi rekommenderar[^·]*$/i, '').trim();
  return text;
}
