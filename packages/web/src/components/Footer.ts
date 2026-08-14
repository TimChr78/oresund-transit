import { translate, type Lang } from '../i18n';
import { esc } from '../lib/html';

/**
 * Footer: attribution in the ACTIVE language, license + Trafiklab links,
 * data disclaimer, changes note, and the SV | DA | EN language switcher.
 */
export function renderFooter(lang: Lang): string {
  const langs: Lang[] = ['sv', 'da', 'en'];
  return `
  <footer class="footer">
    <div class="footer-attribution">
      <p class="attr">${esc(translate('footer_attribution', lang))}</p>
      <p class="links">
        <a href="https://www.trafiklab.se" target="_blank" rel="noopener">Trafiklab.se</a>
        <span class="sep">·</span>
        <a href="/privacy">${esc(translate('nav_privacy', lang))}</a>
        <span class="sep">·</span>
        <a href="/methodology">${esc(translate('nav_methodology', lang))}</a>
        <span class="sep">·</span>
        <a href="/feed.xml" type="application/rss+xml">${esc(translate('footer_rss', lang))}</a>
        <span class="sep">·</span>
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">${esc(translate('footer_license', lang))}</a>
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
