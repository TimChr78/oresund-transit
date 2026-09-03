import { describe, expect, it } from 'vitest';
import {
  actualTime,
  formatDate,
  formatDelaySeconds,
  formatExactDelay,
  formatPct,
  formatTime,
  isValidLocalTimestamp,
  normalizeTs,
} from '../src/i18n/format';

describe('formatDate', () => {
  it('formats SV/EN dates as YYYY-MM-DD', () => {
    expect(formatDate('2026-08-06', 'sv')).toBe('2026-08-06');
    expect(formatDate('2026-08-06', 'en')).toBe('2026-08-06');
  });

  it('formats DA dates as DD-MM-YYYY', () => {
    expect(formatDate('2026-08-06', 'da')).toBe('06-08-2026');
  });

  it('tolerates full ISO datetimes', () => {
    expect(formatDate('2026-08-06T21:59:27', 'sv')).toBe('2026-08-06');
    expect(formatDate('2026-08-06T21:59:27', 'da')).toBe('06-08-2026');
  });

  it('returns an empty string for unparseable input', () => {
    expect(formatDate('', 'sv')).toBe('');
    expect(formatDate('not-a-date', 'sv')).toBe('');
  });
});

describe('formatTime', () => {
  it('formats SV/EN times as HH:MM', () => {
    expect(formatTime('21:59', 'sv')).toBe('21:59');
    expect(formatTime('21:59', 'en')).toBe('21:59');
    expect(formatTime('09:05', 'sv')).toBe('09:05');
  });

  it('formats DA times with a dot separator', () => {
    expect(formatTime('21:59', 'da')).toBe('21.59');
  });

  it('tolerates full ISO datetimes', () => {
    expect(formatTime('2026-08-06T21:59:27', 'sv')).toBe('21:59');
    expect(formatTime('2026-08-06T21:59:27', 'da')).toBe('21.59');
  });

  it('rejects impossible times and unparseable input', () => {
    expect(formatTime('25:99', 'sv')).toBe('');
    expect(formatTime('', 'sv')).toBe('');
  });

  it('parses the space-separated timestamp format (2026-08-06 15:35:11)', () => {
    expect(formatTime('2026-08-06 15:35:11', 'sv')).toBe('15:35');
    expect(formatTime('2026-08-06 15:35:11', 'da')).toBe('15.35');
  });
});

describe('normalizeTs', () => {
  it('converts the space-separated format to ISO-T', () => {
    expect(normalizeTs('2026-08-06 15:35:11')).toBe('2026-08-06T15:35:11');
    expect(normalizeTs('2026-08-06 15:35')).toBe('2026-08-06T15:35');
  });

  it('leaves ISO-T timestamps unchanged', () => {
    expect(normalizeTs('2026-08-06T15:35:11')).toBe('2026-08-06T15:35:11');
  });

  it('returns an empty string for unparseable input', () => {
    expect(normalizeTs('')).toBe('');
    expect(normalizeTs('not-a-date')).toBe('');
    expect(normalizeTs('15:35')).toBe('');
  });
});

describe('formatDelaySeconds', () => {
  it('renders an em dash for missing delay', () => {
    expect(formatDelaySeconds(null, 'sv')).toBe('—');
  });

  it('renders sub-minute delays as seconds', () => {
    expect(formatDelaySeconds(0, 'sv')).toBe('0 s');
    expect(formatDelaySeconds(21, 'sv')).toBe('21 s');
    expect(formatDelaySeconds(59, 'sv')).toBe('59 s');
    expect(formatDelaySeconds(21, 'da')).toBe('21 sek.');
  });

  it('renders minute delays rounded to the nearest whole minute', () => {
    expect(formatDelaySeconds(240, 'sv')).toBe('4 min');
    expect(formatDelaySeconds(3590, 'sv')).toBe('60 min');
  });

  it('uses a Danish abbreviation style', () => {
    expect(formatDelaySeconds(240, 'da')).toBe('4 min.');
    expect(formatDelaySeconds(240, 'en')).toBe('4 min');
  });
});

describe('formatPct', () => {
  it('uses comma decimal separators for SV/DA and a dot for EN', () => {
    expect(formatPct(94.2, 'sv')).toBe('94,2%');
    expect(formatPct(94.2, 'da')).toBe('94,2%');
    expect(formatPct(94.2, 'en')).toBe('94.2%');
  });

  it('renders an em dash for non-finite input', () => {
    expect(formatPct(Number.NaN, 'en')).toBe('—');
  });
});

describe('formatExactDelay', () => {
  it('renders minutes plus the leftover seconds — no rounding', () => {
    expect(formatExactDelay(492, 'en')).toBe('8 min 12 s');
    expect(formatExactDelay(492, 'sv')).toBe('8 min 12 s');
    expect(formatExactDelay(492, 'da')).toBe('8 min. 12 sek.');
  });

  it('renders whole minutes without a seconds tail', () => {
    expect(formatExactDelay(480, 'en')).toBe('8 min');
    expect(formatExactDelay(480, 'da')).toBe('8 min.');
  });

  it('renders sub-minute delays as seconds', () => {
    expect(formatExactDelay(21, 'en')).toBe('21 s');
    expect(formatExactDelay(21, 'da')).toBe('21 sek.');
  });

  it('renders an em dash for a missing delay', () => {
    expect(formatExactDelay(null, 'en')).toBe('—');
    expect(formatExactDelay(undefined, 'sv')).toBe('—');
  });
});

describe('actualTime (backlog B1 — the expected departure)', () => {
  it('adds the measured delay to the scheduled slot', () => {
    expect(actualTime('2026-08-06T21:59:00', 300, 'en')).toBe('22:04');
    expect(actualTime('2026-08-06T21:59:00', 300, 'sv')).toBe('22:04');
    expect(actualTime('2026-08-06T21:59:00', 300, 'da')).toBe('22.04');
  });

  it('rounds the delay to whole minutes so the pair agrees with the "+N min" label', () => {
    // 650 s is 10 min 50 s: "+11 min" is what the row says, so 22:10 is what
    // the slot should say — not a truncated 22:09.
    expect(actualTime('2026-08-06T21:59:00', 650, 'en')).toBe('22:10');
  });

  it('accepts the space-separated form the API also emits', () => {
    expect(actualTime('2026-08-06 21:59:00', 60, 'en')).toBe('22:00');
  });

  it('wraps past midnight', () => {
    expect(actualTime('2026-08-06T23:55:00', 900, 'en')).toBe('00:10');
    expect(actualTime('2026-08-06T23:58:00', 240, 'en')).toBe('00:02');
  });

  it('returns empty when either half of the pair is missing', () => {
    expect(actualTime(null, 300, 'en')).toBe('');
    expect(actualTime(undefined, 300, 'en')).toBe('');
    expect(actualTime('2026-08-06T21:59:00', null, 'en')).toBe('');
    expect(actualTime('2026-08-06T21:59:00', undefined, 'en')).toBe('');
  });

  it('returns empty for a value that carries no clock time', () => {
    expect(actualTime('2026-08-06', 300, 'en')).toBe('');
    expect(actualTime('not-a-time', 300, 'en')).toBe('');
  });

  it('rejects out-of-range clock components instead of folding them into a wall clock', () => {
    // "99:99:00" used to pass the digit-only match and wrap through the
    // modulo into a plausible "— → 04:44".
    expect(actualTime('2026-08-06T99:99:00', 60, 'en')).toBe('');
    expect(actualTime('2026-08-06 99:99:00', 60, 'sv')).toBe('');
    expect(actualTime('2026-08-06T25:00:00', 60, 'sv')).toBe('');
    expect(actualTime('2026-08-06T21:99:00', 60, 'sv')).toBe('');
    expect(actualTime('2026-08-06T21:59:60', 60, 'sv')).toBe('');
    expect(actualTime('99:99', 60, 'sv')).toBe('');
  });

  it('still accepts the boundary values a timetable can legitimately carry', () => {
    expect(actualTime('2026-08-06T23:59:59', 0, 'en')).toBe('23:59');
    expect(actualTime('2026-08-06T00:00:00', 60, 'en')).toBe('00:01');
  });
});

describe('isValidLocalTimestamp (the as_of guard)', () => {
  it('accepts a complete, in-range local stamp', () => {
    expect(isValidLocalTimestamp('2026-08-06T21:59:27')).toBe(true);
    expect(isValidLocalTimestamp('2026-01-01T00:00:00')).toBe(true);
    expect(isValidLocalTimestamp('2024-02-29T23:59:59')).toBe(true); // leap day
  });

  it('rejects anything that is not a complete stamp', () => {
    expect(isValidLocalTimestamp('2026-08-06T21:59')).toBe(false); // no seconds
    expect(isValidLocalTimestamp('2026-08-06 21:59:27')).toBe(false); // space form
    expect(isValidLocalTimestamp('2026-08-06')).toBe(false); // date only
    expect(isValidLocalTimestamp('21:59:27')).toBe(false); // time only
    expect(isValidLocalTimestamp('not-a-timestamp')).toBe(false);
    expect(isValidLocalTimestamp('')).toBe(false);
    expect(isValidLocalTimestamp(undefined)).toBe(false);
    expect(isValidLocalTimestamp(null)).toBe(false);
    expect(isValidLocalTimestamp(1234)).toBe(false);
  });

  it('rejects out-of-range components (the digit-only match would pass them)', () => {
    expect(isValidLocalTimestamp('2026-99-06T21:59:27')).toBe(false); // month
    expect(isValidLocalTimestamp('2026-00-06T21:59:27')).toBe(false);
    expect(isValidLocalTimestamp('2026-08-99T21:59:27')).toBe(false); // day
    expect(isValidLocalTimestamp('2026-08-00T21:59:27')).toBe(false);
    expect(isValidLocalTimestamp('2026-08-06T99:59:27')).toBe(false); // hour
    expect(isValidLocalTimestamp('2026-08-06T21:99:27')).toBe(false); // minute
    expect(isValidLocalTimestamp('2026-08-06T21:59:99')).toBe(false); // second
  });

  it('rejects a day the named month has no room for', () => {
    expect(isValidLocalTimestamp('2026-02-30T12:00:00')).toBe(false); // common-year Feb
    expect(isValidLocalTimestamp('2026-02-29T12:00:00')).toBe(false); // 2026 is not a leap year
    expect(isValidLocalTimestamp('2026-04-31T12:00:00')).toBe(false); // 30-day month
    expect(isValidLocalTimestamp('2100-02-29T12:00:00')).toBe(false); // century, not a leap year
    expect(isValidLocalTimestamp('2000-02-29T12:00:00')).toBe(true); // 400-year leap
  });
});
