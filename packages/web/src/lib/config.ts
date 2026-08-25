/**
 * @oresund/web build configuration.
 *
 * The collector Worker's API base (matches packages/collector deployment).
 * Server-side build steps (scripts/prerender.ts, run via tsx in Node) read
 * this from a single place instead of embedding the URL in each script.
 * Overridable at build time through the COLLECTOR_BASE environment variable
 * (e.g. pointing a local/CI build at a dev collector); defaults to the
 * deployed Worker.
 *
 * NOTE: this module is only safe to import from server/build-time code
 * (scripts, Pages Functions, tests) — `process` does not exist in the
 * browser, so it must never be imported by the client bundle.
 */
export const COLLECTOR_BASE =
  process.env.COLLECTOR_BASE ?? 'https://oresund-transit-collector.tchristensen78.workers.dev/api/transit';