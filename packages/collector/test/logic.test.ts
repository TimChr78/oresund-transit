import { describe, expect, it } from 'vitest';
import { normalizeScan, getDirection } from '../src/logic.js';

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
