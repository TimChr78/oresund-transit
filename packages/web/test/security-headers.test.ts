import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * L1 — security headers for Cloudflare Pages. The `_headers` file in the
 * output directory (public/ → copied verbatim into dist/ by Vite) applies to
 * every static response: HSTS, nosniff, referrer policy and clickjacking
 * protection. Served files (llms.txt, fonts, og-card) and the prerendered
 * pages all get them; the archive Functions set their own headers per
 * response.
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
});