import { describe, expect, it } from 'vitest';
import gottorpRaw from './fixtures/gottorp-raw.json';
import hyllieRaw from './fixtures/hyllie-raw.json';
import kobenhavnHRaw from './fixtures/kobenhavn-h-raw.json';
import {
  normalizeScan,
  getDirection,
  categorizeCause,
  categorizeSeverity,
  classifyType,
  formatTime,
  isChronic,
  isCrossborderTrain,
  isSwedenBoundTrain,
  isGottorpHyllieBus,
  delayStatus,
  disruptionTypeRank,
  stickierType,
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

  it('returns delay for delay >= 240 (before title check)', () => {
    expect(classifyType(false, 240, 'Försening', '')).toBe('delay');
    expect(classifyType(false, 1200, '', '')).toBe('delay');
  });

  it('returns alert for delay < 240 with a message', () => {
    expect(classifyType(false, 239, 'Något', '')).toBe('alert');
    expect(classifyType(false, 0, '', 'text')).toBe('alert');
  });

  it('returns unknown when no message and no delay', () => {
    expect(classifyType(false, 0, '', '')).toBe('unknown');
    expect(classifyType(false, null, '', '')).toBe('unknown');
  });
});

describe('formatTime', () => {
  it('extracts HH:MM from a full ISO timestamp', () => {
    expect(formatTime('2026-08-06T22:14:00')).toBe('22:14');
    expect(formatTime('2026-08-06T21:59:50')).toBe('21:59');
  });

  it('handles a 16-char timestamp (no seconds)', () => {
    expect(formatTime('2026-08-06T22:14')).toBe('22:14');
  });

  it('returns ? for missing or too-short input', () => {
    expect(formatTime('')).toBe('?');
    expect(formatTime('2026-08-06T22:1')).toBe('?');
    expect(formatTime('2026-08-06')).toBe('?');
    expect(formatTime(null)).toBe('?');
  });
});

describe('isChronic', () => {
  it('matches chronic keywords case-insensitively', () => {
    expect(isChronic('Vagnbrist', '')).toBe(true);
    expect(isChronic('', 'kort tag')).toBe(true);
    expect(isChronic('short train', '')).toBe(true);
    expect(isChronic('', 'Fordon')).toBe(true);
  });

  it('does not normalize Scandinavian chars (per reference)', () => {
    expect(isChronic('', 'kort tåg')).toBe(false);
  });

  it('returns false for non-chronic text', () => {
    expect(isChronic('Personalbrist', '')).toBe(false);
    expect(isChronic('', '')).toBe(false);
  });
});

describe('isCrossborderTrain', () => {
  it('flags TRAIN departures bound for Denmark (fixture data)', () => {
    expect(isCrossborderTrain(hyllieRaw.departures[0]!)).toBe(true); // Østerport
    expect(isCrossborderTrain(hyllieRaw.departures[6]!)).toBe(true); // Østerport
    expect(isCrossborderTrain(hyllieRaw.departures[20]!)).toBe(true); // København H
    expect(isCrossborderTrain(kobenhavnHRaw.departures[1]!)).toBe(true); // Østerport
    expect(isCrossborderTrain(kobenhavnHRaw.departures[4]!)).toBe(true); // Østerport
  });

  it('does not flag Sweden-bound or non-Denmark trains (fixture data)', () => {
    expect(isCrossborderTrain(hyllieRaw.departures[3]!)).toBe(false); // Halmstad C
    expect(isCrossborderTrain(kobenhavnHRaw.departures[0]!)).toBe(false); // Hässleholm
    expect(isCrossborderTrain(kobenhavnHRaw.departures[3]!)).toBe(false); // Kristianstad C
  });

  it('does not flag buses', () => {
    expect(isCrossborderTrain(gottorpRaw.departures[0]!)).toBe(false);
  });

  it('handles other crossborder keywords and RAIL mode', () => {
    const base = hyllieRaw.departures[0]!;
    const withDest = (direction: string, transportMode = 'TRAIN') => ({
      ...base,
      route: { ...base.route, direction, transport_mode: transportMode },
    });
    expect(isCrossborderTrain(withDest('Københavns Lufthavn'))).toBe(true);
    expect(isCrossborderTrain(withDest('Kopengamn'))).toBe(true); // reference keyword as spelled
    expect(isCrossborderTrain(withDest('Copenhagen'))).toBe(true);
    expect(isCrossborderTrain(withDest('Lufthavn'))).toBe(true);
    expect(isCrossborderTrain(withDest('Østerport', 'RAIL'))).toBe(true);
    expect(isCrossborderTrain(withDest('Malmö'))).toBe(false);
  });
});

describe('isSwedenBoundTrain', () => {
  it('flags TRAIN departures bound for Sweden (fixture data)', () => {
    expect(isSwedenBoundTrain(hyllieRaw.departures[16]!)).toBe(true); // Hässleholm
    expect(isSwedenBoundTrain(kobenhavnHRaw.departures[0]!)).toBe(true); // Hässleholm
  });

  it('does not flag Denmark-bound or non-listed trains (fixture data)', () => {
    expect(isSwedenBoundTrain(hyllieRaw.departures[0]!)).toBe(false); // Østerport
    expect(isSwedenBoundTrain(kobenhavnHRaw.departures[1]!)).toBe(false); // Østerport
    expect(isSwedenBoundTrain(hyllieRaw.departures[3]!)).toBe(false); // Halmstad C
    expect(isSwedenBoundTrain(kobenhavnHRaw.departures[3]!)).toBe(false); // Kristianstad C
  });

  it('does not flag buses', () => {
    expect(isSwedenBoundTrain(gottorpRaw.departures[0]!)).toBe(false);
  });

  it('handles Sweden keywords (Scandinavian-normalized) and RAIL mode', () => {
    const base = hyllieRaw.departures[16]!;
    const withDest = (direction: string, transportMode = 'TRAIN') => ({
      ...base,
      route: { ...base.route, direction, transport_mode: transportMode },
    });
    expect(isSwedenBoundTrain(withDest('Malmö'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Göteborg'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Växjö'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Hyllie'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Lund C'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Ystad'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Trelleborg'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Karlskrona'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Sverige'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Sweden'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Malmö', 'RAIL'))).toBe(true);
    expect(isSwedenBoundTrain(withDest('Østerport'))).toBe(false);
  });
});

describe('isGottorpHyllieBus', () => {
  it('flags BUS 6/16 departures to Hyllie (fixture data)', () => {
    expect(isGottorpHyllieBus(gottorpRaw.departures[1]!)).toBe(true); // 6 → Toftanäs via Hyllie
    expect(isGottorpHyllieBus(gottorpRaw.departures[2]!)).toBe(true); // 16 → Hyllie
    expect(isGottorpHyllieBus(gottorpRaw.departures[5]!)).toBe(true); // 6 → Toftanäs via Hyllie
    expect(isGottorpHyllieBus(gottorpRaw.departures[6]!)).toBe(true); // 16 → Hyllie
  });

  it('does not flag buses not bound for Hyllie (fixture data)', () => {
    expect(isGottorpHyllieBus(gottorpRaw.departures[0]!)).toBe(false); // 6 → Bunkeflostrand
    expect(isGottorpHyllieBus(gottorpRaw.departures[3]!)).toBe(false); // 16 → Klagshamn
    expect(isGottorpHyllieBus(gottorpRaw.departures[4]!)).toBe(false); // 6 → Bunkeflostrand
    expect(isGottorpHyllieBus(hyllieRaw.departures[4]!)).toBe(false); // 6 → Toftanäs via Södervärn
  });

  it('does not flag other lines or transport modes (fixture data)', () => {
    expect(isGottorpHyllieBus(hyllieRaw.departures[2]!)).toBe(false); // 10 → Malmö C via Hyllie
    expect(isGottorpHyllieBus(kobenhavnHRaw.departures[0]!)).toBe(false); // TRAIN
  });

  it('matches case-insensitively and handles numeric designation', () => {
    const base = gottorpRaw.departures[2]!;
    const withRoute = (route: Partial<typeof base.route>) => ({ ...base, route: { ...base.route, ...route } });
    expect(isGottorpHyllieBus(withRoute({ direction: 'HYLLIE' }))).toBe(true);
    expect(isGottorpHyllieBus(withRoute({ designation: 16 } as never))).toBe(true);
    expect(isGottorpHyllieBus(withRoute({ direction: 'Malmö' }))).toBe(false);
  });
});

describe('delayStatus', () => {
  it('returns on_time below 240s (RT3: Skånetrafiken counts ≤3:59 late as punctual)', () => {
    expect(delayStatus(0)).toBe('on_time');
    expect(delayStatus(59)).toBe('on_time');
    expect(delayStatus(-85)).toBe('on_time');
    expect(delayStatus(239)).toBe('on_time');
  });

  it('returns delayed at and above 240s (4:00)', () => {
    expect(delayStatus(240)).toBe('delayed');
    expect(delayStatus(299)).toBe('delayed');
    expect(delayStatus(1200)).toBe('delayed');
  });
});

describe('disruptionTypeRank / stickierType', () => {
  it('ranks types by severity: cancellation > delay > alert > unknown', () => {
    expect(disruptionTypeRank('cancellation')).toBeGreaterThan(disruptionTypeRank('delay'));
    expect(disruptionTypeRank('delay')).toBeGreaterThan(disruptionTypeRank('alert'));
    expect(disruptionTypeRank('alert')).toBeGreaterThan(disruptionTypeRank('unknown'));
  });

  it('keeps the existing type when the incoming classification is weaker', () => {
    // The 2026-08-11 bug: Trafiklab resets the delay field late, a re-poll
    // classifies the same departure as alert — the delay type must survive.
    expect(stickierType('delay', 'alert')).toBe('delay');
    expect(stickierType('cancellation', 'alert')).toBe('cancellation');
    expect(stickierType('cancellation', 'delay')).toBe('cancellation');
  });

  it('upgrades to the incoming type when it is stronger', () => {
    expect(stickierType('alert', 'delay')).toBe('delay');
    expect(stickierType('delay', 'cancellation')).toBe('cancellation');
    expect(stickierType('unknown', 'alert')).toBe('alert');
  });

  it('keeps the incoming type on equal rank', () => {
    expect(stickierType('alert', 'alert')).toBe('alert');
    expect(stickierType('delay', 'delay')).toBe('delay');
  });
});
