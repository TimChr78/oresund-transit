/**
 * Server-side renderers for the archive routes (/line/*, /station/*,
 * /history/*). These produce complete, standalone HTML documents (English —
 * the crawler default; the station pages and the /history hub take a language
 * and render in it) with per-route title/description/canonical, Open Graph
 * tags, JSON-LD structured data (breadcrumbs + data), and the required
 * Trafiklab attribution. They are pure string builders — no fetch, no I/O —
 * so they are fully testable and reused by the thin Pages Functions in
 * functions/{line,station,history}/[[path]].js (and their sv/da twins).
 *
 * The data these render is pulled at request time from the collector Worker
 * (dynamic archives), unlike the prerendered static pages (/methodology,
 * /privacy).
 */
import type { Disruption, Departure, LiveStatus } from '@oresund/shared';
import { BRAND_NAME, getDict, RSS_TITLE, translate, type Key, type Lang } from '../i18n';
import { formatDelaySeconds, formatExactDelay, formatDate, formatPct, formatTime, isValidLocalDate } from '../i18n/format';
import { bannerModel } from '../components/StatusBanner';
import { stationNameKey, stationTitleName } from '../components/StationPicker';
import { causeLabel } from './causes';
import { BAND_BADGE_CLASS, delayBand, type DelayBand } from './stats';
import { esc } from './html';
import { hreflangCluster, localizedPath, localizedUrl, ogLocaleTags, OG_LOCALE, trainStationJsonLd } from './seo';
import { STATIC_STATIONS } from './sitemap';

export const SITE_URL = 'https://oresund.live';

/** The day ranges the history archive supports (mirrors the collector API). */
export const DAY_RANGES = [7, 14, 30, 90] as const;
export type ArchiveDays = (typeof DAY_RANGES)[number];

export interface ArchiveLine {
  line: string;
  disruptions: number;
  /**
   * The last calendar day the line actually recorded a disruption (audit4
   * N-M3) — the sitemap's <lastmod> for the line's archive page. Absent or
   * null for a line the collector has never seen (the canonical set is unioned
   * in so its pages are crawlable), which is exactly the page that must NOT
   * claim a fresh daily lastmod.
   */
  last_seen?: string | null;
}

/**
 * The canonical line set served over the bridge — the Øresundståg designations
 * plus the two Gottröra/Hyllie bus designations (6, 16) that the corridor
 * filter picks up at Hyllie.
 *
 * Lines are discovered dynamically from disruption data (they come from the
 * route `designation` of Trafiklab departures), but a line with no disruptions
 * in the current window never shows up in that discovery. This static set is
 * unioned with whatever is discovered so every line archive is always a real,
 * linked page — but "linked" and "submitted to the sitemap" are deliberately
 * different things since audit5 M4 / audit6 M6: a line the collector has never
 * observed, or whose only rows predate LIVE_DATA_SINCE, renders a labelled
 * "no disruptions" note and is kept out of the sitemap and marked noindex.
 * hasMonitoredEraData below is the era test; sitemap.ts's hasSubmittableData
 * builds the submission rule on it.
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
 * The canonical set's bus lines (audit5 M4). Designations 6 and 16 are the
 * Gottröra/Hyllie buses the corridor filter picks up at Hyllie
 * (collector logic.ts isGottorpHyllieBus), not rail services — they reached the
 * line family through the pre-Øresundståg-only era and their `last_seen`
 * predates live monitoring. They are real archives with real rows, so they stay
 * linked, but every surface that names them says they are buses.
 */
export const BUS_LINES: readonly string[] = ['6', '16'];

/** True for a line designation the collector records as a bus, not a train. */
export function isBusLine(line: string): boolean {
  return BUS_LINES.includes(line);
}

/**
 * The anchor-text key for one line archive. The bus lines label themselves as
 * buses so a crawler reading "Line 6 — disruption archive" does not index a
 * bus under the Øresundståg head terms.
 */
export function lineArchiveHrefKey(line: string): Key {
  return isBusLine(line) ? 'bus_line_archive_href' : 'line_archive_href';
}

/**
 * The short mode-aware name of a line — "Line 804", "Bus line 6". The line
 * page's H1 takes the long form; everything else that names the same page (the
 * visible breadcrumb, the meta description, the JSON-LD BreadcrumbList entry
 * and the Dataset node) takes this one, so a bus is not re-labelled as a train
 * one element away from its own heading.
 */
export function lineLabel(line: string, lang: Lang = 'en'): string {
  return translate(isBusLine(line) ? 'bus_line_archive_label' : 'line_archive_label', lang, { line });
}

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
    result.push({
      line,
      disruptions: existing?.disruptions ?? 0,
      // The union must not invent a last-seen date for a line the collector
      // has never observed: leaving it unset is what tells the sitemap the
      // page has no data to be fresh about (audit4 N-M3).
      ...(existing?.last_seen ? { last_seen: existing.last_seen } : {}),
    });
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

/**
 * The collector /api/transit/punctuality shape — the corridor-wide daily
 * punctuality rows (every monitored stop summed, no station filter). This is
 * what the /history hub aggregates into its three headline numbers; the
 * per-station version of the same query is ArchiveStationStats.
 */
export interface ArchivePunctuality {
  days: number;
  date_from: string;
  date_to: string;
  daily: {
    date: string;
    total: number;
    on_time: number;
    delayed: number;
    canceled: number;
    on_time_pct: number;
    avg_delay_seconds: number | null;
  }[];
}

/** The three headline numbers the /history hub publishes for one window. */
export interface CorridorTotals {
  departures: number;
  onTime: number;
  delayed: number;
  canceled: number;
  /**
   * On-time share over the whole window, 0–100 with one decimal. Null when no
   * departure was recorded — a corridor that observed nothing has no share to
   * report, and 0% would read as a catastrophic month rather than an empty one.
   */
  onTimePct: number | null;
}

/**
 * Sum the corridor's daily punctuality rows into one set of headline numbers.
 * The share is recomputed from the summed counts — averaging the daily
 * percentages would weight a 4-departure day as heavily as a 400-departure one.
 * Same rounding (one decimal, 0–100) the collector uses per day.
 */
export function corridorTotals(punctuality: ArchivePunctuality): CorridorTotals {
  const totals = punctuality.daily.reduce(
    (acc, row) => ({
      departures: acc.departures + row.total,
      onTime: acc.onTime + row.on_time,
      delayed: acc.delayed + row.delayed,
      canceled: acc.canceled + row.canceled,
    }),
    { departures: 0, onTime: 0, delayed: 0, canceled: 0 },
  );
  return {
    ...totals,
    onTimePct: totals.departures > 0 ? Math.round((totals.onTime / totals.departures) * 1000) / 10 : null,
  };
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
  /**
   * The monitored stops the line was observed at inside the window (audit4
   * N-M1) — what the page cross-links to the station archives. Optional — the
   * collector deploys independently of the site, so an older payload carries
   * none and the section is simply left out.
   */
  stops?: ArchiveStation[];
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
  /**
   * Naive local ISO stamp of the read (audit4 N-C1): every row in `recent` has
   * a sched_time <= it, and it renders under the departures heading. Optional —
   * the collector deploys independently of the site, so a payload from an
   * older worker carries no stamp and the line is simply dropped.
   */
  as_of?: string;
  /**
   * The lines observed at this stop inside the window (audit4 N-M1) — the
   * counterpart of `ArchiveLineStats.stops`, cross-linking the station page to
   * the per-line archives. Optional, same reason.
   */
  lines?: string[];
}

interface ShellOpts {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: unknown;
  body: string;
  /**
   * Document language. The archive routes render en by default; the station
   * pages and the /history hub are the families that localize (audit3 C1),
   * so they pass the route's language through and every string in the shell
   * follows it.
   */
  lang?: Lang;
  /**
   * The en canonical base path of a LOCALIZED page (e.g. '/station/hyllie' or
   * '/history'). When set, the shell emits the full en/sv/da/x-default
   * hreflang cluster; when unset the page exists as one URL and self-announces
   * (hreflangSelf).
   */
  hreflangPath?: string;
  /**
   * The robots directive. Defaults to index,follow; a thin page passes
   * noindex,follow to stay out of the index without orphaning its outbound
   * links (audit6 L2).
   */
  robots?: string;
}

/** Escape a value for an HTML attribute (quotes already escaped by esc). */
function attr(value: string): string {
  return esc(value);
}

/**
 * Minimal hreflang set for a page that exists as ONE URL (no localized
 * twins): the archive routes /line/*, /station/* and /history/{days} are
 * served in English only — the trilingual board handles language switching
 * client-side, so no /sv/ or /da/ variants exist. (The exceptions are the
 * station pages and the /history hub, which pass `hreflangPath` instead and
 * get the full en/sv/da/x-default cluster.) Per Google's hreflang
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
function pageShell({ title, description, canonical, jsonLd, body, lang = 'en', hreflangPath, robots = 'index,follow' }: ShellOpts): string {
  // M10: og:locale (+ alternates where localized twins exist) — the og block
  // below never announced the page's language, only its title and URL.
  const localeTags = hreflangPath ? ogLocaleTags(lang) : `    <meta property="og:locale" content="${OG_LOCALE[lang]}" />`;
  const ogTags = `
${localeTags}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${attr(title)}" />
    <meta property="og:description" content="${attr(description)}" />
    <meta property="og:url" content="${attr(canonical)}" />
    <meta property="og:site_name" content="${BRAND_NAME}" />
    <meta property="og:image" content="https://oresund.live/og-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${attr(translate('og_image_alt', lang))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${attr(title)}" />
    <meta name="twitter:description" content="${attr(description)}" />
    <meta name="twitter:image" content="https://oresund.live/og-card.png" />`;
  const jsonLdBlock = jsonLd === undefined ? '' : `\n    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;
  // Localized pages (the station routes and the /history hub) announce the
  // full en/sv/da/x-default cluster; every other archive route exists as ONE
  // URL per page — no /sv/ /da/ twins (language switching on the board is
  // client-side) — so those self-announce en + x-default, mirroring the
  // static pages' cluster.
  const hreflang = hreflangPath ? hreflangCluster(hreflangPath) : hreflangSelf(attr(canonical));
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${attr(title)}</title>
    <meta name="description" content="${attr(description)}" />
    <link rel="canonical" href="${attr(canonical)}" />
${hreflang}
    <!-- M7: RSS autodiscovery — the home shell has always linked /feed.xml
         this way; the archive pages were 27 of 31 URLs where the feed was
         undiscoverable to a reader or crawler. -->
    <link rel="alternate" type="application/rss+xml" title="${RSS_TITLE}" href="/feed.xml" />
    <meta name="robots" content="${attr(robots)}" />${ogTags}${jsonLdBlock}
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%230a0c10'/><circle cx='32' cy='18' r='7' fill='%2310b981'/><circle cx='32' cy='32' r='7' fill='%23f59e0b'/><circle cx='32' cy='46' r='7' fill='%23ef4444'/></svg>" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #0a0c10; color: #e7eaf0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.55; }
      header { border-bottom: 1px solid #1c2330; padding: 1rem 1.25rem; background: #0d1016; }
      header .brand { color: #10b981; font-weight: 700; text-decoration: none; font-size: 1.05rem; }
      main { max-width: 880px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; overflow-x: hidden; }
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
      /* H5: the 6-7 column daily tables cannot fit a 375px viewport — they
         scroll inside their own container instead of stretching <main> and
         forcing a page-level horizontal scroll (mirrors .table-wrap). */
      .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .table-scroll table { min-width: 540px; }
      th, td { text-align: right; padding: .45rem .5rem; border-bottom: 1px solid #171d28; }
      th:first-child, td:first-child { text-align: left; }
      th { color: #8b93a7; font-weight: 600; font-size: .78rem; text-transform: uppercase; letter-spacing: .03em; }
      .stat { display: inline-block; background: #12161f; border: 1px solid #1c2330; border-radius: 10px; padding: .5rem .9rem; margin-right: .5rem; margin-bottom: .5rem; }
      .stat b { display: block; font-size: 1.1rem; }
      .stat span { color: #8b93a7; font-size: .75rem; }
      /* C1: the corridor status band reuses the board's StatusBanner colour
         semantics (status-green/amber/red/blue — the same hex values as the
         --green/--amber/--red/--blue tokens in styles.css), as static HTML:
         the archive shell ships no JS and no SPA stylesheet. */
      .status-band { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .25rem 1rem; border-radius: 10px; padding: .65rem .9rem; color: #0a0c10; font-weight: 700; }
      .status-band.status-green { background: #10b981; }
      .status-band.status-amber { background: #f59e0b; }
      .status-band.status-red { background: #ef4444; }
      .status-band.status-blue { background: #3b82f6; }
      .status-band .band-count { font-weight: 600; opacity: .85; }
      /* C1/H2: departure status badges — the same tint-on-dark treatment as
         the board's delay-band badges, inlined here because the archive shell
         carries no shared stylesheet. */
      .badge { display: inline-block; border-radius: 5px; padding: 1px 8px; font-size: .72rem; font-weight: 600; white-space: nowrap; }
      .badge-band-on-time { color: #10b981; background: rgba(16, 185, 129, .12); border: 1px solid rgba(16, 185, 129, .26); }
      .badge-band-minor { color: #f59e0b; background: rgba(245, 158, 11, .1); border: 1px solid rgba(245, 158, 11, .22); }
      /* N-M13: the same text/fill tier split as styles.css. On these pages the
         tint composites over the page's own #0a0c10 body rather than the
         board's --surface, so #ef4444 clears AA here (4.61:1) — but the values
         stay in lockstep with the board so a badge never changes colour
         between the board and its archive. */
      .badge-band-moderate { color: #f46565; background: rgba(239, 68, 68, .1); border: 1px solid rgba(239, 68, 68, .26); }
      .badge-band-major { color: #0a0c10; background: #ef4444; border: 1px solid #ef4444; }
      .badge-cancellation { color: #f46565; background: rgba(239, 68, 68, .14); border: 1px solid rgba(239, 68, 68, .3); }
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
    <header><a class="brand" href="${localizedPath('/', lang)}" lang="da">${BRAND_NAME}</a></header>
    <main>${body}</main>
    <footer>
      <p>${esc(translate('archive_attribution', lang))} · <a href="${localizedPath('/', lang)}">${esc(translate('nav_board', lang))}</a> · <a href="${localizedPath('/history', lang)}">${esc(translate('nav_history', lang))}</a> · <a href="${localizedPath('/methodology', lang)}">${esc(translate('nav_methodology', lang))}</a> · <a href="${localizedPath('/privacy', lang)}">${esc(translate('nav_privacy', lang))}</a></p>
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
  const items = [{ name: BRAND_NAME, url: `${SITE_URL}/` }, ...crumbs].map((c, i) =>
    crumb(c.name, c.url, i + 1),
  );
  return { '@type': 'BreadcrumbList', itemListElement: items };
}

/** The factual site identity fragment shared by archive JSON-LD. */
const siteIdentity = {
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: BRAND_NAME,
  url: `${SITE_URL}/`,
};

/** Live Trafiklab polling started 2026-08-06; earlier disruption history was
 * backfilled from KoDa's historical archive (May 2026 onward). */
export const LIVE_DATA_SINCE = '2026-08-06';

/**
 * True when a line's own disruption rows fall inside the monitored era, and so
 * describe service this site actually observed. A `last_seen` before
 * LIVE_DATA_SINCE is the pre-filter archive — bus designations 6 and 16 last
 * saw a disruption on 2026-08-04 and 2026-08-02, before monitoring began —
 * which is exactly the data a sitemap entry or an indexable page must not
 * imply is current (audit6 M6). An absent `last_seen` is a line the collector
 * has never observed at all.
 */
export function hasMonitoredEraData(lastSeen: string | null | undefined): boolean {
  return !!lastSeen && lastSeen >= LIVE_DATA_SINCE;
}

const TRAFIKLAB_CREATOR = { '@type': 'Organization', name: 'Trafiklab', url: 'https://www.trafiklab.se' };
const KODA_CREATOR = { '@type': 'Organization', name: 'KoDa' };

/** CC-BY 4.0 — the license the published data is distributed under. */
const CC_BY_4_0 = 'https://creativecommons.org/licenses/by/4.0/';

/**
 * Dataset creators for a data window. Disruption histories that extend before
 * the live-data start include KoDa's backfill; windows entirely inside the
 * live era (and station punctuality, which only ever comes from live
 * departures) are Trafiklab-only.
 *
 * The comparison runs through the calendar validator (audit6 L13): a raw
 * lexicographic `<` against LIVE_DATA_SINCE is the audit5 M5 class again — an
 * impossible "2026-99-99" sorts above every real date and would have credited
 * KoDa with a window that never happened.
 */
function creatorsFor(dateFrom: string): unknown[] {
  return isValidLocalDate(dateFrom) && dateFrom < LIVE_DATA_SINCE
    ? [TRAFIKLAB_CREATOR, KODA_CREATOR]
    : [TRAFIKLAB_CREATOR];
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
}): Record<string, unknown> {
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
 * each /history/{days} page. `lang` names the windows the way the visible list
 * beside the node does (audit5 M2) — an English "Last 30 days" in the
 * structured data of a page whose own list says "30 dagar" is the same
 * mismatch as an English description.
 */
function historyRangesItemList(lang: Lang = 'en', exclude?: ArchiveDays): unknown {
  const ranges = DAY_RANGES.filter((d) => d !== exclude);
  return {
    '@type': 'ItemList',
    numberOfItems: ranges.length,
    itemListElement: ranges.map((d, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: translate('history_window_label', lang, { days: d }),
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

/**
 * Display an ISO local date as a friendly label (naive, Europe/Stockholm) on
 * the English-only archive routes.
 *
 * Calendar-validated before it is formatted (audit6 M7): `Date.UTC` rolls
 * over, so the shape-only check this used to do turned "2026-99-99" into
 * "7 Jun 2034" and "2026-02-30" into "2 Mar 2026" — a confident, wrong,
 * *indexable* date in the /line/* and /history/{days} meta descriptions, which
 * is worse in kind than an obviously broken one. formatDate (the localized
 * path) got this guard first; the sibling was missed. An invalid value comes
 * back as itself: visibly wrong, never plausibly wrong.
 */
function fmtDate(date: string): string {
  if (!isValidLocalDate(date)) return date;
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
    '<thead><tr><th scope="col">Date</th><th scope="col">Total</th><th scope="col">Cancellations</th><th scope="col">Delays</th><th scope="col">Alerts</th><th scope="col">Avg delay</th></tr></thead>';
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
  return `<div class="table-scroll"><table>${head}<tbody>${body}</tbody></table></div>`;
}

/**
 * The /history window list, as visible links: every range the archive serves,
 * localized with the shared days_* labels. The hub itself reports the default
 * 30-day window; the four range pages carry the day-by-day tables.
 */
function windowLinks(lang: Lang): string {
  // The window pages (/history/{d}) are English-only — no localized twins —
  // so on the sv/da hubs each anchor carries hreflang="en" while keeping the
  // localized days_* labels. hreflang only (audit5 M1): it names the target
  // document, whereas lang would name this element's own — Swedish — text.
  return DAY_RANGES.map((d) => `      <li><a href="/history/${d}" hreflang="en">${esc(translate(`days_${d}` as Key, lang))}</a></li>`).join(
    '\n',
  );
}

/**
 * /history — the archive hub: the whole corridor's numbers for the default
 * 30-day window, and the way into every window, station and line archive.
 *
 * The hub is the one archive page besides the station pages that ships
 * localized twins (/sv/history, /da/history), so it takes a language and every
 * string it renders goes through the dictionary. Unlike /station and /line it
 * does NOT enumerate its children from collector discovery — the monitored
 * stops and the canonical line set are the fixed navigation surface (the same
 * sets llms.txt is built from), so the only collector calls the hub needs are
 * the two that produce its numbers.
 */
export function renderHistoryHub(punctuality: ArchivePunctuality, history: ArchiveHistory, lang: Lang = 'en'): string {
  const totals = corridorTotals(punctuality);
  const empty = totals.departures === 0;
  const description = translate('hub_history_desc', lang);
  // The three headline cards. A corridor that recorded no departures yet has
  // no punctuality to show — the on-time card would read as 0% (audit3 M1) —
  // so the departure count and the share give way to the "no data" note while
  // the disruption count, an independent dataset, still renders.
  const stat = (value: string, key: Key) =>
    `<span class="stat"><b>${value}</b><span>${esc(translate(key, lang))}</span></span>`;
  const cards = empty
    ? [stat(String(history.total_disruptions), 'stat_disruptions')]
    : [
        // The departures card names its unit (audit5 M3): the figure is a count
        // of per-stop observations — the same through-train counted at Hyllie,
        // Malmö C, Kastrup and København H — and a bare "Departures" invited
        // reading it as trains.
        stat(String(totals.departures), 'hub_stat_departures'),
        // departures > 0 here, so the share is a number — the ?? is unreachable.
        stat(esc(formatPct(totals.onTimePct ?? 0, lang)), 'stat_on_time'),
        stat(String(history.total_disruptions), 'stat_disruptions'),
      ];
  // The notes under the cards. The disruption card renders even on a corridor
  // that has recorded no departures yet, so its denominator explanation has to
  // render with it rather than give way to the no-data note — dropping it left
  // that bare count unexplained. An empty corridor shows both: the first
  // explains the missing cards, the second the number that is still there.
  const notes = [
    ...(empty ? [translate('station_no_data_note', lang)] : []),
    translate('hub_disruptions_note', lang),
  ]
    .map((text) => `    <p class="meta">${esc(text)}</p>`)
    .join('\n');
  const body = `
    <p class="crumb"><a href="${localizedPath('/', lang)}" lang="da">${BRAND_NAME}</a> › ${esc(translate('hub_history_h1', lang))}</p>
    <h1>${esc(translate('hub_history_h1', lang))}</h1>
    <p class="sub">${esc(
      translate('hub_history_sub', lang, {
        days: history.days,
        // The raw string is the fallback (audit6 L1): formatDate returns ''
        // for an impossible date, and an empty interpolation reads as
        // ",  to ." rather than as broken data.
        from: formatDate(history.date_from, lang) || history.date_from,
        to: formatDate(history.date_to, lang) || history.date_to,
      }),
    )} ${esc(translate('archive_attribution', lang))}.</p>
    <p class="intro">${esc(translate('hub_history_intro', lang))}</p>
    <div>
      ${cards.join('\n      ')}
    </div>
${notes}
    <h2>${esc(translate('hub_history_windows_heading', lang))}</h2>
    <ul class="plain">
${windowLinks(lang)}
    </ul>
    <h2>${esc(translate('arch_link_station', lang))}</h2>
    <ul class="plain">
${STATIC_STATIONS.map(
  (s) =>
    // The station routes localize, so the link's target language is the page's
    // own — no hreflang annotation, exactly as between two station pages.
    `      <li>${linkTo(localizedPath(`/station/${encodeURIComponent(s.slug)}`, lang), stationName(s, lang), lang, lang)}</li>`,
).join('\n')}
    </ul>
    <h2>${esc(translate('arch_link_line', lang))}</h2>
    <ul class="plain">
${CANONICAL_LINES.map((line) => `      <li>${linkTo(`/line/${encodeURIComponent(line)}`, translate(lineArchiveHrefKey(line), lang, { line }), lang)}</li>`).join('\n')}
    </ul>`;
  return pageShell({
    title: translate('hub_history_title', lang),
    description,
    canonical: localizedUrl('/history', lang),
    hreflangPath: '/history',
    lang,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([{ name: translate('hub_history_h1', lang), url: localizedUrl('/history', lang) }]),
        historyRangesItemList(lang),
        {
          '@type': 'ItemList',
          numberOfItems: STATIC_STATIONS.length,
          itemListElement: STATIC_STATIONS.map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: stationName(s, lang),
            url: localizedUrl(`/station/${encodeURIComponent(s.slug)}`, lang),
          })),
        },
        {
          // The hub's own list of line archives — the full canonical family.
          // It is a table of contents for this page's link list, not a
          // submission list: the sitemap deliberately submits only the lines
          // with monitored-era data (see buildSitemap), and those withheld
          // pages carry noindex. The three documents disagree by design
          // (audit6 L3); each is internally consistent about what it counts.
          '@type': 'ItemList',
          numberOfItems: CANONICAL_LINES.length,
          itemListElement: CANONICAL_LINES.map((line, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: translate(lineArchiveHrefKey(line), lang, { line }),
            url: `${SITE_URL}/line/${encodeURIComponent(line)}`,
          })),
        },
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
    <p class="crumb"><a href="/">${BRAND_NAME}</a> › <a href="/history">History</a> › ${days} days</p>
    <h1>Disruption history — last ${days} days</h1>
    <p class="sub">${history.total_disruptions} disruptions between ${fmtDate(history.date_from)} and ${fmtDate(history.date_to)}. ${esc(translate('archive_attribution', 'en'))}.</p>
    <h2>Daily breakdown</h2>
    ${dailyTable(history.daily)}
    <h2>Other ranges</h2>
    <ul class="plain">
${DAY_RANGES.filter((d) => d !== days).map((d) => `      <li><a href="/history/${d}">Last ${d} days</a></li>`).join('\n')}
    </ul>`;
  return pageShell({
    title: `Disruption history — last ${days} days — ${BRAND_NAME}`,
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
        historyRangesItemList('en', days),
        siteIdentity,
      ],
    },
    body,
  });
}

/** /line — index of the per-line archives. */
export function renderLineIndex(lines: ArchiveLine[]): string {
  const all = unionCanonicalLines(lines);
  // The collector is Øresundståg-only (audit6 M5) — the description must not
  // claim Pågatåg coverage the August stop-id correction removed.
  const description = 'Per-line disruption archives for the Øresund crossing — historical cancellations, delays and alerts for each Öresundståg service.';
  const list = all
    .map(
      (l) =>
        `<li><a href="/line/${encodeURIComponent(l.line)}">${esc(translate(lineArchiveHrefKey(l.line), 'en', { line: l.line }))}</a> <span class="meta">— ${l.disruptions} disruptions recorded</span></li>`,
    )
    .join('\n');
  const body = `
    <p class="crumb"><a href="/" lang="da">${BRAND_NAME}</a> › Lines</p>
    <h1>Line archives</h1>
    <p class="sub">Historical disruption records for each service across the Øresund. ${esc(translate('archive_attribution', 'en'))}.</p>
    <p class="intro">${esc(translate('hub_line_intro', 'en'))}</p>
    <ul class="plain">
${list}
    </ul>`;
  return pageShell({
    title: `Line archives — ${BRAND_NAME}`,
    description,
    canonical: `${SITE_URL}/line`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([{ name: 'Lines', url: `${SITE_URL}/line` }]),
        {
          // This list describes the page's own visible list — every line
          // archive that exists, zero-data ones included. The sitemap submits
          // a subset of it (the lines with monitored-era data) and llms.txt
          // enumerates the whole family as an index of pages. That divergence
          // is deliberate (audit6 L3): an ItemList is a table of contents for
          // THIS document, not a submission list, and the pages the sitemap
          // withholds are exactly the ones carrying noindex.
          '@type': 'ItemList',
          numberOfItems: all.length,
          itemListElement: all.map((l, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: translate(lineArchiveHrefKey(l.line), 'en', { line: l.line }),
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
  // M4: the canonical set's bus lines are archived here because they call at a
  // monitored stop — the H1 says which mode the page is about and the note says
  // why a bus sits in a rail archive. The short form of the same mode-aware
  // name carries into the breadcrumb, the description and the JSON-LD below, so
  // the page never contradicts its own heading about what runs on the line.
  const label = lineLabel(line);
  const description = `Disruption history for ${label} on the Øresund crossing — ${stats.total_disruptions} disruptions between ${fmtDate(stats.date_from)} and ${fmtDate(stats.date_to)}.`;
  // M1: a line with no recorded disruptions collapses its zero-data sections
  // into one annotation instead of rendering empty <ul>/<table> blocks.
  const empty = stats.total_disruptions === 0;
  const bus = isBusLine(line);
  const h1 = translate(bus ? 'bus_line_archive_h1' : 'line_archive_h1', 'en', { line });
  const body = `
    <p class="crumb"><a href="/" lang="da">${BRAND_NAME}</a> › <a href="/line">Lines</a> › ${esc(label)}</p>
    <h1>${esc(h1)}</h1>
    <p class="sub">${stats.total_disruptions} disruptions between ${fmtDate(stats.date_from)} and ${fmtDate(stats.date_to)} (last ${stats.days} days). ${esc(translate('archive_attribution', 'en'))}.</p>
${bus ? `    <p class="meta">${esc(translate('line_bus_note', 'en', { line }))}</p>` : ''}
${
    empty
      ? `    <p class="meta">${esc(translate('line_no_disruptions_note', 'en'))}</p>`
      : `    <h2>Most common causes</h2>
${
        stats.by_cause.length
          ? `    <ul class="plain">
${stats.by_cause.map((c) => `      <li>${esc(causeLabel(c.cause, 'en'))} <span class="meta">— ${esc(translate(c.count === 1 ? 'banner_disruptions_one' : 'banner_disruptions_many', 'en', { n: c.count }))}</span></li>`).join('\n')}
    </ul>`
          : ''
      }
${
        stats.daily.length ? `    <h2>Daily breakdown</h2>
    ${dailyTable(stats.daily)}` : ''
      }
    <h2>Recent disruptions</h2>
    <ul class="plain">
${(stats.recent.length ? stats.recent : []).map((d) => disruptionListItem(d, 'en')).join('\n') || '      <li class="meta">None recorded in this range.</li>'}
    </ul>`
  }
${lineStationsSection(stats.stops, 'en')}
    <h2>Other lines</h2>
    <ul class="plain">
${all.filter((l) => l.line !== line).map((l) => `      <li><a href="/line/${encodeURIComponent(l.line)}">${esc(translate(lineArchiveHrefKey(l.line), 'en', { line: l.line }))}</a></li>`).join('\n')}
    </ul>`;
  return pageShell({
    title: `${h1} — ${BRAND_NAME}`,
    description,
    canonical: `${SITE_URL}/line/${encodeURIComponent(line)}`,
    // L2 (audit6): a line with nothing recorded in the window is a real,
    // linked page with an honest note — not a page a search engine should
    // index. noindex,follow keeps the link graph flowing (the "Other lines"
    // and station cross-links still count) while keeping the thin pages out of
    // the index, which is the same rule the sitemap applies.
    robots: empty ? 'noindex,follow' : 'index,follow',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([
          { name: 'Lines', url: `${SITE_URL}/line` },
          { name: label, url: `${SITE_URL}/line/${encodeURIComponent(line)}` },
        ]),
        dataset({
          name: `${label} disruption archive`,
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

function disruptionListItem(d: Disruption, lang: Lang = 'en'): string {
  const dir = directionLabel(d.direction);
  const type = d.type ? TYPE_LABEL[d.type] ?? d.type : 'Disruption';
  // formatTime, not the raw stamp (audit5 L10): every other timestamp on these
  // pages goes through a formatter, and "2026-08-21T17:42:10" among them read
  // as machine output. An unparseable value falls back to the no-data mark.
  const when = d.timestamp ? ` <span class="meta">· ${esc(formatTime(d.timestamp, lang) || NO_DATA_MARK)}</span>` : '';
  // lineLabel, not the bare designation (audit6 L5): a bus reaches this list
  // the day it has a disruption, and "Delay on line 6 to Denmark" would be the
  // one remaining place a bus is called a train on a page whose H1, breadcrumb
  // and Dataset all say otherwise.
  const line = d.line ? ` on ${lineLabel(d.line, lang)}` : '';
  return `      <li>${esc(type)}${esc(line)}${dir ? ` ${esc(dir)}` : ''}${when}</li>`;
}

/**
 * Display name for a monitored stop (audit3 M4). A station name is a
 * user-visible string, so it lives in the dictionary (keyed by the collector
 * slug) and translates like any other. Slugs the dictionaries do not know yet
 * — a newly monitored stop discovered from the collector — fall back to the
 * collector's own stop_name.
 */
function stationName(station: { slug: string; stop_name: string }, lang: Lang = 'en'): string {
  const key = stationNameKey(station.slug);
  return key in getDict(lang) ? translate(key, lang) : station.stop_name;
}

/**
 * One <a>, tagged with the language of the page it leads to when that differs
 * from the page linking out (audit4 N-M4). Only the station family localizes —
 * /line/*, /history/* and the archive hubs are English-only — so a localized
 * station page links them unprefixed, and without `hreflang` the crawler would
 * read a Swedish page pointing at a URL that looks like a Swedish twin of an
 * English one.
 *
 * `hreflang` only: it describes the TARGET document, which is English. `lang`
 * would describe THIS element's own content — the anchor text, which the
 * renderers translate — so emitting it told a screen reader to read Swedish
 * anchor text with English phonemes (audit5 M1).
 */
function linkTo(href: string, label: string, pageLang: Lang, targetLang: Lang = 'en'): string {
  const attrs = targetLang === pageLang ? '' : ` hreflang="${targetLang}"`;
  return `<a href="${esc(href)}"${attrs}>${esc(label)}</a>`;
}

/**
 * "Lines serving this station" (audit4 N-M1): the lines the collector observed
 * at the stop inside the window, each linking its own line archive — the
 * station page's side of the station↔line cross-link pair, in crawler-visible
 * HTML. `lines` comes from the collector payload and is optional (the
 * collector deploys independently of the site), so a page without it renders
 * no section rather than an empty one.
 */
function stationLinesSection(lines: string[] | undefined, lang: Lang): string {
  if (!lines || lines.length === 0) return '';
  const items = lines
    .map((line) =>
      `      <li>${linkTo(`/line/${encodeURIComponent(line)}`, translate(lineArchiveHrefKey(line), lang, { line }), lang)}</li>`,
    )
    .join('\n');
  return `    <h2>${esc(translate('station_lines_heading', lang))}</h2>
    <ul class="plain">
${items}
    </ul>`;
}

/**
 * "Stations on this line" (audit4 N-M1): the monitored stops the line was
 * observed at, linking their station pages — the line page's side of the same
 * pair. Optional payload, same convention as stationLinesSection.
 */
function lineStationsSection(stops: ArchiveStation[] | undefined, lang: Lang): string {
  if (!stops || stops.length === 0) return '';
  const items = stops
    .map(
      (s) =>
        `      <li>${linkTo(localizedPath(`/station/${encodeURIComponent(s.slug)}`, lang), stationName(s, lang), lang)}</li>`,
    )
    .join('\n');
  return `    <h2>${esc(translate('line_stations_heading', lang))}</h2>
    <ul class="plain">
${items}
    </ul>`;
}

/** /station — index of the per-station archives. */
export function renderStationIndex(stations: ArchiveStation[]): string {
  const description = 'Per-station punctuality archives for the Øresund crossing — on-time performance, cancellations and delays at every monitored stop.';
  const body = `
    <p class="crumb"><a href="/">${BRAND_NAME}</a> › Stations</p>
    <h1>Station archives</h1>
    <p class="sub">Historical on-time performance for each monitored stop on the Øresund crossing. ${esc(translate('archive_attribution', 'en'))}.</p>
    <p class="intro">${esc(translate('hub_station_intro', 'en'))}</p>
    <div class="cards">
${stations.map((s) => `      <a class="card" href="/station/${encodeURIComponent(s.slug)}"><span class="lbl">Station</span><span class="num">${esc(stationName(s))}</span></a>`).join('\n')}
    </div>`;
  return pageShell({
    title: `Station archives — ${BRAND_NAME}`,
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

/**
 * /station/{slug} — one station's page: the live corridor status and latest
 * observed departures (C1) above the punctuality archive it has always served.
 * This is the canonical per-station URL — live and archive deliberately share
 * it rather than splitting onto a /live sibling that would cannibalize the
 * same head term. `live` is the corridor snapshot and may be null (the
 * collector's /live endpoint is fetched best-effort so a snapshot gap degrades
 * the status band instead of failing the page); `lang` localizes the whole
 * document for the /sv/ and /da/ routes.
 */
export function renderStationPage(
  stats: ArchiveStationStats,
  allStations: ArchiveStation[],
  live?: LiveStatus | null,
  lang: Lang = 'en',
): string {
  // A brand-new monitored stop starts with an empty archive (no departures
  // recorded yet): totals are 0, daily rows are zero-filled, and the page
  // must not divide by zero or imply data exists. Mirror the line-page
  // empty-archive pattern: keep it indexable with graceful "no data yet"
  // copy.
  const empty = stats.total_departures === 0;
  // M4: the display name comes from the dictionary (see stationName), so the
  // page never renders the collector's untranslated literal by accident.
  const name = stationName(stats, lang);
  const description = empty
    ? translate('station_desc_empty', lang, { name })
    : translate('station_desc', lang, {
        name,
        n: stats.total_departures,
        pct: formatPct(stats.on_time_pct, lang).replace('%', ''),
        days: stats.days,
      });
  const dailyRows = stats.daily
    .map((r) => {
      // M1: zero-data days (before monitoring started, or a stop with no
      // recorded traffic) have no on-time share or average delay — the
      // collector zero-fills the window, so rendering the raw 0/0% would
      // read as a catastrophic all-delayed service day.
      const pct = r.total === 0 ? NO_DATA_MARK : formatPct(r.on_time_pct, lang);
      const avg = r.total === 0 ? NO_DATA_MARK : formatDelaySeconds(r.avg_delay_seconds, lang);
      const cells = [r.date, r.total, r.on_time, r.delayed, r.canceled, pct, avg]
        .map((v, i) => `<td${i === 0 ? ' class="meta"' : ''}>${esc(typeof v === 'number' ? String(v) : v)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  // The hub link stays on the unprefixed /station — the hub itself is not
  // localized, unlike the per-station pages this page links to below.
  const body = `
    <p class="crumb"><a href="${localizedPath('/', lang)}" lang="da">${BRAND_NAME}</a> › ${linkTo('/station', translate('nav_stations', lang), lang)} › ${esc(name)}</p>
    <h1>${esc(translate('station_h1', lang, { name }))}</h1>
    <p class="sub">${esc(
      translate('station_sub', lang, {
        days: stats.days,
        // formatDate, not fmtDate: a localized page must not switch to English
        // month names in its own subtitle (audit4 LOW). The raw string is the
        // fallback (audit6 L1) — an empty interpolation rendered "(–)".
        from: formatDate(stats.date_from, lang) || stats.date_from,
        to: formatDate(stats.date_to, lang) || stats.date_to,
      }),
    )} ${esc(translate('archive_attribution', lang))}.</p>
    ${renderStationLive(stats, live ?? null, lang)}
${
    empty
      ? `    <p class="meta">${esc(translate('station_no_data_note', lang))}</p>`
      : `    <div>
      <span class="stat"><b>${stats.total_departures}</b><span>${esc(translate('stat_departures', lang))}</span></span>
      <span class="stat"><b>${esc(formatPct(stats.on_time_pct, lang))}</b><span>${esc(translate('stat_on_time', lang))}</span></span>
      <span class="stat"><b>${stats.canceled_count}</b><span>${esc(translate('th_canceled', lang))}</span></span>
      <span class="stat"><b>${formatDelaySeconds(stats.avg_delay_seconds, lang)}</b><span>${esc(translate('stat_avg_delay', lang))}</span></span>
    </div>
${
        stats.daily.length
          ? `    <h2>${esc(translate('station_daily_heading', lang))}</h2>
    <div class="table-scroll">
      <table>
        <thead><tr>${[
            'th_date',
            'stat_departures',
            'stat_on_time',
            'stat_delayed',
            'th_canceled',
            'th_on_time_pct',
            'stat_avg_delay',
          ]
            .map((k) => `<th scope="col">${esc(translate(k as Key, lang))}</th>`)
            .join('')}</tr></thead>
        <tbody>${dailyRows}</tbody>
      </table>
    </div>`
          : ''
      }`
  }
${stationLinesSection(stats.lines, lang)}
    <h2>${esc(translate('station_other_heading', lang))}</h2>
    <ul class="plain">
${allStations
  .filter((s) => s.slug !== stats.slug)
  .map(
    (s) =>
      `      <li><a href="${esc(localizedPath(`/station/${encodeURIComponent(s.slug)}`, lang))}">${esc(stationName(s, lang))}</a></li>`,
  )
  .join('\n')}
    </ul>`;
  // SERP-safe short name for <title> only (stationTitleName): H1/body keep the
  // official display name.
  const titleName = stationTitleName(name);
  // M6: the slug is URL-encoded everywhere else the station URL is emitted
  // (index cards, sibling links, /line pages, the sitemap), so the canonical —
  // and the JSON-LD URLs that mirror it — must be encoded the same way.
  const stationBasePath = `/station/${encodeURIComponent(stats.slug)}`;
  // M12: the place entity this page is about. Facts come from the static
  // station table (name/stop id/place/verified coordinates) — never from the
  // collector payload, so a collector-side name change cannot silently
  // rewrite a structured-data claim. A slug missing from the table still
  // renders a TrainStation node, just without place/geo.
  const staticStation = STATIC_STATIONS.find((s) => s.slug === stats.slug);
  const stationPageUrl = localizedUrl(stationBasePath, lang);
  const trainStation = trainStationJsonLd({
    stopId: stats.stop_id,
    name,
    url: stationPageUrl,
    place: staticStation?.place,
    geo: staticStation?.geo,
  });
  return pageShell({
    title: translate('station_archive_title', lang, { name: titleName }),
    description,
    canonical: stationPageUrl,
    hreflangPath: stationBasePath,
    lang,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([
          { name: translate('nav_stations', lang), url: `${SITE_URL}/station` },
          { name, url: stationPageUrl },
        ]),
        {
          ...dataset({
            // Structured data follows the page's language (audit5 M2) — a
            // Swedish page publishing an English Dataset name and English
            // variable names is the mismatch prerender.applySeo already fixed
            // for the shell's description.
            name: translate('dataset_station_name', lang, { name }),
            description,
            pageUrl: stationPageUrl,
            dateFrom: stats.date_from,
            dateTo: stats.date_to,
            // Punctuality only ever comes from live Trafiklab departures (no KoDa backfill).
            creators: [TRAFIKLAB_CREATOR],
            variables: (
              [
                'var_departures_per_day',
                'var_on_time_per_day',
                'var_delayed_per_day',
                'var_canceled_per_day',
                'var_on_time_pct_per_day',
                'var_avg_delay_per_day',
              ] as Key[]
            ).map((k) => translate(k, lang)),
          }),
          // M12: tie the measurements to the place they were measured at.
          about: { '@id': `${stationPageUrl}#station` },
        },
        trainStation,
        siteIdentity,
      ],
    },
    body,
  });
}

/**
 * The live section of a station page (audit3 C1): the corridor status band and
 * the most recent departures observed at this stop, as static HTML injected
 * between the H1 and the archive summary row. The band is the whole corridor's
 * state (one /api/transit/live snapshot serves all four stations) — only the
 * departure table is per-stop. When no snapshot is available the band is
 * dropped and the page keeps its archive content.
 */
export function renderStationLive(stats: ArchiveStationStats, live: LiveStatus | null, lang: Lang): string {
  const name = stationName(stats, lang);
  // Same model as the board's StatusBanner (band colour + translated status +
  // disruption count), re-emitted as static HTML for the no-JS archive shell.
  const band = live
    ? (() => {
        const m = bannerModel(live, lang);
        return `<p class="status-band ${m.bandClass}" role="status"><span>${esc(m.text)}</span>${
          m.count ? `<span class="band-count">${esc(m.count)}</span>` : ''
        }</p>`;
      })()
    : '';
  const rows = stats.recent.map((d) => departureRow(d, lang)).join('');
  const body = `<tbody>${rows || `<tr><td colspan="6" class="meta">${esc(translate('station_no_data_note', lang))}</td></tr>`}</tbody>`;
  const head = [
    'th_time',
    'th_line',
    'th_train',
    'station_col_destination',
    'th_status',
    'th_delay',
  ]
    .map((k) => `<th scope="col">${esc(translate(k as Key, lang))}</th>`)
    .join('');
  return `
    <section class="station-live">
      <h2>${esc(translate('station_live_heading', lang))}</h2>
      ${band}
      <p class="intro">${esc(translate('station_live_intro', lang, { name }))}</p>
      <h2>${esc(translate('station_departures_heading', lang))}</h2>
      ${
        stats.as_of
          ? `<p class="meta">${esc(
              translate('station_as_of', lang, {
                time: formatTime(stats.as_of, lang) || NO_DATA_MARK,
                date: formatDate(stats.as_of, lang) || NO_DATA_MARK,
              }),
            )}</p>`
          : ''
      }
      <p class="meta">${esc(translate('station_observed_note', lang))}</p>
      <div class="table-scroll">
        <table>
          <thead><tr>${head}</tr></thead>
${body}
        </table>
      </div>
    </section>`;
}

/**
 * Status badge for one observed departure: the same delay-band badge the board
 * renders in its DELAY column (colour escalates with the delay, exact value in
 * the tooltip). Cancellations are checked first — they carry a zero delay, so
 * banding them would read "on time".
 */
function departureStatus(d: Departure, lang: Lang): string {
  if (d.status === 'canceled' || d.canceled === 1) {
    return `<span class="badge badge-cancellation">${esc(translate('type_cancellation', lang))}</span>`;
  }
  const band: DelayBand | null = delayBand(d.delay_seconds);
  if (!band) return NO_DATA_MARK;
  return `<span class="badge ${BAND_BADGE_CLASS[band]}" title="${esc(formatExactDelay(d.delay_seconds, lang))}">${esc(translate(`delay_band_${band}` as Key, lang))}</span>`;
}

/** One row of the latest-observed-departures table (C1 + the H2 train number). */
function departureRow(d: Departure, lang: Lang): string {
  const time = formatTime(d.sched_time ?? '', lang) || NO_DATA_MARK;
  const train = d.technical_number ? `#${esc(d.technical_number)}` : NO_DATA_MARK;
  const dest = d.destination ? esc(d.destination) : NO_DATA_MARK;
  const line = d.line ? esc(d.line) : NO_DATA_MARK;
  const delay = d.status === 'canceled' ? NO_DATA_MARK : formatDelaySeconds(d.delay_seconds, lang);
  return `<tr><td class="meta">${esc(time)}</td><td>${line}</td><td class="meta">${train}</td><td>${dest}</td><td>${departureStatus(d, lang)}</td><td>${esc(delay)}</td></tr>`;
}
