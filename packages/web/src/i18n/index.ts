import type { Dict, Key, Lang } from './keys';
import { da } from './da';
import { en } from './en';
import { sv } from './sv';

export type { Dict, Key, Lang } from './keys';
export { BRAND_NAME, RSS_TITLE } from './keys';

/** localStorage key for the saved language choice. */
export const LANG_STORAGE_KEY = 'oresund-lang';

export const DICTS: Record<Lang, Dict> = { sv, da, en };

export function getDict(lang: Lang): Dict {
  return DICTS[lang];
}

/**
 * Translate a key into the given language, interpolating {name} params
 * (e.g. `translate('banner_disruptions_many', 'en', { n: 3 })`).
 */
export function translate(key: Key, lang: Lang, params?: Record<string, string | number>): string {
  let out = getDict(lang)[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replaceAll(`{${name}}`, String(value));
    }
  }
  return out;
}

/** Map a browser locale ("sv-SE", "da", "en-US", ...) to a supported language. */
export function langFromLocale(locale: string | null | undefined): Lang {
  const code = (locale ?? '').toLowerCase();
  if (code.startsWith('sv')) return 'sv';
  if (code.startsWith('da')) return 'da';
  return 'en';
}

/** Saved language first, then navigator.language; storage failures fall back. */
export function detectLang(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(LANG_STORAGE_KEY);
    if (saved === 'sv' || saved === 'da' || saved === 'en') return saved;
  } catch {
    // storage blocked (private mode / sandboxed iframe) — fall through
  }
  return langFromLocale(globalThis.navigator?.language);
}

/** Persist the language choice; storage failures are non-fatal. */
export function saveLang(lang: Lang): void {
  try {
    globalThis.localStorage?.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore — the choice still applies for this session
  }
}

/**
 * Pick the banner text key from a live snapshot. service_shutdown forces the
 * red "no service" band; otherwise the Phase 3a status field maps 1:1.
 */
export function statusKeyFor(s: { status: string; service_shutdown: boolean }): Key {
  if (s.service_shutdown) return 'status_service_shutdown';
  switch (s.status) {
    case 'red':
      return 'status_cancellations';
    case 'amber':
      return 'status_delayed';
    case 'blue':
      return 'status_alerts';
    default:
      return 'status_normal';
  }
}
