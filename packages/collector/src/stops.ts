/**
 * The monitored stops — the ONE copy of the stop id set (audit6 M11).
 *
 * Everything else that needs the ids derives them from here:
 *
 *   - `index.ts` attaches the per-stop Trafiklab filter and polls each stop;
 *   - `db.ts` re-exports `MONITORED_STOP_IDS` and binds it into every
 *     corridor-wide query over `departures`;
 *   - `migrations/0003_purge_superseded_stop_ids.sql` names the same four ids
 *     (db.test.ts reads the file and asserts it).
 *
 * Before audit6 the ids lived in TWO places — the routing table here's
 * predecessor in index.ts and `MONITORED_STOP_IDS` in db.ts — with nothing
 * cross-checking them. Correcting one id in one list left the corridor query
 * filtering the stale set, so /history's headline silently diverged from the
 * sum of the four station pages: the exact defect audit5 C1 was. A stop id is
 * now written down once.
 */

/** The stop facts the collector needs that are not fetch logic. */
export interface MonitoredStop {
  /** Trafiklab / ResRobot SiteId — the `departures.stop_id` value. */
  id: string;
  /** Display name, as the collector reports it in its own payloads. */
  name: string;
  /** Stable archive URL slug (ASCII, URL-safe) — the /station/{slug} path. */
  slug: string;
  /**
   * Whether departures at this stop attest cross-border service. Malmö C is
   * false not because its filter is the loose one — isOresundTrain is in fact
   * the narrowest of the four — but because purely local Øresundståg turns
   * call there: trains that never cross the bridge cannot attest that the
   * crossing is running, so they must not mask a service shutdown.
   */
  crossborder: boolean;
}

/**
 * `as const` (not a plain annotation) so the slugs stay a literal union instead
 * of widening to `string`. index.ts keys its per-stop filter table by that
 * union — `STOP_FILTERS satisfies Record<MonitoredStopSlug, …>` — so a stop
 * added here without a filter fails `tsc` rather than throwing inside
 * runScheduled and aborting the whole poll (audit7 L1).
 */
export const MONITORED_STOPS = [
  {
    // Hyllie 740001586 and København H 860000626 are verified live SiteIds
    // (they come from the real fixtures' query.query): Hyllie monitors
    // Denmark-bound trains via isCrossborderTrain, København H monitors
    // Sweden-bound trains via isSwedenBoundTrain. Kastrup Lufthavn mirrors
    // København H's filter.
    id: '740001586',
    name: 'Malmö Hyllie',
    slug: 'hyllie',
    crossborder: true,
  },
  {
    id: '860000626',
    name: 'København H',
    slug: 'kobenhavn-h',
    crossborder: true,
  },
  {
    // ✅ Verified 2026-08-24 against ResRobot: real Malmö Centralstation is
    // 740000003 (740000001 was Stockholm C — collected Arlanda Express/Uppsala).
    id: '740000003',
    name: 'Malmö C',
    slug: 'malmo-c',
    crossborder: false,
  },
  {
    // ✅ Verified live 2026-08-22: 860000858 = 'Kastrup flygplats' (ResRobot
    // exact name) — real departures. The earlier 840004349 Kastrup id was a
    // registry misinterpretation — Danish stops use the 86xxxx range
    // (København H = 860000626); polled against the live key, 840004349
    // matched nothing.
    id: '860000858',
    name: 'Københavns Lufthavn (Kastrup)',
    slug: 'kastrup',
    crossborder: true,
  },
] as const satisfies readonly MonitoredStop[];

/** The URL slugs of the monitored stops, as a literal union (see MONITORED_STOPS). */
export type MonitoredStopSlug = (typeof MONITORED_STOPS)[number]['slug'];

/**
 * The stop ids, in monitoring order — the bind list of every corridor-wide
 * `departures` query. Derived, never restated.
 */
export const MONITORED_STOP_IDS: readonly string[] = MONITORED_STOPS.map((s) => s.id);
