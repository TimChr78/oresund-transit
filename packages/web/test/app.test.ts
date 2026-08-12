import { describe, expect, it } from 'vitest';
import { renderApp } from '../src/components/App';
import { createInitialState } from '../src/state';

describe('renderApp — disruptions mode toggle', () => {
  it('shows a "Show all" toggle in today mode', () => {
    const html = renderApp(createInitialState(), 'en', 'declined');
    expect(html).toContain('data-action="set-disruptions-mode"');
    expect(html).toContain('data-value="archive"');
    expect(html).toContain('Show all disruptions');
  });

  it('archive mode flips the toggle to "Back to today"', () => {
    const state = { ...createInitialState(), disruptionsMode: 'archive' as const };
    const html = renderApp(state, 'en', 'declined');
    expect(html).toContain('data-value="today"');
    expect(html).toContain('Back to today');
  });

  it('toggle is trilingual', () => {
    expect(renderApp(createInitialState(), 'sv', 'declined')).toContain('Visa alla störningar');
    expect(renderApp(createInitialState(), 'da', 'declined')).toContain('Vis alle forstyrrelser');
  });
});
