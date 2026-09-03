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

describe('styles.css — accent text/fill tiers (audit4 N-M13)', () => {
  const surface = '#1a1d27';
  const surface2 = '#14161e';
  const bg = '#0a0c10';
  const ink = '#0a0c10'; // --band-ink
  const white = '#ffffff';

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
  /** `fg` composited at `alpha` over `over` — what a badge's tinted chip really is. */
  const over = (fg: string, alpha: number, base: string): string => {
    const p = (h: string, i: number): number => parseInt(h.replace('#', '').slice(i, i + 2), 16);
    return (
      '#' +
      [0, 2, 4]
        .map((i) => Math.round(alpha * p(fg, i) + (1 - alpha) * p(base, i)))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
    );
  };
  /** CSS hue in degrees, so a tier can be pinned to its own hue family. */
  const hue = (hex: string): number => {
    const n = hex.replace('#', '');
    const channel = (i: number): number => parseInt(n.slice(i, i + 2), 16) / 255;
    const r = channel(0);
    const g = channel(2);
    const b = channel(4);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0;
    if (max === r) return (60 * ((g - b) / d) + 360) % 360;
    if (max === g) return 60 * ((b - r) / d) + 120;
    return 60 * ((r - g) / d) + 240;
  };
  const hueGap = (a: string, b: string): number => {
    const d = Math.abs(hue(a) - hue(b));
    return Math.min(d, 360 - d);
  };

  const token = (name: string): string => {
    const m = new RegExp(`^  --${name}: (#[0-9a-f]{6});`, 'm').exec(css);
    if (!m) throw new Error(`--${name} missing from styles.css`);
    return m[1]!;
  };

  const red = token('red');
  const redText = token('red-text');
  const blue = token('blue');
  const blueText = token('blue-text');
  const indigo = token('indigo');
  const indigoText = token('indigo-text');
  const green = token('green');
  const amber = token('amber');

  /** The badge chip backgrounds: the accent at its rule's alpha over --surface,
      the lightest surface a badge sits on (.table-wrap, .stat, .chart). */
  const chip = (accent: string, alpha: number): string => over(accent, alpha, surface);

  it('declares a text sibling for every accent that is used as text', () => {
    for (const name of ['red-text', 'blue-text', 'indigo-text']) {
      expect(token(name)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps each text tier in the hue family of its fill token', () => {
    // Tim's constraint: adjust luminance, never the hue.
    expect(hueGap(redText, red)).toBeLessThanOrEqual(8);
    expect(hueGap(blueText, blue)).toBeLessThanOrEqual(8);
    expect(hueGap(indigoText, indigo)).toBeLessThanOrEqual(8);
  });

  it('clears WCAG AA (4.5:1) as small text on every background it is rendered on', () => {
    // Badge text sits on its OWN tinted chip, which is lighter than any bare
    // surface — the binding case, not --surface.
    expect(ratio(redText, chip(red, 0.14))).toBeGreaterThanOrEqual(4.5); // .badge-cancellation
    expect(ratio(redText, chip(red, 0.1))).toBeGreaterThanOrEqual(4.5); // .badge-band-moderate
    expect(ratio(blueText, chip(blue, 0.14))).toBeGreaterThanOrEqual(4.5); // .badge-alert
    for (const base of [surface, surface2, bg]) {
      expect(ratio(redText, base), `red-text on ${base}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(blueText, base), `blue-text on ${base}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(indigoText, base), `indigo-text on ${base}`).toBeGreaterThanOrEqual(4.5); // links, .brand-sub
      // No text sibling needed — but they must keep clearing AA if retuned.
      expect(ratio(green, base), `green on ${base}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(amber, base), `amber on ${base}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(green, chip(green, 0.12))).toBeGreaterThanOrEqual(4.5); // .badge-band-on-time
    expect(ratio(amber, chip(amber, 0.14))).toBeGreaterThanOrEqual(4.5); // .badge-delay
    expect(ratio(amber, chip(amber, 0.1))).toBeGreaterThanOrEqual(4.5); // .badge-band-minor
    expect(ratio(amber, surface2)).toBeGreaterThanOrEqual(4.5); // .hero-strip-label
  });

  it('keeps white text on the accent FILLS above AA', () => {
    // .tab.active / .day-toggle-btn.active / .lang-btn.active
    expect(ratio(white, indigo)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the status-band ink above AA on every band colour', () => {
    // .status-banner and .badge-band-major both use --band-ink on the fill tier.
    for (const [name, band] of [
      ['green', green],
      ['amber', amber],
      ['red', red],
      ['blue', blue],
    ] as const) {
      expect(ratio(ink, band), `band-ink on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the band\'s secondary stamp readable at its reduced opacity', () => {
    // .sb-updated fades the ink into the band; the fade is what decides the
    // ratio, and --blue is the worst band.
    const worst = Math.min(
      ...([green, amber, red, blue] as const).map((band) => ratio(over(ink, 0.85, band), band)),
    );
    expect(worst).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.sb-updated \{[^}]*opacity:\s*0\.85/);
  });

  it('keeps the active tab\'s count pill above AA under its white label', () => {
    // The pill is composited over the active tab's fill; a light pill there
    // would sit between the white text and the fill and fail.
    const pill = over(ink, 0.22, indigo);
    expect(ratio(white, pill)).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.tab\.active \.tab-count \{[^}]*background:\s*rgba\(10, 12, 16, 0\.22\)/);
  });

  it('stays above the 3:1 non-text floor for segments, dots, trend line and focus ring', () => {
    for (const accent of [red, blue, indigo, green, amber]) {
      expect(ratio(accent, surface), `${accent} on surface`).toBeGreaterThanOrEqual(3);
      expect(ratio(accent, surface2), `${accent} on surface-2`).toBeGreaterThanOrEqual(3);
    }
  });

  it('wires the text tiers to the rules that set text, and the fill tier to fills', () => {
    // The split only protects contrast while the rules point at the right tier.
    const uses = (selector: string, token: string): void => {
      expect(css).toMatch(new RegExp(`${selector.replace(/[.[\]()]/g, '\\$&')} \\{[^}]*color:\\s*var\\(--${token}\\)`));
    };
    uses('.brand-sub', 'indigo-text');
    uses('.home-about a', 'indigo-text');
    uses('.privacy a', 'indigo-text');
    uses('.footer a', 'indigo-text');
    uses('.badge-cancellation', 'red-text');
    uses('.badge-band-moderate', 'red-text');
    uses('.badge-alert', 'blue-text');
    uses('.badge-band-major', 'band-ink');

    const fills = (selector: string, prop: string, value: string): void => {
      expect(css).toMatch(new RegExp(`${selector.replace(/[.[\]()]/g, '\\$&')} \\{[^}]*${prop}:\\s*${value}`));
    };
    fills('.tab.active', 'background', 'var\\(--indigo\\)');
    fills('.day-toggle-btn.active', 'background', 'var\\(--indigo\\)');
    fills('.lang-btn.active', 'background', 'var\\(--indigo\\)');
    fills('.seg-cancel', 'background', 'var\\(--red\\)');
    fills('.dot-cancel', 'background', 'var\\(--red\\)');
    fills('.status-red', 'background', 'var\\(--red\\)');
    fills('.status-blue', 'background', 'var\\(--blue\\)');
    fills('.trend-line', 'stroke', 'var\\(--indigo\\)');
  });

  it('keeps the archive shell\'s inlined badge colours in lockstep with these tokens', () => {
    // archive.ts ships its own <style> (the archive pages carry no SPA
    // stylesheet) and promises the same treatment as the board's badges.
    const archive = readFileSync(new URL('../src/lib/archive.ts', import.meta.url), 'utf8');
    expect(archive).toContain(`.badge-cancellation { color: ${redText};`);
    expect(archive).toContain(`.badge-band-moderate { color: ${redText};`);
    expect(archive).toContain(`.badge-band-major { color: ${ink}; background: ${red};`);
  });
});

describe('styles.css — 375px pass (audit4 N-M14)', () => {
  /** The rules inside the ≤719px block, where every phone fix lives. The
      closing brace is unindented, so \n} ends the block and nothing else. */
  const mobile = /@media \(max-width: 719px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

  it('lets the two nowrap flex rows wrap, or they push the page sideways', () => {
    // The status band's "N disruptions · Updated HH:MM" run is one nowrap block
    // ~240px wide; beside a Swedish status word it exceeded the 347px a 375px
    // viewport offers after .wrap's padding. Same for the hero strip, whose
    // cause badge floors a chip at its 170px max-width.
    expect(css).toMatch(/\.status-banner \{[^}]*display:\s*flex/);
    expect(mobile).toMatch(/\.status-banner \{[^}]*flex-wrap:\s*wrap/);
    expect(mobile).toMatch(/\.sb-meta \{[^}]*white-space:\s*normal/);
    expect(mobile).toMatch(/\.hero-strip \{[^}]*flex-wrap:\s*wrap/);
    expect(mobile).toMatch(/\.hero-strip \.badge-cause \{[^}]*max-width:\s*110px/);
  });

  it('gives the controls a 44px tap target on a phone', () => {
    for (const selector of ['\\.tab', '\\.day-toggle-btn', '\\.lang-btn', '\\.btn']) {
      // The last selector in a group is followed by " {" rather than a comma.
      expect(mobile).toMatch(new RegExp(`${selector}[,{\\s]`));
    }
    expect(mobile).toMatch(/min-height:\s*44px/);
    expect(mobile).toMatch(/\.lang-btn \{[^}]*min-width:\s*44px/);
    // Inline links grow the hit area with padding pulled back out by a negative
    // margin, so the layout does not move.
    expect(mobile).toMatch(/\.station-nav a,[\s\S]*?display:\s*inline-block/);
    expect(mobile).toMatch(/padding:\s*14px 6px/);
    expect(mobile).toMatch(/margin:\s*-14px -6px/);
  });

  it('marks the edges of the two containers that actually pan', () => {
    expect(mobile).toMatch(/\.table-wrap,\n  \.bar-plot \{/);
    expect(mobile).toMatch(/\.bar-plot::before/);
    // Narrow enough not to veil the first column's digits.
    expect(mobile).toMatch(/width:\s*14px/);
    for (const selector of ['\\.table-wrap \\{', '\\.bar-plot \\{']) {
      expect(css).toMatch(new RegExp(`${selector}[^}]*overflow-x:\\s*auto`));
    }
  });

  it('keeps a hidden table from widening the document', () => {
    // width: 1px alone cannot shrink a <table>; measured in headless Chromium,
    // the 30-row daily table came out 462px wide and scrolled the whole page.
    expect(css).toMatch(/\.sr-only \{[^}]*max-width:\s*1px/);
    expect(css).toMatch(/\.sr-only \{[^}]*table-layout:\s*fixed/);
    expect(css).toMatch(/\.sr-only \{[^}]*overflow:\s*hidden/);
  });

  it('clears the sticky hero strip when the strip links down to the table', () => {
    expect(css).toMatch(/#disruptions-table \{[^}]*scroll-margin-top:\s*64px/);
  });

  it('lets the hbar meta shrink so the bar it describes keeps room', () => {
    expect(css).toMatch(/\.hbar-meta \{[^}]*flex:\s*0 1 auto/);
    expect(css).toMatch(/\.hbar-meta \{[^}]*min-width:\s*0/);
  });
});
