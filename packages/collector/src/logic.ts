/**
 * Disruption-collector logic, ported 1:1 from the private Python monitor
 * (transit-monitor.py). Pure functions — no I/O. Behavior and constants are
 * locked by the port plan; a later A/B week validates equivalence.
 */
import type { TrafiklabDeparture } from '@oresund/shared';

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

const CAUSE_KEYWORDS: Record<string, string[]> = {
  staffing: ['personalbrist', 'forarbortfall', 'tagpersonal', 'strejk', 'konflikt', 'sjuk'],
  signal_failure: [
    'signal',
    'vaxel',
    'sbx',
    'banarbete',
    'storning i',
    'tekniskt fel',
    'teknisk storning',
    'stillastaende',
  ],
  vehicle: [
    'vagnbrist',
    'fordonsfel',
    'fordon',
    'kort tag',
    'short train',
    'motorfel',
    'materialfel',
    'bakre tagsatt',
    'vagn',
  ],
  person_on_tracks: [
    'person pa sparet',
    'person',
    'smith',
    'obducent',
    'olycka',
    'pakord',
    'obehoriga pa sparen',
  ],
  infrastructure: ['banarbete', 'bygge', 'underhall', 'entreprenad', 'sparspar'],
  police: ['polis', 'larm', 'raddning', 'brand'],
  weather: [
    'snostorm',
    'storm',
    'blast',
    'halka',
    'oversvamning',
    'regnskur',
    'dimma',
    'vadarforhallanden',
    'hard vind',
  ],
  congestion: ['tagko', 'tågkö', 'ko vid'],
};

const CAUSE_PRIORITY = [
  'staffing',
  'person_on_tracks',
  'signal_failure',
  'vehicle',
  'police',
  'infrastructure',
  'congestion',
  'weather',
] as const;

export type DisruptionCause =
  | 'staffing'
  | 'person_on_tracks'
  | 'signal_failure'
  | 'vehicle'
  | 'police'
  | 'infrastructure'
  | 'congestion'
  | 'weather'
  | 'unknown';

/** Keyword-map cause classification over normalized title+text, priority-ordered. */
export function categorizeCause(title: string, text: string): DisruptionCause {
  let combined = (title + ' ' + text)
    .toLowerCase()
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('å', 'a')
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae');
  combined = ' ' + combined + ' ';
  for (const cause of CAUSE_PRIORITY) {
    if ((CAUSE_KEYWORDS[cause] ?? []).some((kw) => combined.includes(kw))) return cause;
  }
  return 'unknown';
}

export type DisruptionSeverity = 'major' | 'moderate' | 'minor';

/** Severity: canceled→major, delay≥900→moderate, cancellation keywords→major, else minor. */
export function categorizeSeverity(
  delay: number | null | undefined,
  canceled: boolean,
  title: string,
  text: string,
): DisruptionSeverity {
  if (canceled) return 'major';
  if (delay && delay >= 900) return 'moderate';
  const combined = (title + ' ' + text)
    .toLowerCase()
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('å', 'a')
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae');
  if (['installt', 'cancelled', 'canceled', 'stoppad'].some((kw) => combined.includes(kw))) {
    return 'major';
  }
  if (['vagnbrist', 'kort tag', 'short train'].some((kw) => combined.includes(kw))) {
    return 'minor';
  }
  if (delay && delay >= 240) return 'minor';
  return 'minor';
}

export type DisruptionType = 'cancellation' | 'delay' | 'alert' | 'unknown';

/** Type: canceled→cancellation, cancellation keywords→cancellation, delay≥240→delay, message→alert, else unknown. */
export function classifyType(
  canceled: boolean,
  delay: number | null | undefined,
  title: string,
  text: string,
): DisruptionType {
  if (canceled) return 'cancellation';
  const combined = (title + ' ' + text)
    .toLowerCase()
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('å', 'a')
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae');
  if (['installt', 'cancelled', 'canceled'].some((kw) => combined.includes(kw))) {
    return 'cancellation';
  }
  if (delay && delay >= 240) return 'delay';
  if (title || text) return 'alert';
  return 'unknown';
}

/**
 * Severity rank used for "sticky" disruption types: a disruption row that was
 * once classified more severely must not be downgraded by a later, weaker
 * observation of the same departure. Trafiklab resets delay fields late
 * (re-timing / post-departure polls), so a train first logged as delay>=240
 * can re-classify as alert on a later poll even though the alert text — and
 * the recorded worst delay — still describe the same event.
 */
export function disruptionTypeRank(type: DisruptionType): number {
  switch (type) {
    case 'cancellation':
      return 3;
    case 'delay':
      return 2;
    case 'alert':
      return 1;
    default:
      return 0;
  }
}

/**
 * The more severe of two classifications for the same departure. Ties keep
 * the incoming value so the latest observation wins within a rank.
 */
export function stickierType(existing: DisruptionType, incoming: DisruptionType): DisruptionType {
  return disruptionTypeRank(incoming) >= disruptionTypeRank(existing) ? incoming : existing;
}

/** "" or <16 chars → "?", else the HH:MM slice (isoStr[11:16]). */
export function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr || isoStr.length < 16) return '?';
  return isoStr.slice(11, 16);
}

/** Chronic keywords (vagnbrist, kort tag, short train, fordon) — lowercase only, no normalization. */
export function isChronic(title: string, text: string): boolean {
  return ['vagnbrist', 'kort tag', 'short train', 'fordon'].some((kw) =>
    (title + ' ' + text).toLowerCase().includes(kw),
  );
}

/**
 * Resumed-normal notice detection: Trafiklab follows a disruption with
 * "Förseningar – Tågen kan köra normalt igen" ("delays – trains can run
 * normally again") once service is back. That message is NOT a disruption:
 * the delay field often still carries a stale value (0–779s observed), so
 * classifyType would otherwise log a bogus delay/alert row — inflating
 * disruption_count even though the train is on time. The phrase is matched on
 * the Scandinavian-normalized title+text (ö→o, å→a), covering the Swedish
 * variants "kan köra normalt igen" and "kör normalt igen". Only the
 * all-clear phrase counts — a real disturbance text must never match.
 */
export function isResumedNormalNotice(title: string, text: string): boolean {
  const combined = normalizeScan(`${title} ${text}`);
  return combined.includes('kan kora normalt igen') || combined.includes('kor normalt igen');
}

/** True only when every alert on the departure is a resumed-normal notice (no active alerts present). */
export function isEveryAlertResumed(alerts: readonly { title?: unknown; text?: unknown }[]): boolean {
  if (alerts.length === 0) return false;
  for (const a of alerts) {
    const title = String((a as any)?.title ?? '');
    const text = String((a as any)?.text ?? '');
    if (!isResumedNormalNotice(title, text)) return false;
  }
  return true;
}

const CROSSBORDER_DEST_KEYWORDS = [
  'osterport',
  'kobenhavn',
  'copenhagen',
  'kopengamn',
  'lufthavn',
  'kobenhavns lufthavn',
];

/** TRAIN/RAIL and dest contains a Denmark keyword (normalized). */
export function isCrossborderTrain(dep: TrafiklabDeparture): boolean {
  const mode = (dep.route?.transport_mode ?? '').toUpperCase();
  if (!mode.includes('TRAIN') && !mode.includes('RAIL')) return false;
  const dest = normalizeScan(dep.route?.direction ?? '');
  return CROSSBORDER_DEST_KEYWORDS.some((d) => dest.includes(d));
}

const SWEDEN_DEST_KEYWORDS = [
  'malmo',
  'malmö',
  'hyllie',
  'helsingborg',
  'lund',
  'ystad',
  'trelleborg',
  'hassleholm',
  'hässleholm',
  'karlskrona',
  'växjö',
  'vaxjo',
  'göteborg',
  'goteborg',
  'sverige',
  'sweden',
];

/** TRAIN/RAIL and dest contains a Sweden keyword (normalized). */
export function isSwedenBoundTrain(dep: TrafiklabDeparture): boolean {
  const mode = (dep.route?.transport_mode ?? '').toUpperCase();
  if (!mode.includes('TRAIN') && !mode.includes('RAIL')) return false;
  const dest = normalizeScan(dep.route?.direction ?? '');
  return SWEDEN_DEST_KEYWORDS.some((d) => dest.includes(d));
}

/** BUS, designation 6 or 16, and (lowercased, un-normalized) dest contains "hyllie". */
export function isGottorpHyllieBus(dep: TrafiklabDeparture): boolean {
  const mode = (dep.route?.transport_mode ?? '').toUpperCase();
  if (!mode.includes('BUS')) return false;
  const line = String(dep.route?.designation ?? '');
  if (line !== '6' && line !== '16') return false;
  const dest = (dep.route?.direction ?? '').toLowerCase();
  return dest.includes('hyllie');
}

/**
 * Punctuality status threshold — Skånetrafiken's official RT3 measure:
 * a departure ≤ 3:59 late counts as punctual; ≥ 4:00 (240s) is delayed.
 * ("Läget i tågtrafiken 2025": "Skånetrafiken har 3:59 (RT3) som mått".)
 * classifyType uses the SAME 240s boundary, so the official delay definition
 * is consistent across the KPI and the disruption table.
 */
export function delayStatus(delaySeconds: number): 'on_time' | 'delayed' {
  return delaySeconds < 240 ? 'on_time' : 'delayed';
}
