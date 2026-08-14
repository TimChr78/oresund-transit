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
 * This is a pure string transform; the build script in scripts/prerender.ts
 * applies it to dist/index.html after `vite build` and writes
 * dist/{methodology,privacy}.html.
 */
export function renderPrerenderedPage(shell: string, body: string, lang: Lang, meta: PageMeta): string {
  let html = shell.replace('<div id="app"></div>', `<div id="app">${body}</div>`);
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
  // The noscript "requires JavaScript" block is for the dashboard; the static
  // page content is already in the HTML.
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, '');
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
