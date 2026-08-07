import type { Dict } from './keys';

/** Danish dictionary — plain commuter voice, no marketing. */
export const da: Dict = {
  // Status banner
  status_normal: 'Normal drift',
  status_delayed: 'Forsinkelser',
  status_cancellations: 'Aflyste afgange',
  status_alerts: 'Driftsforstyrrelser',
  status_service_shutdown: 'Ingen togtrafik over Øresund lige nu',
  banner_updated: 'Opdateret',
  banner_disruptions_one: '1 forstyrrelse',
  banner_disruptions_many: '{n} forstyrrelser',
  // Direction tabs
  tab_to_denmark: 'Til Danmark',
  tab_to_sweden: 'Til Sverige',
  tab_all: 'Alle',
  // Table headers
  th_time: 'Tid',
  th_line: 'Linje',
  th_type: 'Type',
  th_severity: 'Alvorlighed',
  th_delay: 'Forsinkelse',
  th_direction: 'Retning',
  th_reason: 'Årsag',
  // Disruption types
  type_delay: 'Forsinkelse',
  type_cancellation: 'Aflyst',
  type_alert: 'Advarsel',
  // Severities
  sev_minor: 'Mindre',
  sev_moderate: 'Moderat',
  sev_major: 'Alvorlig',
  // Causes
  cause_staffing: 'Mangel på personale',
  cause_person_on_tracks: 'Person på sporet',
  cause_signal_failure: 'Signalfejl',
  cause_vehicle: 'Køretøjsfejl',
  cause_police: 'Politi / udrykning',
  cause_infrastructure: 'Infrastruktur',
  cause_congestion: 'Togkø',
  cause_weather: 'Vejr',
  cause_unknown: 'Ukendt',
  // Stat labels
  stat_on_time: 'Til tiden',
  stat_delayed: 'Forsinkede',
  stat_canceled: 'Aflyste',
  stat_avg_delay: 'Gns. forsinkelse',
  stat_departures: 'Afgange',
  // History
  hist_daily: 'Per dag',
  hist_by_line: 'Per linje',
  hist_by_cause: 'Per årsag',
  hist_by_hour: 'Per time',
  hist_total: 'I alt: {n}',
  days_7: '7 dage',
  days_14: '14 dage',
  days_30: '30 dage',
  // Sections
  section_disruptions: 'Forstyrrelser',
  section_history: 'Historik',
  // Consent banner
  consent_title: 'Cookies og privatliv',
  consent_body: 'Vi bruger cookies kun til at huske dit sprogvalg. Ingen annoncer, ingen sporing.',
  consent_accept: 'OK',
  consent_decline: 'Afvis',
  // Empty / loading / error states
  empty_no_data: 'Ingen afgange endnu — første planlagte aflæsning afventes.',
  empty_loading: 'Indlæser…',
  empty_error: 'Trafikdata er ikke tilgængelig lige nu.',
  empty_retry: 'Prøv igen',
  empty_disruptions: 'Ingen forstyrrelser',
  // Privacy page
  privacy_title: 'Privatliv',
  privacy_intro:
    'Denne side viser live- og historisk togstatus over Øresund. Det eneste, vi gemmer om dig, er dit sprogvalg i browserens localStorage.',
  privacy_analytics:
    'Vi bruger Umami analytics til at tælle besøg anonymt. Umami bruger ingen cookies, indsamler ingen personlige data og sporer dig ikke på tværs af websteder.',
  privacy_data_source:
    'Live- og historiske data leveres af Trafiklab under en CC-BY 4.0-licens. Kilde:',
  privacy_ads: 'Denne side viser ingen annoncer.',
  privacy_contact: 'Spørgsmål eller feedback? Skriv til os på',
  privacy_back: '← Tilbage til oversigten',
  nav_privacy: 'Privatliv',
  // Footer
  footer_attribution: 'Data fra Trafiklab.se (CC-BY 4.0)',
  footer_disclaimer: 'Data kan ligge ~10–15 min. efter officielle apps; aflyste afgange kan blive overset.',
  footer_changes: 'Ændret: klassificering + præsentation.',
  footer_lang: 'Sprog',
  footer_license: 'CC-BY 4.0-licensen',
};
