import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SECURITY_HEADERS } from '../src/lib/http-errors';

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