/**
 * /sitemap.xml — dynamic sitemap served by a Pages Function.
 *
 * Lists every indexable URL: the three static pages plus the archive routes.
 * The archive sets (/line/*, /station/* and /history/{days}) are discovered
 * from the collector Worker at request time, so the sitemap stays in sync
 * with live data (GSC ready) without a deploy-time snapshot.
 *
 * This Function shadows the former static public/sitemap.xml. On any
 * collector failure the static base (home + methodology + privacy) is still
 * served rather than a 502, so the sitemap never disappears entirely.
 */
import { buildSitemap } from '../src/lib/sitemap';

const COLLECTOR_BASE = 'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit';

function parseLines(json) {
  const b = json ?? {};
  return Array.isArray(b.lines) ? b.lines.filter((l) => l && typeof l.line === 'string') : [];
}

function parseStations(json) {
  const b = json ?? {};
  return Array.isArray(b.stations) ? b.stations.filter((s) => s && typeof s.slug === 'string') : [];
}

function staticBase() {
  return buildSitemap([], []);
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
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=600',
  };

  let res;
  try {
    const [linesRes, stationsRes] = await Promise.all([
      fetch(`${COLLECTOR_BASE}/lines`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${COLLECTOR_BASE}/stations`, { signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!linesRes.ok || !stationsRes.ok) {
      throw new Error('collector non-2xx');
    }
    const [linesJson, stationsJson] = await Promise.all([linesRes.json(), stationsRes.json()]);
    res = buildSitemap(parseLines(linesJson), parseStations(stationsJson));
  } catch {
    // Collector down — fall back to the static base rather than 502, so the
    // sitemap always exists for GSC.
    res = staticBase();
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  return new Response(res, { status: 200, headers });
}
