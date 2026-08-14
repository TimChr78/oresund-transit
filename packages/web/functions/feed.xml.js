/**
 * /feed.xml — RSS 2.0 feed of recent disruptions (Öresundståg / Pågatåg),
 * newest first. Thin wiring: fetch from the collector Worker, render with the
 * pure renderer (src/lib/rss.ts), respond with the RSS content-type.
 *
 * The feed is cached for 5 minutes (client/browser hint; the collector polls
 * every 5 min). On any collector failure — unreachable, non-2xx, or an
 * unparseable body — we answer 502 (plain text) rather than serving a broken
 * or empty feed as 200.
 */
import { renderRssFeed } from '../src/lib/rss';

const COLLECTOR_URL =
  'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit/disruptions?limit=50';

const FEED_OPTS = {
  title: 'Øresund.live — disruptions',
  description: 'Recent disruptions across the Øresund (Öresundståg / Pågatåg), newest first.',
  link: 'https://oresund.live/',
};

function unavailable() {
  return new Response('Feed temporarily unavailable', {
    status: 502,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' },
    });
  }

  const headers = {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  };

  let res;
  try {
    res = await fetch(COLLECTOR_URL, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return unavailable();
  }
  if (!res.ok) {
    return unavailable();
  }

  // HEAD mirrors GET's headers without the body.
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return unavailable();
  }
  const disruptions = Array.isArray(data?.disruptions) ? data.disruptions : [];
  const xml = renderRssFeed(disruptions, FEED_OPTS);
  return new Response(xml, { status: 200, headers });
}
