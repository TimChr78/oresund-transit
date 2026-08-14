import type { Lang } from '../i18n';
import type { PageMeta } from './seo';

/**
 * Prerender a static route (/methodology, /privacy) as a real HTML document.
 *
 * Takes the Vite entry shell (index.html) and injects the server-rendered
 * page fragment into <div id="app">, so crawlers and JS-disabled clients get
 * the actual content in the initial payload. The rest of the shell — fonts,
 * meta, the /src/main.ts module script (which re-renders the page in the
 * visitor's language and keeps the lang switcher working) and the self-heal
 * reload guard — is preserved untouched.
 *
 * The route's own SEO metadata (title, meta description, og/twitter tags)
 * replaces the dashboard defaults from the shell.
 *
 * This is a pure string transform on the source shell; the build script in
 * scripts/prerender.ts applies it and writes public/{methodology,privacy}.html
 * (which Vite copies verbatim into dist/).
 */
export function renderPrerenderedPage(shell: string, body: string, lang: Lang, meta: PageMeta): string {
  let html = shell.replace('<div id="app"></div>', `<div id="app">${body}</div>`);
  html = html.replace('<html lang="en">', `<html lang="${lang}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${meta.title}</title>`);
  html = setMetaContent(html, 'name', 'description', meta.description);
  html = setMetaContent(html, 'property', 'og:title', meta.title);
  html = setMetaContent(html, 'property', 'og:description', meta.description);
  html = setMetaContent(html, 'name', 'twitter:title', meta.title);
  html = setMetaContent(html, 'name', 'twitter:description', meta.description);
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
