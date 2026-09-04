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
  return bannerSection(
    `status-banner ${m.bandClass}`,
    `
    <span class="sb-text">${esc(m.text)}</span>
    <span class="sb-meta">
      ${m.count ? `<span class="sb-count">${esc(m.count)}</span>` : ''}
      <span class="sb-time">
        <span class="sb-updated">${esc(m.updated)}</span>
        <span class="sb-clock">${esc(m.time)}</span>
      </span>
    </span>`,
  );
}

/**
 * The banner's slot: the same keyed live region whatever the /live fetch is
 * doing (audit6 M4). The no-data and error states used to swap the region for
 * a bare `<div class="empty">` — a different tag, so the reconciler REMOVED
 * the region — and the region that came back on recovery was inserted already
 * holding its text, which most screen readers read as "nothing changed". A
 * board that degrades to a 503 and comes back therefore dropped its next
 * announcement, which is the single most important announcement on the site.
 * Keeping the region standing through loading → no data → error → ok means the
 * recovery lands on a region assistive tech has been listening to since first
 * paint; `data-key` is what makes the two states the same node to the
 * reconciler, and the band colour is the only thing the ok state adds.
 */
export function renderBannerSlot(content: string): string {
  return bannerSection('status-slot', content);
}

/** The keyed live region both banner states render through. */
function bannerSection(cls: string, inner: string): string {
  return `
  <section data-key="status-banner" class="${cls}" role="status" aria-live="polite">${inner}
  </section>`;
}
