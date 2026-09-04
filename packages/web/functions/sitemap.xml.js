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
import { withSecurityHeaders } from '../src/lib/http-errors';
import { isValidLocalDate } from '../src/i18n/format';

const COLLECTOR_BASE = 'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit';

/** A W3C date, the only shape a sitemap <lastmod> may carry. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The two shapes dist/build-meta.json's stamp may take: a date, or an ISO
 * instant on one. Nothing else — not a date with junk glued on, not an
 * instant with an impossible hour — is a stamp this build wrote. */
const STAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?)?$/;

/**
 * The date part of a value that IS a date; null for anything else. Shape and
 * CALENDAR are both checked (audit5): DATE_RE alone let "2026-02-30" through
 * to buildSitemap, which then dropped it at w3cDate — the same impossible date
 * rejected one layer down, after two callers had already treated it as real.
 */
function asDate(value) {
  return typeof value === 'string' && DATE_RE.test(value) && isValidLocalDate(value) ? value : null;
}

/**
 * The build stamp's date part, or null when the stamp is not one. VALIDATED
 * WHOLE before slicing (audit5): `slice(0, 10)` read "2026-09-01T25:00:00Z"
 * and "2026-09-01junk" as "2026-09-01", a date the build never wrote. A
 * stamp that is not a real date — and a real time, when it carries one —
 * contributes nothing and the caller falls back.
 */
function stampDate(value) {
  const m = typeof value === 'string' ? STAMP_RE.exec(value) : null;
  const date = m?.[1];
  if (!date || !asDate(date)) return null;
  const hour = m[2];
  // No time at all is the shape the build actually writes (sv-SE, date only).
  if (hour === undefined) return date;
  const minute = Number(m[3]);
  const second = m[4] === undefined ? 0 : Number(m[4]);
  return Number(hour) < 24 && minute < 60 && second < 60 ? date : null;
}

function parseLines(json) {
  const b = json ?? {};
  // audit4 N-M3: keep the per-line disruption count and its last-data date, so
  // a line the collector has never observed can omit <lastmod> instead of
  // claiming a daily-fresh page. last_seen must be a plain date — anything else
  // is dropped rather than emitted as a <lastmod> the protocol rejects.
  return Array.isArray(b.lines)
    ? b.lines
        .filter((l) => l && typeof l.line === 'string' && typeof l.disruptions === 'number')
        .map((l) => ({
          line: l.line,
          disruptions: l.disruptions,
          last_seen: asDate(l.last_seen),
        }))
    : [];
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
 *
 * The stamp is reduced to its date part and only kept when the whole stamp
 * really is one (audit5 L11, audit5 review): the sitemap no longer clamps
 * whatever string arrives, so a malformed build stamp must degrade to
 * `today()` rather than be sliced into something that looks like a date.
 */
async function buildDate(context) {
  try {
    const origin = new URL(context.request.url).origin;
    const res = await context.env.ASSETS.fetch(new Request(`${origin}/build-meta.json`));
    if (res.ok) {
      const meta = await res.json();
      const generated = meta && typeof meta.generated === 'string' ? stampDate(meta.generated) : null;
      if (generated) return generated;
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
  // Every response shape this Function emits carries the security set (audit5
  // H5): the sitemap used to be the one URL on the site with none at all.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: withSecurityHeaders({ 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' }),
    });
  }

  const headers = withSecurityHeaders({
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=600',
  });

  // audit3 H4 — every URL carries <lastmod>. The static pages get the deploy
  // date; the archive pages get the collector's data-window end (date_to,
  // which every /line, /station and /history window is anchored on). Either
  // source degrades to the other, then to today, so the attribute is always
  // present and never claims a change newer than what we actually know.
  const fallback = (await buildDate(context)) ?? today();

  let res;
  try {
    // history is isolated in its own settled lane: a rejection there only
    // costs the archive <lastmod> date, never the line/station URLs.
    const [linesRes, stationsRes, historySettled] = await Promise.all([
      fetch(`${COLLECTOR_BASE}/lines`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${COLLECTOR_BASE}/stations`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${COLLECTOR_BASE}/history?days=7`, { signal: AbortSignal.timeout(10_000) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (!linesRes.ok || !stationsRes.ok) {
      throw new Error('collector non-2xx');
    }
    const [linesJson, stationsJson] = await Promise.all([linesRes.json(), stationsRes.json()]);
    const lastmod = { deployed: fallback, data: asDate(historySettled?.date_to) ?? fallback };
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
