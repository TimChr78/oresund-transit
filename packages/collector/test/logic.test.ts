import { describe, expect, it } from 'vitest';
import { normalizeScan } from '../src/logic.js';

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
