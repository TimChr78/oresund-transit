/**
 * Disruption-collector logic, ported 1:1 from the private Python monitor
 * (transit-monitor.py). Pure functions — no I/O. Behavior and constants are
 * locked by the port plan; a later A/B week validates equivalence.
 */

/** Scandinavian normalization: ø→o, æ→ae, å→a, ö→o, ä→a, lowercase. */
export function normalizeScan(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae')
    .replaceAll('å', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('ä', 'a');
}

const DENMARK_DEST_KEYWORDS = [
  'kobenhavn',
  'copenhagen',
  'osterport',
  'helsingor',
  'norreport',
  'kbh',
  'lufthavn',
];

/**
 * Bus lines 6/16 → "bus"; else scan dest for Denmark keywords → "to_denmark",
 * otherwise "to_sweden"; parity fallback (even→to_denmark, odd→to_sweden) only
 * when dest is empty/unknown; null if line is not numeric.
 */
export function getDirection(
  line: string | number | null | undefined,
  dest?: string | null,
): 'bus' | 'to_denmark' | 'to_sweden' | null {
  // Mirrors Python `int(line)` (full-string integer, may be signed/whitespace-padded).
  const s = String(line).trim();
  const numeric = /^[+-]?\d+$/.test(s) ? Number(s) : null;
  if (numeric === 6 || numeric === 16) return 'bus';

  const d = normalizeScan(dest ?? '');
  if (d && d !== '?' && d !== '-') {
    if (DENMARK_DEST_KEYWORDS.some((k) => d.includes(k))) return 'to_denmark';
    return 'to_sweden';
  }
  if (numeric !== null) {
    return numeric % 2 === 0 ? 'to_denmark' : 'to_sweden';
  }
  return null;
}
