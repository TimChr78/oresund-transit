import { describe, expect, it } from 'vitest';
import {
  normalizeScan,
  getDirection,
  categorizeCause,
  categorizeSeverity,
  classifyType,
} from '../src/logic.js';

describe('normalizeScan', () => {
  it('lowercases and replaces Scandinavian chars', () => {
    expect(normalizeScan('Østerport')).toBe('osterport');
    expect(normalizeScan('Malmö')).toBe('malmo');
    expect(normalizeScan('Göteborg')).toBe('goteborg');
    expect(normalizeScan('København H')).toBe('kobenhavn h');
    expect(normalizeScan('Hässleholm')).toBe('hassleholm');
    expect(normalizeScan('Växjö')).toBe('vaxjo');
    expect(normalizeScan('Ærø')).toBe('aero');
  });

  it('handles uppercase input and empty string', () => {
    expect(normalizeScan('HELSINGØR')).toBe('helsingor');
    expect(normalizeScan('')).toBe('');
  });
});

describe('getDirection', () => {
  it('returns bus for lines 6 and 16 regardless of dest', () => {
    expect(getDirection('6')).toBe('bus');
    expect(getDirection('6', 'Malmö')).toBe('bus');
    expect(getDirection('16', 'Østerport')).toBe('bus');
  });

  it('detects Denmark-bound destinations', () => {
    expect(getDirection('804', 'København H')).toBe('to_denmark');
    expect(getDirection('803', 'Østerport')).toBe('to_denmark');
    expect(getDirection('802', 'Helsingør')).toBe('to_denmark');
    expect(getDirection('804', 'KBH')).toBe('to_denmark');
    expect(getDirection('11', 'Lufthavn')).toBe('to_denmark');
    expect(getDirection('11', 'Copenhagen')).toBe('to_denmark');
    expect(getDirection('11', 'Nørreport')).toBe('to_denmark');
  });

  it('defaults non-Denmark destinations to to_sweden', () => {
    expect(getDirection('804', 'Halmstad C')).toBe('to_sweden');
    expect(getDirection('11', 'Malmö')).toBe('to_sweden');
  });

  it('falls back to line parity when dest is empty/unknown', () => {
    expect(getDirection('804')).toBe('to_denmark');
    expect(getDirection('804', '')).toBe('to_denmark');
    expect(getDirection('803')).toBe('to_sweden');
    expect(getDirection('803', '?')).toBe('to_sweden');
    expect(getDirection('802', '-')).toBe('to_denmark');
  });

  it('returns null for non-numeric lines with no usable dest', () => {
    expect(getDirection('abc')).toBeNull();
    expect(getDirection('', '')).toBeNull();
    expect(getDirection('804', '?')).not.toBeNull();
  });

  it('still uses dest when line is non-numeric', () => {
    expect(getDirection('abc', 'Malmö')).toBe('to_sweden');
    expect(getDirection('abc', 'København')).toBe('to_denmark');
  });
});

describe('categorizeCause', () => {
  it('matches staffing keywords', () => {
    expect(categorizeCause('Personalbrist', '')).toBe('staffing');
    expect(categorizeCause('', 'strejk')).toBe('staffing');
    expect(categorizeCause('konflikt', '')).toBe('staffing');
    expect(categorizeCause('', 'sjuk')).toBe('staffing');
    expect(categorizeCause('Förarbortfall', '')).toBe('staffing');
  });

  it('matches signal_failure keywords (incl. banarbete priority)', () => {
    expect(categorizeCause('Signalfel', '')).toBe('signal_failure');
    expect(categorizeCause('', 'stillastående tåg')).toBe('signal_failure');
    expect(categorizeCause('Växelfel', '')).toBe('signal_failure');
    expect(categorizeCause('', 'banarbete')).toBe('signal_failure');
  });

  it('matches vehicle keywords', () => {
    expect(categorizeCause('Vagnbrist', '')).toBe('vehicle');
    expect(categorizeCause('', 'kort tåg')).toBe('vehicle');
    expect(categorizeCause('', 'short train')).toBe('vehicle');
    expect(categorizeCause('Fordonsfel', '')).toBe('vehicle');
  });

  it('matches person_on_tracks keywords', () => {
    expect(categorizeCause('Person på spåret', '')).toBe('person_on_tracks');
    expect(categorizeCause('', 'olycka')).toBe('person_on_tracks');
    expect(categorizeCause('', 'Smith')).toBe('person_on_tracks');
  });

  it('matches infrastructure keywords', () => {
    expect(categorizeCause('Bygge', '')).toBe('infrastructure');
    expect(categorizeCause('Underhåll', '')).toBe('infrastructure');
    expect(categorizeCause('', 'entreprenad')).toBe('infrastructure');
  });

  it('matches police keywords', () => {
    expect(categorizeCause('Polis på plats', '')).toBe('police');
    expect(categorizeCause('', 'brand')).toBe('police');
    expect(categorizeCause('', 'larm')).toBe('police');
    expect(categorizeCause('Räddning', '')).toBe('police');
  });

  it('matches weather keywords', () => {
    expect(categorizeCause('Snöstorm', '')).toBe('weather');
    expect(categorizeCause('', 'halka')).toBe('weather');
    expect(categorizeCause('Hård vind', '')).toBe('weather');
  });

  it('matches congestion keywords', () => {
    expect(categorizeCause('Tågkö', '')).toBe('congestion');
    expect(categorizeCause('', 'kö vid Malmö')).toBe('congestion');
  });

  it('respects priority order and falls back to unknown', () => {
    expect(categorizeCause('Personalbrist', 'person på spåret')).toBe('staffing');
    expect(categorizeCause('strejk', 'signalfel')).toBe('staffing');
    expect(categorizeCause('', '')).toBe('unknown');
    expect(categorizeCause('Trafikstart', '')).toBe('unknown');
  });
});

describe('categorizeSeverity', () => {
  it('returns major for canceled departures', () => {
    expect(categorizeSeverity(0, true, '', '')).toBe('major');
    expect(categorizeSeverity(900, true, 'installt', '')).toBe('major');
  });

  it('returns moderate for delay >= 900 (before keyword check)', () => {
    expect(categorizeSeverity(900, false, '', '')).toBe('moderate');
    expect(categorizeSeverity(1200, false, '', '')).toBe('moderate');
    expect(categorizeSeverity(900, false, 'installt', '')).toBe('moderate');
  });

  it('returns minor for delay below 900 without keywords', () => {
    expect(categorizeSeverity(899, false, '', '')).toBe('minor');
    expect(categorizeSeverity(600, false, '', '')).toBe('minor');
    expect(categorizeSeverity(599, false, '', '')).toBe('minor');
    expect(categorizeSeverity(0, false, '', '')).toBe('minor');
  });

  it('returns major on cancellation keywords', () => {
    expect(categorizeSeverity(0, false, 'Inställt tåg', '')).toBe('major');
    expect(categorizeSeverity(0, false, '', 'cancelled')).toBe('major');
    expect(categorizeSeverity(0, false, 'canceled', '')).toBe('major');
    expect(categorizeSeverity(0, false, '', 'stoppad')).toBe('major');
  });

  it('returns minor on vehicle keywords', () => {
    expect(categorizeSeverity(0, false, 'Vagnbrist', '')).toBe('minor');
    expect(categorizeSeverity(0, false, '', 'kort tåg')).toBe('minor');
    expect(categorizeSeverity(0, false, 'short train', '')).toBe('minor');
  });
});

describe('classifyType', () => {
  it('returns cancellation for canceled departures', () => {
    expect(classifyType(true, 0, '', '')).toBe('cancellation');
    expect(classifyType(true, 900, 'Inställt', '')).toBe('cancellation');
  });

  it('returns cancellation on cancellation keywords', () => {
    expect(classifyType(false, 0, 'Inställt tåg', '')).toBe('cancellation');
    expect(classifyType(false, 0, '', 'cancelled')).toBe('cancellation');
    expect(classifyType(false, 0, 'canceled', '')).toBe('cancellation');
  });

  it('returns delay for delay >= 600 (before title check)', () => {
    expect(classifyType(false, 600, 'Försening', '')).toBe('delay');
    expect(classifyType(false, 1200, '', '')).toBe('delay');
  });

  it('returns alert for delay < 600 with a message', () => {
    expect(classifyType(false, 599, 'Något', '')).toBe('alert');
    expect(classifyType(false, 0, '', 'text')).toBe('alert');
  });

  it('returns unknown when no message and no delay', () => {
    expect(classifyType(false, 0, '', '')).toBe('unknown');
    expect(classifyType(false, null, '', '')).toBe('unknown');
  });
});
