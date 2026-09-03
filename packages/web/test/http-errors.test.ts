import { describe, expect, it } from 'vitest';
import { DICTS } from '../src/i18n';
import type { Key } from '../src/i18n/keys';
import { acceptLang, renderUnavailablePage, serviceUnavailableResponse, SECURITY_HEADERS } from '../src/lib/http-errors';

/**
 * audit4 N-H4 — the collector-outage page. A collector failure used to answer
 * every archive route with a bare `502 text/plain` line: correct HTTP, and a
 * dead end for whoever was reading the page. These pin the replacement —
 * branded, localized, and carrying the same security header set every other
 * response on the site ships (audit4 N-C2).
 */

describe('acceptLang — error-page language', () => {
  it('lets the URL prefix win over whatever the client asks for', () => {
    expect(acceptLang('da-DK,da;q=0.9', 'sv')).toBe('sv');
    expect(acceptLang(null, 'da')).toBe('da');
  });

  it('negotiates from Accept-Language when the URL has no prefix', () => {
    expect(acceptLang('sv-SE,sv;q=0.9,en;q=0.8')).toBe('sv');
    expect(acceptLang('da-DK,da;q=0.9,en;q=0.8')).toBe('da');
    expect(acceptLang('en-GB,en;q=0.9')).toBe('en');
    // Quality-ordered, not first-listed.
    expect(acceptLang('en;q=0.3,da;q=0.9')).toBe('da');
  });

  it('falls back to English for unsupported or absent headers', () => {
    expect(acceptLang('de-DE,fr;q=0.8')).toBe('en');
    expect(acceptLang('*')).toBe('en');
    expect(acceptLang('')).toBe('en');
    expect(acceptLang(null)).toBe('en');
    expect(acceptLang(undefined)).toBe('en');
  });
});

describe('renderUnavailablePage', () => {
  it('renders a branded, self-contained page with a retry hint and a way home', () => {
    const html = renderUnavailablePage('en', '/station/hyllie');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('lang="en"');
    expect(html).toContain('Øresund.live');
    expect(html).toContain('Temporarily unavailable');
    expect(html).toContain('href="/station/hyllie"'); // re-request the page
    expect(html).toContain('href="/"'); // back to the live board
  });

  it('renders in every supported language', () => {
    expect(renderUnavailablePage('sv', '/station/hyllie')).toContain('lang="sv"');
    expect(renderUnavailablePage('sv', '/x')).toContain(DICTS.sv.err502_title);
    expect(renderUnavailablePage('da', '/x')).toContain(DICTS.da.err502_title);
    expect(renderUnavailablePage('en', '/x')).toContain(DICTS.en.err502_title);
  });

  it('escapes the route it echoes back into the retry link', () => {
    const html = renderUnavailablePage('en', '/station/<script>');
    expect(html).not.toContain('/station/<script>');
    expect(html).toContain('/station/&lt;script&gt;');
  });

  it('is marked noindex so an outage page never ranks', () => {
    expect(renderUnavailablePage('en', '/x')).toContain('noindex');
  });
});

describe('serviceUnavailableResponse', () => {
  it('answers 502 with the branded page and no-store', async () => {
    const res = serviceUnavailableResponse('en', '/history/30');
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('text/html');
    // A CDN that cached the outage page would keep serving it after recovery.
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(await res.text()).toContain('Temporarily unavailable');
  });

  it('carries the same security header set as every other response', () => {
    const res = serviceUnavailableResponse('en', '/x');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name.toLowerCase())).toBe(value);
    }
  });

  it('uses an err502 key for every language, so the page can never render a blank string', () => {
    for (const lang of ['sv', 'da', 'en'] as const) {
      for (const key of ['err502_title', 'err502_body', 'err502_retry', 'err502_home'] as Key[]) {
        expect(DICTS[lang][key].trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
