import type { Lang } from '../i18n';

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
 * This is a pure string transform on the source shell; the build script in
 * scripts/prerender.ts applies it and writes public/{methodology,privacy}.html
 * (which Vite copies verbatim into dist/).
 */
export function renderPrerenderedPage(shell: string, body: string, lang: Lang): string {
  let html = shell.replace('<div id="app"></div>', `<div id="app">${body}</div>`);
  html = html.replace('<html lang="en">', `<html lang="${lang}">`);
  return html;
}
