import { describe, expect, it } from 'vitest';
import { renderPrivacyPage } from '../src/components/PrivacyPage';
import { getDict, type Lang } from '../src/i18n';

const LANGS: Lang[] = ['sv', 'da', 'en'];

describe('renderPrivacyPage', () => {
  it('renders the translated title and back link for each language', () => {
    const expectations: Record<Lang, { title: string; back: string }> = {
      en: { title: 'Privacy', back: '← Back to dashboard' },
      sv: { title: 'Integritet', back: '← Tillbaka till översikten' },
      da: { title: 'Privatliv', back: '← Tilbage til oversigten' },
    };
    for (const lang of LANGS) {
      const html = renderPrivacyPage(lang, getDict(lang));
      expect(html, lang).toContain(expectations[lang].title);
      expect(html, lang).toContain(expectations[lang].back);
      expect(html, lang).toContain('href="/"');
    }
  });

  it('keeps the lang switcher and footer visible', () => {
    const html = renderPrivacyPage('en', getDict('en'));
    expect(html).toContain('data-action="set-lang"');
    expect(html).toContain('Trafiklab.se');
  });

  it('links the Trafiklab data source and contact email', () => {
    const html = renderPrivacyPage('en', getDict('en'));
    expect(html).toContain('href="https://www.trafiklab.se"');
    expect(html).toContain('href="mailto:hello@oresund.live"');
  });
});
