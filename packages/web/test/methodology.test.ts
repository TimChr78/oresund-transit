import { describe, expect, it } from 'vitest';
import { renderMethodologyPage } from '../src/components/MethodologyPage';
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
      expect(html, lang).toContain('href="/"');
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
});
