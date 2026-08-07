import { describe, expect, it } from 'vitest';
import { CAUSE_KEYS, causeLabel, cleanReason } from '../src/lib/causes';

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
