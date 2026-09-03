import { translate, type Lang } from '../i18n';
import { esc } from '../lib/html';
import { localizedPath } from '../lib/seo';
import { renderArchiveHubLinks, renderStationPageLinks } from './ArchiveLinks';
import { stationNameKey, STATION_SLUGS } from './StationPicker';

/**
 * The homepage about block (audit3 C2).
 *
 * The home page is a client-rendered SPA shell, so the HTML a crawler first
 * sees used to be one H1 plus a build-time status sentence — ~96 words on the
 * page that earns the most links. This block ships the evergreen, factual
 * description of what the site tracks (the corridor, the four monitored
 * stations, departure punctuality, disruption causes), how a number is
 * defined (the RT3 threshold), and where the data comes from (Trafiklab,
 * 5-minute polling, CC-BY 4.0) — inside #static-shell, the same no-JS/crawler
 * container that already carries the lead and the station picker.
 *
 * It is deliberately descriptive: nothing here is a claim about service
 * quality, only a statement of what is measured and how. boot() removes
 * #static-shell when the board renders, so JS visitors never see it twice.
 *
 * Rendered into index.html in English (the crawler default) and swapped for
 * the localized version by prerender's renderLocalizedHome — the same
 * lockstep the station picker uses, and asserted by test/prerender.test.ts.
 * Markup stays free of nested <div> so the static pages' strip regex and
 * boot()'s removal both keep working.
 */
export function renderHomeAbout(lang: Lang): string {
  // The four stations are named in prose using the localized display names,
  // so the sentence can never drift from the links below it (audit3 M4).
  const stations = STATION_SLUGS.map((slug) => translate(stationNameKey(slug), lang)).join(', ');
  // {link} is the only in-prose anchor: swap it in after escaping so the
  // dictionary stays plain text.
  const method = esc(translate('about_method', lang)).replace(
    '{link}',
    `<a href="${esc(localizedPath('/methodology', lang))}">${esc(translate('nav_methodology', lang))}</a>`,
  );
  return `<section class="home-about">
      <h2>${esc(translate('about_title', lang))}</h2>
      <p>${esc(translate('about_corridor', lang, { stations }))}</p>
      <p>${method}</p>
      <p>${esc(translate('about_source', lang))}</p>
${renderStationPageLinks(lang, 'about-links')}
      <p class="about-more">${esc(translate('board_archives_intro', lang))}</p>
${renderArchiveHubLinks(lang, 'about-links archive-links')}
    </section>`;
}
