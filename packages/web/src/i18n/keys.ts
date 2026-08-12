/** Languages supported by the dashboard. */
export type Lang = 'sv' | 'da' | 'en';

/**
 * The full translation surface. All three dictionaries (sv/da/en) MUST have
 * exactly these keys — enforced by test/i18n.test.ts.
 */
export interface Dict {
  // Brand
  brand_name: string;
  brand_sub: string;
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
  // Stat card hints (one-liners defining each number)
  stat_on_time_hint: string;
  stat_delayed_hint: string;
  stat_canceled_hint: string;
  stat_avg_delay_hint: string;
  stat_departures_hint: string;
  // History
  hist_daily: string;
  hist_punctuality: string;
  hist_by_line: string;
  hist_by_cause: string;
  hist_by_hour: string;
  heat_tooltip: string;
  heat_caption: string;
  heat_low: string;
  heat_high: string;
  hist_by_weekday: string;
  hist_line_delay: string;
  hist_total: string;
  trend_avg_3d: string;
  punct_data_since: string;
  // Chart hints (one-liners defining each history chart)
  hist_daily_hint: string;
  hist_punctuality_hint: string;
  hist_by_line_hint: string;
  hist_by_weekday_hint: string;
  hist_by_cause_hint: string;
  hist_by_hour_hint: string;
  hist_peak_hint: string;
  // Short month names (month_1 = January)
  month_1: string;
  month_2: string;
  month_3: string;
  month_4: string;
  month_5: string;
  month_6: string;
  month_7: string;
  month_8: string;
  month_9: string;
  month_10: string;
  month_11: string;
  month_12: string;
  // Weekdays (Mon..Sun)
  weekday_mon: string;
  weekday_tue: string;
  weekday_wed: string;
  weekday_thu: string;
  weekday_fri: string;
  weekday_sat: string;
  weekday_sun: string;
  // Insight cards
  insight_wow: string;
  insight_wow_delta: string;
  insight_wow_counts: string;
  insight_avg_delay: string;
  insight_peak: string;
  insight_peak_share: string;
  insight_peak_avg: string;
  days_7: string;
  days_14: string;
  days_30: string;
  days_90: string;
  // Sections
  section_disruptions: string;
  disruptions_show_all: string;
  disruptions_back_to_today: string;
  disruptions_today_sep: string;
  disruptions_none_archive: string;
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
  disruptions_none_today: string;
  // Privacy page
  privacy_title: string;
  privacy_intro: string;
  privacy_analytics: string;
  privacy_data_source: string;
  privacy_ads: string;
  privacy_contact: string;
  privacy_back: string;
  nav_privacy: string;
  // Methodology page
  meth_title: string;
  meth_intro: string;
  meth_defs_title: string;
  meth_col_kpi: string;
  meth_col_definition: string;
  meth_thresholds_title: string;
  meth_thresholds_body: string;
  meth_scope_title: string;
  meth_scope_body: string;
  meth_source_title: string;
  meth_source_body: string;
  meth_lag_title: string;
  meth_lag_body: string;
  nav_methodology: string;
  meth_def_on_time: string;
  meth_def_delayed: string;
  meth_def_canceled: string;
  meth_def_avg_delay: string;
  meth_def_departures: string;
  meth_def_daily: string;
  meth_def_punctuality: string;
  meth_def_by_line: string;
  meth_def_by_weekday: string;
  meth_def_by_cause: string;
  meth_def_by_hour: string;
  meth_def_peak: string;
  // Footer
  footer_attribution: string;
  footer_disclaimer: string;
  footer_changes: string;
  footer_lang: string;
  footer_license: string;
}

/** Union of every translation key. */
export type Key = keyof Dict;
