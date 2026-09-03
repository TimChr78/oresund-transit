import { describe, expect, it } from 'vitest';
import { hreflangCluster, localizedUrl, scopedHeadUrl } from '../src/lib/seo';

/**
 * audit4 N-H6 — the head of a station-scoped board.
 *
 * `?station=` is a client-side view of the homepage: the server has no such
 * URL, so the shell ships the corridor's canonical and hreflang cluster
 * whatever the query says. When a visitor scopes the board, every href in that
 * cluster moves to the `?station=<slug>` form so the set stays self-consistent
 * instead of pointing at URLs that carry no station at all.
 */

const SHELL = {
  canonical: 'https://oresund.live/',
  cluster: hreflangCluster('/').split('\n').map((l) => /href="([^"]+)"/.exec(l)?.[1] ?? ''),
};

describe('scopedHeadUrl (audit4 N-H6)', () => {
  it('appends the station to an absolute URL', () => {
    expect(scopedHeadUrl('https://oresund.live/', 'hyllie')).toBe('https://oresund.live/?station=hyllie');
  });

  it('scopes every member of the hreflang cluster, localized variants included', () => {
    for (const href of SHELL.cluster) {
      expect(scopedHeadUrl(href, 'malmo-c')).toBe(`${href}?station=malmo-c`);
    }
    expect(SHELL.cluster).toContain(localizedUrl('/', 'sv'));
    expect(SHELL.cluster).toContain(localizedUrl('/', 'da'));
  });

  it('scopes the localized canonical form, not only the English one', () => {
    expect(scopedHeadUrl('https://oresund.live/sv/', 'kastrup')).toBe('https://oresund.live/sv/?station=kastrup');
    expect(scopedHeadUrl('https://oresund.live/da/', 'kobenhavn-h')).toBe(
      'https://oresund.live/da/?station=kobenhavn-h',
    );
  });

  it('restores the shell URL when the scope goes back to the whole corridor', () => {
    expect(scopedHeadUrl('https://oresund.live/?station=hyllie', 'all')).toBe('https://oresund.live/');
    expect(scopedHeadUrl('https://oresund.live/sv/?station=hyllie', 'all')).toBe('https://oresund.live/sv/');
  });

  it('replaces a previous station rather than stacking queries', () => {
    expect(scopedHeadUrl('https://oresund.live/?station=hyllie', 'kastrup')).toBe(
      'https://oresund.live/?station=kastrup',
    );
  });

  it('never points the scoped board at the /station/ archive page', () => {
    // That page is a different document — a 30-day punctuality archive with
    // its own canonical. Folding the live board onto it would merge two
    // distinct pages into one URL.
    expect(scopedHeadUrl('https://oresund.live/', 'hyllie')).not.toContain('/station/');
  });
});
