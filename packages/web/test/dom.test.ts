import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isPlainPrimaryClick, reconcile, refocusTarget, type ParseHtml } from '../src/lib/dom';

/**
 * The suite runs in plain node (vite.config.ts: "Pure-logic tests only — no
 * jsdom"), so these tests carry a minimal DOM of their own: just enough
 * element behaviour for the reconciler to walk — attributes, children,
 * serialization and the three mutations it makes. The parser is a small
 * reader for the regular, machine-generated markup the renderers emit, which
 * is the only HTML reconcile() is ever handed.
 *
 * What the tests are actually pinning is the guarantee N-H7 asks for: an
 * unchanged subtree comes out the other end as the SAME node, untouched.
 */

let touched = 0;

class FakeText {
  parentNode: FakeElement | null = null;
  constructor(readonly text: string) {}
  get nodeType(): number {
    return 3;
  }
  get textContent(): string {
    return this.text;
  }
}

class FakeElement {
  nodeType = 1;
  parentNode: FakeElement | null = null;
  childNodes: (FakeElement | FakeText)[] = [];

  constructor(
    public tagName: string,
    private attrs: Record<string, string> = {},
  ) {}

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  getAttributeNames(): string[] {
    return Object.keys(this.attrs);
  }
  removeAttribute(name: string): void {
    delete this.attrs[name];
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((n): n is FakeElement => n.nodeType === 1);
  }
  get firstChild(): FakeElement | FakeText | null {
    return this.childNodes[0] ?? null;
  }
  get nextSibling(): FakeElement | FakeText | null {
    const at = this.parentNode?.childNodes.indexOf(this) ?? -1;
    return at === -1 ? null : this.parentNode?.childNodes[at + 1] ?? null;
  }
  get textContent(): string {
    return this.childNodes.map((n) => (n.nodeType === 1 ? (n as FakeElement).textContent : (n as FakeText).text)).join('');
  }
  /** Serialized exactly as the renderers write it, so identity is comparable. */
  get outerHTML(): string {
    const open = Object.entries(this.attrs)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
    return `<${this.tagName}${open}>${this.inner}</${this.tagName}>`;
  }
  /** The children as markup, for the reconciler's whole-subtree rewrite. */
  get innerHTML(): string {
    return this.inner;
  }
  private get inner(): string {
    return this.childNodes
      .map((n) => (n.nodeType === 1 ? (n as FakeElement).outerHTML : (n as FakeText).text))
      .join('');
  }
  /** The first-paint path reconcile() takes on an empty root. */
  set innerHTML(html: string) {
    this.childNodes = [];
    for (const el of parse(html)) {
      el.parentNode = this;
      this.childNodes.push(el);
    }
    touched++;
  }
  insertBefore(node: FakeElement, ref: FakeElement | FakeText | null): FakeElement {
    detach(node);
    const at = ref === null ? this.childNodes.length : this.childNodes.indexOf(ref);
    this.childNodes.splice(at === -1 ? this.childNodes.length : at, 0, node);
    node.parentNode = this;
    touched++;
    return node;
  }
  replaceWith(node: FakeElement): void {
    this.parentNode?.insertBefore(node, this);
    this.remove();
  }
  appendChild<T extends FakeElement | FakeText>(node: T): T {
    detach(node as FakeElement);
    this.childNodes.push(node);
    node.parentNode = this;
    touched++;
    return node;
  }
  removeChild(node: FakeElement | FakeText): FakeElement | FakeText {
    this.childNodes = this.childNodes.filter((n) => n !== node);
    if (node.nodeType !== 3) (node as FakeElement).parentNode = null;
    else (node as FakeText).parentNode = null;
    touched++;
    return node;
  }
  remove(): void {
    const parent = this.parentNode;
    if (!parent) return;
    parent.childNodes = parent.childNodes.filter((n) => n !== this);
    this.parentNode = null;
    // Removing the focused node — or anything above it — sends the caret to <body>.
    if (active !== null && (active === this || contains(this, active))) active = BODY;
    touched++;
  }
  /** A no-op on anything not focusable, exactly as in a browser. */
  focus(): void {
    if (FOCUSABLE.has(this.tagName.toUpperCase()) || this.getAttribute('tabindex') !== null) active = this;
  }
}

function detach(node: FakeElement): void {
  if (node.parentNode) {
    node.parentNode.childNodes = node.parentNode.childNodes.filter((n) => n !== node);
    node.parentNode = null;
  }
}

/**
 * The focus model the focus-carrying tests run against: `<body>` is where a
 * browser puts the caret when the focused node leaves the document, and only
 * a naturally focusable element — or one handed `tabindex="-1"` — takes the
 * focus back. Real enough to pin the guarantee, small enough to stay a stub.
 */
const BODY = new FakeElement('body');
let active: FakeElement | null = null;

/** A stand-in for the global `document` the reconciler reads the caret from. */
const fakeDocument = {
  get activeElement(): unknown {
    return active;
  },
};

/** Elements the browser focuses on their own; anything else needs a tabindex. */
const FOCUSABLE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'IFRAME']);

/** True when `ancestor` is `node` or sits above it. */
function contains(ancestor: FakeElement, node: FakeElement): boolean {
  for (let cur: FakeElement | null = node.parentNode; cur; cur = cur.parentNode) {
    if (cur === ancestor) return true;
  }
  return false;
}

/**
 * Reads the shape of markup the renderers emit: a container's open and close
 * tags sit on their own lines and its children on the lines between, and any
 * leaf is written whole on one line. Enough to build a real tree — the
 * reconciler only ever sees this kind of HTML.
 */
function parse(html: string): FakeElement[] {
  const roots: FakeElement[] = [];
  const stack: FakeElement[] = [];
  const attach = (el: FakeElement): void => {
    const parent = stack[stack.length - 1];
    if (parent) {
      el.parentNode = parent;
      parent.childNodes.push(el);
    } else {
      roots.push(el);
    }
  };

  for (const raw of html.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // <tag attr="v">        — container opens
    const open = /^<(\w+)((?: [a-zA-Z-]+="[^"]*")*)>$/.exec(line);
    if (open) {
      const el = new FakeElement(open[1]!, attrsOf(open[2] ?? ''));
      attach(el);
      stack.push(el);
      continue;
    }
    // </tag>                — container closes
    if (/^<\/\w+>$/.test(line)) {
      stack.pop();
      continue;
    }
    // <tag attr="v">text</tag>  — leaf, written whole
    const leaf = /^<(\w+)((?: [a-zA-Z-]+="[^"]*")*)>(.*)<\/\1>$/.exec(line);
    if (leaf) {
      const el = new FakeElement(leaf[1]!, attrsOf(leaf[2] ?? ''));
      if (leaf[3]) {
        const text = new FakeText(leaf[3]);
        text.parentNode = el;
        el.childNodes.push(text);
      }
      attach(el);
    }
  }
  return roots;
}

function attrsOf(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[m[1]!] = m[2]!;
  return attrs;
}

/** Count the live descendants of a node, so tests can assert on tree size. */
function count(el: FakeElement): number {
  return 1 + el.children.reduce((n, c) => n + count(c), 0);
}

const parseHtml = parse as unknown as ParseHtml;

describe('reconcile (audit4 N-H7) — keyed DOM reconciliation', () => {
  it('assigns directly on the first paint, when there is nothing to reuse', () => {
    const root = new FakeElement('div');
    reconcile(root as unknown as Element, '<ul>\n  <li data-key="a">A</li>\n</ul>\n', parseHtml);
    expect(root.children.length).toBe(1);
    expect(count(root.children[0]!)).toBe(2);
  });

  it('leaves an unchanged subtree as the same node, with no mutation', () => {
    const root = new FakeElement('div');
    const html = '<ul>\n  <li data-key="a">A</li>\n  <li data-key="b">B</li>\n</ul>\n';
    reconcile(root as unknown as Element, html, parseHtml);
    const before = root.children[0]!;
    const rowBefore = before.children[0]!;

    touched = 0;
    reconcile(root as unknown as Element, html, parseHtml);

    expect(root.children[0]).toBe(before);
    expect(root.children[0]!.children[0]).toBe(rowBefore);
    expect(touched).toBe(0);
  });

  it('reuses a row that moved, instead of deleting and rebuilding it', () => {
    const root = new FakeElement('div');
    reconcile(root as unknown as Element, '<ul>\n  <li data-key="a">A</li>\n  <li data-key="b">B</li>\n</ul>\n', parseHtml);
    const ul = root.children[0]!;
    const a = ul.children[0]!;
    const b = ul.children[1]!;

    reconcile(root as unknown as Element, '<ul>\n  <li data-key="b">B</li>\n  <li data-key="a">A</li>\n</ul>\n', parseHtml);

    expect(ul.children.map((c) => c.getAttribute('data-key'))).toEqual(['b', 'a']);
    expect(ul.children[0]).toBe(b);
    expect(ul.children[1]).toBe(a);
    expect(ul.children.length).toBe(2);
  });

  it('updates a changed cell without replacing the row that holds it', () => {
    const root = new FakeElement('div');
    reconcile(
      root as unknown as Element,
      '<table>\n  <tr data-key="r1">\n    <td class="line">803</td>\n  </tr>\n</table>\n',
      parseHtml,
    );
    const table = root.children[0]!;
    const tr = table.children[0]!;
    const td = tr.children[0]!;

    reconcile(
      root as unknown as Element,
      '<table>\n  <tr data-key="r1">\n    <td class="line">804</td>\n  </tr>\n</table>\n',
      parseHtml,
    );

    // The replacement stops at the cell: a <td> holding text has no structure
    // to key below, so it is rebuilt — but the row and table above it are the
    // same nodes they were.
    expect(root.children[0]).toBe(table);
    expect(table.children[0]).toBe(tr);
    expect(tr.children[0]).not.toBe(td);
    expect(tr.children[0]!.textContent).toBe('804');
  });

  it('inserts and removes rows around the ones it kept', () => {
    const root = new FakeElement('div');
    reconcile(root as unknown as Element, '<ul>\n  <li data-key="a">A</li>\n  <li data-key="b">B</li>\n</ul>\n', parseHtml);
    const ul = root.children[0]!;
    const b = ul.children[1]!;

    reconcile(root as unknown as Element, '<ul>\n  <li data-key="b">B</li>\n  <li data-key="c">C</li>\n</ul>\n', parseHtml);

    expect(ul.children[0]).toBe(b);
    expect(ul.children[1]!.getAttribute('data-key')).toBe('c');
    expect(ul.children.length).toBe(2);
  });

  it('replaces an element whose attributes changed, since it cannot be keyed below', () => {
    const root = new FakeElement('div');
    reconcile(root as unknown as Element, '<section>\n  <a class="tab active">All</a>\n</section>\n', parseHtml);
    const before = root.children[0]!.children[0]!;

    reconcile(root as unknown as Element, '<section>\n  <a class="tab">All</a>\n</section>\n', parseHtml);

    expect(root.children[0]!.children[0]).not.toBe(before);
    expect(root.children[0]!.children[0]!.getAttribute('class')).toBe('tab');
  });

  it('descends past a text-bearing leaf to the leaves that actually changed', () => {
    const root = new FakeElement('div');
    reconcile(
      root as unknown as Element,
      '<section>\n  <h2>Disruptions</h2>\n  <p class="intro">Quiet day</p>\n</section>\n',
      parseHtml,
    );
    const section = root.children[0]!;
    const heading = section.children[0]!;

    reconcile(
      root as unknown as Element,
      '<section>\n  <h2>Disruptions</h2>\n  <p class="intro">Busy day</p>\n</section>\n',
      parseHtml,
    );

    expect(root.children[0]).toBe(section);
    expect(section.children[0]).toBe(heading); // unchanged sibling kept
    expect(section.children[1]!.textContent).toBe('Busy day');
  });

  it('empties a container when the new markup renders nothing there', () => {
    const root = new FakeElement('div');
    reconcile(root as unknown as Element, '<main>\n  <section class="hero">Active now</section>\n</main>\n', parseHtml);
    reconcile(root as unknown as Element, '<main>\n</main>\n', parseHtml);
    expect(root.children[0]!.children.length).toBe(0);
  });
});

describe('live regions (audit5 H3) — the status banner is mutated, never replaced', () => {
  // The banner exactly as StatusBanner.ts renders it: a keyed live region whose
  // class is the corridor's band. Green→amber is the transition that has to
  // announce "delays are affecting trains".
  const banner = (band: string, text: string): string =>
    `<main>\n  <section data-key="status-banner" class="status-banner ${band}" role="status" aria-live="polite">\n    <span class="sb-text">${text}</span>\n  </section>\n</main>\n`;

  it('keeps the role=status element by identity across a band transition', () => {
    const root = new FakeElement('div');
    reconcile(root as unknown as Element, banner('status-green', 'Normal service'), parseHtml);
    const region = root.children[0]!.children[0]!;
    expect(region.getAttribute('role')).toBe('status');

    reconcile(root as unknown as Element, banner('status-amber', 'Delays'), parseHtml);

    expect(root.children[0]!.children[0]).toBe(region);
    expect(region.getAttribute('class')).toBe('status-banner status-amber');
    expect(region.children[0]!.textContent).toBe('Delays');
  });

  it('still keeps it when only the class changed and the text did not', () => {
    const root = new FakeElement('div');
    reconcile(root as unknown as Element, banner('status-green', 'Normal service'), parseHtml);
    const region = root.children[0]!.children[0]!;

    reconcile(root as unknown as Element, banner('status-red', 'Normal service'), parseHtml);

    expect(root.children[0]!.children[0]).toBe(region);
    expect(region.getAttribute('class')).toBe('status-banner status-red');
    expect(region.children[0]!.textContent).toBe('Normal service');
  });

  it('keeps an aria-live element whose children are not keyable, rewriting their block', () => {
    const root = new FakeElement('div');
    reconcile(root as unknown as Element, '<main>\n  <p aria-live="polite">3 disruptions</p>\n</main>\n', parseHtml);
    const live = root.children[0]!.children[0]!;

    reconcile(root as unknown as Element, '<main>\n  <p aria-live="polite">4 disruptions</p>\n</main>\n', parseHtml);

    expect(root.children[0]!.children[0]).toBe(live);
    expect(live.textContent).toBe('4 disruptions');
  });
});

describe('refocusTarget (audit5 H3) — a replacement hands the focus back', () => {
  /** parse() returns a list of roots; these documents have exactly one. */
  const doc = (html: string): FakeElement => parse(html)[0]!;
  // The reconciler's own double, standing in for the real DOM types.
  const asElement = (fake: unknown): Element => fake as unknown as Element;
  const asNode = (fake: unknown): Node => fake as unknown as Node;
  const refocus = (current: FakeElement, next: FakeElement, active: FakeElement | null): FakeElement | null =>
    refocusTarget(asElement(current), asElement(next), asNode(active)) as FakeElement | null;

  it('maps the focused control to its counterpart in the replacement', () => {
    const current = doc('<div>\n  <button class="lang-btn active" aria-pressed="true">SV</button>\n  <button class="lang-btn">EN</button>\n</div>\n');
    const next = doc('<div>\n  <button class="lang-btn" aria-pressed="false">SV</button>\n  <button class="lang-btn active" aria-pressed="true">EN</button>\n</div>\n');

    expect(refocus(current, next, current.children[1]!)).toBe(next.children[1]!);
  });

  it('maps the replacement itself when the focused node was the replaced element', () => {
    const current = doc('<div>\n  <a class="tab active">All</a>\n</div>\n');
    const next = doc('<div>\n  <a class="tab">All</a>\n</div>\n');

    expect(refocus(current, next, current)).toBe(next);
  });

  it('climbs to the nearest element when the focused node has no element counterpart', () => {
    const current = doc('<div>\n  <ul>\n    <li data-key="a">\n      <button>A</button>\n    </li>\n  </ul>\n</div>\n');
    const next = doc('<div>\n  <ul>\n    <li data-key="a">A</li>\n  </ul>\n</div>\n');
    const button = current.children[0]!.children[0]!.children[0]!;
    const li = next.children[0]!.children[0]!;

    expect(refocus(current, next, button)).toBe(li);
  });

  it('falls back to the replacement when the focused position is gone entirely', () => {
    const current = doc('<div>\n  <ul>\n    <li data-key="a">\n      <button>A</button>\n    </li>\n    <li data-key="b">\n      <button>B</button>\n    </li>\n  </ul>\n</div>\n');
    const next = doc('<div>\n  <ul>\n    <li data-key="a">A</li>\n  </ul>\n</div>\n');
    const button = current.children[0]!.children[1]!.children[0]!;

    expect(refocus(current, next, button)).toBe(next);
  });

  it('returns null when nothing inside the replaced element has the focus', () => {
    const current = doc('<div>\n  <button>A</button>\n</div>\n');
    const next = doc('<div>\n  <button>A</button>\n</div>\n');

    expect(refocus(current, next, null)).toBeNull();
  });
});

describe('refocusTarget — the fallback is somewhere focus can actually land', () => {
  beforeEach(() => {
    globalThis.document = fakeDocument as unknown as Document;
    active = null;
  });
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
    active = null;
  });

  it('restores the focus when a focused retry button is replaced by a note', () => {
    // The live error → loading transition: the error placeholder holds a
    // retry <button> beside its message, the loading one is a bare <div>
    // with text in it. That text makes the replacement un-keyable, so the
    // whole block is replaced — and the focused button with it.
    const root = new FakeElement('div');
    const asEl = root as unknown as Element;
    reconcile(
      asEl,
      '<div class="empty">\n  <span>Something went wrong</span>\n  <button type="button" class="btn" data-action="retry-live">Retry</button>\n</div>\n',
      parseHtml,
    );
    // The keyboard user is on the retry button when the refresh lands.
    const button = root.children[0]!.children[1]!;
    button.focus();
    expect(active).toBe(button);

    reconcile(asEl, '<div class="empty">Loading…</div>\n', parseHtml);

    // The focused button went with the old block...
    expect(root.children[0]!.getAttribute('data-action')).toBeNull();
    // ...and the focus came back rather than staying on <body>. The
    // replacement is a <div>, which cannot take the focus on its own — the
    // tabindex it now carries is what let focus() land on it.
    const fallback = root.children[0]!;
    expect(active).toBe(fallback);
    expect(fallback.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(fallback);
  });

  it('focuses a focusable counterpart without adding a tabindex to it', () => {
    // The everyday swap: an error placeholder's button is re-rendered with a
    // new label. Its counterpart is focusable in its own right, so the focus
    // moves across with no synthetic tabindex and no tab stop added.
    const root = new FakeElement('div');
    const asEl = root as unknown as Element;
    reconcile(
      asEl,
      '<div class="empty">\n  <span>Request failed</span>\n  <button type="button" class="btn" data-action="retry-live">Retry</button>\n</div>\n',
      parseHtml,
    );
    root.children[0]!.children[1]!.focus();

    reconcile(
      asEl,
      '<div class="empty">\n  <span>Still failing</span>\n  <button type="button" class="btn" data-action="retry-live">Try again</button>\n</div>\n',
      parseHtml,
    );

    const counterpart = root.children[0]!.children[1]!;
    expect(active).toBe(counterpart);
    expect(counterpart.getAttribute('tabindex')).toBeNull();
  });
});


describe('the removal sweep keeps the focus (audit6 M3)', () => {
  beforeEach(() => {
    globalThis.document = fakeDocument as unknown as Document;
    active = null;
  });
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
    active = null;
  });

  /**
   * The exact transition the audit named: SET_DAY_RANGE nulls history, stats
   * and punctuality, so the second render turns the <section class="history">
   * that CONTAINS the focused day-range button into a bare <div class="empty">.
   * Different tag, different key — the section is removed, not replaced, and
   * the removal sweep had no focus handling at all.
   */
  const withHistory = '<main>\n  <section class="history" data-key="history-section">\n    <div class="day-toggle">\n      <button type="button" class="day-toggle-btn" data-action="set-days">30 days</button>\n    </div>\n  </section>\n</main>\n';
  const loading = '<main>\n  <div class="empty">Loading…</div>\n</main>\n';

  it('does not drop a keyboard user onto <body> when their section is removed', () => {
    const root = new FakeElement('div');
    const asEl = root as unknown as Element;
    reconcile(asEl, withHistory, parseHtml);
    const button = root.children[0]!.children[0]!.children[0]!.children[0]!;
    button.focus();
    expect(active).toBe(button);

    reconcile(asEl, loading, parseHtml);

    // The section went, and the focus came back to where it stood rather than
    // falling to <body>. The replacement is a <div>, which needs a tabindex
    // before focus() can land on it.
    const replacement = root.children[0]!.children[0]!;
    expect(replacement.getAttribute('class')).toBe('empty');
    expect(active).toBe(replacement);
    expect(replacement.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(replacement);
  });

  it('hands the focus to the surviving sibling when the removed node was last', () => {
    const before = '<main>\n  <section class="history" data-key="history-section">\n    <button>Range</button>\n  </section>\n  <section class="archives" data-key="archives">\n    <a href="/line">Lines</a>\n  </section>\n</main>\n';
    const after = '<main>\n  <section class="archives" data-key="archives">\n    <a href="/line">Lines</a>\n  </section>\n</main>\n';
    const root = new FakeElement('div');
    const asEl = root as unknown as Element;
    reconcile(asEl, before, parseHtml);
    root.children[0]!.children[0]!.children[0]!.focus();

    reconcile(asEl, after, parseHtml);

    // Nothing replaced the removed section, so the nearest surviving neighbour
    // — the element now standing where it did — takes the focus.
    expect(root.children.length).toBe(1);
    expect(root.children[0]!.children.length).toBe(1);
    expect(active).toBe(root.children[0]!.children[0]);
  });

  it('leaves the focus alone when nothing focused is removed', () => {
    const root = new FakeElement('div');
    const asEl = root as unknown as Element;
    reconcile(asEl, withHistory, parseHtml);
    reconcile(asEl, loading, parseHtml);
    expect(document.activeElement).toBeNull();
  });
});

describe('a live region survives empty → data by identity (audit6 M4)', () => {
  /**
   * StatusBanner renders the SAME keyed region for every /live state; only the
   * band colour is added when there is something to report. LIVE_NO_DATA used
   * to swap the region for a bare <div class="empty"> — a different tag, so the
   * region was removed and the one that came back on recovery was inserted
   * already holding its text, which most screen readers read as "nothing
   * changed".
   */
  const empty =
    '<main>\n  <section data-key="status-banner" class="status-slot" role="status" aria-live="polite">\n    <div class="empty">No data</div>\n  </section>\n</main>\n';
  const ok = '<main>\n  <section data-key="status-banner" class="status-banner status-green" role="status" aria-live="polite">\n    <span class="sb-text">Normal service</span>\n  </section>\n</main>\n';

  it('reuses the region element when the board recovers from a 503', () => {
    const root = new FakeElement('div');
    const asEl = root as unknown as Element;
    reconcile(asEl, empty, parseHtml);
    const region = root.children[0]!.children[0]!;
    expect(region.getAttribute('role')).toBe('status');

    reconcile(asEl, ok, parseHtml);

    expect(root.children[0]!.children[0]).toBe(region);
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('class')).toBe('status-banner status-green');
  });

  it('reuses it again when the board degrades to empty', () => {
    const root = new FakeElement('div');
    const asEl = root as unknown as Element;
    reconcile(asEl, ok, parseHtml);
    const region = root.children[0]!.children[0]!;

    reconcile(asEl, empty, parseHtml);

    expect(root.children[0]!.children[0]).toBe(region);
    expect(region.getAttribute('class')).toBe('status-slot');
  });
});

describe('copyAttributes (audit6 L6) — the banner can be byte-identical again', () => {
  const banner = (band: string): string =>
    `<main>\n  <section data-key="status-banner" class="status-banner ${band}" role="status" aria-live="polite">\n    <span class="sb-text">Normal service</span>\n  </section>\n</main>\n`;

  it('re-derives the attribute order from the new markup, so the fast path is not lost', () => {
    const root = new FakeElement('div');
    const asEl = root as unknown as Element;
    reconcile(asEl, banner('status-green'), parseHtml);
    reconcile(asEl, banner('status-amber'), parseHtml);
    // One full cycle later the markup is what it was at first paint.
    const html = banner('status-green');
    reconcile(asEl, html, parseHtml);
    expect(root.children[0]!.children[0]!.outerHTML).toBe(parse(html)[0]!.children[0]!.outerHTML);
  });
});


describe('isPlainPrimaryClick (audit4 N-M8)', () => {
  const click = (overrides: Partial<Parameters<typeof isPlainPrimaryClick>[0]> = {}): boolean =>
    isPlainPrimaryClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides });

  it('claims a plain primary click', () => {
    expect(click()).toBe(true);
  });

  it('leaves the browser its own meaning for a modified or non-primary click', () => {
    // cmd-click (macOS) / ctrl-click (Windows, Linux) = open in a new tab.
    expect(click({ metaKey: true })).toBe(false);
    expect(click({ ctrlKey: true })).toBe(false);
    // shift-click = new window; alt-click = download.
    expect(click({ shiftKey: true })).toBe(false);
    expect(click({ altKey: true })).toBe(false);
    // Middle-click — the classic open-in-background-tab.
    expect(click({ button: 1 })).toBe(false);
    expect(click({ button: 2 })).toBe(false);
  });
});
