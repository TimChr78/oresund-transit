/** Languages supported by the dashboard. */
export type Lang = 'sv' | 'da' | 'en';

/**
 * The full translation surface. All three dictionaries (sv/da/en) MUST have
 * exactly these keys — enforced by test/i18n.test.ts.
 */
export interface Dict {
  // Status banner
  status_normal: string;
  status_delayed: string;
  status_cancellations: string;
  status_alerts: string;
  status_service_shutdown: string;
  banner_updated: string;
  banner_disruptions_one: string;
  banner_disruptions_many: string;
  // Direction tabs
  tab_to_denmark: string;
  tab_to_sweden: string;
  tab_all: string;
  // Table headers
  th_time: string;
  th_line: string;
  th_type: string;
  th_severity: string;
  th_delay: string;
  th_direction: string;
  th_reason: string;
  // Disruption types
  type_delay: string;
  type_cancellation: string;
  type_alert: string;
  // Severities
  sev_minor: string;
  sev_moderate: string;
  sev_major: string;
  // Causes (enum keys stored in D1 — see categorizeCause in the collector)
  cause_staffing: string;
  cause_person_on_tracks: string;
  cause_signal_failure: string;
  cause_vehicle: string;
  cause_police: string;
  cause_infrastructure: string;
  cause_congestion: string;
  cause_weather: string;
  cause_unknown: string;
  // Stat labels
  stat_on_time: string;
  stat_delayed: string;
  stat_canceled: string;
  stat_avg_delay: string;
  stat_departures: string;
  // History
  hist_daily: string;
  hist_by_line: string;
  hist_by_cause: string;
  hist_by_hour: string;
  hist_total: string;
  days_7: string;
  days_14: string;
  days_30: string;
  // Sections
  section_disruptions: string;
  section_history: string;
  // Consent banner
  consent_title: string;
  consent_body: string;
  consent_accept: string;
  consent_decline: string;
  // Empty / loading / error states
  empty_no_data: string;
  empty_loading: string;
  empty_error: string;
  empty_retry: string;
  empty_disruptions: string;
  // Privacy page
  privacy_title: string;
  privacy_intro: string;
  privacy_analytics: string;
  privacy_data_source: string;
  privacy_ads: string;
  privacy_contact: string;
  privacy_back: string;
  nav_privacy: string;
  // Footer
  footer_attribution: string;
  footer_disclaimer: string;
  footer_changes: string;
  footer_lang: string;
  footer_license: string;
}

/** Union of every translation key. */
export type Key = keyof Dict;
