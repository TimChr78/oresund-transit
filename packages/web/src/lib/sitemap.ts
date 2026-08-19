/**
 * Dynamic sitemap builder — /sitemap.xml served by a Pages Function.
 *
 * Lists every indexable URL: the three static pages plus the archive routes.
 * The archive sets (/line/*, /station/* and the /history/{days} pages) are
 * discovered from the collector at request time, so the sitemap stays in sync
 * with live data and is always "GSC ready" without a deploy-time snapshot.
 *
 * Pure function — no I/O — so it is trivially testable.
 */
import { SITE_URL, DAY_RANGES, type ArchiveLine, type ArchiveStation } from './archive';

/** changefreq hints — archives are stable enough for daily crawls. */
const ARCHIVE_CHANGEFREQ = 'daily';
const STATIC_CHANGEFREQ = {
  home: 'hourly',
  page: 'monthly',
};

export function buildSitemap(lines: ArchiveLine[], stations: ArchiveStation[]): string {
  const locs: string[] = [];

  const add = (url: string, changefreq: string): void => {
    locs.push(`  <url><loc>${url}</loc><changefreq>${changefreq}</changefreq></url>`);
  };

  add(`${SITE_URL}/`, STATIC_CHANGEFREQ.home);
  add(`${SITE_URL}/methodology`, STATIC_CHANGEFREQ.page);
  add(`${SITE_URL}/privacy`, STATIC_CHANGEFREQ.page);

  add(`${SITE_URL}/history`, ARCHIVE_CHANGEFREQ);
  for (const d of DAY_RANGES) add(`${SITE_URL}/history/${d}`, ARCHIVE_CHANGEFREQ);

  add(`${SITE_URL}/line`, ARCHIVE_CHANGEFREQ);
  for (const l of lines) add(`${SITE_URL}/line/${encodeURIComponent(l.line)}`, ARCHIVE_CHANGEFREQ);

  add(`${SITE_URL}/station`, ARCHIVE_CHANGEFREQ);
  for (const s of stations) add(`${SITE_URL}/station/${s.slug}`, ARCHIVE_CHANGEFREQ);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.join('\n')}
</urlset>
`;
}
