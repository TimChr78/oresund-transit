import { translate, type Lang } from '../i18n';
import { esc } from '../lib/html';
import { localizedPath } from '../lib/seo';

/**
 * Footer: attribution in the ACTIVE language, license + Trafiklab links,
 * data disclaimer, changes note, and the SV | DA | EN language switcher.
 *
 * Internal links go through localizedPath (audit4 LOW): on /sv/ and /da/ the
 * translated labels used to navigate to the English twins of the same pages.
 */
export function renderFooter(lang: Lang): string {
  const langs: Lang[] = ['sv', 'da', 'en'];
  const sep = `<span class="sep" aria-hidden="true">·</span>`;
  return `
  <footer class="footer">
    <div class="footer-attribution">
      <p class="attr">${esc(translate('footer_attribution', lang))}</p>
      <p class="links">
        <a href="https://www.trafiklab.se" target="_blank" rel="noopener noreferrer">Trafiklab.se</a>
        ${sep}
        <a href="${esc(localizedPath('/privacy', lang))}">${esc(translate('nav_privacy', lang))}</a>
        ${sep}
        <a href="${esc(localizedPath('/methodology', lang))}">${esc(translate('nav_methodology', lang))}</a>
        ${sep}
        <a href="/feed.xml">${esc(translate('footer_rss', lang))}</a>
        ${sep}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">${esc(translate('footer_license', lang))}</a>
      </p>
      <p class="note">${esc(translate('footer_disclaimer', lang))}</p>
      <p class="note">${esc(translate('footer_changes', lang))}</p>
    </div>
    <div class="lang-switch" role="group" aria-label="${esc(translate('footer_lang', lang))}">
      <span class="lang-label">${esc(translate('footer_lang', lang))}</span>
      ${langs
        .map(
          (l) => `
        <button type="button" class="lang-btn${l === lang ? ' active' : ''}"
          data-action="set-lang" data-value="${l}" aria-pressed="${l === lang}">
          ${l.toUpperCase()}
        </button>`,
        )
        .join('')}
    </div>
  </footer>`;
}
