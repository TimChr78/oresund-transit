import { describe, expect, it } from 'vitest';
import { reconcile, type ParseHtml } from '../src/lib/dom';

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
    const inner = this.childNodes
      .map((n) => (n.nodeType === 1 ? (n as FakeElement).outerHTML : (n as FakeText).text))
      .join('');
    return `<${this.tagName}${open}>${inner}</${this.tagName}>`;
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
  remove(): void {
    const parent = this.parentNode;
    if (!parent) return;
    parent.childNodes = parent.childNodes.filter((n) => n !== this);
    this.parentNode = null;
    touched++;
  }
}

function detach(node: FakeElement): void {
  if (node.parentNode) {
    node.parentNode.childNodes = node.parentNode.childNodes.filter((n) => n !== node);
    node.parentNode = null;
  }
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
      if (leaf[3]) el.childNodes.push(new FakeText(leaf[3]));
      attach(el);
    }
  }
  return roots;
}

function attrsOf(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
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

