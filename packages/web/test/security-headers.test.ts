import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleArchiveRequest, SECURITY_HEADERS, type FetchLike } from '../src/lib/archive-http';

/**
 * Security headers (audit4 N-C2).
 *
 * Two surfaces serve HTML, and Cloudflare treats them differently: the
 * `_headers` file in public/ (copied verbatim into dist/ by Vite) covers every
 * STATIC response, but Cloudflare never applies `_headers` to a Pages
 * Function's Response — so the ~30 archive URLs the Functions render need the
 * same set attached in code. These tests pin both halves, and pin them to each
 * other so they cannot drift.
 */
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

/** Parse a `_headers` file into a flat name → value map (last value wins). */
function parseHeadersFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const m = /^([A-Za-z-]+):\s*(.+)$/.exec(trimmed);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

const STATIC_HEADERS = parseHeadersFile(headers);

describe('security headers (Cloudflare Pages _headers)', () => {
  it('applies the hardened header set to every static route', () => {
    expect(headers).toMatch(/^\/\*/m);
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toContain('X-Frame-Options: DENY');
  });

  it('declares a CSP and a Permissions-Policy', () => {
    expect(STATIC_HEADERS['Content-Security-Policy']).toContain("default-src 'self'");
    expect(STATIC_HEADERS['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(STATIC_HEADERS['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });
});

describe('security headers on Pages Function responses (audit4 N-C2)', () => {
  // Collector payloads good enough for each route to render a real 200 page —
  // the headers must be checked on every response shape the Functions emit.
  const payload = {
    slug: 'hyllie',
    stop_id: '740001586',
    stop_name: 'Malmö Hyllie',
    days: 30,
    date_from: '2026-07-08',
    date_to: '2026-08-06',
    total_departures: 0,
    on_time_count: 0,
    delayed_count: 0,
    canceled_count: 0,
    on_time_pct: 0,
    avg_delay_seconds: null,
    daily: [],
    recent: [],
    as_of: '2026-08-06T21:59:27',
  };
  const routes: Record<string, unknown> = {
    '/api/transit/lines': { lines: [{ line: '804', disruptions: 4 }] },
    '/api/transit/stations': {
      stations: [{ slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' }],
    },
    '/api/transit/station/hyllie': payload,
    '/api/transit/history': {
      days: 30,
      date_from: '2026-07-08',
      date_to: '2026-08-06',
      total_disruptions: 0,
      daily: [],
    },
    '/api/transit/live': {
      status: 'green',
      timestamp: '2026-08-06T21:59:27',
      disruption_count: 0,
      service_shutdown: false,
    },
  };

  const fetchOk: FetchLike = async (url) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    if (!hit) throw new Error(`no stub for ${url}`);
    return new Response(JSON.stringify(routes[hit]), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const fetchDown: FetchLike = async () => {
    throw new Error('collector unreachable');
  };

  async function securityHeadersOf(pathname: string, fetchImpl: FetchLike): Promise<Headers> {
    const res = await handleArchiveRequest(pathname, fetchImpl);
    expect(res, `${pathname} should be an archive route`).not.toBeNull();
    return res!.headers;
  }

  it('attaches the full set to a rendered page', async () => {
    const res = await handleArchiveRequest('/line', fetchOk);
    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res?.headers.get(name), `${name} on a 200 page`).toBe(value);
    }
  });

  it('attaches the full set to the 301 redirect and the 502 fallback', async () => {
    const redirect = await securityHeadersOf('/history', fetchOk);
    const unavailable = await securityHeadersOf('/history/30', fetchDown);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(redirect.get(name), `${name} on a 301`).toBe(value);
      expect(unavailable.get(name), `${name} on a 502`).toBe(value);
    }
    expect(unavailable.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it('attaches them to localized station routes too', async () => {
    const res = await handleArchiveRequest('/sv/station/hyllie', fetchOk);
    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res?.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res?.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('stays in sync with public/_headers', () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(STATIC_HEADERS[name], `${name} is missing from _headers`).toBe(value);
    }
  });
});
