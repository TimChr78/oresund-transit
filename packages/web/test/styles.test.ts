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

  it('styles the muted one-liner chart hints (0.75rem, faint, under the title)', () => {
    expect(css).toMatch(/\.chart-hint \{[^}]*font-size:\s*0\.75rem/);
    expect(css).toMatch(/\.chart-hint \{[^}]*color:\s*var\(--faint\)/);
    expect(css).toMatch(/\.chart-hint \{[^}]*margin[^}]*6px/);
  });

  it('styles the methodology definitions table (left-aligned, faint headers)', () => {
    expect(css).toMatch(/\.meth-table th \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.meth-table td \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.meth-table td:first-child \{[^}]*font-family:\s*var\(--font-display\)/);
    expect(css).toMatch(/\.meth-h \{[^}]*color:\s*var\(--dim\)/);
  });

  it('left-aligns hbar-count and hbar-meta while keeping tabular numerals', () => {
    expect(css).toMatch(/\.hbar-count \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.hbar-count \{[^}]*font-variant-numeric:\s*tabular-nums/);
    expect(css).toMatch(/\.hbar-meta \{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.hbar-meta \{[^}]*font-variant-numeric:\s*tabular-nums/);
  });

  it('shows the active station scope on the picker, distinct from hover (backlog A1)', () => {
    expect(css).toMatch(/\.station-nav a\[aria-current\] \{[^}]*color:\s*var\(--text\)/);
    expect(css).toMatch(/\.station-nav a\[aria-current\] \{[^}]*text-decoration:\s*underline/);
    // Hover keeps its own colour, so current and pointed-at never look alike.
    expect(css).toMatch(/\.station-nav a:hover \{[^}]*color:\s*var\(--green\)/);
    // The current rule ties the plain hover rule on specificity and sits after
    // it, so var(--text) would otherwise swallow the green on hover — restate it.
    expect(css).toMatch(/\.station-nav a\[aria-current\]:hover \{[^}]*color:\s*var\(--green\)/);
  });

  it('styles the scheduled-vs-expected time pair (backlog B1)', () => {
    expect(css).toMatch(/\.time-sched \{[^}]*font-family:\s*var\(--mono\)/);
    expect(css).toMatch(/\.time-actual \{[^}]*color:\s*var\(--dim\)/);
    expect(css).toMatch(/\.route-section \{[^}]*display:\s*block/);
  });
});

describe('styles.css — faint text token (audit4 N-H8)', () => {
  const surface = '#1a1d27';
  const surface2 = '#14161e';
  const bg = '#0a0c10';

  /** WCAG relative luminance and contrast ratio. */
  const lum = (hex: string): number => {
    const n = hex.replace('#', '');
    const ch = (i: number): number => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  };
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [Math.max(lum(a), lum(b)), Math.min(lum(a), lum(b))];
    return (hi + 0.05) / (lo + 0.05);
  };

  const faint = (/^  --faint: (#[0-9a-f]{6});/m.exec(css) ?? [])[1];
  const dim = (/^  --dim: (#[0-9a-f]{6});/m.exec(css) ?? [])[1];
  const text = (/^  --text: (#[0-9a-f]{6});/m.exec(css) ?? [])[1];

  it('declares a faint token to test at all', () => {
    expect(faint).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('clears WCAG AA (4.5:1) against the lightest surface it is read on', () => {
    // --faint is used at hint and header sizes (0.72rem+), well under the
    // 18pt/14pt-bold threshold, so 4.5:1 is the bar — not the 3:1 large-text one.
    expect(ratio(faint!, surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(faint!, surface2)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(faint!, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('stays the faintest text tier, one clear step under --dim', () => {
    // Hierarchy, not just compliance: faint must still read fainter than the
    // secondary tier, which itself reads fainter than body text.
    expect(lum(faint!)).toBeLessThan(lum(dim!));
    expect(lum(dim!)).toBeLessThan(lum(text!));
    expect(ratio(faint!, surface) / ratio(dim!, surface)).toBeLessThan(0.9);
  });
});
