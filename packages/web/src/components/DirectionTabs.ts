import type { LiveStatus } from '@oresund/shared';
import { translate, type Lang } from '../i18n';
import { departureCountFor, type Direction } from '../lib/stats';

export interface TabDef {
  value: Direction;
  label: string;
  count: number | null;
  active: boolean;
}

/** Direction tabs with live departure counts (null counts before first load). */
export function tabDefs(live: LiveStatus | null, direction: Direction, lang: Lang): TabDef[] {
  const order: Direction[] = ['all', 'to_denmark', 'to_sweden'];
  return order.map((value) => ({
    value,
    label: translate(
      value === 'all' ? 'tab_all' : value === 'to_denmark' ? 'tab_to_denmark' : 'tab_to_sweden',
      lang,
    ),
    count: live ? departureCountFor(live, value) : null,
    active: direction === value,
  }));
}

export function renderDirectionTabs(live: LiveStatus | null, direction: Direction, lang: Lang): string {
  const tabs = tabDefs(live, direction, lang);
  return `
  <div class="tabs" role="tablist" aria-label="direction">
    ${tabs
      .map(
        (t) => `
      <button type="button" role="tab" aria-selected="${t.active}" class="tab${t.active ? ' active' : ''}"
        data-action="set-direction" data-value="${t.value}">
        <span>${t.label}</span>
        ${t.count !== null ? `<span class="tab-count">${t.count}</span>` : ''}
      </button>`,
      )
      .join('')}
  </div>`;
}
