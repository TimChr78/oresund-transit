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

/** Today as a W3C date — the last-resort <lastmod> if both real sources fail. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The deploy date (audit3 H4) — stamped into dist/build-meta.json by
 * scripts/generate-llms.ts at build time and read back here through the
 * ASSETS binding, so the static URLs' <lastmod> advances only on a real
 * deploy rather than on every request. Undefined when the binding is absent
 * (unit tests) or the asset is missing.
 */
async function buildDate(context) {
  try {
    const origin = new URL(context.request.url).origin;
    const res = await context.env.ASSETS.fetch(new Request(`${origin}/build-meta.json`));
    if (res.ok) {
      const meta = await res.json();
      if (meta && typeof meta.generated === 'string') return meta.generated;
    }
  } catch {
    // No ASSETS binding / unreadable asset — the caller falls back.
  }
  return undefined;
}

function staticBase(lastmod) {
  return buildSitemap([], [], lastmod);
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

  // audit3 H4 — every URL carries <lastmod>. The static pages get the deploy
  // date; the archive pages get the collector's data-window end (date_to,
  // which every /line, /station and /history window is anchored on). Either
  // source degrades to the other, then to today, so the attribute is always
  // present and never claims a change newer than what we actually know.
  const fallback = (await buildDate(context)) ?? today();

  let res;
  try {
    const [linesRes, stationsRes, historyRes] = await Promise.all([
      fetch(`${COLLECTOR_BASE}/lines`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${COLLECTOR_BASE}/stations`, { signal: AbortSignal.timeout(10_000) }),
      // Only used for the archive <lastmod> — a failure here must not drop
      // the archive URLs the way a lines/stations failure does.
      fetch(`${COLLECTOR_BASE}/history?days=7`, { signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!linesRes.ok || !stationsRes.ok) {
      throw new Error('collector non-2xx');
    }
    const [linesJson, stationsJson] = await Promise.all([linesRes.json(), stationsRes.json()]);
    let dataDate;
    try {
      if (historyRes.ok) dataDate = (await historyRes.json())?.date_to;
    } catch {
      // Unusable history payload — the archive URLs fall back to `fallback`.
    }
    const lastmod = { deployed: fallback, data: typeof dataDate === 'string' ? dataDate : fallback };
    res = buildSitemap(parseLines(linesJson), parseStations(stationsJson), lastmod);
  } catch {
    // Collector down — fall back to the static base rather than 502, so the
    // sitemap always exists for GSC.
    res = staticBase({ deployed: fallback, data: fallback });
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  return new Response(res, { status: 200, headers });
}
