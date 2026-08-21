import type { Route } from './route';
import type { Lang } from '../i18n';
import { SITE_URL } from './archive';

/**
 * Per-route, per-language SEO metadata, shared by the prerender build script
 * (static pages in en + the localized /sv/ and /da/ variants) and documented
 * for the shell. The in-browser lang switcher re-renders page text for
 * visitors on the / and /en shells; the prerendered localized variants ship
 * their metadata (and the en shell's home) in the initial HTML. The
 * dashboard's title/description live in index.html (Vite entry shell); the
 * `en` values below must match it.
 *
 * Each canonical is the localized absolute URL (en unprefixed, sv/da under
 * their language prefix). Canonical + og:url follow the variant.
 */
export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
}

export const META: Record<Route, Record<Lang, PageMeta>> = {
  dashboard: {
    en: {
      title: 'Øresund.live — live train status across the Sound',
      description:
        'Live train status for Øresundståg departures between Hyllie and København H — delays, cancellations and alerts, updated every 5 minutes from Trafiklab.',
      canonical: 'https://oresund.live/',
    },
    sv: {
      title: 'Øresund.live — live tågstatus över Öresund',
      description:
        'Live tågstatus för Øresundstågs avgångar mellan Hyllie och København H — förseningar, inställda tåg och störningar, uppdaterat var 5:e minut från Trafiklab.',
      canonical: 'https://oresund.live/sv/',
    },
    da: {
      title: 'Øresund.live — live togstatus over Øresund',
      description:
        'Live togstatus for Øresundstågs afgange mellem Hyllie og København H — forsinkelser, aflysninger og driftsforstyrrelser, opdateret hvert 5. minut fra Trafiklab.',
      canonical: 'https://oresund.live/da/',
    },
  },
  methodology: {
    en: {
      title: 'Methodology — Øresund.live',
      description:
        'How every metric on the Øresund.live dashboard is defined — on-time and delay thresholds, the Trafiklab data source and its caveats.',
      canonical: 'https://oresund.live/methodology',
    },
    sv: {
      title: 'Metod — Øresund.live',
      description:
        'Så här definieras alla nyckeltal på Øresund.live-tavlan — tröskelvärden för punktlighet och förseningar, datakällan Trafiklab och dess begränsningar.',
      canonical: 'https://oresund.live/sv/methodology',
    },
    da: {
      title: 'Metode — Øresund.live',
      description:
        'Sådan defineres alle nøgletal på Øresund.live-tavlen — grænseværdier for rettidighed og forsinkelser, datakilden Trafiklab og dens begrænsninger.',
      canonical: 'https://oresund.live/da/methodology',
    },
  },
  privacy: {
    en: {
      title: 'Privacy — Øresund.live',
      description:
        'What Øresund.live stores and why — only your language choice, cookieless anonymous analytics, no ads, no personal data.',
      canonical: 'https://oresund.live/privacy',
    },
    sv: {
      title: 'Integritet — Øresund.live',
      description:
        'Vad Øresund.live sparar och varför — bara ditt språkval, kaklös anonym statistik, inga annonser och inga personuppgifter.',
      canonical: 'https://oresund.live/sv/privacy',
    },
    da: {
      title: 'Privatliv — Øresund.live',
      description:
        'Hvad Øresund.live gemmer og hvorfor — kun dit sprogvalg, cookieløs anonym statistik, ingen annoncer og ingen personoplysninger.',
      canonical: 'https://oresund.live/da/privacy',
    },
  },
};

/**
 * Absolute URL of a static page's canonical path in a language. `path` is the
 * en (unprefixed) canonical path, e.g. '/' or '/methodology'; en is served
 * without a language prefix, sv/da live under /sv and /da.
 */
export function localizedUrl(path: string, lang: Lang): string {
  const prefix = lang === 'en' ? '' : `/${lang}`;
  return `${SITE_URL}${prefix}${path}`;
}

/**
 * The hreflang <link> cluster for a static page, including x-default -> en.
 * Injected verbatim into <head> of every variant (en, sv, da) of the page.
 */
export function hreflangCluster(path: string): string {
  const links = (['en', 'sv', 'da'] as const)
    .map((l) => `    <link rel="alternate" hreflang="${l}" href="${localizedUrl(path, l)}" />`)
    .concat([`    <link rel="alternate" hreflang="x-default" href="${localizedUrl(path, 'en')}" />`]);
  return links.join('\n');
}
