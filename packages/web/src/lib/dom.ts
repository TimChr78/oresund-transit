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
 * Two nodes are exempt from replacement (audit5 H3):
 *
 *   - a live region (role="status" / aria-live) is mutated in place however
 *     much of it changed. A region inserted already holding its text does not
 *     announce in most screen readers — the region has to pre-exist and be
 *     rewritten — and the banner's class changes on every band transition,
 *     which is exactly when the announcement matters;
 *   - whatever a replacement tears the focus away from hands it back: the
 *     focused node's counterpart in the new markup is focused after the swap,
 *     so a keyboard user is not dumped to <body> for clicking a toggle. The
 *     REMOVAL sweep gets the same treatment (audit6 M3) — a section that
 *     contains the focus and is dropped entirely would otherwise lose it just
 *     as surely as a replacement does.
 *
 * Inter-tag whitespace text nodes: they are neither matched nor removed during
 * the keyed walk, and the keyed walk never adds or deletes one. A live region
 * whose children are too tangled to key IS rewritten node by node, and that
 * branch moves whatever text nodes it finds (audit6 L14) — the earlier claim
 * that none is ever touched was wrong. It is balanced, so nothing accumulates;
 * adjacent blanks collapse to one space under HTML whitespace rules; and a
 * flex container ignores whitespace-only children entirely.
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
 *
 * Where a renderer declares a `data-key`, that key IS the identity and the
 * class is not part of it (audit5 H3): the status banner re-colours itself by
 * swapping `status-green` for `status-amber`, and a class-keyed match would
 * read that as one node out and a different one in — replacing the live region
 * that has to survive to announce the change.
 */
function keyOf(el: Element): string {
  const id = el.getAttribute('id') ?? '';
  const dataKey = el.getAttribute('data-key');
  if (dataKey !== null) return `${el.tagName}#${id}@${dataKey}`;
  return `${el.tagName}#${id}.${el.getAttribute('class') ?? ''}@`;
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
  // The focused element, read before anything moves: a removal below can drop
  // the subtree holding it, and by then it is already back on <body>.
  const active = typeof document === 'undefined' ? null : document.activeElement;
  let focusAt = -1;
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

  for (const queue of live.values()) {
    for (const el of queue) {
      if (focusAt === -1 && active !== null && containsNode(el, active)) {
        // Where the removed node stood, so the focus can land on what replaced
        // it — or on the nearest surviving neighbour when nothing did.
        focusAt = Array.from(parent.children).indexOf(el);
      }
      el.remove();
    }
  }
  if (focusAt !== -1) {
    const children = Array.from(parent.children);
    carryFocus(children[Math.min(focusAt, children.length - 1)] ?? parent);
  }
}

/**
 * True when `node` is `ancestor` or sits inside it.
 *
 * `document.activeElement` answers with the element itself, not the subtree —
 * so a focused day-range button inside a removed <section> reads as "the
 * button", and only a walk up the parents reveals it is going away with the
 * section (audit6 M3).
 */
function containsNode(ancestor: Node, node: Node): boolean {
  for (let cur: Node | null = node; cur; cur = cur.parentNode) {
    if (cur === ancestor) return true;
  }
  return false;
}

/**
 * True for a live region — the element a screen reader is already listening
 * to. Replacing one destroys the announcement: a region that enters the tree
 * already holding its text reads as "nothing changed" in most screen readers,
 * so the region must pre-exist and be rewritten in place.
 */
function isLiveRegion(el: Element): boolean {
  return el.getAttribute('role') === 'status' || el.getAttribute('aria-live') !== null;
}

/** Bring `current`'s attributes exactly in line with `next`'s, in place. */
function copyAttributes(current: Element, next: Element): void {
  // Rebuilt in `next`'s order (audit6 L6): setAttribute on an attribute a node
  // already has keeps its original position, so copying value-by-value
  // preserved the CURRENT node's ordering. After the banner's first in-place
  // band change its attributes no longer matched the freshly rendered markup's
  // order, `current.outerHTML === next.outerHTML` could never be true again,
  // and update()'s byte-identical fast path — the cheapest test in the module —
  // was wasted on the one element that runs it most often.
  for (const name of Array.from(current.getAttributeNames())) current.removeAttribute(name);
  for (const name of next.getAttributeNames()) {
    current.setAttribute(name, next.getAttribute(name) ?? '');
  }
}

/**
 * The node in `next` that corresponds to `active` inside `current`, or null
 * when `active` is not inside `current` (or there is none).
 *
 * replaceWith throws the caret to <body> and a keyboard or screen-reader user
 * back to the top of the document, because the node they were on is gone. The
 * language, mode and day-range buttons all change class and aria-pressed when
 * activated — which is what triggers the swap — so the activated control's
 * counterpart in the new markup is found by walking its child-index path over
 * and handed back for focus. A path that no longer exists falls back to the
 * replacement itself, the nearest thing to where the user was — see
 * carryFocus(), which is what makes that fallback a place focus can land.
 */
export function refocusTarget(current: Element, next: Element, active: Node | null): Element | null {
  if (!active) return null;
  const path: number[] = [];
  let node: Node | null = active;
  while (node && node !== current) {
    const parent: Node | null = node.parentNode;
    if (!parent) return null;
    path.unshift(Array.from(parent.childNodes).indexOf(node as ChildNode));
    node = parent;
  }
  if (node !== current) return null;
  let target: Node | null = next;
  for (const index of path) {
    target = target.childNodes[index] ?? null;
    if (!target) return next;
  }
  // A focused text node has no focus() of its own; the nearest enclosing
  // element does, and if the position is gone entirely the replacement is the
  // closest thing to where the user was.
  while (target && target.nodeType !== 1) target = target.parentNode;
  return (target as Element | null) ?? next;
}

/**
 * Put the focus on `target`, and make it focusable if it is not already.
 *
 * The fallback `refocusTarget` hands back is often a plain <div> — the error
 * placeholder's retry button, say, is replaced whole by the loading block's
 * `.empty` <div>, which cannot take the focus at all. focus() on it is a
 * silent no-op and the user is exactly where the swap was meant to avoid
 * sending them: on <body>. `tabindex="-1"` puts an element in the programmatic
 * tab order — reachable by focus(), never by Tab — so the deliberate fallback
 * becomes a real destination instead of a failed one.
 */
function carryFocus(target: Element): void {
  const el = target as HTMLElement;
  if (typeof el.focus !== 'function') return;
  el.focus();
  if (typeof document === 'undefined' || document.activeElement === el) return;
  el.setAttribute('tabindex', '-1');
  el.focus();
}

/** replaceWith, with the focus carried across to the replacement. */
function replaceFocused(current: Element, next: Element): void {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  const target = refocusTarget(current, next, active);
  current.replaceWith(next);
  if (target) carryFocus(target);
}

/** Reuse `current` where it can, replace it where it cannot. */
function update(current: Element, next: Element, parse: ParseHtml): void {
  // Byte-identical: the common case, and the cheapest test in the module.
  if (current.outerHTML === next.outerHTML) return;
  const keyableBoth = keyable(current) && keyable(next);
  // A live region is mutated, never replaced (audit5 H3) — see isLiveRegion.
  // Its attributes are applied in place and its children reconciled as usual;
  // children too tangled to key (text mixed with elements) are rewritten as a
  // block, which still leaves the region itself standing.
  if (isLiveRegion(current)) {
    if (!sameAttributes(current, next)) copyAttributes(current, next);
    if (keyableBoth) applyChildren(current, Array.from(next.children), parse);
    else {
      // Children too tangled to key (text mixed with elements): adopt the
      // replacement's nodes wholesale. The region itself stays in the tree,
      // which is the part the screen reader is listening to.
      let child = current.firstChild;
      while (child) {
        const nextSibling = child.nextSibling;
        current.removeChild(child);
        child = nextSibling;
      }
      for (const node of Array.from(next.childNodes)) current.appendChild(node);
    }
    return;
  }
  // Attributes differ, or the children are text-bearing leaves — either way
  // there is nothing to key on below this node.
  if (!sameAttributes(current, next) || !keyableBoth) {
    replaceFocused(current, next);
    return;
  }
  applyChildren(current, Array.from(next.children), parse);
}
