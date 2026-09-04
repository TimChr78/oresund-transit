import { describe, expect, it } from 'vitest';
import type { Disruption } from '@oresund/shared';
import { CANONICAL_LINES } from '../src/lib/archive';
import { knownArchiveLines, renderRssFeed, type RssOptions } from '../src/lib/rss';

/** A full disruption row as served by /api/transit/disruptions. */
function disruption(overrides: Partial<Disruption> = {}): Disruption {
  return {
    id: 1,
    timestamp: '2026-07-15T12:00:00',
    line: '803',
    type: 'delay',
    cause: 'signal_failure',
    route_section: null,
    severity: 'moderate',
    delay_seconds: 660,
    raw_text: 'Signalfel på bron',
    dep_key: null,
    first_seen: null,
    last_updated: null,
    direction: 'to_denmark',
    technical_number: null,
    sched_time: '2026-07-15T12:00:00',
    ...overrides,
  };
}

const OPTS: RssOptions = {
  title: 'Øresund.live disruptions',
  description: 'Recent disruptions across the Sound',
  link: 'https://oresund.live/',
};

/**
 * Minimal XML well-formedness check for the simple documents we emit (no
 * CDATA/comments/processing instructions beyond the prolog): every tag is
 * balanced and properly nested, attribute quotes are respected.
 */
function assertWellFormedXml(xml: string): void {
  expect(xml.startsWith('<?xml')).toBe(true);
  const body = xml.slice(xml.indexOf('?>') + 2);
  const stack: string[] = [];
  const tagRe = /<\/?([A-Za-z][\w.-]*)(?:"[^"]*"|'[^']*'|[^>"'])*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body))) {
    const full = m[0];
    const name = m[1]!;
    if (full.startsWith('</')) {
      expect(stack.pop(), `closing </${name}>`).toBe(name);
    } else if (!full.endsWith('/>')) {
      stack.push(name);
    }
  }
  expect(stack, 'unclosed tags').toEqual([]);
}

describe('renderRssFeed', () => {
  it('returns a well-formed RSS 2.0 document with the channel metadata', () => {
    const xml = renderRssFeed([disruption()], OPTS);
    assertWellFormedXml(xml);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('<title>Øresund.live disruptions</title>');
    expect(xml).toContain('<link>https://oresund.live/</link>');
    expect(xml).toContain('<description>Recent disruptions across the Sound</description>');
    expect(xml).toContain('<language>en</language>');
    expect(xml).toMatch(/<lastBuildDate>[^<]+<\/lastBuildDate>/);
  });

  it('emits one <item> per disruption, preserving the API order (newest first)', () => {
    const xml = renderRssFeed(
      [
        disruption({ id: 2, timestamp: '2026-07-16T08:00:00' }),
        disruption({ id: 1, timestamp: '2026-07-15T12:00:00' }),
      ],
      OPTS,
    );
    const first = xml.indexOf('<item>');
    const second = xml.indexOf('<item>', first + 1);
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(xml.slice(first, second)).toContain('<guid isPermaLink="false">https://oresund.live/disruption/2</guid>');
    expect(xml.slice(second)).toContain('<guid isPermaLink="false">https://oresund.live/disruption/1</guid>');
  });

  it('composes per-item titles from line + type + direction', () => {
    const delay = renderRssFeed(
      [disruption({ type: 'delay', direction: 'to_denmark', line: '803' })],
      OPTS,
    );
    expect(delay).toContain('<title>Line 803 delayed to Denmark</title>');

    const cancelled = renderRssFeed(
      [disruption({ type: 'cancellation', direction: 'to_sweden', line: '805' })],
      OPTS,
    );
    expect(cancelled).toContain('<title>Line 805 cancellation to Sweden</title>');

    const alert = renderRssFeed([disruption({ type: 'alert', line: '803' })], OPTS);
    expect(alert).toContain('<title>Alert: line 803</title>');
  });

  it('composes a title without a line number when line is null', () => {
    const xml = renderRssFeed([disruption({ type: 'delay', line: null, direction: null })], OPTS);
    expect(xml).toContain('<title>Delayed</title>');
  });

  it('uses a stable per-item guid and the site link (no detail pages)', () => {
    const xml = renderRssFeed([disruption({ id: 42 })], OPTS);
    // isPermaLink=false: the guid URL is a stable identifier, not a real page.
    expect(xml).toContain('<guid isPermaLink="false">https://oresund.live/disruption/42</guid>');
    expect(xml).toContain('<link>https://oresund.live/</link>');
  });

  it('links each item at its own line archive instead of the homepage (audit6 L17)', () => {
    const xml = renderRssFeed([disruption({ line: '803' }), disruption({ id: 2, line: null })], OPTS);
    const links = [...xml.matchAll(/<link>([^<]*)<\/link>/g)].map((m) => m[1]!);
    // <link> appears once for the channel and once per item.
    expect(links[0]).toBe('https://oresund.live/');
    expect(links[1]).toBe('https://oresund.live/line/803');
    // A row with no line designation has nothing to deep-link to, so it keeps
    // the channel URL.
    expect(links[2]).toBe('https://oresund.live/');
  });

  it('includes cause, severity, delay minutes and raw_text in the description', () => {
    const xml = renderRssFeed(
      [
        disruption({
          cause: 'signal_failure',
          severity: 'moderate',
          delay_seconds: 660,
          raw_text: 'Signalfel på bron',
        }),
      ],
      OPTS,
    );
    expect(xml).toContain('Signal failure'); // en dict label for cause_signal_failure
    expect(xml).toContain('moderate');
    expect(xml).toContain('11 min');
    expect(xml).toContain('Signalfel på bron');
  });

  it('XML-escapes every interpolated value (raw_text, line, cause)', () => {
    const xml = renderRssFeed(
      [
        disruption({
          id: 9,
          line: '8<0&3',
          cause: 'a < b & c',
          raw_text: 'Signal & track <broken> "quoted"',
        }),
      ],
      OPTS,
    );
    expect(xml).toContain('Signal &amp; track &lt;broken&gt; &quot;quoted&quot;');
    expect(xml).toContain('Line 8&lt;0&amp;3 delayed to Denmark');
    expect(xml).toContain('a &lt; b &amp; c');
    expect(xml).not.toContain('Signal & track <broken>');
    expect(xml).not.toContain('<broken>');
    assertWellFormedXml(xml);
  });

  it('strips XML-1.0-invalid control characters from text values', () => {
    const xml = renderRssFeed([disruption({ raw_text: 'Line break\u0001here\u001F' })], OPTS);
    expect(xml).toContain('Line breakhere');
    expect(xml).not.toContain('\u0001');
    expect(xml).not.toContain('\u001F');
    assertWellFormedXml(xml);
  });

  it('formats pubDate as RFC 822 with CEST (+0200) for a summer timestamp', () => {
    const xml = renderRssFeed([disruption({ timestamp: '2026-07-15T12:00:00' })], OPTS);
    expect(xml).toContain('<pubDate>Wed, 15 Jul 2026 12:00:00 +0200</pubDate>');
  });

  it('formats pubDate as RFC 822 with CET (+0100) for a winter timestamp', () => {
    const xml = renderRssFeed([disruption({ timestamp: '2026-01-15T12:00:00' })], OPTS);
    expect(xml).toContain('<pubDate>Thu, 15 Jan 2026 12:00:00 +0100</pubDate>');
  });

  it('uses CEST after the spring-forward and CET after the fall-back', () => {
    const afterSpring = renderRssFeed([disruption({ timestamp: '2026-03-29T23:59:00' })], OPTS);
    expect(afterSpring).toContain('<pubDate>Sun, 29 Mar 2026 23:59:00 +0200</pubDate>');
    const afterFall = renderRssFeed([disruption({ timestamp: '2026-10-25T12:00:00' })], OPTS);
    expect(afterFall).toContain('<pubDate>Sun, 25 Oct 2026 12:00:00 +0100</pubDate>');
  });

  it('renders an empty channel (no items) for an empty list', () => {
    const xml = renderRssFeed([], OPTS);
    assertWellFormedXml(xml);
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
  });

  it('omits <pubDate> for an unparseable timestamp (never emits an empty element)', () => {
    const xml = renderRssFeed([disruption({ timestamp: 'not-a-date' })], OPTS);
    expect(xml).not.toContain('<pubDate>');
    assertWellFormedXml(xml);
  });
});

describe('renderRssFeed — links stay inside the /line discovery set (audit6)', () => {
  /**
   * The collector stores whatever route.designation it accepted, but /line
   * only answers for the canonical set plus the lines it reports. An item
   * linking a line outside that set would hand a feed reader a 404.
   */
  const DISCOVERED = ['803', '999'];

  it('deep-links a line the archive route answers for', () => {
    const xml = renderRssFeed([disruption({ line: '999' })], { ...OPTS, knownLines: DISCOVERED });
    expect(xml).toContain('<link>https://oresund.live/line/999</link>');
  });

  it('keeps the channel link for a line no archive page exists for', () => {
    // '777' is neither canonical nor in the discovered set.
    const xml = renderRssFeed([disruption({ line: '777' })], { ...OPTS, knownLines: DISCOVERED });
    const links = [...xml.matchAll(/<link>([^<]*)<\/link>/g)].map((m) => m[1]!);
    expect(links[0]).toBe('https://oresund.live/');
    expect(links[1]).toBe('https://oresund.live/');
    expect(xml).not.toContain('/line/777');
  });

  it('still deep-links a canonical line when the discovery fetch came back empty', () => {
    // knownArchiveLines([]) is what the feed passes when /lines fails: the
    // canonical pages exist without a fetch, so the outage costs the feed its
    // discovered links only — not all of them.
    const xml = renderRssFeed([disruption({ line: '803' }), disruption({ id: 2, line: '777' })], {
      ...OPTS,
      knownLines: knownArchiveLines([]),
    });
    expect(xml).toContain('<link>https://oresund.live/line/803</link>');
    expect(xml).not.toContain('/line/777');
  });

  it('deep-links every line when the caller cannot know the discovery set', () => {
    // No `knownLines`: the renderer has nothing to check against, which is the
    // pre-audit6 behaviour the feed's own caller no longer relies on.
    const xml = renderRssFeed([disruption({ line: '777' })], OPTS);
    expect(xml).toContain('<link>https://oresund.live/line/777</link>');
  });

  it('still escapes the line it declines to link', () => {
    const xml = renderRssFeed([disruption({ line: '8<0&3' })], { ...OPTS, knownLines: DISCOVERED });
    expect(xml).toContain('<title>Line 8&lt;0&amp;3 delayed to Denmark</title>');
    expect(xml).not.toContain('/line/8<0&3');
    assertWellFormedXml(xml);
  });
});

describe('knownArchiveLines', () => {
  it('unions the canonical corridor lines with the lines the collector observed', () => {
    const known = knownArchiveLines(['999', '804']);
    for (const canonical of ['801', '802', '803', '804', '910']) {
      expect(known).toContain(canonical);
    }
    expect(known).toContain('999');
  });

  it('de-duplicates a line the collector reports that is already canonical', () => {
    expect(knownArchiveLines(['803', '803', '999']).filter((l) => l === '803')).toHaveLength(1);
  });

  it('is exactly the canonical set when the discovery list is empty', () => {
    expect(knownArchiveLines([]).length).toBe(CANONICAL_LINES.length);
  });
});
