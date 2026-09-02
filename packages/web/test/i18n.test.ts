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

  it('provides every privacy-page key in all languages', () => {
    const privacyKeys = [
      'privacy_title',
      'privacy_intro',
      'privacy_analytics',
      'privacy_data_source',
      'privacy_ads',
      'privacy_contact',
      'privacy_back',
      'nav_privacy',
    ] as Key[];
    for (const lang of ALL_LANGS) {
      for (const key of privacyKeys) {
        expect(DICTS[lang][key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('provides every methodology-page key in all languages', () => {
    const methKeys = [
      'meth_title',
      'meth_intro',
      'meth_defs_title',
      'meth_col_kpi',
      'meth_col_definition',
      'meth_thresholds_title',
      'meth_thresholds_body',
      'meth_scope_title',
      'meth_scope_body',
      'meth_source_title',
      'meth_source_body',
      'meth_lag_title',
      'meth_lag_body',
      'nav_methodology',
      'meth_def_on_time',
      'meth_def_delayed',
      'meth_def_canceled',
      'meth_def_avg_delay',
      'meth_def_departures',
      'meth_def_daily',
      'meth_def_punctuality',
      'meth_def_by_line',
      'meth_def_by_weekday',
      'meth_def_by_cause',
      'meth_def_by_hour',
      'meth_def_peak',
    ] as Key[];
    for (const lang of ALL_LANGS) {
      for (const key of methKeys) {
        expect(DICTS[lang][key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('provides a translated label for every cause key in all languages', () => {
    const causeKeys = [
      'staffing',
      'person_on_tracks',
      'signal_failure',
      'vehicle',
      'police',
      'infrastructure',
      'congestion',
      'weather',
      'unknown',
    ];
    for (const lang of ALL_LANGS) {
      for (const cause of causeKeys) {
        const key = `cause_${cause}` as Key;
        expect(DICTS[lang][key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('translates the new privacy keys', () => {
    expect(translate('privacy_title', 'en')).toBe('Privacy');
    expect(translate('privacy_title', 'sv')).toBe('Integritet');
    expect(translate('privacy_title', 'da')).toBe('Privatliv');
    expect(translate('privacy_back', 'en')).toBe('← Back to dashboard');
    expect(translate('nav_privacy', 'sv')).toBe('Integritet');
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

  it('provides the SEO batch keys (hub intros, attribution, zero-data notes, line href) in every language', () => {
    const seoBatchKeys = [
      'hub_line_intro',
      'hub_station_intro',
      'archive_attribution',
      'line_archive_href',
      'line_no_disruptions_note',
      'station_no_data_note',
    ] as Key[];
    for (const lang of ALL_LANGS) {
      for (const key of seoBatchKeys) {
        expect(DICTS[lang][key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
    // En attribution is English — never the Swedish fragment (M2).
    expect(translate('archive_attribution', 'en')).toBe('Data from Trafiklab.se');
    // The line href interpolation carries route context (M4).
    expect(translate('line_archive_href', 'en', { line: '801' })).toBe('Line 801 delays & history');
  });

  it('labels every delay band in all three languages (audit3 H1)', () => {
    const bandKeys = [
      'delay_band_on_time',
      'delay_band_minor',
      'delay_band_moderate',
      'delay_band_major',
    ] as Key[];
    for (const lang of ALL_LANGS) {
      for (const key of bandKeys) {
        expect(DICTS[lang][key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
    // The punctual band reuses each language's on-time wording (stat_on_time).
    expect(translate('delay_band_on_time', 'en')).toBe('On time');
    expect(translate('delay_band_on_time', 'sv')).toBe('I tid');
    expect(translate('delay_band_on_time', 'da')).toBe('Til tiden');
    // The delayed bands carry the minute range itself, so the badge needs no
    // legend — identical across languages by design.
    expect(translate('delay_band_minor', 'sv')).toBe('5–15 min');
    expect(translate('delay_band_moderate', 'da')).toBe('15–30 min');
    expect(translate('delay_band_major', 'en')).toBe('30+ min');
  });

  it('names every monitored station in all three languages (audit3 M4)', () => {
    const stationKeys = [
      'station_hyllie',
      'station_kobenhavn_h',
      'station_malmo_c',
      'station_kastrup',
    ] as Key[];
    for (const lang of ALL_LANGS) {
      for (const key of stationKeys) {
        expect(DICTS[lang][key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
    // en mirrors the collector's stop_name verbatim — the archive renderers
    // fall back to it only for slugs the dictionaries do not know yet.
    expect(translate('station_kastrup', 'en')).toBe('Københavns Lufthavn (Kastrup)');
    // sv/da use the natural local forms, consistent with the existing copy.
    expect(translate('station_kobenhavn_h', 'sv')).toBe('Köpenhamn H');
    expect(translate('station_kastrup', 'sv')).toBe('Kastrup flygplats');
    expect(translate('station_kobenhavn_h', 'da')).toBe('København H');
    expect(translate('station_kastrup', 'da')).toBe('Kastrup Lufthavn');
  });
});
