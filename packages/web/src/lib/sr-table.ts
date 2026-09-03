import { esc } from './html';

/** A visually-hidden data table that carries the same numbers as a chart. */
export interface SrTable {
  /** Localized caption: names the chart the table belongs to. */
  caption: string;
  /** Column headings, in order. */
  headers: string[];
  /** One entry per data row; cells[0] is the row heading. */
  rows: string[][];
}

/**
 * The accessible alternative for a chart (audit4 N-M15).
 *
 * The board's charts encode their values in pixels: bar heights, segment
 * heights, cell opacity, `%` labels painted in absolutely-positioned spans.
 * None of that reaches a screen reader — the per-point `<title>` tooltips need
 * a pointing device, and the visible value labels are a fragment of the series.
 *
 * Rather than summarize, the chart is paired with its own data: a visually
 * hidden table, in the DOM directly after the visual it mirrors, holding every
 * value the chart was drawn from. Sighted layout is untouched (.sr-only) and no
 * chart library is involved — it is a plain <table> with real <th scope>, so it
 * also answers the chart's own "what was the number on Tuesday" question for a
 * screen-reader user. It renders last in the .chart block, so the reading order
 * is: heading → hint → visual → data.
 */
export function renderSrTable(table: SrTable): string {
  const head = table.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
  const body = table.rows
    .map(
      (cells) =>
        `<tr><th scope="row">${esc(cells[0] ?? '')}</th>${cells
          .slice(1)
          .map((c) => `<td>${esc(c)}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `
  <table class="sr-only">
    <caption>${esc(table.caption)}</caption>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}
