import { describe, expect, it } from 'vitest';
import { esc } from '../src/lib/html';

describe('esc', () => {
  it('escapes HTML metacharacters', () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(esc("it's")).toBe('it&#39;s');
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('leaves safe strings untouched', () => {
    expect(esc('801 — Østerport')).toBe('801 — Østerport');
  });
});
