/**
 * Shared types for oresund-transit — the API contract between collector,
 * web dashboard, and any third-party consumers.
 *
 * These mirror the private SQLite schema. Keep in sync with:
 * - packages/collector/migrations/0001_initial.sql
 * - the private transit-monitor.py (data semantics)
 */

/** A disruption event (delay, cancellation, alert). */
export interface Disruption {
  id: number;
  timestamp: string;      // ISO local time
  line: string | null;
  type: 'delay' | 'cancellation' | 'alert' | string | null;
  cause: string | null;
  route_section: string | null;
  severity: 'minor' | 'moderate' | 'major' | string | null;
  delay_seconds: number | null;
  raw_text: string | null;
  dep_key: string | null;
  first_seen: string | null;
  last_updated: string | null;
  direction: 'to_denmark' | 'to_sweden' | string | null;
  technical_number: string | null;
  sched_time: string | null;
}

/** One observed departure at a monitored stop. */
export interface Departure {
  id: number;
  stop_id: string;
  stop_name: string;
  line: string | null;
  destination: string | null;
  sched_time: string | null;
  delay_seconds: number;
  canceled: 0 | 1;
  status: 'on_time' | 'delayed' | 'canceled';
  technical_number: string | null;
  dep_key: string;
  first_seen: string;
  last_updated: string;
}

/** Live status snapshot (the /api/transit/live contract). */
export interface LiveStatus {
  status: 'green' | 'blue' | 'amber' | 'red';
  status_text: string;
  timestamp: string;
  time_short: string;
  disruption_count: number;
  departure_counts: {
    to_denmark: number;
    to_sweden: number;
    bus: number;
  };
  service_shutdown: boolean;
  directions: {
    to_denmark: string[];
    to_sweden: string[];
    bus: string[];
  };
}

/** Delay-% analytics response (computed from departures table). */
export interface DelayStats {
  date_from: string;
  date_to: string;
  total_departures: number;
  on_time_count: number;
  delayed_count: number;
  canceled_count: number;
  on_time_pct: number;
  delayed_pct: number;
  canceled_pct: number;
  avg_delay_seconds: number | null;
  by_line: Record<string, LineDelayStats>;
}

export interface LineDelayStats {
  total: number;
  on_time_pct: number;
  delayed_pct: number;
  avg_delay_seconds: number | null;
}

/**
 * One departure as returned by the Trafiklab departure-board API
 * (mirrors the raw fixture JSON in packages/collector/test/fixtures/*.json).
 */
export interface TrafiklabDeparture {
  scheduled: string;
  realtime: string;
  delay: number;
  canceled: boolean;
  route: {
    designation: string;
    direction: string;
    transport_mode: string;
    transport_mode_code: number;
    name: string;
  };
  trip: {
    technical_number: number;
  };
  agency: {
    id: string;
    name: string;
    operator: string;
  };
  alerts: unknown[];
}
