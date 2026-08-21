import type { Lang } from '../i18n';
import type { PageMeta } from './seo';

/**
 * Prerender a static route (/methodology, /privacy) as a real HTML document.
 *
 * Takes the BUILT Vite shell (dist/index.html — which already carries the
 * hashed CSS/JS asset links) and injects the server-rendered page fragment
 * into <div id="app">, so crawlers and JS-disabled clients get the actual
 * content in the initial payload. Because the shell is the built page, the
 * static routes load the same stylesheet and the same JS bundle as the
 * dashboard: the lang switcher works (main.ts re-renders the page in the
 * visitor's language) and the pages are fully styled.
 *
 * The route's own SEO metadata (title, meta description, canonical, og/twitter
 * tags) replaces the dashboard defaults from the shell, and the dashboard-only
 * <noscript> block is dropped (static pages render fine without JS).
 *
 * `hreflang` is the optional <link rel="alternate" hreflang=...> cluster
 * (en+sv+da+x-default) injected into <head> — required for every language
 * variant of these pages.
 *
 * This is a pure string transform; the build script in scripts/prerender.ts
 * applies it to dist/index.html after `vite build` and writes the per-language
 * dist/{methodology,privacy}.html (and sv/ da/ sub-directories).
 */
export function renderPrerenderedPage(
  shell: string,
  body: string,
  lang: Lang,
  meta: PageMeta,
  hreflang?: string,
): string {
  let html = shell.replace('<div id="app"></div>', `<div id="app">${body}</div>`);
  html = applySeo(html, lang, meta, hreflang);
  // The noscript "requires JavaScript" block is for the dashboard; the static
  // page content is already in the HTML.
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, '');
  // The shell's no-JS/crawler fallback (static H1 + SEO lead) is dashboard
  // content — the static route injects its own page into #app, so the
  // fallback must not leak into /methodology or /privacy. The block itself
  // contains no nested <div>, so the first </div> closes it.
  html = html.replace(/<div id="static-shell"[^>]*>[\s\S]*?<\/div>\s*/, '');
  return html;
}

/**
 * Localized variant of the dashboard home page.
 *
 * The home page is the SPA shell (rendered client-side), so its /sv/ and /da/
 * variants are the same shell with the language attribute, localized
 * title/description/canonical/og/twitter and the hreflang cluster swapped in.
 * Unlike renderPrerenderedPage, the dashboard-only <noscript> and
 * #static-shell SEO fallback are KEPT — the home page still needs them. Used
 * to emit dist/index.html (en, gains hreflang) and dist/{sv,da}/index.html.
 */
export function renderLocalizedHome(shell: string, lang: Lang, meta: PageMeta, hreflang?: string): string {
  return applySeo(shell, lang, meta, hreflang);
}

/**
 * Swap language, title, canonical and the meta/og/twitter block for a page,
 * inject the optional hreflang cluster, and return the updated document.
 * Shared by the static-page and home-variant paths.
 */
function applySeo(html: string, lang: Lang, meta: PageMeta, hreflang?: string): string {
  html = html.replace('<html lang="en">', `<html lang="${lang}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${meta.title}</title>`);
  // Replace the shell's dashboard canonical with the route's — never duplicate.
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${meta.canonical}" />`);
  html = setMetaContent(html, 'name', 'description', meta.description);
  html = setMetaContent(html, 'property', 'og:title', meta.title);
  html = setMetaContent(html, 'property', 'og:description', meta.description);
  html = setMetaContent(html, 'property', 'og:url', meta.canonical);
  html = setMetaContent(html, 'name', 'twitter:title', meta.title);
  html = setMetaContent(html, 'name', 'twitter:description', meta.description);
  if (hreflang) {
    html = html.replace('</head>', `${hreflang}\n  </head>`);
  }
  return html;
}

/**
 * Replace the `content` value of a `<meta name|property="…">` tag, tolerating
 * multiline formatting (index.html keeps the description on several lines).
 * Each targeted tag has exactly one content attribute.
 */
function setMetaContent(html: string, attr: 'name' | 'property', value: string, content: string): string {
  const re = new RegExp(`(<meta\\s+${attr}="${value}"[\\s\\S]*?content=")[^"]*(")`);
  return html.replace(re, `$1${content}$2`);
}
