import type { Dict, Lang } from '../i18n';
import { esc } from '../lib/html';
import { renderFooter } from './Footer';

/**
 * Privacy page — a centered, plain-voice column that reuses the app shell
 * (dark theme, dot grid, fonts) and keeps the Footer (attribution + lang
 * switcher) below. Back link sits at the top, next to the brand.
 *
 * Takes `dict` explicitly (per the i18n rule: every render reads one language
 * dictionary) plus `lang` for the Footer.
 */
export function renderPrivacyPage(lang: Lang, dict: Dict): string {
  return `
  <div class="wrap privacy-wrap">
    <header class="topbar">
      <h1 class="brand">Øresund <span class="brand-sub">live</span></h1>
      <a class="privacy-back" href="/">${esc(dict.privacy_back)}</a>
    </header>
    <main class="privacy">
      <h2 class="privacy-title">${esc(dict.privacy_title)}</h2>
      <p class="privacy-lead">${esc(dict.privacy_intro)}</p>
      <p>${esc(dict.privacy_analytics)}</p>
      <p class="privacy-source">${esc(dict.privacy_data_source)}
        <a href="https://www.trafiklab.se" target="_blank" rel="noopener">Trafiklab.se</a>
      </p>
      <p>${esc(dict.privacy_ads)}</p>
      <p class="privacy-contact">${esc(dict.privacy_contact)}
        <a href="mailto:hello@oresund.live">hello@oresund.live</a>
      </p>
    </main>
    ${renderFooter(lang)}
  </div>`;
}
