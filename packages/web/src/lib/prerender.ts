import type { Lang } from '../i18n';
import { translate } from '../i18n';
import { renderHomeAbout } from '../components/HomeAbout';
import { renderStationPicker, stationScopeLabel } from '../components/StationPicker';
import type { PageMeta } from './seo';
import { localizedPath, ogLocaleTags } from './seo';
import { esc } from './html';
import type { HomeSummary } from './seo-summary';

export type { HomeSummary } from './seo-summary';

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
  // The shell's no-JS/crawler fallback (brand wordmark + H1 lead) is dashboard
  // content — the static route injects its own page into #app, so the fallback
  // must not leak into /methodology or /privacy. The block may contain nested
  // <div> elements (the brand wordmark), so consume up to the closing </div>
  // that sits immediately before the site footer, not the first </div> found.
  // The shell footer goes with it (audit4 N-M2): the injected page already ends
  // in its own footer, and HTML allows exactly one <footer> landmark per
  // document — no-JS visitors keep one either way, because this only runs on
  // the prerendered pages, where the page's own footer is static HTML.
  html = html.replace(
    /<div id="static-shell"[^>]*>[\s\S]*?<\/div>\s*<footer class="site-footer">[\s\S]*?<\/footer>/,
    '',
  );
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
  let html = applySeo(shell, lang, meta, hreflang);
  // M2: the sv/da variants must not ship the English static-shell lead
  // verbatim — swap in the localized tagline (en keeps the shell text).
  if (lang !== 'en') {
    const lead = translate('lead_tagline', lang);
    html = html.replace(/<h1 class="lead">[\s\S]*?<\/h1>/, () => `<h1 class="lead">${lead}</h1>`);
    // C1: the station picker and the board scope label are user-visible
    // strings, so the localized home variants get the localized station names
    // and the /sv|/da station routes rather than the shell's English markup.
    html = html.replace(/<nav class="station-nav"[\s\S]*?<\/nav>/, () => renderStationPicker(lang));
    html = html.replace(
      /<span class="board-label">[\s\S]*?<\/span>/,
      () => `<span class="board-label">${esc(stationScopeLabel(lang))}</span>`,
    );
    // C2: the evergreen about block is user-visible prose, so the /sv/ and
    // /da/ home variants get their own wording and their own station routes
    // instead of the shell's English paragraph block.
    html = html.replace(/<section class="home-about">[\s\S]*?<\/section>/, () => renderHomeAbout(lang));
    // H6 (audit5): the shell's footer was passed through untouched — English
    // labels AND English URLs on a `<html lang="sv">` document, pointing at
    // /methodology when /sv/methodology exists. This is the no-JS/crawler copy,
    // so the JS-rendered footer's fix (audit4 N-M4) never reached the variant
    // that matters more for search.
    html = html.replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, () => shellFooterHtml(lang));
    // The wordmark links home, so on a localized variant it links THAT home.
    // (The shell anchor already carries lang="da" for the slashed Ø — L3.)
    html = html.replace(
      /(<a class="brand") href="\/"/,
      `$1 href="${localizedPath('/', lang)}"`,
    );
  }
  return html;
}

/**
 * The shell's static footer, in the page's language.
 *
 * Localized targets go through localizedPath; the archive hubs have no
 * localized twins, so those anchors carry hreflang="en" — hreflang ONLY
 * (audit5 M1), because it describes the target document while `lang` would
 * describe this element's own translated text. The language switcher offers
 * the OTHER two languages: index.html's SV/DA pair meant a Swedish page whose
 * "SV" link pointed at itself and no way back to English (audit5 L7). English
 * keeps the shell's own footer verbatim, where SV + DA is already the full set.
 */
export function shellFooterHtml(lang: Lang): string {
  const sep = `\n      <span class="sep" aria-hidden="true">·</span>`;
  const link = (href: string, label: string, attrs = ''): string =>
    `      <a href="${esc(href)}"${attrs}>${esc(label)}</a>`;
  const items = [
    link(localizedPath('/history', lang), translate('nav_history', lang)),
    link('/line', translate('arch_link_line', lang), ' hreflang="en"'),
    link('/station', translate('arch_link_station', lang), ' hreflang="en"'),
    link(localizedPath('/methodology', lang), translate('nav_methodology', lang)),
    // The other two languages, each named and labelled in its own language.
    ...(['sv', 'da', 'en'] as const)
      .filter((l) => l !== lang)
      .map((l) => link(localizedPath('/', l), l.toUpperCase(), ` lang="${l}" hreflang="${l}"`)),
  ];
  return `<footer class="site-footer">
  <nav aria-label="${esc(translate('nav_site_sections', lang))}">
${items.join(sep)}
  </nav>
</footer>`;
}

/**
 * Localized home shell with the build-time corridor status summary.
 *
 * Same as renderLocalizedHome, but when a HomeSummary snapshot was resolved
 * at build time it also injects the three-sentence status block into
 * #static-shell (the no-JS/crawler fallback): status sentence, last-24h
 * cancellation count, trend line. The block is plain <p> text so the static
 * pages' strip regex (which assumes #static-shell contains no nested <div>)
 * keeps working, and boot() removes the whole block client-side on load.
 *
 * `summary` is null when the build-time fetch failed (collector unreachable /
 * no snapshot yet) — the shell then ships exactly like renderLocalizedHome.
 */
export function renderHomeWithSummary(
  shell: string,
  lang: Lang,
  meta: PageMeta,
  hreflang: string | undefined,
  summary: HomeSummary | null,
): string {
  let html = renderLocalizedHome(shell, lang, meta, hreflang);
  if (summary) html = injectHomeSummary(html, lang, summary);
  return html;
}

/** Build and inject the three-sentence summary into #static-shell. */
function injectHomeSummary(html: string, lang: Lang, summary: HomeSummary): string {
  const sentences = [
    translate(summary.statusKey, lang),
    translate(
      summary.cancellations24h === 0
        ? 'seo_cancel_24h_zero'
        : summary.cancellations24h === 1
          ? 'seo_cancel_24h_one'
          : 'seo_cancel_24h_many',
      lang,
      { n: summary.cancellations24h },
    ),
    translate(summary.trendKey, lang),
  ];
  const block = `<p class="seo-summary">${sentences.map((s) => esc(s)).join(' ')}</p>`;
  // The lead H2 is the last element inside #static-shell; inject after it,
  // still within the block (plain <p>s only — no nested <div>, so the
  // static-page strip regex and boot()'s removal both keep working).
  return html.replace('</h1>', `</h1>\n      ${block}`);
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
  // M10: og:locale + og:locale:alternate — every page family is served in
  // three languages, so Facebook/LinkedIn can tell /sv/ from / (audit3 M2).
  html = html.replace('</head>', `${ogLocaleTags(lang)}\n  </head>`);
  // The shell's JSON-LD carries an English `description` on both the WebSite
  // and the Organization node, and nothing above rewrites it — so a /sv/ page
  // with a Swedish title and meta description still published English
  // sentences inside `lang="sv"` structured data. Rather than add a third
  // language's worth of description strings to keep in sync, drop the member
  // on the non-English variants: `name`/`url`/`sameAs`/`contactPoint` are the
  // facts the graph exists for, and the archive family's siteIdentity already
  // ships without a description (audit4 LOW).
  if (lang !== 'en') {
    // Two shapes exist: a description member followed by more members
    // (`...,` — drop the member cleanly) and a description as the LAST
    // member of its node (`...}` — drop it plus the preceding comma so the
    // remaining JSON still parses).
    html = html.replace(/\s*"description": "[^"]*",/g, '');
    html = html.replace(/,\s*"description": "[^"]*"(\s*\})/g, '$1');
  }
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
