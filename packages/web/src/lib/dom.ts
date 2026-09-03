/**
 * Keyed DOM reconciliation for the board (audit4 N-H7).
 *
 * renderApp() produces the whole board as one HTML string, and boot() used to
 * assign it to #app.innerHTML on every dispatch. So every 120-second refresh
 * and every station switch tore the entire board down and rebuilt it —
 * hundreds of nodes replaced to change a handful of cells, scroll position and
 * text selection lost with them, and the browser re-laid-out a page that had
 * barely changed.
 *
 * reconcile() walks the new string against the live tree instead and touches
 * only what differs:
 *
 *   - a subtree whose HTML is byte-identical is left completely alone (the
 *     common case on a refresh, where most of the board has not moved);
 *   - elements matched by key are REUSED — relocated with insertBefore, which
 *     moves a node without recreating it — and descended into, never rebuilt;
 *   - what is new is inserted, what is gone is removed, and what changed is
 *     replaced at the smallest node that actually changed.
 *
 * Descent stops at any element whose children are not a plain element list
 * (real text mixed in with the tags — a <td> holding a formatted time, say).
 * There is no key structure to walk there, so that node is replaced whole.
 * That is what bounds the work: leaves that carry data are replaced while every
 * unchanged branch above them survives.
 *
 * Inter-tag whitespace text nodes are neither matched nor removed. They cannot
 * accumulate (reconcile never adds or deletes one), multiple adjacent blanks
 * collapse to a single space under HTML whitespace rules, and a flex
 * container ignores whitespace-only children entirely — so leaving them where
 * the first paint put them is safe and costs nothing.
 *
 * Zero dependencies: no virtual DOM, no library. The parser is the browser's
 * own via <template>, which never fetches whatever markup it parses. `parse`
 * is injectable so the reconciliation itself can be tested without a DOM.
 */

/** Parse an HTML fragment into its detached top-level elements. */
export type ParseHtml = (html: string) => Element[];

/**
 * True for a plain primary click — the only click main.ts may take over.
 *
 * The station picker's entries are real links to real pages, so every other
 * gesture keeps the browser's own meaning (audit4 N-M8): cmd/ctrl-click opens a
 * new tab, shift-click a new window, alt-click downloads, and a non-primary
 * button (middle-click) is the same shortcut again. Intercepting those too used
 * to leave a cmd-click doing nothing at all — the worst of both worlds, a link
 * that neither navigated nor switched the board.
 */
export function isPlainPrimaryClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  );
}

function templateParse(html: string): Element[] {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return Array.from(tpl.content.children);
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/** A text node holding only the whitespace between tags. */
function isBlankText(node: Node): boolean {
  return node.nodeType === 3 && !(node.textContent ?? '').trim();
}

/** True when every child is an element or inter-tag whitespace. */
function keyable(el: Element): boolean {
  return Array.from(el.childNodes).every((n) => isElement(n) || isBlankText(n));
}

/**
 * A node's identity for matching: tag, id, class and any explicit data-key.
 * The renderers put `data-key` on the rows of the two data tables (disruption
 * id / departure dep_key), so a row that merely moved is recognised as the same
 * row rather than deleted and rebuilt. Keys may repeat — one <tr> per row of
 * the same shape — so matches are consumed in order and stay positional
 * within a key.
 */
function keyOf(el: Element): string {
  return `${el.tagName}#${el.getAttribute('id') ?? ''}.${el.getAttribute('class') ?? ''}@${el.getAttribute('data-key') ?? ''}`;
}

function sameAttributes(a: Element, b: Element): boolean {
  const names = a.getAttributeNames();
  if (names.length !== b.getAttributeNames().length) return false;
  return names.every((name) => a.getAttribute(name) === b.getAttribute(name));
}

/**
 * Bring `root` in line with `html` without discarding the nodes it can reuse.
 * The first call (an empty root) assigns directly — there is nothing to keep.
 */
export function reconcile(root: Element, html: string, parse: ParseHtml = templateParse): void {
  if (root.children.length === 0) {
    root.innerHTML = html;
    return;
  }
  applyChildren(root, parse(html), parse);
}

/** Make parent's element children exactly `next`, reusing what matches. */
function applyChildren(parent: Element, next: Element[], parse: ParseHtml): void {
  // Live children by key. The map's leftover entries at the end are the ones
  // the new markup no longer contains.
  const live = new Map<string, Element[]>();
  for (const child of Array.from(parent.children)) {
    const key = keyOf(child);
    const queue = live.get(key);
    if (queue) queue.push(child);
    else live.set(key, [child]);
  }

  const pairs = next.map((node) => {
    const queue = live.get(keyOf(node));
    return { node, current: queue?.shift() ?? null };
  });

  // Place in order. `ref` is the node the next item goes before and only ever
  // advances, so a run that is already in order costs no moves at all; and
  // insertBefore on a node already in the tree relocates it rather than
  // recreating it, which is what keeps an unchanged row an unchanged row.
  let ref: Node | null = parent.firstChild;
  for (const { node, current } of pairs) {
    if (current) {
      if (current === ref) ref = ref.nextSibling;
      else parent.insertBefore(current, ref);
      update(current, node, parse);
    } else {
      parent.insertBefore(node, ref);
    }
  }

  for (const queue of live.values()) for (const el of queue) el.remove();
}

/** Reuse `current` where it can, replace it where it cannot. */
function update(current: Element, next: Element, parse: ParseHtml): void {
  // Byte-identical: the common case, and the cheapest test in the module.
  if (current.outerHTML === next.outerHTML) return;
  // Attributes differ, or the children are text-bearing leaves — either way
  // there is nothing to key on below this node.
  if (!sameAttributes(current, next) || !keyable(current) || !keyable(next)) {
    current.replaceWith(next);
    return;
  }
  applyChildren(current, Array.from(next.children), parse);
}
