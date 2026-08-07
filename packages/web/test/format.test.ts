import { describe, expect, it } from 'vitest';
import { formatDate, formatDelaySeconds, formatPct, formatTime, normalizeTs } from '../src/i18n/format';

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
