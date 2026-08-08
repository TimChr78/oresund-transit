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

  it('grows the daily plot to 180px so bars and value labels breathe', () => {
    expect(css).toMatch(/\.bars \{[^}]*height:\s*180px/);
  });

  it('widens daily bars (max-width ~34px) so 7-day bars look substantial', () => {
    expect(css).toMatch(/\.bar-stack \{[^}]*max-width:\s*34px/);
  });

  it('styles per-bar value labels in mono, dim, above the bar', () => {
    expect(css).toMatch(/\.bar-value \{[^}]*font-family:\s*var\(--mono\)/);
    expect(css).toMatch(/\.bar-value \{[^}]*color:\s*var\(--dim\)/);
    expect(css).toMatch(/\.bar-value \{[^}]*position:\s*absolute/);
  });

  it('styles the heatmap color-scale legend (green-to-red gradient row)', () => {
    expect(css).toMatch(/\.heat-legend \{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.heat-scale \{[^}]*linear-gradient\(to right,\s*#10b981,\s*#ef4444\)/);
    expect(css).toMatch(/\.heat-low \{[^}]*#10b981/);
    expect(css).toMatch(/\.heat-high \{[^}]*#ef4444/);
  });

  it('styles the muted one-liner stat hints (small, faint, offset below the label)', () => {
    expect(css).toMatch(/\.stat-hint \{[^}]*font-size:\s*0\.72rem/);
    expect(css).toMatch(/\.stat-hint \{[^}]*color:\s*var\(--faint\)/);
    expect(css).toMatch(/\.stat-hint \{[^}]*margin-top:\s*2px/);
  });

  it('left-aligns hbar-count and hbar-meta while keeping tabular numerals', () => {
    expect(css).toMatch(/\.hbar-count \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.hbar-count \{[^}]*font-variant-numeric:\s*tabular-nums/);
    expect(css).toMatch(/\.hbar-meta \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.hbar-meta \{[^}]*font-variant-numeric:\s*tabular-nums/);
  });
});
