import { describe, expect, it } from 'vitest';
import type { Dict, Key, Lang } from '../src/i18n/keys';
import { da } from '../src/i18n/da';
import { en } from '../src/i18n/en';
import { langFromLocale, statusKeyFor, translate } from '../src/i18n/index';
import { sv } from '../src/i18n/sv';

const ALL_LANGS: Lang[] = ['sv', 'da', 'en'];
const DICTS: Record<Lang, Dict> = { sv, da, en };

describe('i18n dictionaries', () => {
  it('all three languages have identical key sets', () => {
    const keys = (d: Dict): string[] => Object.keys(d).sort();
    const svKeys = keys(sv);
    expect(keys(da)).toEqual(svKeys);
    expect(keys(en)).toEqual(svKeys);
  });

  it('every key resolves to a non-empty string in every language', () => {
    for (const lang of ALL_LANGS) {
      for (const key of Object.keys(DICTS[lang]) as Key[]) {
        expect(DICTS[lang][key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('translate returns the dictionary string for the language', () => {
    expect(translate('status_normal', 'sv')).toBe('Normal trafik');
    expect(translate('status_normal', 'da')).toBe('Normal drift');
    expect(translate('status_normal', 'en')).toBe('Normal service');
  });

  it('translate interpolates {n} placeholders', () => {
    expect(translate('banner_disruptions_many', 'sv', { n: 3 })).toBe('3 störningar');
    expect(translate('banner_disruptions_many', 'da', { n: 3 })).toBe('3 forstyrrelser');
    expect(translate('banner_disruptions_many', 'en', { n: 3 })).toBe('3 disruptions');
  });

  it('detects language from browser locales', () => {
    expect(langFromLocale('sv-SE')).toBe('sv');
    expect(langFromLocale('sv')).toBe('sv');
    expect(langFromLocale('da-DK')).toBe('da');
    expect(langFromLocale('da')).toBe('da');
    expect(langFromLocale('en-US')).toBe('en');
    expect(langFromLocale('de-DE')).toBe('en');
    expect(langFromLocale(undefined)).toBe('en');
    expect(langFromLocale(null)).toBe('en');
  });

  it('maps live status + shutdown to the right banner key', () => {
    expect(statusKeyFor({ status: 'green', service_shutdown: false })).toBe('status_normal');
    expect(statusKeyFor({ status: 'amber', service_shutdown: false })).toBe('status_delayed');
    expect(statusKeyFor({ status: 'red', service_shutdown: false })).toBe('status_cancellations');
    expect(statusKeyFor({ status: 'blue', service_shutdown: false })).toBe('status_alerts');
    expect(statusKeyFor({ status: 'red', service_shutdown: true })).toBe('status_service_shutdown');
    expect(statusKeyFor({ status: 'green', service_shutdown: true })).toBe('status_service_shutdown');
    expect(statusKeyFor({ status: 'purple', service_shutdown: false })).toBe('status_normal');
  });
});
