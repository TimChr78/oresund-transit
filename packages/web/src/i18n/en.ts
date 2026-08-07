import type { Dict } from './keys';

/** English dictionary — plain commuter voice, no marketing. */
export const en: Dict = {
  // Status banner
  status_normal: 'Normal service',
  status_delayed: 'Delays',
  status_cancellations: 'Cancellations',
  status_alerts: 'Alerts',
  status_service_shutdown: 'No train service across the Øresund right now',
  banner_updated: 'Updated',
  banner_disruptions_one: '1 disruption',
  banner_disruptions_many: '{n} disruptions',
  // Direction tabs
  tab_to_denmark: '→ DK',
  tab_to_sweden: '→ SE',
  tab_all: 'All',
  // Table headers
  th_time: 'Time',
  th_line: 'Line',
  th_type: 'Type',
  th_severity: 'Severity',
  th_delay: 'Delay',
  th_destination: 'Destination',
  th_reason: 'Reason',
  // Disruption types
  type_delay: 'Delay',
  type_cancellation: 'Cancellation',
  type_alert: 'Alert',
  // Severities
  sev_minor: 'Minor',
  sev_moderate: 'Moderate',
  sev_major: 'Major',
  // Stat labels
  stat_on_time: 'On time',
  stat_delayed: 'Delayed',
  stat_canceled: 'Canceled',
  stat_avg_delay: 'Avg delay',
  stat_departures: 'Departures',
  // History
  hist_daily: 'Daily',
  hist_by_line: 'By line',
  hist_by_cause: 'By cause',
  hist_by_hour: 'By hour',
  hist_total: 'Total: {n}',
  days_7: '7 days',
  days_14: '14 days',
  days_30: '30 days',
  // Sections
  section_disruptions: 'Disruptions',
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
  // Footer
  footer_attribution: 'Data from Trafiklab.se (CC-BY 4.0)',
  footer_disclaimer: 'Data can lag official apps by ~10–15 min; cancellations may be missed.',
  footer_changes: 'Modified: classification + presentation.',
  footer_lang: 'Language',
  footer_license: 'CC-BY 4.0 license',
};
