import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SECURITY_HEADERS } from '../src/lib/http-errors';
import { handleArchiveRequest, type FetchLike } from '../src/lib/archive-http';

/**
 * L1 — security headers for Cloudflare Pages. The `_headers` file in the
 * output directory (public/ → copied verbatim into dist/ by Vite) applies to
 * every static response: HSTS, nosniff, referrer policy and clickjacking
 * protection. Served files (llms.txt, fonts, og-card) and the prerendered
 * pages all get them.
 *
 * audit4 N-C1/N-C2 follow-up: Cloudflare does NOT apply `_headers` to a Pages
 * Function's Response, so the Functions carry the same set in code
 * (SECURITY_HEADERS). These tests keep the two honest — if one changes
 * without the other, the archive URLs and the static ones disagree about
 * their own policy.
 */
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

describe('security headers (Cloudflare Pages _headers)', () => {
  it('applies the hardened header set to every route', () => {
    expect(headers).toMatch(/^\/\*/m);
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toContain('X-Frame-Options: DENY');
  });

  it('allows the Umami analytics origin the shell loads (audit4 N-H1)', () => {
    const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const src = /<script[^>]*\ssrc="(https:[^"]+)"[^>]*data-website-id/.exec(shell)?.[1];
    expect(src, 'the shell ships an analytics script').toBeTruthy();

    // script-src must let the browser run it, and connect-src must let the
    // beacon reach /api/send on the same origin — `script-src 'self'` blocked
    // the tag from the day the header landed, so the dashboard read zero.
    const origin = new URL(src!).origin;
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain(`script-src 'self' ${origin}`);
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain(`connect-src 'self' ${origin}`);
  });

  it('keeps _headers and the Functions’ in-code set identical', () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headers).toContain(`${name}: ${value}`);
    }
  });
});

describe('security headers on Pages Function responses (audit4 N-C2, merged from #48)', () => {
  const payload = {
    slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie', days: 30,
    date_from: '2026-07-08', date_to: '2026-08-06', total_departures: 0,
    on_time_count: 0, delayed_count: 0, canceled_count: 0, on_time_pct: 0,
    avg_delay_seconds: null, daily: [], recent: [], as_of: '2026-08-06T21:59:27',
  };
  const routes: Record<string, unknown> = {
    '/api/transit/lines': { lines: [{ line: '804', disruptions: 4 }] },
    '/api/transit/stations': { stations: [{ slug: 'hyllie', stop_id: '740001586', stop_name: 'Malmö Hyllie' }] },
    '/api/transit/station/hyllie': payload,
    '/api/transit/history': { days: 30, date_from: '2026-07-08', date_to: '2026-08-06', total_disruptions: 0, daily: [] },
    '/api/transit/live': { status: 'green', timestamp: '2026-08-06T21:59:27', disruption_count: 0, service_shutdown: false },
  };
  const fetchOk: FetchLike = async (url) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    if (!hit) throw new Error(`no stub for ${url}`);
    return new Response(JSON.stringify(routes[hit]), { headers: { 'Content-Type': 'application/json' } });
  };
  const fetchDown: FetchLike = async () => { throw new Error('collector unreachable'); };

  it('attaches the full set to a rendered page, the 301 and the branded 502', async () => {
    const page = await handleArchiveRequest('/line', fetchOk);
    expect(page?.status).toBe(200);
    const redirect = await handleArchiveRequest('/history', fetchOk);
    const down = await handleArchiveRequest('/history/30', fetchDown);
    expect(down?.status).toBe(502);
    for (const res of [page, redirect, down]) {
      expect(res).not.toBeNull();
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(res!.headers.get(name), `${name} on a ${res!.status}`).toBe(value);
      }
    }
    // branded fallback (wave 2 N-H4): the 502 is a page, not plain text
    expect(down!.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('attaches them to localized station routes too', async () => {
    const res = await handleArchiveRequest('/sv/station/hyllie', fetchOk);
    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res?.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
