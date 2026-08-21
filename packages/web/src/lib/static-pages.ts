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
 *
 * Static pages are served in three languages: en (unprefixed, the default)
 * and the prerendered /sv/ and /da/ variants. Every (id, lang) pair is
 * derived from this registry + STATIC_LANGS, so the soft-404 known-path set
 * and the prerender output list can never drift apart.
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
 * page is the build output itself (the shell), so it has no SSG renderer of
 * its own — but it IS emitted as a localized shell (sv/index.html, da/index.html).
 */
export type PrerenderedPageId = Exclude<StaticPageId, 'home'>;

/** Languages each static page is served in (en is the unprefixed default). */
export const STATIC_LANGS = ['en', 'sv', 'da'] as const;
export type StaticLang = (typeof STATIC_LANGS)[number];

/** The single canonical (en) path a route is served at. */
function basePath(id: StaticPageId): string {
  const p = STATIC_PAGES.find((entry) => entry.id === id);
  if (!p) throw new Error(`unknown static page id: ${id}`);
  return p.path;
}

/** dist/ file name for a page at a given root path (home → index.html). */
function baseFile(path: string): string {
  return path === '/' ? 'index.html' : `${path.slice(1)}.html`;
}

/** Canonical path of a static page in a language (en unprefixed, e.g. /sv/methodology). */
export function staticPath(id: StaticPageId, lang: StaticLang): string {
  const path = basePath(id);
  return lang === 'en' ? path : `/${lang}${path}`;
}

/** dist/ file path a page variant is emitted as, e.g. 'sv/methodology.html'. */
export function staticFilePath(id: StaticPageId, lang: StaticLang): string {
  const path = basePath(id);
  return lang === 'en' ? baseFile(path) : `${lang}/${baseFile(path)}`;
}

/**
 * Canonical paths the soft-404 catch-all passes through the ASSETS binding
 * (every page in every language).
 */
export const STATIC_PAGE_PATHS: readonly string[] = STATIC_PAGES.flatMap((p) =>
  STATIC_LANGS.map((lang) => staticPath(p.id, lang)),
);

/** dist/ file names each prerendered page variant is emitted as. */
export const PRERENDER_FILES: readonly string[] = STATIC_PAGES.flatMap((p) =>
  STATIC_LANGS.map((lang) => staticFilePath(p.id, lang)),
);
