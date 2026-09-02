import type { Lang } from '../i18n';
import { translate } from '../i18n';
import { esc } from '../lib/html';
import { localizedPath } from '../lib/seo';
import { stationNameKey, STATION_SLUGS } from './StationPicker';

/**
 * Archive hub links (audit3 C3): the three archive entries a commuter reaches
 * from the board body, the homepage about block and the methodology page.
 *
 * The audit's finding was that the JS-rendered board carried exactly one
 * internal link (a `#fragment`) and the archive leaves were reachable only
 * through the footer — so the hubs get descriptive, in-content links instead
 * of bare footer chrome. One shared list, so the anchor text a crawler sees is
 * identical on every page that links a hub.
 *
 * `/line` and `/history/30` exist as single English URLs (no localized twins),
 * so they stay unprefixed on the sv/da pages — same convention as the
 * archive shell's footer. Localized pages use `localizedPath` (see HomeAbout).
 */

/** One archive hub link: label + the one-line "what you get" description. */
export interface ArchiveLink {
  href: string;
  label: string;
  desc: string;
}

/** The three archive hubs, in the order they are listed everywhere. */
export function archiveHubs(lang: Lang): ArchiveLink[] {
  return [
    { href: '/station', label: translate('arch_link_station', lang), desc: translate('arch_link_station_desc', lang) },
    { href: '/line', label: translate('arch_link_line', lang), desc: translate('arch_link_line_desc', lang) },
    { href: '/history/30', label: translate('arch_link_history', lang), desc: translate('arch_link_history_desc', lang) },
  ];
}

/**
 * The archive hubs as a plain list. `class` picks up the host page's styling
 * (the board and the static pages use different palettes); the markup is one
 * `<ul>` of `<li><a>label</a> — <span>description</span></li>`.
 */
export function renderArchiveHubLinks(lang: Lang, className: string): string {
  const items = archiveHubs(lang)
    .map(
      (l) =>
        `        <li><a href="${esc(l.href)}">${esc(l.label)}</a> <span class="why">— ${esc(l.desc)}</span></li>`,
    )
    .join('\n');
  return `      <ul class="${esc(className)}">\n${items}\n      </ul>`;
}

/**
 * The four per-station pages, localized routes + translated names, as a plain
 * list. The anchor text is the same string the target page's H1 uses, so the
 * link always agrees with what it points at.
 */
export function renderStationPageLinks(lang: Lang, className: string): string {
  const items = STATION_SLUGS.map(
    (slug) =>
      `        <li><a href="${esc(localizedPath(`/station/${slug}`, lang))}">${esc(translate(stationNameKey(slug), lang))}</a></li>`,
  ).join('\n');
  return `      <ul class="${esc(className)}">\n${items}\n      </ul>`;
}

/**
 * Related pages for the methodology page (audit3 C3): the four station pages
 * the definitions are measured at, then the three archive hubs. The
 * methodology page had exactly one outbound link (back to the board), so the
 * site's own definition page never pointed at the data it describes.
 */
export function renderRelatedPages(lang: Lang, className: string): string {
  const stations = STATION_SLUGS.map(
    (slug) =>
      `        <li><a href="${esc(localizedPath(`/station/${slug}`, lang))}">${esc(translate(stationNameKey(slug), lang))}</a></li>`,
  );
  const hubs = archiveHubs(lang).map(
    (l) => `        <li><a href="${esc(l.href)}">${esc(l.label)}</a> <span class="why">— ${esc(l.desc)}</span></li>`,
  );
  return `      <ul class="${esc(className)}">\n${[...stations, ...hubs].join('\n')}\n      </ul>`;
}
