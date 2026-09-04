import { describe, expect, it } from 'vitest';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
import { renderApp } from '../src/components/App';
import { createInitialState } from '../src/state';
import { getDict, type Lang } from '../src/i18n';

const LANGS: Lang[] = ['sv', 'da', 'en'];

/** Every KPI name as rendered by its existing label key (EN). */
const KPI_NAMES = [
  'On time',
  'Delayed',
  'Canceled',
  'Avg delay',
  'Departures',
  'Daily',
  'Punctuality',
  'By line',
  'By weekday',
  'By cause',
  'By hour',
  'Peak hours',
];

describe('renderMethodologyPage', () => {
  it('renders the translated title and back link for each language', () => {
    const expectations: Record<Lang, string> = {
      en: 'Methodology',
      sv: 'Metod',
      da: 'Metode',
    };
    for (const lang of LANGS) {
      const html = renderMethodologyPage(lang, getDict(lang));
      expect(html, lang).toContain(expectations[lang]);
      expect(html, lang).toContain(`href="${lang === 'en' ? '/' : `/${lang}/`}"`);
    }
  });

  it('renders a definitions table with every KPI name', () => {
    const html = renderMethodologyPage('en', getDict('en'));
    expect(html).toContain('meth-table');
    for (const name of KPI_NAMES) {
      expect(html, name).toContain(`>${name}<`);
    }
  });

  it('renders the ground-truth definitions from the API/collector', () => {
    const html = renderMethodologyPage('en', getDict('en'));
    expect(html).toContain('delay under 240 seconds');
    expect(html).toContain('240 seconds (4 minutes) or more');
    expect(html).toContain('lines 802–805');
    expect(html).toContain('Hyllie ↔ København H');
  });

  it('states thresholds, data source, coverage and the lag caveat', () => {
    const html = renderMethodologyPage('en', getDict('en'));
    expect(html).toContain('CC-BY 4.0');
    expect(html).toContain('Trafiklab');
    expect(html).toContain('2026-08-06');
    expect(html).toContain('10–15 minutes');
  });

  it('keeps the lang switcher and footer visible', () => {
    const html = renderMethodologyPage('en', getDict('en'));
    expect(html).toContain('data-action="set-lang"');
    expect(html).toContain('Trafiklab.se');
  });

  it('translates the whole page into sv and da', () => {
    const sv = renderMethodologyPage('sv', getDict('sv'));
    expect(sv).toContain('Metod');
    expect(sv).toContain('Definitioner');
    expect(sv).toContain('802–805');
    const da = renderMethodologyPage('da', getDict('da'));
    expect(da).toContain('Metode');
    expect(da).toContain('Definitioner');
    expect(da).toContain('802–805');
  });

  it('links a Related pages section: the four station pages plus the archive hubs (audit3 C3)', () => {
    for (const lang of LANGS) {
      const html = renderMethodologyPage(lang, getDict(lang));
      expect(html, lang).toContain(getDict(lang).meth_related_title);
      // The four stations the definitions are measured at — localized routes,
      // localized names.
      for (const slug of ['hyllie', 'malmo-c', 'kastrup', 'kobenhavn-h']) {
        expect(html, `${lang} station/${slug}`).toContain(`href="/${lang === 'en' ? '' : `${lang}/`}station/${slug}"`);
      }
      // …and the hubs that hold the data the page describes.
      expect(html, lang).toContain('href="/station"');
      expect(html, lang).toContain('href="/line"');
      // audit5 H2: /history localizes, so each variant links its own twin.
      expect(html, lang).toContain(`href="/${lang === 'en' ? '' : `${lang}/`}history"`);
    }
  });
});

describe('methodology heading order (audit4 N-M12)', () => {
  const sections = (lang: Lang): string[] => {
    const html = renderMethodologyPage(lang, getDict(lang));
    return [...html.matchAll(/<h([1-6])[^>]*>/g)].map((m) => m[1]!);
  };

  it('starts at h1 and never skips a level, in all three languages', () => {
    for (const lang of ['en', 'sv', 'da'] as const) {
      const levels = sections(lang);
      expect(levels[0]).toBe('1');
      let previous = 1;
      for (const level of levels) {
        const n = Number(level);
        expect(n, `${lang}: ${levels.join(',')}`).toBeLessThanOrEqual(previous + 1);
        previous = n;
      }
    }
  });

  it('renders the section headings as h2 (the styles come from .meth-h, not the tag)', () => {
    const html = renderMethodologyPage('en', getDict('en'));
    expect(html).toContain('<h2 class="meth-h">KPI definitions</h2>');
    expect(html).not.toContain('<h3');
  });
});

describe('methodology analytics disclosure (audit4 N-M16)', () => {
  it('documents the cookieless measurement instead of showing a consent banner', () => {
    for (const lang of LANGS) {
      const dict = getDict(lang);
      const html = renderMethodologyPage(lang, dict);
      expect(html, lang).toContain(dict.meth_tracking_title);
      expect(html, lang).toContain('Umami');
      // The three facts the finding turned on: no cookies, no personal data,
      // nothing stored beyond the language choice.
      expect(html, lang).toContain(dict.meth_tracking_body);
      expect(html, lang).toContain('localStorage');
      // …with the fuller statement one click away.
      expect(html, lang).toContain(
        `href="/${lang === 'en' ? '' : `${lang}/`}privacy"`,
      );
    }
  });

  it('is the only consent-ish copy on the site — no banner, no dialog, no accept/decline', () => {
    // Nothing anywhere on the board may ask for consent again without this
    // test forcing the decision to be made deliberately.
    expect(renderApp(createInitialState(), 'en')).not.toMatch(/role="dialog"/i);
    expect(renderApp(createInitialState(), 'en')).not.toMatch(/consent/i);
    expect(renderApp(createInitialState(), 'en')).not.toMatch(/cookie/i);
  });
});
