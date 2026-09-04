/**
 * Cross-package drift guard (audit7 N-M2).
 *
 * `packages/collector/src/stops.ts` is the one home of the stop ids — but
 * `STATIC_STATIONS` in src/lib/sitemap.ts restated slug + stop_id + stop_name
 * for all four stops, and nothing compared the two. This copy is published:
 * `buildLlmsTxt` writes "Trafiklab stop id {id}" into llms.txt for all four
 * stops in all three languages, and `staticBase` in functions/sitemap.xml.js
 * falls back to it when the collector is down. A future id correction in the
 * collector — the exact event that caused audit5's CRITICAL — would otherwise
 * leave llms.txt, the JSON-LD and the outage sitemap advertising a stale id
 * with every test green.
 *
 * A build-time derivation was the other option audited and rejected: it would
 * put a `packages/collector` import inside sitemap.ts, which is bundled both by
 * `vite build` and by the Pages Functions, so the deploy tooling would have to
 * reach outside the web package root. A test needs no tooling and fails loudly
 * on the same drift.
 */
import { describe, expect, it } from 'vitest';
import { MONITORED_STOPS } from '../../collector/src/stops';
import { STATIC_STATIONS } from '../src/lib/sitemap';

describe('STATIC_STATIONS vs the collector MONITORED_STOPS', () => {
  it('is the collector stop set, not a second copy of it', () => {
    expect(STATIC_STATIONS.map(({ slug, stop_id, stop_name }) => ({ slug, stop_id, stop_name }))).toEqual(
      MONITORED_STOPS.map(({ slug, id, name }) => ({ slug, stop_id: id, stop_name: name })),
    );
  });

  it('keeps the collector’s monitoring order, which the corridor aggregates follow', () => {
    expect(STATIC_STATIONS.map((s) => s.slug)).toEqual(MONITORED_STOPS.map((s) => s.slug));
  });

  it('covers every monitored stop — a stop added in the collector must be added here too', () => {
    expect(new Set(STATIC_STATIONS.map((s) => s.slug))).toEqual(new Set(MONITORED_STOPS.map((s) => s.slug)));
  });

  it('carries the entity facts (place + geo) the TrainStation JSON-LD needs', () => {
    for (const station of STATIC_STATIONS) {
      expect(station.place.trim().length, station.slug).toBeGreaterThan(0);
      expect(Number.isFinite(station.geo.lat), `${station.slug} lat`).toBe(true);
      expect(Number.isFinite(station.geo.lng), `${station.slug} lng`).toBe(true);
    }
  });
});
