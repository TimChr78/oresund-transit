import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('styles.css — de-right-align pass', () => {
  it('contains no text-align: right anywhere (user dislikes right-aligned text)', () => {
    expect(css).not.toMatch(/text-align:\s*right/);
  });

  it('left-aligns hbar labels while keeping the fixed label column width', () => {
    expect(css).toMatch(/\.hbar-label \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.hbar-label \{[^}]*flex:\s*0\s*0\s*74px/);
  });

  it('stacks the line hbar label from the left (flex-start, not flex-end)', () => {
    expect(css).toMatch(/\.hbar-line \.hbar-label \{[^}]*align-items:\s*flex-start/);
  });

  it('guards .trend-line with vector-effect: non-scaling-stroke so the stretched SVG cannot balloon stroke width', () => {
    expect(css).toMatch(/\.trend-line \{[^}]*vector-effect:\s*non-scaling-stroke/);
  });

  it('raises daily-grid line opacity so the tick gridlines actually guide the eye', () => {
    expect(css).toMatch(/\.daily-grid line \{[^}]*rgba\(255,\s*255,\s*255,\s*0\.14\)/);
  });

  it('left-aligns hbar-count and hbar-meta while keeping tabular numerals', () => {
    expect(css).toMatch(/\.hbar-count \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.hbar-count \{[^}]*font-variant-numeric:\s*tabular-nums/);
    expect(css).toMatch(/\.hbar-meta \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.hbar-meta \{[^}]*font-variant-numeric:\s*tabular-nums/);
  });
});
