import { describe, expect, it } from 'vitest';
import { CAUSE_KEYS, causeFromText, causeLabel, cleanReason, effectiveCause } from '../src/lib/causes';

describe('causeLabel', () => {
  it('maps every cause enum key to its Swedish reference label', () => {
    const sv: Record<string, string> = {
      staffing: 'Personalbrist',
      person_on_tracks: 'Person på spår',
      signal_failure: 'Signalfel',
      vehicle: 'Fordonsfel',
      police: 'Polis/larm',
      infrastructure: 'Infrastruktur',
      congestion: 'Tågkö',
      weather: 'Väder',
      unknown: 'Okänt',
    };
    expect([...CAUSE_KEYS].sort()).toEqual(Object.keys(sv).sort());
    for (const [cause, label] of Object.entries(sv)) {
      expect(causeLabel(cause, 'sv'), cause).toBe(label);
    }
  });

  it('translates idiomatically per language', () => {
    expect(causeLabel('vehicle', 'en')).toBe('Vehicle fault');
    expect(causeLabel('signal_failure', 'en')).toBe('Signal failure');
    expect(causeLabel('staffing', 'da')).not.toBe('Personalbrist');
  });

  it('falls back to the unknown label for null and passes legacy values through', () => {
    expect(causeLabel(null, 'en')).toBe('Unknown');
    expect(causeLabel('', 'en')).toBe('Unknown');
    expect(causeLabel('Signalfel', 'en')).toBe('Signalfel'); // legacy raw value
  });
});

describe('cleanReason', () => {
  it('strips the DELAY prefix entirely', () => {
    expect(cleanReason('DELAY 21:59 804 -> Østerport: +11min forsening', 'en')).toBe('');
  });

  it('keeps the alert message after the prefix', () => {
    expect(cleanReason('DELAY 04:58 16 -> Hyllie: +11min forsening | Signalfel vid Malmö', 'en')).toBe(
      'Signalfel vid Malmö',
    );
  });

  it('normalizes segment separators', () => {
    expect(cleanReason('Signalfel | Vi arbetar med att åtgärda felet', 'en')).toBe(
      'Signalfel · Vi arbetar med att åtgärda felet',
    );
  });

  it('trims trailing recommendation boilerplate', () => {
    expect(cleanReason('Signalfel · Vi rekommenderar att du reser senare', 'en')).toBe('Signalfel');
    expect(cleanReason('DELAY 21:59 804 -> Østerport: +11min forsening | Signalfel · Vi rekommenderar att du reser senare', 'en')).toBe('Signalfel');
  });

  it('returns an empty string for null/undefined', () => {
    expect(cleanReason(null, 'en')).toBe('');
    expect(cleanReason(undefined, 'en')).toBe('');
  });
});

describe('causeFromText (backlog B2)', () => {
  it('recognises the alert phrasings the collector\'s keyword map misses', () => {
    // Each of these was sampled live from /api/transit/disruptions.
    expect(causeFromText('Resande mot Lund C ska byta tåg på Malmö C. Orsaken är att tåget ska till verkstad.')).toBe('vehicle');
    expect(causeFromText('Tåget står stilla vid København Østerport. Orsaken är ordningsproblem.')).toBe('police');
    expect(causeFromText('Tåget är försenat. Orsaken är många resande.')).toBe('congestion');
    expect(causeFromText('Det är stopp i tågtrafiken mellan Hyllie och CPH Airport sedan klockan 23:45.')).toBe('signal_failure');
    expect(causeFromText('Tåget är försenat. Orsaken är framkomlighetsproblem.')).toBe('signal_failure');
    expect(causeFromText('Buss ersätter i pendeltrafik på sträckan CPH Airport - Malmö C.')).toBe('infrastructure');
  });

  it('matches through the Scandinavian normalization the collector applies', () => {
    // "många"/"ersätter" are stored with diacritics in raw_text.
    expect(causeFromText('Orsaken är MÅNGA resande')).toBe('congestion');
    expect(causeFromText('Buss ERSÄTTER på sträckan')).toBe('infrastructure');
  });

  it('returns null for text that names no cause', () => {
    expect(causeFromText('DELAY 08:14 803 -> Østerport: +12min forsening')).toBeNull();
    expect(causeFromText('Tåget är försenat.')).toBeNull();
    expect(causeFromText(null)).toBeNull();
    expect(causeFromText('')).toBeNull();
  });
});

describe('effectiveCause (backlog B2)', () => {
  it('never overrides a verdict the collector already reached', () => {
    expect(effectiveCause('person_on_tracks', 'Tåget ska till verkstad')).toBe('person_on_tracks');
    expect(effectiveCause('signal_failure', 'Orsaken är många resande')).toBe('signal_failure');
  });

  it('fills the gap when the collector stored unknown and the text names a cause', () => {
    expect(effectiveCause('unknown', 'Orsaken är att tåget ska till verkstad.')).toBe('vehicle');
    expect(effectiveCause(null, 'Orsaken är ordningsproblem.')).toBe('police');
    expect(effectiveCause(undefined, 'Orsaken är många resande.')).toBe('congestion');
  });

  it('stays unknown when neither the collector nor the text knows', () => {
    expect(effectiveCause('unknown', null)).toBe('unknown');
    expect(effectiveCause('unknown', 'Tåget är försenat.')).toBe('unknown');
    expect(effectiveCause(null, undefined)).toBe('unknown');
  });

  it('passes legacy free-text causes through verbatim', () => {
    expect(effectiveCause('Signalfel', null)).toBe('Signalfel');
  });

  it('only ever returns CAUSE_KEYS members, so i18n parity covers every label it can show', () => {
    const texts = [
      'tåget ska till verkstad',
      'ordningsproblem',
      'många resande',
      'stopp i tågtrafiken',
      'framkomlighetsproblem',
      'buss ersätter',
      'ersättningsbuss',
      'ingen orsak här',
    ];
    for (const text of texts) {
      const resolved = causeFromText(text);
      expect(resolved === null || (CAUSE_KEYS as readonly string[]).includes(resolved), text).toBe(true);
    }
  });
});
