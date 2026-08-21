/**
 * The pretty-path HTML pages this site serves as real, indexable pages (as
 * opposed to the dashboard shell that gets dispatched client-side). This is
 * the single source of truth shared by:
 *
 *  - functions/[[path]].js — the soft-404 catch-all passes these paths through
 *    the ASSETS binding instead of treating them as unknown → 404; and
 *  - scripts/prerender.ts — the set of pages emitted as real HTML files, so
 *    adding a prerendered page here automatically keeps the catch-all in sync.
 *
 * index.html (the build output served at /) is not a prerender artifact but is
 * still an SPA-served HTML page; the catch-all appends '/index.html' itself.
 */
export const STATIC_PAGE_PATHS = ['/', '/methodology', '/privacy'] as const;

/** dist/ file names each pretty path is emitted as. The index page is excluded:
 *  it is the build output itself, not a prerender artifact. */
export const PRERENDER_FILES = STATIC_PAGE_PATHS.filter((p) => p !== '/').map(
  (p) => `${p.slice(1)}.html`,
);
