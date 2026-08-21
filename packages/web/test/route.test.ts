import { describe, expect, it } from 'vitest';
import { routePath, langFromPath } from '../src/lib/route';

describe('routePath', () => {
  it('maps /privacy and /privacy/ to the privacy route', () => {
    expect(routePath('/privacy')).toBe('privacy');
    expect(routePath('/privacy/')).toBe('privacy');
  });

  it('maps /methodology and /methodology/ to the methodology route', () => {
    expect(routePath('/methodology')).toBe('methodology');
    expect(routePath('/methodology/')).toBe('methodology');
  });

  it('maps localized /sv/ and /da/ static pages to the same route', () => {
    expect(routePath('/sv/privacy')).toBe('privacy');
    expect(routePath('/sv/privacy/')).toBe('privacy');
    expect(routePath('/da/privacy')).toBe('privacy');
    expect(routePath('/sv/methodology')).toBe('methodology');
    expect(routePath('/da/methodology')).toBe('methodology');
  });

  it('maps everything else to the dashboard', () => {
    expect(routePath('/')).toBe('dashboard');
    expect(routePath('/index.html')).toBe('dashboard');
    expect(routePath('/unknown')).toBe('dashboard');
    expect(routePath('')).toBe('dashboard');
    expect(routePath('/sv/')).toBe('dashboard');
    expect(routePath('/sv/unknown')).toBe('dashboard');
    expect(routePath('/sv')).toBe('dashboard');
  });
});

describe('langFromPath', () => {
  it('returns the language prefix for /sv/ and /da/ paths, null otherwise', () => {
    expect(langFromPath('/sv/methodology')).toBe('sv');
    expect(langFromPath('/sv/')).toBe('sv');
    expect(langFromPath('/da/privacy')).toBe('da');
    expect(langFromPath('/da/')).toBe('da');
    expect(langFromPath('/methodology')).toBeNull();
    expect(langFromPath('/')).toBeNull();
    expect(langFromPath('/sv')).toBeNull();
  });
});
