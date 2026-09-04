/**
 * /feed.xml — RSS 2.0 feed of recent Øresundståg disruptions, newest first.
 * Thin wiring: fetch from the collector Worker, render with the pure renderer
 * (src/lib/rss.ts), respond with the RSS content-type. The channel description
 * names Øresundståg only (audit6 M5) — the collector has been single-agency
 * since the August stop-id correction, and the feed is a crawler-visible
 * surface that must not claim coverage the data does not have.
 *
 * The feed is cached for 5 minutes (client/browser hint; the collector polls
 * every 5 min). On any collector failure — unreachable, non-2xx, or an
 * unparseable body — we answer 502 rather than serving a broken or empty feed
 * as 200. The body is the same branded, localized page the archive routes use
 * (audit4 N-H4): the status code is what a feed reader keys on, so a human who
 * opens the URL in a browser gets an explanation instead of a bare line.
 */
import { knownArchiveLines, renderRssFeed } from '../src/lib/rss';
import { acceptLang, serviceUnavailableResponse, withSecurityHeaders } from '../src/lib/http-errors';
import { RSS_TITLE } from '../src/i18n';

const COLLECTOR_URL =
  'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit/disruptions?limit=50';
const LINES_URL =
  'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit/lines';

const FEED_OPTS = {
  // The same string the pages' RSS autodiscovery <link> carries (audit5 L6).
  title: RSS_TITLE,
  description: 'Recent disruptions across the Øresund (Öresundståg), newest first.',
  link: 'https://oresund.live/',
};

/**
 * The lines the collector has observed, which (with the canonical set, see
 * knownArchiveLines) is exactly what /line/{line} answers for. Best-effort: a
 * failure here degrades the feed to linking the canonical archives — every one
 * of which exists — rather than emitting item links the archive route 404s.
 */
async function observedLines() {
  try {
    const res = await fetch(LINES_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.lines)
      ? data.lines.filter((l) => l && typeof l.line === 'string').map((l) => l.line)
      : [];
  } catch {
    return [];
  }
}

function unavailable(request) {
  return serviceUnavailableResponse(acceptLang(request.headers.get('accept-language')), '/feed.xml');
}

export async function onRequest(context) {
  const { request } = context;
  // Every response shape this Function emits carries the security set (audit5
  // H5): only the collector-failure branches had it, so /feed.xml flipped
  // between protected and unprotected with collector health.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: withSecurityHeaders({ 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' }),
    });
  }

  const headers = withSecurityHeaders({
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });

  let res;
  try {
    res = await fetch(COLLECTOR_URL, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return unavailable(request);
  }
  if (!res.ok) {
    return unavailable(request);
  }

  // HEAD mirrors GET's headers without the body.
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return unavailable(request);
  }
  const disruptions = Array.isArray(data?.disruptions) ? data.disruptions : [];
  // Every item link stays inside the archive route's own discovery set, so a
  // feed item can never deep-link a /line/{line} URL that answers 404.
  const xml = renderRssFeed(disruptions, { ...FEED_OPTS, knownLines: knownArchiveLines(await observedLines()) });
  return new Response(xml, { status: 200, headers });
}
