import type { LiveStatus } from '@oresund/shared';
import { formatTime } from '../i18n/format';
import { statusKeyFor, translate, type Lang } from '../i18n';
import { esc } from '../lib/html';

/**
 * The signature element: a departure-board strip. Full-width colored band,
 * status text in Space Grotesk, disruption count + timestamp in tabular
 * numerals. Static — it only changes when a fetch lands.
 *
 * The <section> carries a data-key so the keyed reconciler (lib/dom.ts) keeps
 * matching it when the band class flips green→amber→red: a live region whose
 * element is replaced does not announce, and the band change is exactly when
 * the announcement matters (audit5 H3).
 */

export interface BannerModel {
  bandClass: string;
  text: string;
  updated: string;
  time: string;
  count: string | null;
}

/** Pure banner model: band color, translated text, count, clock. */
export function bannerModel(live: LiveStatus, lang: Lang): BannerModel {
  const key = statusKeyFor(live);
  const count =
    live.disruption_count > 0
      ? translate(
          live.disruption_count === 1 ? 'banner_disruptions_one' : 'banner_disruptions_many',
          lang,
          { n: live.disruption_count },
        )
      : null;
  return {
    // service_shutdown forces the red band even when status is green.
    bandClass: `status-${live.service_shutdown ? 'red' : live.status}`,
    text: translate(key, lang),
    updated: translate('banner_updated', lang),
    time: formatTime(live.time_short || live.timestamp, lang),
    count,
  };
}

export function renderStatusBanner(live: LiveStatus, lang: Lang): string {
  const m = bannerModel(live, lang);
  return `
  <section data-key="status-banner" class="status-banner ${m.bandClass}" role="status" aria-live="polite">
    <span class="sb-text">${esc(m.text)}</span>
    <span class="sb-meta">
      ${m.count ? `<span class="sb-count">${esc(m.count)}</span>` : ''}
      <span class="sb-time">
        <span class="sb-updated">${esc(m.updated)}</span>
        <span class="sb-clock">${esc(m.time)}</span>
      </span>
    </span>
  </section>`;
}
