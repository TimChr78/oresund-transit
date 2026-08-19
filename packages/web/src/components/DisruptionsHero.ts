import type { Disruption } from '@oresund/shared';
import { formatTime } from '../i18n/format';
import { translate, type Lang } from '../i18n';
import { causeLabel } from '../lib/causes';
import { esc } from '../lib/html';
import { sortNewestFirst } from '../lib/stats';

/**
 * Disruption hero strip: when the live status reports disruptions (count > 0),
 * the newest active disruptions are surfaced ABOVE the table as a sticky row
 * of chips — line, HH:MM and cause badge each. The strip links down to the
 * table (id="disruptions-table") so it doubles as a table shortcut, and it
 * renders the same cause badges/labels the table uses (i18n da/sv/en).
 */

export function renderDisruptionsHero(disruptions: readonly Disruption[], lang: Lang): string {
  if (disruptions.length === 0) return '';
  const items = sortNewestFirst(disruptions).slice(0, 3);
  return `
  <a class="hero-strip" href="#disruptions-table">
    <span class="hero-strip-label">${esc(translate('hero_disruptions', lang))}</span>
    <span class="hero-strip-items">
      ${items
        .map(
          (d) => `
      <span class="hero-strip-item">
        <span class="hero-strip-line">${esc(d.line ?? '—')}</span>
        <span class="hero-strip-time">${esc(formatTime(d.sched_time ?? d.timestamp, lang) || '—')}</span>
        <span class="badge badge-cause">${esc(causeLabel(d.cause, lang))}</span>
      </span>`,
        )
        .join('')}
    </span>
    <span class="hero-strip-arrow" aria-hidden="true">↓</span>
  </a>`;
}