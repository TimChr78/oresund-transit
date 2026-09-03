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

/**
 * Keyword fallback (backlog B2) for rows the collector stored as `unknown` but
 * whose alert text still names a cause. Inventoried over 45 days of live
 * /disruptions (2026-07-19 → 2026-09-03, 973 rows): the collector only ever
 * writes enum keys — `unknown` 645, `vehicle` 95, `signal_failure` 90,
 * `person_on_tracks` 86, `staffing` 43, `congestion` 12, `police` 2 — so every
 * verdict it reaches is already covered by CAUSE_KEYS and the enum needs no
 * new member. The gap is the reverse one: 89 of those 645 `unknown` rows DO
 * carry text, and a recurring phrasing in it never hits the collector's
 * keyword map. These are those phrases, each seen in the live sample; a catch
 * there relabels ~20% of the unknown-but-explained rows.
 *
 * Matching runs over the same Scandinavian normalization the collector applies
 * (å/ä→a, ö→o, ø→o, æ→ae), and the fallback NEVER runs when the collector
 * already reached a verdict — it only fills the gap it left, so the two can
 * disagree about a row without either of them changing what is shown.
 */
const CAUSE_TEXT_KEYWORDS: readonly { cause: CauseKey; keywords: readonly string[] }[] = [
  // "tåget ska till verkstad" — the vehicle is out for maintenance, not broken en route.
  { cause: 'vehicle', keywords: ['verkstad'] },
  { cause: 'police', keywords: ['ordningsproblem'] },
  { cause: 'congestion', keywords: ['manga resande'] },
  { cause: 'signal_failure', keywords: ['stopp i tagtrafiken', 'framkomlighetsproblem'] },
  { cause: 'infrastructure', keywords: ['buss ersatter', 'ersattningsbuss'] },
];

/** Lowercase + the collector's Scandinavian normalization, so both sides match the same tokens. */
function normalizeScan(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae')
    .replaceAll('å', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('ä', 'a');
}

/**
 * Re-classify from the alert text alone; null when no keyword matches (the
 * plain "DELAY 08:14 803 -> Østerport: +12min" prefix matches nothing, so
 * those rows stay unknown — there is genuinely no cause in them).
 */
export function causeFromText(raw: string | null | undefined): CauseKey | null {
  if (!raw) return null;
  const text = ` ${normalizeScan(raw)} `;
  for (const { cause, keywords } of CAUSE_TEXT_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) return cause;
  }
  return null;
}

/**
 * The cause a row should display (backlog B2): the collector's verdict when it
 * reached one, else the text fallback, else 'unknown'. Legacy free-text values
 * from old seeds pass through untouched, exactly as causeLabel renders them.
 */
export function effectiveCause(cause: string | null | undefined, raw: string | null | undefined): string {
  if (cause && cause !== 'unknown') return cause;
  return causeFromText(raw) ?? 'unknown';
}

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
