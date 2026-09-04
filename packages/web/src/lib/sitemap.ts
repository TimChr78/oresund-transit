/**
 * Dynamic sitemap builder — /sitemap.xml served by a Pages Function.
 *
 * Lists every indexable URL: the static pages (in en + localized sv/da with
 * hreflang xhtml:link annotations) plus the archive routes. The archive sets
 * (/line/*, /station/* and the /history/{days} pages) are discovered from the
 * collector at request time, so the sitemap stays in sync with live data and
 * is always "GSC ready" without a deploy-time snapshot.
 *
 * Pure function — no I/O — so it is trivially testable.
 */
import { BRAND_NAME, translate, type Lang } from '../i18n';
import { isValidLocalDate } from '../i18n/format';
import { stationNameKey } from '../components/StationPicker';
import {
  SITE_URL,
  DAY_RANGES,
  unionCanonicalLines,
  CANONICAL_LINES,
  isBusLine,
  type ArchiveLine,
  type ArchiveStation,
} from './archive';
import { META, localizedPath } from './seo';

/** changefreq hints — archives are stable enough for daily crawls. */
const ARCHIVE_CHANGEFREQ = 'daily';
const STATIC_CHANGEFREQ = {
  home: 'hourly',
  page: 'monthly',
};
const LANGS = ['en', 'sv', 'da'] as const;

/**
 * Last-modified dates for the sitemap's two page families (audit3 H4).
 * `<lastmod>` is the one sitemap signal Google acts on — provided it is
 * accurate — so each family gets the timestamp that actually moves it:
 *
 * - `deployed` — the build/deploy date. The static pages change only when the
 *   site ships.
 * - `data` — the collector data-window end. The archive pages change when the
 *   data does (every /line, /station and /history window is anchored on the
 *   same date_to).
 *
 * Day precision (`YYYY-MM-DD`): the data model has no finer resolution, and
 * fabricating minute-level timestamps would make the attribute unverifiable.
 */
export interface SitemapLastmod {
  deployed: string;
  data: string;
}

/** A W3C date, the only shape a sitemap <lastmod> may carry (audit5 M5/L11). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The W3C date form the sitemap protocol expects, or null when the value is
 * not one. VALIDATED, not clamped (audit5 L11): `slice(0, 10)` turned whatever
 * string arrived — an ISO stamp, a collector field that is not a date at all —
 * into something that merely looks like one, and `<lastmod>` is the one
 * sitemap signal Google acts on. A null return drops the element: saying
 * nothing about freshness is honest, a fabricated date is not.
 */
function w3cDate(value: string): string | null {
  return DATE_RE.test(value) && isValidLocalDate(value) ? value : null;
}

/**
 * The hreflang xhtml:link cluster for a static page (its en canonical base
 * path, e.g. '/' or '/methodology'), pointing at every variant + x-default.
 * Required on each URL of a localized page so Google maps the variants.
 */
function hreflangLinks(basePath: string): string {
  const cluster: [string, string][] = [
    ['en', `${SITE_URL}${basePath}`],
    ['sv', `${SITE_URL}/sv${basePath}`],
    ['da', `${SITE_URL}/da${basePath}`],
    ['x-default', `${SITE_URL}${basePath}`],
  ];
  return cluster.map(([h, href]) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${href}" />`).join('\n');
}

/**
 * The minimal xhtml:link alternate set for an archive URL. Most archive routes
 * exist as one URL per page (no sv/da twins — localized variants exist only
 * for the static pages, the station pages and the /history hub), so each
 * announces itself via en + a self-referencing x-default, same as the HTML
 * <head> emission (archive.pageShell's hreflangSelf).
 */
function archiveAlternateLinks(url: string): string {
  return [
    `    <xhtml:link rel="alternate" hreflang="en" href="${url}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${url}" />`,
  ].join('\n');
}

export function buildSitemap(lines: ArchiveLine[], stations: ArchiveStation[], lastmod: SitemapLastmod): string {
  const locs: string[] = [];
  const allLines = unionCanonicalLines(lines);
  // A lastmod source that is not a date contributes nothing rather than a
  // made-up value — see w3cDate.
  const deployed = w3cDate(lastmod.deployed);
  const data = w3cDate(lastmod.data);

  // <lastmod> precedes <changefreq> — the order the sitemap XSD defines. A null
  // lastmod omits the element entirely: <lastmod></lastmod> is worse than none,
  // because Google reads an empty/false date as "never changes".
  const add = (url: string, changefreq: string, alternates?: string, lastmodDate: string | null = data): void => {
    const lastmodTag = lastmodDate ? `<lastmod>${lastmodDate}</lastmod>` : '';
    locs.push(`  <url><loc>${url}</loc>${lastmodTag}<changefreq>${changefreq}</changefreq>${alternates ? `\n${alternates}` : ''}</url>`);
  };

  // Static pages: one <url> per language, each carrying the full hreflang
  // cluster (en/sv/da/x-default).
  const addStatic = (basePath: string, changefreq: string): void => {
    const lastmodTag = deployed ? `<lastmod>${deployed}</lastmod>` : '';
    for (const lang of LANGS) {
      const url = lang === 'en' ? `${SITE_URL}${basePath}` : `${SITE_URL}/${lang}${basePath}`;
      locs.push(`  <url><loc>${url}</loc>${lastmodTag}<changefreq>${changefreq}</changefreq>\n${hreflangLinks(basePath)}</url>`);
    }
  };

  addStatic('/', STATIC_CHANGEFREQ.home);
  addStatic('/methodology', STATIC_CHANGEFREQ.page);
  addStatic('/privacy', STATIC_CHANGEFREQ.page);

  // The /history hub is, with the station pages, the one archive family with
  // localized twins: en + sv + da, each URL carrying the full hreflang cluster
  // so Google maps the three variants to each other.
  for (const lang of LANGS) {
    const url = lang === 'en' ? `${SITE_URL}/history` : `${SITE_URL}/${lang}/history`;
    add(url, ARCHIVE_CHANGEFREQ, hreflangLinks('/history'));
  }

  // The /history/{days} windows stay single-URL (H5) — the hub is their index,
  // so the windows list no localized variants of their own.
  for (const d of DAY_RANGES) {
    const url = `${SITE_URL}/history/${d}`;
    add(url, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(url));
  }


  add(`${SITE_URL}/line`, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(`${SITE_URL}/line`));
  for (const l of allLines) {
    // audit5 M4: only the lines that have actually recorded a disruption are
    // submitted. The canonical set is unioned in so its pages stay crawlable
    // and linked, but 7 of the 12 had never seen a disruption — zero-content
    // URLs telling the search engine "crawl me daily" — and an XML entry is a
    // recommendation, not a directory listing. The /line index and the internal
    // link graph still reach every page, so nothing becomes orphaned.
    if (l.disruptions === 0 && !l.last_seen) continue;
    const url = `${SITE_URL}/line/${encodeURIComponent(l.line)}`;
    // audit4 N-M3: a line page is only as fresh as the line's own data. The
    // last day that actually recorded a disruption is the honest <lastmod>;
    // a line the collector has never seen (the canonical union) has no data at
    // all, so its URL publishes no lastmod instead of today's — that page is
    // static boilerplate, and a daily-fresh claim on it is unverifiable. An
    // older collector that reports counts but no date falls back to the
    // data-window end for the lines it did discover.
    const lineLastmod = l.last_seen ?? (l.disruptions > 0 ? data : null);
    add(url, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(url), lineLastmod ? w3cDate(lineLastmod) : null);
  }

  add(`${SITE_URL}/station`, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(`${SITE_URL}/station`));
  // The per-station pages are the one archive family with localized twins
  // (audit3 C1): each slug emits en + sv + da, each URL carrying the full
  // hreflang cluster so Google maps the three variants to each other.
  for (const s of stations) {
    const base = `/station/${encodeURIComponent(s.slug)}`;
    for (const lang of LANGS) {
      const url = lang === 'en' ? `${SITE_URL}${base}` : `${SITE_URL}/${lang}${base}`;
      add(url, ARCHIVE_CHANGEFREQ, hreflangLinks(base));
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${locs.join('\n')}
</urlset>
`;
}

/**
 * The monitored stops, as a STATIC set for build-time artifacts (llms.txt and
 * the TrainStation JSON-LD — the sitemap keeps discovering stations from the
 * collector at request time). /station/{slug} pages exist for exactly these
 * slugs; mirror of the collector's MONITORED_STOPS
 * (packages/collector/src/index.ts).
 *
 * `place` and `geo` are the entity facts the station pages' TrainStation
 * JSON-LD needs (audit3 M12). Coordinates are Wikidata P625 for the station
 * entity, rounded to 4 decimals (~11 m) — verified, not estimated from a map:
 *   hyllie      Q1844369  55°33'45.7"N 12°58'33"E
 *   malmo-c     Q575797   55°36'32.0"N 12°59'58.9"E
 *   kastrup     Q2431774  55°37'46.6"N 12°38'57.8"E (railway station, T3)
 *   kobenhavn-h Q171332   55°40'21.7"N 12°33'52.2"E
 */
export interface StaticStation extends ArchiveStation {
  /** The containing place the TrainStation node points at. */
  place: string;
  /** Station coordinates, Wikidata P625 rounded to 4 decimals. */
  geo: { lat: number; lng: number };
}

export const STATIC_STATIONS: readonly StaticStation[] = [
  {
    slug: 'hyllie',
    stop_id: '740001586',
    stop_name: 'Malmö Hyllie',
    place: 'Malmö, Sweden',
    geo: { lat: 55.5627, lng: 12.9758 },
  },
  {
    slug: 'kobenhavn-h',
    stop_id: '860000626',
    stop_name: 'København H',
    place: 'Copenhagen, Denmark',
    geo: { lat: 55.6727, lng: 12.5645 },
  },
  {
    slug: 'malmo-c',
    stop_id: '740000003',
    stop_name: 'Malmö C',
    place: 'Malmö, Sweden',
    geo: { lat: 55.6089, lng: 12.9997 },
  },
  {
    slug: 'kastrup',
    stop_id: '860000858',
    stop_name: 'Københavns Lufthavn (Kastrup)',
    place: 'Tårnby Municipality, Denmark',
    geo: { lat: 55.6296, lng: 12.6494 },
  },
];

/** The localized-language label llms.txt uses to distinguish the 12 station URLs. */
const LLMS_LANG_LABEL: Record<Lang, string> = { en: 'English', sv: 'svenska', da: 'dansk' };

/** One-line description of a station page, in the page's own language. The
 * stop id is appended as its own sentence — nestling it in brackets after a
 * name that already ends in one (Kastrup) reads badly. */
const LLMS_STATION_DESC: Record<Lang, string> = {
  en: 'Punctuality archive and latest observed departures at {name} on the Øresund corridor. Trafiklab stop id {id}.',
  sv: 'Punktlighetsarkiv och senaste observerade avgångar vid {name} på Öresundskorridoren. Trafiklab-hållplats-id {id}.',
  da: 'Punktualitetsarkiv og seneste observerede afgange ved {name} på Øresundskorridoren. Trafiklab-stoppested-id {id}.',
};

/**
 * Build-time /llms.txt — the LLM-readable site index (llmstxt.org), generated
 * during `vite build` from the same route data as the sitemap: the site
 * title, a one-paragraph description and the grouped page list (Live status,
 * Archives per line/station, History windows, Methodology, Privacy).
 *
 * Unlike the sitemap (request-time, collector-discovered) this is a static
 * snapshot: lines come from CANONICAL_LINES and stations from STATIC_STATIONS,
 * so the file never depends on the collector being up at build time. Relative
 * URLs are used per the llmstxt.org spec. Emitted to dist/llms.txt by
 * scripts/generate-llms.ts.
 *
 * The station section (audit3 M9) enumerates every station URL there is —
 * four stops in en + sv + da, 12 pages — each with a one-line description in
 * the page's own language, so an LLM can answer "which station should I
 * check?" and pick the right language variant instead of guessing from bare
 * links.
 */
export function buildLlmsTxt(): string {
  // The bus lines are named as buses here too (audit5 M4): llms.txt is the
  // index an LLM reads to decide what a page is about, so "Line 6" would file a
  // bus under the Øresundståg head terms.
  const lines = CANONICAL_LINES.map(
    (l) => `- [${isBusLine(l) ? `Bus line ${l}` : `Line ${l}`}](/line/${encodeURIComponent(l)})`,
  ).join('\n');
  const stations = STATIC_STATIONS.flatMap((s) =>
    (['en', 'sv', 'da'] as const).map((lang) => {
      // The name comes from the dictionary, not the collector's stop_name: the
      // link text has to match the H1 of the page it points at (the rule
      // ArchiveLinks states), and stop_name is the English literal.
      const name = translate(stationNameKey(s.slug), lang);
      const desc = LLMS_STATION_DESC[lang].replace('{name}', name).replace('{id}', s.stop_id);
      return `- [${name} — ${LLMS_LANG_LABEL[lang]}](${localizedPath(`/station/${encodeURIComponent(s.slug)}`, lang)}): ${desc}`;
    }),
  ).join('\n');
  // Every window the archive serves — including /history/30, which used to be
  // listed a second time as its own entry (audit5 L1).
  const windows = DAY_RANGES.map((d) => `- [Last ${d} days](/history/${d})`).join('\n');

  return `# ${BRAND_NAME}

> ${META.dashboard.en.description}

## Live status

- [Live departure board](/): delays, cancellations and alerts for Øresundståg departures, updated every 5 minutes. Four stops are monitored across the crossing: Malmö Hyllie, Malmö C, Københavns Lufthavn (Kastrup) and København H.

## Archives per line/station

- [Line archives](/line): historical disruptions per line
${lines}
- [Station archives](/station): historical punctuality per station

### Stations (each page in three languages)

${stations}

## History windows

- [Disruption history](/history): the whole corridor for the last 30 days — departures, on-time share and disruptions across all four monitored stations (also in [svenska](/sv/history) and [dansk](/da/history)).
${windows}

## Methodology

- [Methodology](/methodology): how every metric on the dashboard is defined — the on-time threshold, the data source and its lag

## Privacy

- [Privacy](/privacy): what the site stores — language choice, cookieless analytics, no personal data
`;
}
