import type { Route } from './route';

/**
 * Per-route SEO metadata, shared by the prerender build script (static pages)
 * and documented for the shell. Titles/descriptions are served in English —
 * the crawler default; the in-browser lang switcher re-renders page text for
 * visitors, and main.ts overrides document.title on boot for static pages.
 * The dashboard's title/description live in index.html (Vite entry shell);
 * the values below must match it.
 */
export interface PageMeta {
  title: string;
  description: string;
}

export const META: Record<Route, PageMeta> = {
  dashboard: {
    title: 'Øresund.live — live train status across the Sound',
    description:
      'Live departures, delays and disruptions across the Øresund — Hyllie ↔ København H. Privacy-friendly, no ads.',
  },
  methodology: {
    title: 'Methodology — Øresund.live',
    description:
      'How every metric on the Øresund.live dashboard is defined — on-time and delay thresholds, the Trafiklab data source and its caveats.',
  },
  privacy: {
    title: 'Privacy — Øresund.live',
    description:
      'What Øresund.live stores and why — only your language choice, cookieless anonymous analytics, no ads, no personal data.',
  },
};
