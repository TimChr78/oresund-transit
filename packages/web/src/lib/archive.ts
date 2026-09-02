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
import { getDict, translate, type Key, type Lang } from '../i18n';
import { esc } from './html';

export const SITE_URL = 'https://oresund.live';

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
      .intro { color: #b9c1d4; margin: 0 0 1.2rem; }
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
      <p>${esc(translate('archive_attribution', 'en'))} · <a href="/">Live board</a> · <a href="/methodology">Methodology</a> · <a href="/privacy">Privacy</a></p>
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

/** Placeholder for a metric a zero-data day cannot have (audit3 M1). */
const NO_DATA_MARK = '—';

function dailyTable(rows: ArchiveHistory['daily']): string {
  const head =
    '<thead><tr><th>Date</th><th>Total</th><th>Cancellations</th><th>Delays</th><th>Alerts</th><th>Avg delay</th></tr></thead>';
  const body = rows
    .map((r) => {
      // M1: a day with no recorded disruptions has no average to report —
      // the collector zero-fills the window, so "0 min" would read as a
      // measured (perfect) day rather than an unobserved one.
      const cells = [r.date, r.count, r.cancellations, r.delays, r.alerts, r.count === 0 ? NO_DATA_MARK : fmtDelay(r.avg_delay)]
        .map((v, i) => `<td${i === 0 ? ' class="meta"' : ''}>${esc(typeof v === 'number' ? String(v) : v)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

/** /history — index of the day-range archives. */
export function renderHistoryIndex(): string {
  const description = 'Archived disruption history for the Øresund crossing — daily totals, cancellations, delays and alerts across 7, 14, 30 and 90 days.';
  const links = DAY_RANGES.map(
    (d) => `<li><a href="/history/${d}">Last ${d} days</a> <span class="meta">— daily disruption counts &amp; delays</span></li>`,
  ).join('\n');
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › History</p>
    <h1>Disruption history</h1>
    <p class="sub">Archived disruption totals for the Øresund crossing — cancellations, delays and alerts per day, over the range you choose.</p>
    <h2>Choose a range</h2>
    <ul class="plain">
${links}
    </ul>`;
  return pageShell({
    title: 'Disruption history — Øresund.live',
    description,
    canonical: `${SITE_URL}/history`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([{ name: 'History', url: `${SITE_URL}/history` }]),
        historyRangesItemList(),
        siteIdentity,
      ],
    },
    body,
  });
}

/** /history/{days} — one day range of daily disruption totals. */
export function renderHistoryPage(days: ArchiveDays, history: ArchiveHistory): string {
  const description = `Archived disruption history for the Øresund crossing, last ${days} days — daily totals for cancellations, delays and alerts ${history.date_from} to ${history.date_to}.`;
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › <a href="/history">History</a> › ${days} days</p>
    <h1>Disruption history — last ${days} days</h1>
    <p class="sub">${history.total_disruptions} disruptions between ${fmtDate(history.date_from)} and ${fmtDate(history.date_to)}. ${esc(translate('archive_attribution', 'en'))}.</p>
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
        `<li><a href="/line/${encodeURIComponent(l.line)}">${esc(translate('line_archive_href', 'en', { line: l.line }))}</a> <span class="meta">— ${l.disruptions} disruptions recorded</span></li>`,
    )
    .join('\n');
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › Lines</p>
    <h1>Line archives</h1>
    <p class="sub">Historical disruption records for each service across the Øresund. ${esc(translate('archive_attribution', 'en'))}.</p>
    <p class="intro">${esc(translate('hub_line_intro', 'en'))}</p>
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
  const description = `Disruption history for line ${line} on the Øresund crossing — ${stats.total_disruptions} disruptions between ${fmtDate(stats.date_from)} and ${fmtDate(stats.date_to)}.`;
  // M1: a line with no recorded disruptions collapses its zero-data sections
  // into one annotation instead of rendering empty <ul>/<table> blocks.
  const empty = stats.total_disruptions === 0;
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › <a href="/line">Lines</a> › Line ${esc(line)}</p>
    <h1>Line ${esc(line)} — disruption archive</h1>
    <p class="sub">${stats.total_disruptions} disruptions between ${fmtDate(stats.date_from)} and ${fmtDate(stats.date_to)} (last ${stats.days} days). ${esc(translate('archive_attribution', 'en'))}.</p>
${
    empty
      ? `    <p class="meta">${esc(translate('line_no_disruptions_note', 'en'))}</p>`
      : `    <h2>Most common causes</h2>
${
        stats.by_cause.length
          ? `    <ul class="plain">
${stats.by_cause.map((c) => `      <li>${esc(c.cause)} <span class="meta">— ${c.count}</span></li>`).join('\n')}
    </ul>`
          : ''
      }
${
        stats.daily.length ? `    <h2>Daily breakdown</h2>
    ${dailyTable(stats.daily)}` : ''
      }
    <h2>Recent disruptions</h2>
    <ul class="plain">
${(stats.recent.length ? stats.recent : []).map(disruptionListItem).join('\n') || '      <li class="meta">None recorded in this range.</li>'}
    </ul>`
  }
    <h2>Other lines</h2>
    <ul class="plain">
${all.filter((l) => l.line !== line).map((l) => `      <li><a href="/line/${encodeURIComponent(l.line)}">${esc(translate('line_archive_href', 'en', { line: l.line }))}</a></li>`).join('\n')}
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

/**
 * Display name for a monitored stop (audit3 M4). A station name is a
 * user-visible string, so it lives in the dictionary (keyed by the collector
 * slug) and translates like any other. Slugs the dictionaries do not know yet
 * — a newly monitored stop discovered from the collector — fall back to the
 * collector's own stop_name.
 */
function stationName(station: ArchiveStation, lang: Lang = 'en'): string {
  const key = `station_${station.slug.replaceAll("-", "_")}` as Key;
  return key in getDict(lang) ? translate(key, lang) : station.stop_name;
}

/** /station — index of the per-station archives. */
export function renderStationIndex(stations: ArchiveStation[]): string {
  const description = 'Per-station punctuality archives for the Øresund crossing — on-time performance, cancellations and delays at every monitored stop.';
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › Stations</p>
    <h1>Station archives</h1>
    <p class="sub">Historical on-time performance for each monitored stop on the Øresund crossing. ${esc(translate('archive_attribution', 'en'))}.</p>
    <p class="intro">${esc(translate('hub_station_intro', 'en'))}</p>
    <div class="cards">
${stations.map((s) => `      <a class="card" href="/station/${encodeURIComponent(s.slug)}"><span class="lbl">Station</span><span class="num">${esc(stationName(s))}</span></a>`).join('\n')}
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
            name: stationName(s),
            url: `${SITE_URL}/station/${encodeURIComponent(s.slug)}`,
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
  // M4: the display name comes from the dictionary (see stationName), so the
  // page never renders the collector's untranslated literal by accident.
  const name = stationName(stats);
  const description = empty
    ? `Punctuality history for ${name} on the Øresund crossing — no departures recorded yet; data starts flowing once live monitoring begins.`
    : `Punctuality history for ${name} on the Øresund crossing — ${stats.total_departures} departures, ${stats.on_time_pct}% on time over the last ${stats.days} days.`;
  const dailyRows = stats.daily
    .map((r) => {
      // M1: zero-data days (before monitoring started, or a stop with no
      // recorded traffic) have no on-time share or average delay — the
      // collector zero-fills the window, so rendering the raw 0/0% would
      // read as a catastrophic all-delayed service day.
      const pct = r.total === 0 ? NO_DATA_MARK : `${r.on_time_pct}%`;
      const avg = r.total === 0 ? NO_DATA_MARK : fmtDelay(r.avg_delay_seconds);
      const cells = [r.date, r.total, r.on_time, r.delayed, r.canceled, pct, avg]
        .map((v, i) => `<td${i === 0 ? ' class="meta"' : ''}>${esc(typeof v === 'number' ? String(v) : v)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › <a href="/station">Stations</a> › ${esc(name)}</p>
    <h1>${esc(name)} — punctuality archive</h1>
    <p class="sub">Observed departures over the last ${stats.days} days (${fmtDate(stats.date_from)}–${fmtDate(stats.date_to)}). ${esc(translate('archive_attribution', 'en'))}.</p>
${
    empty
      ? `    <p class="meta">${esc(translate('station_no_data_note', 'en'))}</p>`
      : `    <div>
      <span class="stat"><b>${stats.total_departures}</b><span>Departures</span></span>
      <span class="stat"><b>${stats.on_time_pct}%</b><span>On time</span></span>
      <span class="stat"><b>${stats.canceled_count}</b><span>Cancelled</span></span>
      <span class="stat"><b>${fmtDelay(stats.avg_delay_seconds)}</b><span>Avg delay</span></span>
    </div>
${
        stats.daily.length
          ? `    <h2>Daily on-time performance</h2>
    <table>
      <thead><tr><th>Date</th><th>Departures</th><th>On time</th><th>Delayed</th><th>Cancelled</th><th>On time %</th><th>Avg delay</th></tr></thead>
      <tbody>${dailyRows}</tbody>
    </table>`
          : ''
      }
    <h2>Recent observations</h2>
    <ul class="plain">
${(stats.recent.length ? stats.recent : []).map(departureListItem).join('\n') || '      <li class="meta">No departures recorded yet.</li>'}
    </ul>`
  }
    <h2>Other stations</h2>
    <ul class="plain">
${allStations.filter((s) => s.slug !== stats.slug).map((s) => `      <li><a href="/station/${encodeURIComponent(s.slug)}">${esc(stationName(s))}</a></li>`).join('\n')}
    </ul>`;
  // SERP-safe short name for <title> only: strip parenthetical qualifiers
  // ('Københavns Lufthavn (Kastrup)' -> 'Københavns Lufthavn') so even the
  // longest stop name stays ≤ 60 chars after the i18n template. H1/body keep
  // the official display name.
  const titleName = name.replace(
    /\s*\((?:Kastrup|CPH|Copenhagen)\)\s*/i, ' ').trim() || name;
  // M6: the slug is URL-encoded everywhere else the station URL is emitted
  // (index cards, sibling links, /line pages, the sitemap), so the canonical —
  // and the JSON-LD URLs that mirror it — must be encoded the same way.
  const stationUrl = `${SITE_URL}/station/${encodeURIComponent(stats.slug)}`;
  return pageShell({
    title: translate('station_archive_title', 'en', { name: titleName }),
    description,
    canonical: stationUrl,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([
          { name: 'Stations', url: `${SITE_URL}/station` },
          { name, url: stationUrl },
        ]),
        dataset({
          name: `${name} punctuality archive`,
          description,
          pageUrl: stationUrl,
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
  // M4: route context — the destination is the most descriptive bit of a
  // departure ("delay on line 804 → Østerport" beats a bare line number).
  const dest = d.destination ? ` → ${esc(d.destination)}` : '';
  return `      <li>${esc(status)}${line}${dest}${when}</li>`;
}
