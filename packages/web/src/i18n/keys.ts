/** Languages supported by the dashboard. */
export type Lang = 'sv' | 'da' | 'en';

/**
 * The full translation surface. All three dictionaries (sv/da/en) MUST have
 * exactly these keys — enforced by test/i18n.test.ts.
 */
export interface Dict {
  // Brand
  brand_name: string;
  // Status banner
  status_normal: string;
  status_delayed: string;
  status_cancellations: string;
  status_alerts: string;
  status_service_shutdown: string;
  banner_updated: string;
  banner_disruptions_one: string;
  banner_disruptions_many: string;
  // Disruption hero strip (newest active disruptions surfaced above the table)
  hero_disruptions: string;
  // SEO lead (H1 under the brand wordmark) — tight, names the four monitored
  // stops. Kept verbatim in index.html for en (the served shell), swapped in
  // by the prerenderer for sv/da.
  lead_tagline: string;
  // Build-time corridor status summary (no-JS/crawler home shell) — the
  // three-sentence snapshot injected at build time from collector data
  seo_status_normal: string;
  seo_status_delayed: string;
  seo_status_cancellations: string;
  seo_status_alerts: string;
  seo_status_shutdown: string;
  seo_cancel_24h_zero: string;
  seo_cancel_24h_one: string;
  seo_cancel_24h_many: string;
  seo_trend_up: string;
  seo_trend_down: string;
  seo_trend_flat: string;
  // Direction tabs
  tab_to_denmark: string;
  tab_to_sweden: string;
  tab_all: string;
  // Table headers
  th_time: string;
  th_line: string;
  th_type: string;
  th_delay: string;
  th_direction: string;
  th_reason: string;
  // Station-page table headers (audit3 C1/H2) — the archive daily table and
  // the latest-observed-departures table.
  th_date: string;
  th_status: string;
  th_train: string;
  th_on_time_pct: string;
  // Chart data tables (audit4 N-M15) — the accessible alternative for the
  // charts, whose values live in pixel geometry.
  th_total: string;
  th_hour: string;
  th_share: string;
  th_count: string;
  sr_data_table: string;
  th_canceled: string;
  // Disruption types
  type_delay: string;
  type_cancellation: string;
  type_alert: string;
  // Disruption row detail (backlog B1) — the scheduled-vs-expected time pair
  // tooltip and the affected-stretch note under the line.
  time_pair_title: string;
  route_section_hint: string;
  // Delay bands (audit3 H1) — the DELAY column renders these as color-coded
  // badges instead of raw seconds; the exact delay lives in the badge tooltip.
  delay_band_on_time: string;
  delay_band_minor: string;
  delay_band_moderate: string;
  delay_band_major: string;
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
  // Accessible names for the two board tables (audit4 LOW): neither table has a
  // visible heading of its own inside .table-wrap.
  disruptions_caption_today: string;
  disruptions_caption_archive: string;
  // Zero rows under a direction filter (backlog B4) — distinct from the
  // corridor-wide disruptions_none_today, which would over-claim "all clear".
  disruptions_none_today_dir: string;
  section_history: string;
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
  meth_tracking_title: string;
  meth_tracking_body: string;
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
  // Archive page titles (station archives — template must keep rendered
  // <title> ≤ 60 chars even for the longest monitored stop name)
  station_archive_title: string;
  // Station pages (audit3 C1) — the per-station page is localized in all three
  // languages, so every string it renders lives here: heading, sub-line, meta
  // description, the daily-archive table and the live section (corridor status
  // band + latest observed departures).
  station_h1: string;
  station_sub: string;
  station_desc: string;
  station_desc_empty: string;
  station_daily_heading: string;
  station_other_heading: string;
  /**
   * Document title of the board while one station is picked (audit4 N-M5).
   * Takes {name}.
   */
  station_board_title: string;
  /** Station ↔ line cross-links (audit4 N-M1). */
  station_lines_heading: string;
  line_stations_heading: string;
  // Station scope on the live board (backlog A1) — the departures table shown
  // while a single station is picked in the picker.
  station_scope_heading: string;
  station_scope_intro: string;
  station_scope_empty: string;
  station_scope_archive_link: string;
  station_live_heading: string;
  station_live_intro: string;
  station_departures_heading: string;
  // As-of line under the departures heading (audit4 N-C1) — the collector
  // stamps every /station response with the read the rows were bounded to.
  station_as_of: string;
  station_observed_note: string;
  station_col_destination: string;
  nav_stations: string;
  nav_board: string;
  station_nav_label: string;
  // Accessible names for the two filter groups on the board (audit4 LOW)
  filter_direction: string;
  filter_range: string;
  // Footer
  footer_attribution: string;
  footer_disclaimer: string;
  footer_changes: string;
  footer_lang: string;
  footer_license: string;
  footer_rss: string;
  // Archive pages — prerendered intros, summary stats row, monitoring note.
  // The archive SSG renderers serve en by default; the keys still live in all
  // three dictionaries for parity and future localized archive pages.
  arch_stat_total: string;
  arch_stat_cancellations: string;
  arch_stat_delays: string;
  arch_stat_alerts: string;
  arch_stat_avg_delay: string;
  arch_hist_intro_7: string;
  arch_hist_intro_14: string;
  arch_hist_intro_30: string;
  arch_hist_intro_90: string;
  arch_intro_line: string;
  arch_intro_station: string;
  arch_empty_period: string;
  arch_empty_day: string;

  // Archive pages (server-rendered hubs — en is what crawlers see)
  hub_line_intro: string;
  hub_station_intro: string;
  archive_attribution: string;
  line_archive_href: string;
  line_no_disruptions_note: string;
  station_no_data_note: string;

  /**
   * The /history hub — the aggregate archive page. With the station pages it is
   * the one archive family served in en + sv + da, so every string it renders
   * lives here. `hub_history_title` must stay ≤ 60 characters and
   * `hub_history_desc` inside 120–155 (both asserted in test/archive.test.ts);
   * `hub_history_sub` takes {days}, {from} and {to}.
   */
  hub_history_title: string;
  hub_history_h1: string;
  hub_history_desc: string;
  hub_history_sub: string;
  hub_history_intro: string;
  hub_history_windows_heading: string;
  /** The stat-card label for the corridor's recorded disruption count. */
  stat_disruptions: string;

  // Station display names (audit3 M4) — keyed by the collector slug. A stop
  // name is a user-visible string, so it translates like any other.
  station_hyllie: string;
  station_kobenhavn_h: string;
  station_malmo_c: string;
  station_kastrup: string;

  // Homepage about block (audit3 C2) — the evergreen crawlable copy in the
  // no-JS/crawler home shell. about_corridor takes a {stations} placeholder
  // (the localized names, corridor order) and about_method a {link}
  // placeholder replaced with the /methodology anchor.
  about_title: string;
  about_corridor: string;
  about_method: string;
  about_source: string;

  // Archive hub links (audit3 C3) — shared by the board body, the homepage
  // about block and the methodology related-pages list.
  arch_link_station: string;
  arch_link_line: string;
  arch_link_history: string;
  arch_link_station_desc: string;
  arch_link_line_desc: string;
  arch_link_history_desc: string;
  board_archives_heading: string;
  board_archives_intro: string;
  meth_related_title: string;
  meth_related_intro: string;

  // Collector-outage fallback page (audit4 N-H4) — the 502 the archive
  // Functions and /feed.xml answer with when the collector Worker is
  // unreachable. Server-rendered, so it cannot reuse the SPA dictionaries at
  // runtime; the language is picked from the URL prefix, then Accept-Language.
  err502_title: string;
  nav_site_sections: string;
  err502_body: string;
  err502_retry: string;
  err502_home: string;
}

/** Union of every translation key. */
export type Key = keyof Dict;
