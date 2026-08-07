import { translate, type Lang } from '../i18n';
import { esc } from '../lib/html';

/**
 * GDPR consent: one accept/decline, persisted under `oresund-consent`.
 * No ad network is wired up yet — the copy states that plainly. This banner
 * renders nothing once a choice has been made (handled by the App).
 */
export function renderConsentBanner(lang: Lang): string {
  return `
  <aside class="consent" role="dialog" aria-label="${esc(translate('consent_title', lang))}">
    <h2 class="consent-title">${esc(translate('consent_title', lang))}</h2>
    <p class="consent-body">${esc(translate('consent_body', lang))}</p>
    <div class="consent-actions">
      <button type="button" class="btn btn-primary" data-action="consent-accept">${esc(translate('consent_accept', lang))}</button>
      <button type="button" class="btn btn-ghost" data-action="consent-decline">${esc(translate('consent_decline', lang))}</button>
    </div>
  </aside>`;
}
