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
import { SITE_URL, DAY_RANGES, unionCanonicalLines, type ArchiveLine, type ArchiveStation } from './archive';

/** changefreq hints — archives are stable enough for daily crawls. */
const ARCHIVE_CHANGEFREQ = 'daily';
const STATIC_CHANGEFREQ = {
  home: 'hourly',
  page: 'monthly',
};
const LANGS = ['en', 'sv', 'da'] as const;

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

export function buildSitemap(lines: ArchiveLine[], stations: ArchiveStation[]): string {
  const locs: string[] = [];
  const allLines = unionCanonicalLines(lines);

  const add = (url: string, changefreq: string): void => {
    locs.push(`  <url><loc>${url}</loc><changefreq>${changefreq}</changefreq></url>`);
  };

  // Static pages: one <url> per language, each carrying the full hreflang
  // cluster (en/sv/da/x-default).
  const addStatic = (basePath: string, changefreq: string): void => {
    for (const lang of LANGS) {
      const url = lang === 'en' ? `${SITE_URL}${basePath}` : `${SITE_URL}/${lang}${basePath}`;
      locs.push(`  <url><loc>${url}</loc><changefreq>${changefreq}</changefreq>\n${hreflangLinks(basePath)}</url>`);
    }
  };

  addStatic('/', STATIC_CHANGEFREQ.home);
  addStatic('/methodology', STATIC_CHANGEFREQ.page);
  addStatic('/privacy', STATIC_CHANGEFREQ.page);

  add(`${SITE_URL}/history`, ARCHIVE_CHANGEFREQ);
  for (const d of DAY_RANGES) add(`${SITE_URL}/history/${d}`, ARCHIVE_CHANGEFREQ);

  add(`${SITE_URL}/line`, ARCHIVE_CHANGEFREQ);
  for (const l of allLines) add(`${SITE_URL}/line/${encodeURIComponent(l.line)}`, ARCHIVE_CHANGEFREQ);

  add(`${SITE_URL}/station`, ARCHIVE_CHANGEFREQ);
  for (const s of stations) add(`${SITE_URL}/station/${encodeURIComponent(s.slug)}`, ARCHIVE_CHANGEFREQ);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${locs.join('\n')}
</urlset>
`;
}
