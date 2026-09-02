import { translate, type Key, type Lang } from '../i18n';
import { esc } from '../lib/html';
import { localizedPath } from '../lib/seo';

/**
 * Station picker (audit3 C1): a plain nav of links to the four per-station
 * pages. Cross-page links, not client-side state — the disruption table cannot
 * be filtered by station because `Disruption` carries no `stop_id`, so the
 * only way to switch station is to follow a link.
 *
 * Rendered into the board header (App.ts) and into the no-JS/crawler shell in
 * index.html, so the four station pages are reachable from the homepage body
 * and not just the footer. Names come from the station_* dictionary keys
 * (audit3 M4), so the same anchor text a crawler sees on / also labels the
 * target page's <h1>.
 */

/** The monitored stops in corridor order (Sweden → Denmark), by collector slug. */
export const STATION_SLUGS = ['hyllie', 'malmo-c', 'kastrup', 'kobenhavn-h'] as const;

/** The station-name dictionary key for a collector slug (station_hyllie, …). */
export function stationNameKey(slug: string): Key {
  return `station_${slug.replaceAll('-', '_')}` as Key;
}

/** The four monitored stations, translated, in corridor order. */
export function stationNames(lang: Lang): string[] {
  return STATION_SLUGS.map((slug) => translate(stationNameKey(slug), lang));
}

/**
 * The board's scope label (audit3 C1 step 6): four stops are monitored, so the
 * label names all four instead of under-reporting the corridor as
 * "Hyllie ↔ København H".
 */
export function stationScopeLabel(lang: Lang): string {
  return stationNames(lang).join(' · ');
}

/** One nav of station links, in the page's language. */
export function renderStationPicker(lang: Lang): string {
  const links = STATION_SLUGS.map(
    (slug) =>
      `<a href="${esc(localizedPath(`/station/${slug}`, lang))}">${esc(translate(stationNameKey(slug), lang))}</a>`,
  ).join('<span class="sep" aria-hidden="true">·</span>');
  return `<nav class="station-nav" aria-label="${esc(translate('station_nav_label', lang))}">${links}</nav>`;
}
