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
