import { describe, expect, it } from 'vitest';
import { routePath } from '../src/lib/route';

describe('routePath', () => {
  it('maps /privacy and /privacy/ to the privacy route', () => {
    expect(routePath('/privacy')).toBe('privacy');
    expect(routePath('/privacy/')).toBe('privacy');
  });

  it('maps /methodology and /methodology/ to the methodology route', () => {
    expect(routePath('/methodology')).toBe('methodology');
    expect(routePath('/methodology/')).toBe('methodology');
  });

  it('maps everything else to the dashboard', () => {
    expect(routePath('/')).toBe('dashboard');
    expect(routePath('/index.html')).toBe('dashboard');
    expect(routePath('/unknown')).toBe('dashboard');
    expect(routePath('')).toBe('dashboard');
  });
});
