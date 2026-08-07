import type { Disruption } from '@oresund/shared';
import { translate, type Lang } from '../i18n';
import type { Direction } from '../lib/stats';

export interface TabDef {
  value: Direction;
  label: string;
  count: number | null;
  active: boolean;
}

/**
 * Direction tabs with today's disruption counts (null until the disruptions
 * feed has loaded). The feed is already filtered to the local-today window
 * by the API, so the counts are simply per-direction tallies of the list.
 */
export function tabDefs(disruptions: Disruption[] | null, direction: Direction, lang: Lang): TabDef[] {
  const order: Direction[] = ['all', 'to_denmark', 'to_sweden'];
  const countFor = (value: Direction): number => {
    if (!disruptions) return 0;
    if (value === 'all') return disruptions.length;
    return disruptions.filter((d) => d.direction === value).length;
  };
  return order.map((value) => ({
    value,
    label: translate(
      value === 'all' ? 'tab_all' : value === 'to_denmark' ? 'tab_to_denmark' : 'tab_to_sweden',
      lang,
    ),
    count: disruptions ? countFor(value) : null,
    active: direction === value,
  }));
}

export function renderDirectionTabs(
  disruptions: Disruption[] | null,
  direction: Direction,
  lang: Lang,
): string {
  const tabs = tabDefs(disruptions, direction, lang);
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
