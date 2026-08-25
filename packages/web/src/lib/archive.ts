/**
 * Server-side renderers for the archive routes (/line/*, /station/*,
 * /history/*). These produce complete, standalone HTML documents (English —
 * the crawler default) with per-route title/description/canonical, Open Graph
 * tags, JSON-LD structured data (breadcrumbs + data), and the required
 * Trafiklab attribution. They are pure string builders — no fetch, no I/O —
 * so they are fully testable and reused by the thin Pages Functions in
 * functions/{line,station,history}/[[path]].js.
 *
 * The data these render is pulled at request time from the collector Worker
 * (dynamic archives), unlike the prerendered static pages (/methodology,
 * /privacy).
 */
import type { Disruption, Departure } from '@oresund/shared';
import { translate } from '../i18n';
import { esc } from './html';
import type { Key } from '../i18n';

export const SITE_URL = 'https://oresund.live';

/**
 * The day live monitoring began (see the methodology page copy). Calendar
 * days BEFORE this date that are zero-filled by the collector are pre-
 * monitoring gaps, not real quiet days — archive pages replace them with an
 * explanatory note instead of a misleading all-zero row.
 */
export const MONITORING_START = '2026-08-06';

/** The day ranges the history archive supports (mirrors the collector API). */
export const DAY_RANGES = [7, 14, 30, 90] as const;
export type ArchiveDays = (typeof DAY_RANGES)[number];

export interface ArchiveLine {
  line: string;
  disruptions: number;
}

/**
 * The canonical Øresundståg / Pågatåg / bus line set served over the bridge.
 *
 * Lines are discovered dynamically from disruption data (they come from the
 * route `designation` of Trafiklab departures), but a line with no disruptions
 * in the current window never shows up in that discovery — so /line/* pages
 * for e.g. 801 or 807 existed but were invisible to crawlers. This static set
 * is unioned with whatever is discovered so every valid line archive is always
 * listed in the sitemap and the /line index, whether or not it has recorded
 * disruptions.
 */
export const CANONICAL_LINES: readonly string[] = [
  '801',
  '802',
  '803',
  '804',
  '805',
  '806',
  '807',
  '808',
  '809',
  '910',
  '6',
  '16',
];

/**
 * Union a dynamically-discovered line list with the canonical set. Canonical
 * lines come first (in CANONICAL_LINES order, keeping any discovered
 * disruption count), then any non-canonical lines discovered from data are
 * appended. De-duplicated by line value.
 */
export function unionCanonicalLines(lines: ArchiveLine[]): ArchiveLine[] {
  const result: ArchiveLine[] = [];
  const seen = new Set<string>();
  for (const line of CANONICAL_LINES) {
    const existing = lines.find((l) => l.line === line);
    result.push({ line, disruptions: existing?.disruptions ?? 0 });
    seen.add(line);
  }
  for (const l of lines) {
    if (!seen.has(l.line)) {
      result.push(l);
      seen.add(l.line);
    }
  }
  return result;
}

export interface ArchiveStation {
  slug: string;
  stop_id: string;
  stop_name: string;
}

/** The collector /api/transit/history shape (days, daily rows). */
export interface ArchiveHistory {
  days: number;
  date_from: string;
  date_to: string;
  total_disruptions: number;
  daily: {
    date: string;
    count: number;
    cancellations: number;
    delays: number;
    alerts: number;
    avg_delay: number | null;
  }[];
}

/** The collector /api/transit/line/{line} shape. */
export interface ArchiveLineStats {
  line: string;
  days: number;
  date_from: string;
  date_to: string;
  total_disruptions: number;
  daily: ArchiveHistory['daily'];
  by_cause: { cause: string; count: number }[];
  recent: Disruption[];
}

/** The collector /api/transit/station/{slug} shape. */
export interface ArchiveStationStats {
  slug: string;
  stop_id: string;
  stop_name: string;
  days: number;
  date_from: string;
  date_to: string;
  total_departures: number;
  on_time_count: number;
  delayed_count: number;
  canceled_count: number;
  on_time_pct: number;
  avg_delay_seconds: number | null;
  daily: {
    date: string;
    total: number;
    on_time: number;
    delayed: number;
    canceled: number;
    on_time_pct: number;
    avg_delay_seconds: number | null;
  }[];
  recent: Departure[];
}

interface ShellOpts {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: unknown;
  body: string;
}

/** Escape a value for an HTML attribute (quotes already escaped by esc). */
function attr(value: string): string {
  return esc(value);
}

/**
 * Minimal hreflang set for a page that exists as ONE URL (no localized
 * twins): the archive routes (/line/*, /station/*, /history/*) are served
 * in English only — the trilingual board handles language switching
 * client-side, so no /sv/ or /da/ variants exist. Per Google's hreflang
 * guidance a single-URL page still announces itself: `en` (its document
 * language) plus a self-referencing `x-default`. Same <link rel="alternate">
 * shape as the static pages' hreflang cluster (src/lib/seo.ts), so both page
 * families emit the same markup. `url` is the absolute canonical URL, already
 * escaped by the caller exactly like the canonical link it mirrors.
 */
function hreflangSelf(url: string): string {
  return [
    `    <link rel="alternate" hreflang="en" href="${url}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${url}" />`,
  ].join('\n');
}

/**
 * The shared document shell for every archive page. Lightweight, fully
 * self-contained (no SPA bundle — these are static archives for crawlers and
 * no-JS clients), with the site favicon, SEO tags and the mandatory
 * attribution.
 */
function pageShell({ title, description, canonical, jsonLd, body }: ShellOpts): string {
  const ogTags = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${attr(title)}" />
    <meta property="og:description" content="${attr(description)}" />
    <meta property="og:url" content="${attr(canonical)}" />
    <meta property="og:site_name" content="Øresund.live" />
    <meta property="og:image" content="https://oresund.live/og-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Øresund.live — Øresundståg departures across the Sound" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${attr(title)}" />
    <meta name="twitter:description" content="${attr(description)}" />
    <meta name="twitter:image" content="https://oresund.live/og-card.png" />`;
  const jsonLdBlock = jsonLd === undefined ? '' : `\n    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;
  // These routes exist as one URL per page — no /sv/ /da/ twins exist for the
  // archives (language switching on the board is client-side), so each page
  // self-announces en + x-default in <head>, mirroring the hreflang cluster
  // the static pages emit. Escaped exactly like the canonical it points at.
  const hreflang = hreflangSelf(attr(canonical));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${attr(title)}</title>
    <meta name="description" content="${attr(description)}" />
    <link rel="canonical" href="${attr(canonical)}" />
${hreflang}
    <meta name="robots" content="index,follow" />${ogTags}${jsonLdBlock}
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%230a0c10'/><circle cx='32' cy='18' r='7' fill='%2310b981'/><circle cx='32' cy='32' r='7' fill='%23f59e0b'/><circle cx='32' cy='46' r='7' fill='%23ef4444'/></svg>" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #0a0c10; color: #e7eaf0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.55; }
      header { border-bottom: 1px solid #1c2330; padding: 1rem 1.25rem; background: #0d1016; }
      header .brand { color: #10b981; font-weight: 700; text-decoration: none; font-size: 1.05rem; }
      main { max-width: 880px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
      h1 { font-size: 1.6rem; margin: 0 0 .4rem; }
      h2 { font-size: 1.15rem; margin: 2rem 0 .6rem; color: #c7d0e0; }
      .sub { color: #8b93a7; margin: 0 0 1.2rem; font-size: .95rem; }
      .crumb { font-size: .85rem; color: #7c8498; margin: 0 0 1rem; }
      .crumb a { color: #7c8498; text-decoration: none; }
      .crumb a:hover { color: #10b981; }
      .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .6rem; }
      .card { background: #12161f; border: 1px solid #1c2330; border-radius: 10px; padding: .9rem 1rem; display: block; color: #e7eaf0; text-decoration: none; }
      .card:hover { border-color: #2c3a52; }
      .card .num { font-size: 1.3rem; font-weight: 700; }
      .card .lbl { color: #8b93a7; font-size: .8rem; }
      table { width: 100%; border-collapse: collapse; font-size: .9rem; }
      th, td { text-align: right; padding: .45rem .5rem; border-bottom: 1px solid #171d28; }
      th:first-child, td:first-child { text-align: left; }
      th { color: #8b93a7; font-weight: 600; font-size: .78rem; text-transform: uppercase; letter-spacing: .03em; }
      .stat { display: inline-block; background: #12161f; border: 1px solid #1c2330; border-radius: 10px; padding: .5rem .9rem; margin-right: .5rem; margin-bottom: .5rem; }
      .stat b { display: block; font-size: 1.1rem; }
      .stat span { color: #8b93a7; font-size: .75rem; }
      ul.plain { list-style: none; padding: 0; margin: 0; }
      ul.plain li { padding: .4rem 0; border-bottom: 1px solid #171d28; }
      ul.plain a { color: #9fc9ff; text-decoration: none; }
      ul.plain a:hover { text-decoration: underline; }
      .meta { color: #7c8498; font-size: .82rem; }
      footer { border-top: 1px solid #1c2330; padding: 1.25rem; text-align: center; color: #7c8498; font-size: .82rem; }
      footer a { color: #9fc9ff; text-decoration: none; }
    </style>
  </head>
  <body>
    <header><a class="brand" href="/">Øresund.live</a></header>
    <main>${body}</main>
    <footer>
      <p>Data från Trafiklab.se · <a href="/">Live board</a> · <a href="/methodology">Methodology</a> · <a href="/privacy">Privacy</a></p>
    </footer>
  </body>
</html>
`;
}

/** A breadcrumb item for JSON-LD (1-based position). */
function crumb(name: string, url: string, position: number): { '@type': 'ListItem'; position: number; name: string; item: string } {
  return { '@type': 'ListItem', position, name, item: url };
}

/**
 * BreadcrumbList JSON-LD for a page nested under the dashboard. @context is
 * declared ONCE at the block root (audit M10) — nodes inside @graph must not
 * carry their own.
 */
function breadcrumb(crumbs: { name: string; url: string }[]): unknown {
  const items = [{ name: 'Øresund.live', url: `${SITE_URL}/` }, ...crumbs].map((c, i) =>
    crumb(c.name, c.url, i + 1),
  );
  return { '@type': 'BreadcrumbList', itemListElement: items };
}

/** The factual site identity fragment shared by archive JSON-LD. */
const siteIdentity = {
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: 'Øresund.live',
  url: `${SITE_URL}/`,
};

/** Live Trafiklab polling started 2026-08-06; earlier disruption history was
 * backfilled from KoDa's historical archive (May 2026 onward). */
const LIVE_DATA_SINCE = '2026-08-06';

const TRAFIKLAB_CREATOR = { '@type': 'Organization', name: 'Trafiklab', url: 'https://www.trafiklab.se' };
const KODA_CREATOR = { '@type': 'Organization', name: 'KoDa' };

/** CC-BY 4.0 — the license the published data is distributed under. */
const CC_BY_4_0 = 'https://creativecommons.org/licenses/by/4.0/';

/**
 * Dataset creators for a data window. Disruption histories that extend before
 * the live-data start include KoDa's backfill; windows entirely inside the
 * live era (and station punctuality, which only ever comes from live
 * departures) are Trafiklab-only.
 */
function creatorsFor(dateFrom: string): unknown[] {
  return dateFrom < LIVE_DATA_SINCE ? [TRAFIKLAB_CREATOR, KODA_CREATOR] : [TRAFIKLAB_CREATOR];
}

/** Dataset JSON-LD (audit H4) — the structured description of the CC-BY
 * time-series an archive page publishes: window, creators, license, the page
 * as distribution, and the measured variables. */
function dataset(opts: {
  name: string;
  description: string;
  pageUrl: string;
  dateFrom: string;
  dateTo: string;
  creators: unknown[];
  variables: string[];
}): unknown {
  return {
    '@type': 'Dataset',
    name: opts.name,
    description: opts.description,
    url: opts.pageUrl,
    temporalCoverage: `${opts.dateFrom}/${opts.dateTo}`,
    creator: opts.creators,
    license: CC_BY_4_0,
    distribution: { '@type': 'DataDownload', contentUrl: opts.pageUrl, encodingFormat: 'text/html' },
    variableMeasured: opts.variables,
  };
}

/**
 * ItemList JSON-LD (audit M9) of the available history windows, mirroring the
 * visible range list on the page: all ranges on /history, the other ranges on
 * each /history/{days} page.
 */
function historyRangesItemList(exclude?: ArchiveDays): unknown {
  const ranges = DAY_RANGES.filter((d) => d !== exclude);
  return {
    '@type': 'ItemList',
    numberOfItems: ranges.length,
    itemListElement: ranges.map((d, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `Last ${d} days`,
      url: `${SITE_URL}/history/${d}`,
    })),
  };
}

function fmtDelay(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds <= 0) return '0 min';
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

/** Display an ISO local date as a friendly label (naive, Europe/Stockholm). */
function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const TYPE_LABEL: Record<string, string> = {
  delay: 'Delay',
  cancellation: 'Cancellation',
  alert: 'Alert',
};

function directionLabel(direction: string | null): string {
  if (direction === 'to_denmark') return 'to Denmark';
  if (direction === 'to_sweden') return 'to Sweden';
  return '';
}

function dailyTable(rows: ArchiveHistory['daily']): string {
  const head =
    '<thead><tr><th>Date</th><th>Total</th><th>Cancellations</th><th>Delays</th><th>Alerts</th><th>Avg delay</th></tr></thead>';
  const body = collapseGaps(rows, isHistoryRowEmpty)
    .map((r) => {
      if ('gapFrom' in r) return gapRow(r.gapFrom, r.gapTo, 6);
      const cells = [r.date, r.count, r.cancellations, r.delays, r.alerts, fmtDelay(r.avg_delay)]
        .map((v, i) => `<td${i === 0 ? ' class="meta"' : ''}>${esc(typeof v === 'number' ? String(v) : v)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

/** A daily row, or a contiguous run of pre-monitoring empty days collapsed into one note. */
type TableRow<T> = T | { gapFrom: string; gapTo: string };

/**
 * Collapse contiguous daily rows that are fully empty AND fall before
 * MONITORING_START into a single note marker — those days are pre-monitoring
 * gaps (the collector zero-fills the whole range), not real zero days.
 * Empty days after monitoring began stay as ordinary rows (a quiet day IS
 * data). Rows may arrive in either order (the collector returns them
 * newest-first); the gap bounds are normalized chronologically below so the
 * note never reads an inverted period.
 */
function collapseGaps<T extends { date: string }>(rows: T[], isEmpty: (r: T) => boolean): TableRow<T>[] {
  const out: TableRow<T>[] = [];
  let gapStart: T | null = null;
  let gapEnd: T | null = null;
  const flush = (): void => {
    if (gapStart && gapEnd) {
      // Latest-first input makes the first empty row the NEWER bound; sort
      // the two ISO dates so gapFrom is always the oldest day displayed.
      const from = gapStart.date <= gapEnd.date ? gapStart.date : gapEnd.date;
      const to = gapStart.date <= gapEnd.date ? gapEnd.date : gapStart.date;
      out.push({ gapFrom: from, gapTo: to });
      gapStart = null;
      gapEnd = null;
    }
  };
  for (const r of rows) {
    if (isEmpty(r) && r.date < MONITORING_START) {
      gapStart ??= r;
      gapEnd = r;
    } else {
      flush();
      out.push(r);
    }
  }
  flush();
  return out;
}

function isHistoryRowEmpty(r: ArchiveHistory['daily'][number]): boolean {
  return r.count === 0 && r.cancellations === 0 && r.delays === 0 && r.alerts === 0 && r.avg_delay == null;
}

function isStationRowEmpty(r: ArchiveStationStats['daily'][number]): boolean {
  return r.total === 0 && r.on_time === 0 && r.delayed === 0 && r.canceled === 0 && r.avg_delay_seconds == null;
}

/** One explanatory table row replacing a pre-monitoring gap. */
function gapRow(from: string, to: string, colspan: number): string {
  const note =
    from === to
      ? translate('arch_empty_day', 'en', { date: MONITORING_START, from: fmtDate(from) })
      : translate('arch_empty_period', 'en', { date: MONITORING_START, from: fmtDate(from), to: fmtDate(to) });
  return `<tr><td class="meta" colspan="${colspan}">${esc(note)}</td></tr>`;
}

/** Sum a daily series into the summary stats shown at the top of archive pages. */
function summarizeDaily(rows: ArchiveHistory['daily']): { cancellations: number; delays: number; alerts: number; avgDelaySeconds: number | null } {
  let cancellations = 0;
  let delays = 0;
  let alerts = 0;
  let delaySum = 0;
  let delayN = 0;
  for (const r of rows) {
    cancellations += r.cancellations;
    delays += r.delays;
    alerts += r.alerts;
    // Weight by delayed records, not total count: count includes cancellations
    // and alerts, which would skew the delay average toward days with many
    // cancellations. A day with avg_delay but zero delays contributes nothing.
    if (r.avg_delay != null && r.delays > 0) {
      delaySum += r.avg_delay * r.delays;
      delayN += r.delays;
    }
  }
  return {
    cancellations,
    delays,
    alerts,
    avgDelaySeconds: delayN > 0 ? Math.round(delaySum / delayN) : null,
  };
}

/** The `.stat` summary row shared by /history and /line/{line} pages. */
function statsRow(total: number, summary: { cancellations: number; delays: number; alerts: number; avgDelaySeconds: number | null }): string {
  const t = (key: Key): string => translate(key, 'en');
  return `<div>
      <span class="stat"><b>${total}</b><span>${t('arch_stat_total')}</span></span>
      <span class="stat"><b>${summary.cancellations}</b><span>${t('arch_stat_cancellations')}</span></span>
      <span class="stat"><b>${summary.delays}</b><span>${t('arch_stat_delays')}</span></span>
      <span class="stat"><b>${summary.alerts}</b><span>${t('arch_stat_alerts')}</span></span>
      <span class="stat"><b>${fmtDelay(summary.avgDelaySeconds)}</b><span>${t('arch_stat_avg_delay')}</span></span>
    </div>`;
}

/** The unique intro key for each history window (H5: no shared boilerplate). */
const HIST_INTRO: Record<ArchiveDays, Key> = {
  7: 'arch_hist_intro_7',
  14: 'arch_hist_intro_14',
  30: 'arch_hist_intro_30',
  90: 'arch_hist_intro_90',
};

/**
 * /history/{days} — one day range of daily disruption totals, with a
 * window-specific intro, a summary stats row and (for windows that reach back
 * before monitoring began) an explanatory note instead of misleading all-zero
 * rows. /history itself 301s to /history/30 (see archive-http dispatch).
 */
export function renderHistoryPage(days: ArchiveDays, history: ArchiveHistory): string {
  const description = `Archived disruption history for the Øresund crossing, last ${days} days — daily totals for cancellations, delays and alerts ${history.date_from} to ${history.date_to}.`;
  const summary = summarizeDaily(history.daily);
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › <a href="/history">History</a> › ${days} days</p>
    <h1>Disruption history — last ${days} days</h1>
    <p class="sub">${esc(translate(HIST_INTRO[days], 'en'))}</p>
    <p class="sub">${history.total_disruptions} disruptions between ${fmtDate(history.date_from)} and ${fmtDate(history.date_to)}. Data från Trafiklab.se.</p>
    ${statsRow(history.total_disruptions, summary)}
    <h2>Daily breakdown</h2>
    ${dailyTable(history.daily)}
    <h2>Other ranges</h2>
    <ul class="plain">
${DAY_RANGES.filter((d) => d !== days).map((d) => `      <li><a href="/history/${d}">Last ${d} days</a></li>`).join('\n')}
    </ul>`;
  return pageShell({
    title: `Disruption history — last ${days} days — Øresund.live`,
    description,
    canonical: `${SITE_URL}/history/${days}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([
          { name: 'History', url: `${SITE_URL}/history` },
          { name: `${days} days`, url: `${SITE_URL}/history/${days}` },
        ]),
        dataset({
          name: `Disruption history — last ${days} days`,
          description,
          pageUrl: `${SITE_URL}/history/${days}`,
          dateFrom: history.date_from,
          dateTo: history.date_to,
          creators: creatorsFor(history.date_from),
          variables: [
            'Total disruptions per day',
            'Cancellations per day',
            'Delays per day',
            'Alerts per day',
            'Average delay per day',
          ],
        }),
        historyRangesItemList(days),
        siteIdentity,
      ],
    },
    body,
  });
}

/** /line — index of the per-line archives. */
export function renderLineIndex(lines: ArchiveLine[]): string {
  const all = unionCanonicalLines(lines);
  const description = 'Per-line disruption archives for the Øresund crossing — historical cancellations, delays and alerts for each Öresundståg / Pågatåg service.';
  const list = all
    .map(
      (l) =>
        `<li><a href="/line/${encodeURIComponent(l.line)}">Line ${esc(l.line)}</a> <span class="meta">— ${l.disruptions} disruptions recorded</span></li>`,
    )
    .join('\n');
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › Lines</p>
    <h1>Line archives</h1>
    <p class="sub">Historical disruption records for each service across the Øresund. Data från Trafiklab.se.</p>
    <ul class="plain">
${list}
    </ul>`;
  return pageShell({
    title: 'Line archives — Øresund.live',
    description,
    canonical: `${SITE_URL}/line`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([{ name: 'Lines', url: `${SITE_URL}/line` }]),
        {
          '@type': 'ItemList',
          numberOfItems: all.length,
          itemListElement: all.map((l, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: `Line ${l.line}`,
            url: `${SITE_URL}/line/${encodeURIComponent(l.line)}`,
          })),
        },
        siteIdentity,
      ],
    },
    body,
  });
}

/** /line/{line} — one line's disruption archive. */
export function renderLinePage(line: string, stats: ArchiveLineStats, allLines: ArchiveLine[]): string {
  const all = unionCanonicalLines(allLines);
  const summary = summarizeDaily(stats.daily);
  const description = `Disruption history for line ${line} on the Øresund crossing — ${stats.total_disruptions} disruptions between ${fmtDate(stats.date_from)} and ${fmtDate(stats.date_to)}.`;
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › <a href="/line">Lines</a> › Line ${esc(line)}</p>
    <h1>Line ${esc(line)} — disruption archive</h1>
    <p class="sub">${esc(translate('arch_intro_line', 'en', { line }))}</p>
    <p class="sub">${stats.total_disruptions} disruptions between ${fmtDate(stats.date_from)} and ${fmtDate(stats.date_to)} (last ${stats.days} days). Data från Trafiklab.se.</p>
    ${statsRow(stats.total_disruptions, summary)}
    <h2>Most common causes</h2>
    <ul class="plain">
${(stats.by_cause.length ? stats.by_cause : []).map((c) => `      <li>${esc(c.cause)} <span class="meta">— ${c.count}</span></li>`).join('\n')}
    </ul>
    <h2>Daily breakdown</h2>
    ${dailyTable(stats.daily)}
    <h2>Recent disruptions</h2>
    <ul class="plain">
${(stats.recent.length ? stats.recent : []).map(disruptionListItem).join('\n') || '      <li class="meta">None recorded in this range.</li>'}
    </ul>
    <h2>Other lines</h2>
    <ul class="plain">
${all.filter((l) => l.line !== line).map((l) => `      <li><a href="/line/${encodeURIComponent(l.line)}">Line ${esc(l.line)}</a></li>`).join('\n')}
    </ul>`;
  return pageShell({
    title: `Line ${line} — disruption archive — Øresund.live`,
    description,
    canonical: `${SITE_URL}/line/${encodeURIComponent(line)}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([
          { name: 'Lines', url: `${SITE_URL}/line` },
          { name: `Line ${line}`, url: `${SITE_URL}/line/${encodeURIComponent(line)}` },
        ]),
        dataset({
          name: `Line ${line} disruption archive`,
          description,
          pageUrl: `${SITE_URL}/line/${encodeURIComponent(line)}`,
          dateFrom: stats.date_from,
          dateTo: stats.date_to,
          creators: creatorsFor(stats.date_from),
          variables: [
            'Total disruptions',
            'Cancellations per day',
            'Delays per day',
            'Alerts per day',
            'Disruptions by cause',
            'Average delay per day',
          ],
        }),
        siteIdentity,
      ],
    },
    body,
  });
}

function disruptionListItem(d: Disruption): string {
  const dir = directionLabel(d.direction);
  const type = d.type ? TYPE_LABEL[d.type] ?? d.type : 'Disruption';
  const when = d.timestamp ? ` <span class="meta">· ${esc(String(d.timestamp).replace('T', ' '))}</span>` : '';
  return `      <li>${esc(type)} on line ${esc(d.line ?? 'unknown')}${dir ? ` ${esc(dir)}` : ''}${when}</li>`;
}

/** /station — index of the per-station archives. */
export function renderStationIndex(stations: ArchiveStation[]): string {
  const description = 'Per-station punctuality archives for the Øresund crossing — on-time performance, cancellations and delays at every monitored stop.';
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › Stations</p>
    <h1>Station archives</h1>
    <p class="sub">Historical on-time performance for each monitored stop on the Øresund crossing. Data från Trafiklab.se.</p>
    <div class="cards">
${stations.map((s) => `      <a class="card" href="/station/${encodeURIComponent(s.slug)}"><span class="lbl">Station</span><span class="num">${esc(s.stop_name)}</span></a>`).join('\n')}
    </div>`;
  return pageShell({
    title: 'Station archives — Øresund.live',
    description,
    canonical: `${SITE_URL}/station`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([{ name: 'Stations', url: `${SITE_URL}/station` }]),
        {
          '@type': 'ItemList',
          numberOfItems: stations.length,
          itemListElement: stations.map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: s.stop_name,
            url: `${SITE_URL}/station/${s.slug}`,
          })),
        },
        siteIdentity,
      ],
    },
    body,
  });
}

/** /station/{slug} — one station's punctuality archive. */
export function renderStationPage(stats: ArchiveStationStats, allStations: ArchiveStation[]): string {
  // A brand-new monitored stop starts with an empty archive (no departures
  // recorded yet): totals are 0, daily rows are zero-filled, and the page
  // must not divide by zero or imply data exists. Mirror the line-page
  // empty-archive pattern: keep it indexable with graceful "no data yet"
  // copy.
  const empty = stats.total_departures === 0;
  const description = empty
    ? `Punctuality history for ${stats.stop_name} on the Øresund crossing — no departures recorded yet; data starts flowing once live monitoring begins.`
    : `Punctuality history for ${stats.stop_name} on the Øresund crossing — ${stats.total_departures} departures, ${stats.on_time_pct}% on time over the last ${stats.days} days.`;
  const dailyRows = collapseGaps(stats.daily, isStationRowEmpty)
    .map((r) => {
      if ('gapFrom' in r) return gapRow(r.gapFrom, r.gapTo, 7);
      const cells = [r.date, r.total, r.on_time, r.delayed, r.canceled, `${r.on_time_pct}%`, fmtDelay(r.avg_delay_seconds)]
        .map((v, i) => `<td${i === 0 ? ' class="meta"' : ''}>${esc(typeof v === 'number' ? String(v) : v)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › <a href="/station">Stations</a> › ${esc(stats.stop_name)}</p>
    <h1>${esc(stats.stop_name)} — punctuality archive</h1>
    <p class="sub">${esc(translate('arch_intro_station', 'en', { station: stats.stop_name }))}</p>
    <p class="sub">Observed departures over the last ${stats.days} days (${fmtDate(stats.date_from)}–${fmtDate(stats.date_to)}). Data från Trafiklab.se.</p>
${empty ? '    <p class="meta">No data yet — this station\'s archive starts once live monitoring begins.</p>' : ''}
    <div>
      <span class="stat"><b>${stats.total_departures}</b><span>Departures</span></span>
      <span class="stat"><b>${stats.on_time_pct}%</b><span>On time</span></span>
      <span class="stat"><b>${stats.canceled_count}</b><span>Cancelled</span></span>
      <span class="stat"><b>${fmtDelay(stats.avg_delay_seconds)}</b><span>Avg delay</span></span>
    </div>
    <h2>Daily on-time performance</h2>
    <table>
      <thead><tr><th>Date</th><th>Departures</th><th>On time</th><th>Delayed</th><th>Cancelled</th><th>On time %</th><th>Avg delay</th></tr></thead>
      <tbody>${dailyRows}</tbody>
    </table>
    <h2>Recent observations</h2>
    <ul class="plain">
${(stats.recent.length ? stats.recent : []).map(departureListItem).join('\n') || '      <li class="meta">No departures recorded yet.</li>'}
    </ul>
    <h2>Other stations</h2>
    <ul class="plain">
${allStations.filter((s) => s.slug !== stats.slug).map((s) => `      <li><a href="/station/${encodeURIComponent(s.slug)}">${esc(s.stop_name)}</a></li>`).join('\n')}
    </ul>`;
  return pageShell({
    // i18n title template — keeps even the longest stop name ≤ 60 chars (L3).
    title: translate('station_archive_title', 'en', { name: stats.stop_name }),
    description,
    canonical: `${SITE_URL}/station/${stats.slug}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([
          { name: 'Stations', url: `${SITE_URL}/station` },
          { name: stats.stop_name, url: `${SITE_URL}/station/${stats.slug}` },
        ]),
        dataset({
          name: `${stats.stop_name} punctuality archive`,
          description,
          pageUrl: `${SITE_URL}/station/${stats.slug}`,
          dateFrom: stats.date_from,
          dateTo: stats.date_to,
          // Punctuality only ever comes from live Trafiklab departures (no KoDa backfill).
          creators: [TRAFIKLAB_CREATOR],
          variables: [
            'Departures per day',
            'On-time departures per day',
            'Delayed departures per day',
            'Cancelled departures per day',
            'On-time percentage per day',
            'Average delay per day',
          ],
        }),
        siteIdentity,
      ],
    },
    body,
  });
}

function departureListItem(d: Departure): string {
  const status =
    d.status === 'on_time' ? 'On time' : d.status === 'delayed' ? `Delayed ${fmtDelay(d.delay_seconds)}` : d.status === 'canceled' ? 'Cancelled' : 'Unknown';
  const when = d.sched_time ? ` <span class="meta">· ${esc(String(d.sched_time).replace('T', ' '))}</span>` : '';
  const line = d.line ? ` line ${esc(d.line)}` : '';
  return `      <li>${esc(status)}${line}${when}</li>`;
}
