import type { Dict } from './keys';

/** English dictionary — plain commuter voice, no marketing. */
export const en: Dict = {
  // Brand (identical across languages)
  brand_name: 'Øresund',
  brand_sub: 'live',
  // Status banner
  status_normal: 'Normal service',
  status_delayed: 'Delays',
  status_cancellations: 'Cancellations',
  status_alerts: 'Alerts',
  status_service_shutdown: 'No train service across the Øresund right now',
  banner_updated: 'Updated',
  banner_disruptions_one: '1 disruption',
  banner_disruptions_many: '{n} disruptions',
  // Disruption hero strip
  hero_disruptions: 'Active now',
  // SEO lead (H1 under the brand wordmark)
  lead_tagline:
    'Live train departures: Hyllie, Malmö C, Kastrup, København H',
  // Build-time corridor status summary (no-JS/crawler home shell) — written
  // as plain sentences so crawlers and JS-disabled visitors get the snapshot.
  seo_status_normal: 'Trains are running normally across the Øresund crossing.',
  seo_status_delayed: 'Delays are affecting trains across the Øresund crossing.',
  seo_status_cancellations: 'Disruptions are affecting trains across the Øresund crossing.',
  seo_status_alerts: 'Minor alerts are active for trains across the Øresund crossing.',
  seo_status_shutdown: 'Train service across the Øresund crossing is suspended.',
  seo_cancel_24h_zero: 'No cancellations in the last 24 hours.',
  seo_cancel_24h_one: '1 cancellation in the last 24 hours.',
  seo_cancel_24h_many: '{n} cancellations in the last 24 hours.',
  seo_trend_up: 'That is more than the previous 24 hours.',
  seo_trend_down: 'That is fewer than the previous 24 hours.',
  seo_trend_flat: 'That is in line with the previous 24 hours.',
  // Direction tabs
  tab_to_denmark: '→ DK',
  tab_to_sweden: '→ SE',
  tab_all: 'All',
  // Table headers
  th_time: 'Time',
  th_line: 'Line',
  th_type: 'Type',
  th_delay: 'Delay',
  th_direction: 'Direction',
  th_reason: 'Reason',
  // Station-page table headers (audit3 C1/H2)
  th_date: 'Date',
  th_status: 'Status',
  th_train: 'Train',
  th_on_time_pct: 'On time %',
  th_canceled: 'Cancelled',
  // Disruption types
  type_delay: 'Delay',
  type_cancellation: 'Cancellation',
  type_alert: 'Alert',
  // Disruption row detail (B1)
  time_pair_title: 'Scheduled {sched} · expected {actual} ({delay})',
  route_section_hint: 'Affected section',
  // Delay bands (audit3 H1) — badge text in the DELAY column
  delay_band_on_time: 'On time',
  delay_band_minor: '4–10 min',
  delay_band_moderate: '10–15 min',
  delay_band_major: '15+ min',
  // Causes
  cause_staffing: 'Staffing shortage',
  cause_person_on_tracks: 'Person on tracks',
  cause_signal_failure: 'Signal failure',
  cause_vehicle: 'Vehicle fault',
  cause_police: 'Police / emergency',
  cause_infrastructure: 'Infrastructure',
  cause_congestion: 'Train queue',
  cause_weather: 'Weather',
  cause_unknown: 'Unknown',
  // Stat labels
  stat_on_time: 'On time',
  stat_delayed: 'Delayed',
  stat_canceled: 'Canceled',
  stat_avg_delay: 'Avg delay',
  stat_departures: 'Departures',
  // Stat card hints
  stat_on_time_hint: 'Today · share of departures with under 4 min delay',
  stat_delayed_hint: 'Today · departures delayed 4 min or more',
  stat_canceled_hint: 'Today · departures canceled',
  stat_avg_delay_hint: 'Mean delay of all departures today',
  stat_departures_hint: 'Cross-border Øresundståg departures today',
  // History
  hist_daily: 'Daily',
  hist_punctuality: 'Punctuality',
  hist_by_line: 'By line',
  hist_by_cause: 'By cause',
  hist_by_hour: 'By hour',
  heat_tooltip: '{hour}:00 — {pct} ({n})',
  heat_caption: 'Share of disruptions by hour — last 30 days',
  heat_low: 'low',
  heat_high: 'high',
  hist_by_weekday: 'By weekday',
  hist_line_delay: 'avg {a} · max {b}',
  hist_total: 'Total: {n}',
  trend_avg_3d: '3-day avg',
  punct_data_since: 'data since {date}',
  // Chart hints
  hist_daily_hint: 'Disruptions per day, stacked by type',
  hist_punctuality_hint: 'Share of departures on time (under 4 min delay) per day',
  hist_by_line_hint: 'Disruption count per train line · avg / max delay',
  hist_by_weekday_hint: 'Disruptions by weekday · avg delay',
  hist_by_cause_hint: 'Disruptions grouped by cause',
  hist_by_hour_hint: 'Share of disruptions by hour of day',
  hist_peak_hint: 'Peak hours 07–09 & 16–18 vs rest of day',
  // Short month names
  month_1: 'Jan',
  month_2: 'Feb',
  month_3: 'Mar',
  month_4: 'Apr',
  month_5: 'May',
  month_6: 'Jun',
  month_7: 'Jul',
  month_8: 'Aug',
  month_9: 'Sep',
  month_10: 'Oct',
  month_11: 'Nov',
  month_12: 'Dec',
  // Weekdays
  weekday_mon: 'Mon',
  weekday_tue: 'Tue',
  weekday_wed: 'Wed',
  weekday_thu: 'Thu',
  weekday_fri: 'Fri',
  weekday_sat: 'Sat',
  weekday_sun: 'Sun',
  // Insight cards
  insight_wow: 'Week over week',
  insight_wow_delta: '{pct} vs previous week',
  insight_wow_counts: '{prev} → {curr} disruptions',
  insight_avg_delay: 'Avg delay: {a} → {b}',
  insight_peak: 'Peak hours',
  insight_peak_share: '{pct} of disruptions during peak',
  insight_peak_avg: 'Peak {peak} · off-peak {off}',
  days_7: '7 days',
  days_14: '14 days',
  days_30: '30 days',
  days_90: '90 days',
  // Sections
  section_disruptions: 'Disruptions',
  disruptions_show_all: 'Show all disruptions',
  disruptions_back_to_today: 'Back to today',
  disruptions_today_sep: 'Today',
  disruptions_none_archive: 'No disruptions logged in the recent archive.',
  disruptions_none_today_dir: 'No disruptions in this direction today.',
  section_history: 'History',
  // Consent banner
  consent_title: 'Cookies & privacy',
  consent_body: 'We use cookies only to remember your language choice. No ads, no tracking.',
  consent_accept: 'Accept',
  consent_decline: 'Decline',
  // Empty / loading / error states
  empty_no_data: 'No departures yet — waiting for the first scheduled run.',
  empty_loading: 'Loading…',
  empty_error: 'Live data is unreachable right now.',
  empty_retry: 'Retry',
  empty_disruptions: 'No disruptions',
  disruptions_none_today: 'All clear — no disruptions today.',
  // Privacy page
  privacy_title: 'Privacy',
  privacy_intro:
    'This site shows live and historical train status across the Øresund. The only thing it stores about you is your language choice, saved in your browser (localStorage).',
  privacy_analytics:
    'We use Umami analytics to count visits anonymously. Umami is cookieless, collects no personal data, and does not track you across sites.',
  privacy_data_source:
    'Live and historical data is provided by Trafiklab under a CC-BY 4.0 license. Source:',
  privacy_ads: 'No ads are served on this site.',
  privacy_contact: 'Questions or feedback? Email us at',
  privacy_back: '← Back to dashboard',
  nav_privacy: 'Privacy',
  // Methodology page
  meth_title: 'Methodology',
  meth_intro: 'How every number on this site is defined, and where the data comes from.',
  meth_defs_title: 'KPI definitions',
  meth_col_kpi: 'KPI',
  meth_col_definition: 'Definition',
  meth_thresholds_title: 'Thresholds',
  meth_thresholds_body:
    'A departure counts as delayed when its delay is 240 seconds (4 minutes) or more — Skånetrafiken’s official RT3 punctuality measure (≤ 3:59 late = punctual). Everything below that counts as on time.',
  meth_scope_title: 'Coverage',
  meth_scope_body:
    'Data covers cross-border Øresundståg services (lines 802–805) on the Hyllie ↔ København H corridor only. Other regional and local services are not included.',
  meth_source_title: 'Data source',
  meth_source_body:
    'Data comes from Trafiklab (Skånetrafiken) realtime departures, polled every 5 minutes, under a CC-BY 4.0 license. Live data starts 2026-08-06; earlier history comes from KoDa’s historical archive (May 2026 onward).',
  meth_lag_title: 'Data lag',
  meth_lag_body:
    'Trafiklab data can lag the official Skånetrafiken app by about 10–15 minutes on cancellations.',
  nav_methodology: 'Methodology',
  meth_def_on_time: 'Share of today’s cross-border departures with a delay under 240 seconds (4 minutes).',
  meth_def_delayed:
    'Share of today’s cross-border departures delayed 240 seconds (4 minutes) or more — not canceled.',
  meth_def_canceled: 'Share of today’s cross-border departures that were canceled.',
  meth_def_avg_delay:
    'Mean delay across all of today’s departures, in seconds — on-time departures count with their actual (near-zero) delay.',
  meth_def_departures:
    'Number of today’s cross-border departures observed: Øresundståg lines 802–805 on the Hyllie ↔ København H corridor.',
  meth_def_daily: 'Disruptions (cancellations, delays, alerts) per day, stacked by type.',
  meth_def_punctuality: 'Share of departures on time (delay under 4 minutes) per day. Days without departures are skipped.',
  meth_def_by_line: 'Disruption count per train line, plus average and maximum delay.',
  meth_def_by_weekday: 'Disruption count per weekday, plus average delay.',
  meth_def_by_cause: 'Disruption count grouped by cause category.',
  meth_def_by_hour: 'Share of disruptions per hour of day — last 30 days.',
  meth_def_peak: 'Share of disruptions during peak hours (07–09 and 16–18) versus the rest of the day.',
  // Archive page titles — template must keep the rendered <title> ≤ 60 chars
  // even for the longest monitored stop name ("Københavns Lufthavn (Kastrup)").
  station_archive_title: '{name} — punctuality — Øresund.live',
  // Station pages (audit3 C1) — the per-station page is fully localized.
  station_h1: '{name} — punctuality archive',
  station_sub: 'Observed departures over the last {days} days ({from}–{to}).',
  station_desc:
    'Punctuality history for {name} on the Øresund crossing — {n} departures, {pct}% on time over the last {days} days.',
  station_desc_empty:
    'Punctuality history for {name} on the Øresund crossing — no departures recorded yet; data starts flowing once live monitoring begins.',
  station_daily_heading: 'Daily on-time performance',
  station_other_heading: 'Other stations',
  // Station scope on the live board (A1)
  station_scope_heading: 'Latest departures at {name}',
  station_scope_intro:
    'Departures observed at {name}. The status band, KPI cards and history charts cover all four monitored stations.',
  station_scope_empty: 'No departures observed at {name} yet.',
  station_scope_archive_link: 'Punctuality archive for {name}',
  station_live_heading: 'Live status right now',
  station_live_intro:
    'The status band covers the whole Øresund corridor; the departures below were observed at {name}.',
  station_departures_heading: 'Latest observed departures',
  // audit4 N-C1 — the stamp the recent rows were bounded to (sched_time <= it).
  station_as_of: 'Observed up to {time} on {date}',
  // Tone follows meth_lag_body: declare the lag instead of implying a live
  // predictive board (the collector polls every 5 min and reads back slots).
  station_observed_note:
    'These are observed departures, not a predictive departure board — the collector polls Trafiklab every 5 minutes and reads back the most recent scheduled slots, so the newest rows can lag real time by up to 15 minutes.',
  station_col_destination: 'Destination',
  nav_stations: 'Stations',
  nav_board: 'Live board',
  station_nav_label: 'Monitored stations',
  // Footer
  footer_attribution: 'Data from Trafiklab.se (CC-BY 4.0)',
  footer_disclaimer: 'Data can lag official apps by ~10–15 min; cancellations may be missed.',
  footer_changes: 'Modified: classification + presentation.',
  footer_lang: 'Language',
  footer_license: 'CC-BY 4.0 license',
  footer_rss: 'RSS feed',
  // Archive pages — prerendered intros, summary stats row, monitoring note.
  arch_stat_total: 'Total',
  arch_stat_cancellations: 'Cancellations',
  arch_stat_delays: 'Delays',
  arch_stat_alerts: 'Alerts',
  arch_stat_avg_delay: 'Avg delay',
  arch_hist_intro_7: 'A snapshot of the last 7 days — how cancellations, delays and alerts played out across the Øresund crossing this week.',
  arch_hist_intro_14: 'Two weeks of service history — a clearer picture of how disruptions on the crossing have evolved.',
  arch_hist_intro_30: 'A month of service history — the last 30 days of cancellations, delays and alerts on the Øresund crossing.',
  arch_hist_intro_90: 'Three months of service history — the long-term pattern of cancellations, delays and alerts across the crossing.',
  arch_intro_line: 'Disruptions recorded for line {line} — cancellations, delays and alerts with the most common causes and a day-by-day breakdown.',
  arch_intro_station: 'On-time performance at {station} — how many departures left on time, were delayed or canceled, day by day.',
  arch_empty_period: 'Monitoring began {date} — {from} to {to} recorded no data.',
  arch_empty_day: 'Monitoring began {date} — {from} recorded no data.',

  // Archive pages (server-rendered hubs — en is what crawlers see)
  hub_line_intro:
    'This hub covers every train service running across the Øresund — the cross-border Øresundståg services (lines 802–805) and the regional lines that share the corridor. Each line page tracks the disruptions recorded against that service: cancellations, delays and alerts, with the most common causes and a day-by-day breakdown over the last 30 days.',
  hub_station_intro:
    'This hub covers the monitored stops on the Øresund corridor, from Malmö C and Hyllie across the bridge to Kastrup Lufthavn and København H. Each station page shows punctuality — the share of departures on time, cancellations and the average delay — with a day-by-day record over the last 30 days.',
  archive_attribution: 'Data from Trafiklab.se',
  line_archive_href: 'Line {line} delays & history',
  line_no_disruptions_note: 'No disruptions recorded since monitoring began 2026-08-06.',
  station_no_data_note: 'No departures recorded since monitoring began 2026-08-06.',

  // Station display names (audit3 M4) — keyed by the collector slug. The en
  // forms mirror the collector's stop_name verbatim (archive.ts falls back to
  // it for slugs the dictionaries do not know yet).
  station_hyllie: 'Malmö Hyllie',
  station_kobenhavn_h: 'København H',
  station_malmo_c: 'Malmö C',
  station_kastrup: 'Københavns Lufthavn (Kastrup)',

  // Homepage about block (audit3 C2) — evergreen, crawlable copy in the
  // no-JS/crawler shell. Descriptive only: what is tracked, how a number is
  // defined, where the data comes from. {link} in about_method is replaced
  // with the /methodology anchor after escaping (see HomeAbout.ts).
  about_title: 'Train punctuality across the Øresund, station by station',
  about_corridor:
    'Øresund.live follows cross-border Øresundståg services on the corridor between Malmö and Copenhagen. Every scheduled departure passing one of the four monitored stations — Malmö Hyllie, Malmö C, Kastrup and København H — is compared with the timetable and stored, so each station page can show how that stop actually performed.',
  about_method:
    'A departure counts as on time when it leaves less than four minutes late — the RT3 punctuality threshold Skånetrafiken uses. Larger deviations are recorded as delays or cancellations, and operator alerts are grouped into cause categories such as signal failure, vehicle fault or staffing. The {link} page defines every number on the board.',
  about_source:
    'Data comes from Trafiklab (Skånetrafiken) realtime departures, polled every five minutes and published under a CC-BY 4.0 license. Live monitoring began in August 2026, so the archives are still short — and the board shows observed departures, not a prediction of the next train.',

  // Archive hub links (audit3 C3) — one set of labels + one-line descriptions
  // shared by the board body (App.ts), the homepage about block
  // (HomeAbout.ts) and the methodology page's related-pages list.
  arch_link_station: 'Station archives',
  arch_link_line: 'Line archives',
  arch_link_history: 'Disruption history, last 30 days',
  arch_link_station_desc: 'On-time share, cancellations and average delay at each monitored stop.',
  arch_link_line_desc: 'Disruptions recorded per train line over the last 30 days.',
  arch_link_history_desc: 'Day-by-day cancellations, delays and alerts across the crossing.',
  board_archives_heading: 'History & archives',
  board_archives_intro: 'The board shows today. The archives keep the longer record — per station, per line and day by day.',
  meth_related_title: 'Related pages',
  meth_related_intro:
    'The same definitions applied: the punctuality record of each monitored station, and the disruption history behind the charts.',
};
