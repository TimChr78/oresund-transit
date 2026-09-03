import { translate, type Key, type Lang } from '../i18n';
import { esc } from '../lib/html';
import { localizedPath } from '../lib/seo';

/**
 * Station picker (audit3 C1 nav, backlog A1 live scope). One nav serves both
 * jobs:
 *
 *  - In the no-JS/crawler shell (index.html, prerendered /sv + /da homes) it is
 *    what it always was: links to the four per-station pages, so the station
 *    pages stay reachable from the homepage body.
 *  - On the live board the same links switch the board's station scope in
 *    place: main.ts intercepts the click (preventDefault) and refetches from
 *    the per-station endpoint instead of navigating. No-JS visitors and
 *    middle-clicks still follow the href — a real page, not a dead toggle.
 *
 * "All" is the unfiltered corridor view and links to the board itself, so the
 * reset works without JS too.
 *
 * The board data cannot be filtered per station client-side: `Disruption` rows
 * carry no `stop_id` (they describe a train, not an observation at a stop), so
 * a scope switch fetches `/api/transit/station/{slug}`, whose `recent` array is
 * the only per-stop data the collector exposes.
 *
 * Markup stays in lockstep with the hand-written nav in index.html —
 * test/prerender.test.ts asserts the shell equals renderStationPicker('en').
 * Scope is conveyed with `aria-current` (the state attribute for links), not
 * `aria-pressed`, which ARIA reserves for buttons.
 */

/** The monitored stops in corridor order (Sweden → Denmark), by collector slug. */
export const STATION_SLUGS = ['hyllie', 'malmo-c', 'kastrup', 'kobenhavn-h'] as const;

/** The board's station scope: the whole corridor, or one monitored stop. */
export type StationScope = 'all' | (typeof STATION_SLUGS)[number];

/** The station-name dictionary key for a collector slug (station_hyllie, …). */
export function stationNameKey(slug: string): Key {
  return `station_${slug.replaceAll('-', '_')}` as Key;
}

/** The four monitored stations, translated, in corridor order. */
export function stationNames(lang: Lang): string[] {
  return STATION_SLUGS.map((slug) => translate(stationNameKey(slug), lang));
}

/**
 * A scope from untrusted input (?station= query, data-value). Only the four
 * monitored slugs are valid; everything else — including null — is 'all'.
 */
export function parseStationScope(value: string | null | undefined): StationScope {
  return (STATION_SLUGS as readonly string[]).includes(value ?? '') ? (value as StationScope) : 'all';
}

/**
 * The scope a board URL asks for: the `?station=` value of a query string
 * (leading '?' optional), validated against the monitored slugs. Anything
 * unexpected — a hand-edited link, a slug from before a stop was renamed, no
 * param at all — is the whole corridor (audit4 N-M10). Reading it anywhere else
 * would let a bogus value reach SET_STATION, which puts the station section
 * into its loading state and then waits for a stop no endpoint serves: the
 * board would sit in "Loading…" forever.
 */
export function stationScopeFromSearch(search: string | null | undefined): StationScope {
  return parseStationScope(new URLSearchParams(search ?? '').get('station'));
}

/**
 * SERP-safe short form of a station name — for <title> only; the H1 and the
 * body keep the official name. Strips the parenthetical qualifier that pushes
 * the longest stop past ~60 characters once a title template wraps it:
 * 'Københavns Lufthavn (Kastrup)' → 'Københavns Lufthavn'.
 */
export function stationTitleName(name: string): string {
  return name.replace(/\s*\((?:Kastrup|CPH|Copenhagen)\)\s*/i, ' ').trim() || name;
}

/**
 * The board's scope label (audit3 C1 step 6): four stops are monitored, so the
 * label names all four instead of under-reporting the corridor as
 * "Hyllie ↔ København H". A picked station replaces the list with its name.
 */
export function stationScopeLabel(lang: Lang, scope: StationScope = 'all'): string {
  if (scope !== 'all') return translate(stationNameKey(scope), lang);
  return stationNames(lang).join(' · ');
}

/**
 * One nav of station links, in the page's language. `scope` marks the active
 * option (aria-current) — 'all' by default, which is what the static shell and
 * the prerendered home variants ship.
 */
export function renderStationPicker(lang: Lang, scope: StationScope = 'all'): string {
  const item = (value: StationScope, href: string, label: string): string => {
    const current = scope === value ? ' aria-current="true"' : '';
    return `<a href="${esc(href)}"${current} data-action="set-station" data-value="${value}">${esc(label)}</a>`;
  };
  const all = item('all', localizedPath('/', lang), translate('tab_all', lang));
  const links = STATION_SLUGS.map((slug) =>
    item(slug, localizedPath(`/station/${slug}`, lang), translate(stationNameKey(slug), lang)),
  ).join('<span class="sep" aria-hidden="true">·</span>');
  return `<nav class="station-nav" aria-label="${esc(translate('station_nav_label', lang))}">${all}<span class="sep" aria-hidden="true">·</span>${links}</nav>`;
}
