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
import { SITE_URL, DAY_RANGES, unionCanonicalLines, CANONICAL_LINES, type ArchiveLine, type ArchiveStation } from './archive';
import { META } from './seo';

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

/** Clamp a timestamp to the W3C date form the sitemap protocol expects. */
function w3cDate(value: string): string {
  return value.slice(0, 10);
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
 * The minimal xhtml:link alternate set for an archive URL. Archive routes
 * exist as one URL per page (no sv/da twins — localized variants only exist
 * for the static pages, and the board switches language client-side), so each
 * announces itself via en + a self-referencing x-default, same as the HTML
 * <head> emission (seo.hreflangSelf).
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
  const deployed = w3cDate(lastmod.deployed);
  const data = w3cDate(lastmod.data);

  // <lastmod> precedes <changefreq> — the order the sitemap XSD defines.
  const add = (url: string, changefreq: string, alternates?: string): void => {
    locs.push(
      `  <url><loc>${url}</loc><lastmod>${data}</lastmod><changefreq>${changefreq}</changefreq>${alternates ? `\n${alternates}` : ''}</url>`,
    );
  };

  // Static pages: one <url> per language, each carrying the full hreflang
  // cluster (en/sv/da/x-default).
  const addStatic = (basePath: string, changefreq: string): void => {
    for (const lang of LANGS) {
      const url = lang === 'en' ? `${SITE_URL}${basePath}` : `${SITE_URL}/${lang}${basePath}`;
      locs.push(`  <url><loc>${url}</loc><lastmod>${deployed}</lastmod><changefreq>${changefreq}</changefreq>\n${hreflangLinks(basePath)}</url>`);
    }
  };

  addStatic('/', STATIC_CHANGEFREQ.home);
  addStatic('/methodology', STATIC_CHANGEFREQ.page);
  addStatic('/privacy', STATIC_CHANGEFREQ.page);

  // /history itself 301s to /history/30 (H5) - only canonical window URLs are indexable.
  for (const d of DAY_RANGES) {
    const url = `${SITE_URL}/history/${d}`;
    add(url, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(url));
  }


  add(`${SITE_URL}/line`, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(`${SITE_URL}/line`));
  for (const l of allLines) {
    const url = `${SITE_URL}/line/${encodeURIComponent(l.line)}`;
    add(url, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(url));
  }

  add(`${SITE_URL}/station`, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(`${SITE_URL}/station`));
  for (const s of stations) {
    const url = `${SITE_URL}/station/${encodeURIComponent(s.slug)}`;
    add(url, ARCHIVE_CHANGEFREQ, archiveAlternateLinks(url));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${locs.join('\n')}
</urlset>
`;
}

/**
 * The monitored stops, as a STATIC set for build-time artifacts (llms.txt
 * only — the sitemap keeps discovering stations from the collector at request
 * time). /station/{slug} pages exist for exactly these slugs; mirror of the
 * collector's MONITORED_STOPS (packages/collector/src/index.ts).
 */
const STATIC_STATIONS: readonly ArchiveStation[] = [
  { slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' },
  { slug: 'kobenhavn-h', stop_id: '860000626', stop_name: 'København H' },
  { slug: 'malmo-c', stop_id: '740000003', stop_name: 'Malmö C' },
  { slug: 'kastrup', stop_id: '860000858', stop_name: 'Københavns Lufthavn (Kastrup)' },
];

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
 */
export function buildLlmsTxt(): string {
  const lines = CANONICAL_LINES.map((l) => `- [Line ${l}](/line/${encodeURIComponent(l)})`).join('\n');
  const stations = STATIC_STATIONS.map((s) => `- [${s.stop_name}](/station/${encodeURIComponent(s.slug)})`).join('\n');
  const windows = DAY_RANGES.map((d) => `- [Last ${d} days](/history/${d})`).join('\n');

  return `# Øresund.live

> ${META.dashboard.en.description}

## Live status

- [Live departure board](/): delays, cancellations and alerts for Øresundståg departures across the Sound

## Archives per line/station

- [Line archives](/line): historical disruptions per line
${lines}
- [Station archives](/station): historical punctuality per station
${stations}

## History windows

- [Disruption history](/history): daily disruption totals
${windows}

## Methodology

- [Methodology](/methodology): how every metric on the dashboard is defined

## Privacy

- [Privacy](/privacy): what the site stores — language choice, cookieless analytics, no personal data
`;
}
