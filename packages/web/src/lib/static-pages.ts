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
 *
 * Each registry entry pairs a stable route id with the canonical path it is
 * served at. The route id is the key the prerenderer indexes its SSG renderers
 * by, so adding a non-home page here forces you to also add a renderer in
 * scripts/prerender.ts — that table is exhaustively typed over
 * `PrerenderedPageId`, so a new path can never silently map to a missing
 * renderer (no arbitrary string casts).
 */
export const STATIC_PAGES = [
  { id: 'home', path: '/' },
  { id: 'methodology', path: '/methodology' },
  { id: 'privacy', path: '/privacy' },
] as const;

/** Route ids for every static page, including the SPA-shell home page. */
export type StaticPageId = (typeof STATIC_PAGES)[number]['id'];

/**
 * Route ids for the pages that are prerendered to real dist/ HTML. The home
 * page is the build output itself (the shell), so it has no renderer of its
 * own and is excluded.
 */
export type PrerenderedPageId = Exclude<StaticPageId, 'home'>;

/** Canonical paths the soft-404 catch-all passes through the ASSETS binding. */
export const STATIC_PAGE_PATHS: readonly string[] = STATIC_PAGES.map((p) => p.path);

/** dist/ file names each prerendered page is emitted as (home is the shell). */
export const PRERENDER_FILES: readonly string[] = STATIC_PAGES.filter(
  (p) => p.id !== 'home',
).map((p) => `${p.path.slice(1)}.html`);
