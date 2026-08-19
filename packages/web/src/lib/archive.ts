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
import { esc } from './html';

export const SITE_URL = 'https://oresund.live';

/** The day ranges the history archive supports (mirrors the collector API). */
export const DAY_RANGES = [7, 14, 30, 90] as const;
export type ArchiveDays = (typeof DAY_RANGES)[number];

export interface ArchiveLine {
  line: string;
  disruptions: number;
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
    <meta property="og:site_name" content="Øresund.live" />`;
  const jsonLdBlock = jsonLd === undefined ? '' : `\n    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${attr(title)}</title>
    <meta name="description" content="${attr(description)}" />
    <link rel="canonical" href="${attr(canonical)}" />
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

/** BreadcrumbList JSON-LD for a page nested under the dashboard. */
function breadcrumb(crumbs: { name: string; url: string }[]): unknown {
  const items = [{ name: 'Øresund.live', url: `${SITE_URL}/` }, ...crumbs].map((c, i) =>
    crumb(c.name, c.url, i + 1),
  );
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
}

/** The factual site identity fragment shared by archive JSON-LD. */
const siteIdentity = {
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: 'Øresund.live',
  url: `${SITE_URL}/`,
};

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
  const body = rows
    .map((r) => {
      const cells = [r.date, r.count, r.cancellations, r.delays, r.alerts, fmtDelay(r.avg_delay)]
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
    <p class="sub">${history.total_disruptions} disruptions between ${fmtDate(history.date_from)} and ${fmtDate(history.date_to)}. Data från Trafiklab.se.</p>
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
        siteIdentity,
      ],
    },
    body,
  });
}

/** /line — index of the per-line archives. */
export function renderLineIndex(lines: ArchiveLine[]): string {
  const description = 'Per-line disruption archives for the Øresund crossing — historical cancellations, delays and alerts for each Öresundståg / Pågatåg service.';
  const list = lines
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
          numberOfItems: lines.length,
          itemListElement: lines.map((l, i) => ({
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
  const description = `Disruption history for line ${line} on the Øresund crossing — ${stats.total_disruptions} disruptions between ${fmtDate(stats.date_from)} and ${fmtDate(stats.date_to)}.`;
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › <a href="/line">Lines</a> › Line ${esc(line)}</p>
    <h1>Line ${esc(line)} — disruption archive</h1>
    <p class="sub">${stats.total_disruptions} disruptions between ${fmtDate(stats.date_from)} and ${fmtDate(stats.date_to)} (last ${stats.days} days). Data från Trafiklab.se.</p>
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
${allLines.filter((l) => l.line !== line).map((l) => `      <li><a href="/line/${encodeURIComponent(l.line)}">Line ${esc(l.line)}</a></li>`).join('\n')}
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
  const description = 'Per-station punctuality archives for the Øresund crossing — on-time performance, cancellations and delays at Hyllie and København H.';
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
  const description = `Punctuality history for ${stats.stop_name} on the Øresund crossing — ${stats.total_departures} departures, ${stats.on_time_pct}% on time over the last ${stats.days} days.`;
  const dailyRows = stats.daily
    .map((r) => {
      const cells = [r.date, r.total, r.on_time, r.delayed, r.canceled, `${r.on_time_pct}%`, fmtDelay(r.avg_delay_seconds)]
        .map((v, i) => `<td${i === 0 ? ' class="meta"' : ''}>${esc(typeof v === 'number' ? String(v) : v)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const body = `
    <p class="crumb"><a href="/">Øresund.live</a> › <a href="/station">Stations</a> › ${esc(stats.stop_name)}</p>
    <h1>${esc(stats.stop_name)} — punctuality archive</h1>
    <p class="sub">Observed departures over the last ${stats.days} days (${fmtDate(stats.date_from)}–${fmtDate(stats.date_to)}). Data från Trafiklab.se.</p>
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
    title: `${stats.stop_name} — punctuality archive — Øresund.live`,
    description,
    canonical: `${SITE_URL}/station/${stats.slug}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumb([
          { name: 'Stations', url: `${SITE_URL}/station` },
          { name: stats.stop_name, url: `${SITE_URL}/station/${stats.slug}` },
        ]),
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
