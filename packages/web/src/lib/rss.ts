import type { Disruption } from '@oresund/shared';
import { causeLabel } from './causes';
import { formatDelaySeconds, stockholmWallClock } from '../i18n/format';

/**
 * Pure RSS 2.0 feed renderer for /feed.xml.
 *
 * The feed lists recent disruptions (Øresundståg) newest first, exactly as the
 * collector's /api/transit/disruptions returns them — this module NEVER
 * re-sorts. The collector has been Øresundståg-only since the August stop-id
 * correction (audit6 M5), so the feed must not claim Pågatåg coverage.
 *
 * All text values are XML-escaped on output; disruption data is external
 * input and can contain &, <, quotes.
 */

export interface RssOptions {
  title: string;
  description: string;
  link: string;
  /** Channel lastBuildDate; defaults to the current time (RFC 1123). */
  lastBuildDate?: Date;
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** XML-escape a text value for safe interpolation into the document. */
export function escXml(value: string): string {
  // Escape markup metacharacters AND drop XML-1.0-invalid control characters
  // (raw_text is external input; \t \n \r are the only allowed C0 controls).
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return cleaned.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * UTC offset of Europe/Stockholm (in minutes) at the given UTC instant.
 * +120 during CEST (summer), +60 during CET (winter). Reads the offset back
 * from the shared wall-clock helper (i18n/format) so there is one
 * implementation of "what does Stockholm say this instant is".
 */
function stockholmOffsetMinutes(utcMs: number): number {
  const { year, month, day, hour, minute, second } = stockholmWallClock(new Date(utcMs));
  const asUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  return (asUtc - utcMs) / 60_000;
}

/**
 * Render a disruption's NAIVE local timestamp ("YYYY-MM-DDTHH:MM:SS",
 * Europe/Stockholm wall clock) as an RFC 822 date carrying the correct UTC
 * offset for that date (+0200 CEST / +0100 CET). The wall-clock components
 * stay verbatim; only the offset varies with the season. Returns '' when
 * unparseable.
 */
function toRfc822(timestamp: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(timestamp);
  if (!m) return '';
  const y = m[1]!;
  const mo = m[2]!;
  const d = m[3]!;
  const h = m[4]!;
  const mi = m[5]!;
  const s = m[6]!;
  // Probe the season via the wall-clock anchored at UTC (the offset at that
  // instant — far from a DST transition for real disruption timestamps).
  const naiveUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const offsetMin = stockholmOffsetMinutes(naiveUtc);
  const weekday = DAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
  return `${weekday}, ${d} ${MONTHS[+mo - 1]} ${y} ${h}:${mi}:${s} ${tz}`;
}

/**
 * The item's link (audit6 L17): every item used to point at the channel URL,
 * which gave a reader nothing to deep-link to. Each disruption names a line,
 * and /line/{line} is a real page — so the item links there and the feed
 * becomes a way into the archives rather than 50 copies of the homepage.
 */
function linkFor(d: Disruption, channelLink: string): string {
  return d.line ? `https://oresund.live/line/${encodeURIComponent(d.line)}` : channelLink;
}

/** Item title composed from line + type + direction (feed is English-only). */
function titleFor(d: Disruption): string {
  const dir = d.direction === 'to_denmark' ? ' to Denmark' : d.direction === 'to_sweden' ? ' to Sweden' : '';
  switch (d.type) {
    case 'delay':
      return d.line ? `Line ${d.line} delayed${dir}` : `Delayed${dir}`;
    case 'cancellation':
      return d.line ? `Line ${d.line} cancellation${dir}` : `Cancellation${dir}`;
    case 'alert':
      return d.line ? `Alert: line ${d.line}` : 'Alert';
    default:
      return d.line ? `Disruption on line ${d.line}` : 'Disruption';
  }
}

/** Item description: cause + severity + delay minutes + raw_text. */
function descriptionFor(d: Disruption): string {
  const parts: string[] = [];
  if (d.cause) parts.push(`Cause: ${causeLabel(d.cause, 'en')}`);
  if (d.severity) parts.push(`Severity: ${d.severity}`);
  if (d.delay_seconds !== null && d.delay_seconds !== undefined) {
    parts.push(`Delay: ${formatDelaySeconds(d.delay_seconds, 'en')}`);
  }
  if (d.raw_text) parts.push(`Details: ${d.raw_text}`);
  return parts.join(' · ');
}

/** Render a full RSS 2.0 document listing the disruptions, newest first. */
export function renderRssFeed(items: Disruption[], opts: RssOptions): string {
  const lastBuildDate = (opts.lastBuildDate ?? new Date()).toUTCString();
  const itemXml = items
    .map((d) => {
      const pubDate = toRfc822(d.timestamp);
      const pubDateEl = pubDate ? `\n      <pubDate>${pubDate}</pubDate>` : '';
      return `    <item>
      <title>${escXml(titleFor(d))}</title>
      <link>${escXml(linkFor(d, opts.link))}</link>
      <guid isPermaLink="false">https://oresund.live/disruption/${d.id}</guid>${pubDateEl}
      <description>${escXml(descriptionFor(d))}</description>
    </item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escXml(opts.title)}</title>
    <link>${escXml(opts.link)}</link>
    <description>${escXml(opts.description)}</description>
    <language>en</language>
    <lastBuildDate>${escXml(lastBuildDate)}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;
}
