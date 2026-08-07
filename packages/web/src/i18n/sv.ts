import type { Dict } from './keys';

/** Swedish dictionary — plain commuter voice, no marketing. */
export const sv: Dict = {
  // Status banner
  status_normal: 'Normal trafik',
  status_delayed: 'Förseningar',
  status_cancellations: 'Inställda avgångar',
  status_alerts: 'Trafikstörningar',
  status_service_shutdown: 'Ingen tågtrafik över Öresund just nu',
  banner_updated: 'Uppdaterad',
  banner_disruptions_one: '1 störning',
  banner_disruptions_many: '{n} störningar',
  // Direction tabs
  tab_to_denmark: 'Mot Danmark',
  tab_to_sweden: 'Mot Sverige',
  tab_all: 'Alla',
  // Table headers
  th_time: 'Tid',
  th_line: 'Linje',
  th_type: 'Typ',
  th_severity: 'Allvarlighet',
  th_delay: 'Försening',
  th_direction: 'Riktning',
  th_reason: 'Orsak',
  // Disruption types
  type_delay: 'Försening',
  type_cancellation: 'Inställd',
  type_alert: 'Varning',
  // Severities
  sev_minor: 'Mindre',
  sev_moderate: 'Måttlig',
  sev_major: 'Allvarlig',
  // Causes (Swedish reference — matches the private board)
  cause_staffing: 'Personalbrist',
  cause_person_on_tracks: 'Person på spår',
  cause_signal_failure: 'Signalfel',
  cause_vehicle: 'Fordonsfel',
  cause_police: 'Polis/larm',
  cause_infrastructure: 'Infrastruktur',
  cause_congestion: 'Tågkö',
  cause_weather: 'Väder',
  cause_unknown: 'Okänt',
  // Stat labels
  stat_on_time: 'I tid',
  stat_delayed: 'Försenade',
  stat_canceled: 'Inställda',
  stat_avg_delay: 'Snittförsening',
  stat_departures: 'Avgångar',
  // History
  hist_daily: 'Per dag',
  hist_by_line: 'Per linje',
  hist_by_cause: 'Per orsak',
  hist_by_hour: 'Per timme',
  hist_total: 'Totalt: {n}',
  days_7: '7 dagar',
  days_14: '14 dagar',
  days_30: '30 dagar',
  // Sections
  section_disruptions: 'Störningar',
  section_history: 'Historik',
  // Consent banner
  consent_title: 'Cookies & integritet',
  consent_body: 'Vi använder cookies bara för att spara ditt språkval. Inga annonser, ingen spårning.',
  consent_accept: 'OK',
  consent_decline: 'Neka',
  // Empty / loading / error states
  empty_no_data: 'Inga avgångar ännu — första schemalagda avläsningen väntas.',
  empty_loading: 'Läser in…',
  empty_error: 'Trafikdata nås inte just nu.',
  empty_retry: 'Försök igen',
  empty_disruptions: 'Inga störningar',
  // Privacy page
  privacy_title: 'Integritet',
  privacy_intro:
    'Den här sidan visar live- och historisk tågstatus över Öresund. Det enda vi sparar om dig är ditt språkval, i webbläsarens localStorage.',
  privacy_analytics:
    'Vi använder Umami analytics för att räkna besök anonymt. Umami använder inga cookies, samlar ingen personlig data och spårar dig inte mellan webbplatser.',
  privacy_data_source:
    'Live- och historisk data tillhandahålls av Trafiklab under licensen CC-BY 4.0. Källa:',
  privacy_ads: 'Den här sidan visar inga annonser.',
  privacy_contact: 'Frågor eller feedback? Mejla oss på',
  privacy_back: '← Tillbaka till översikten',
  nav_privacy: 'Integritet',
  // Footer
  footer_attribution: 'Data från Trafiklab.se (CC-BY 4.0)',
  footer_disclaimer: 'Data kan ligga ~10–15 min efter officiella appar; inställda avgångar kan missas.',
  footer_changes: 'Ändrat: klassificering + presentation.',
  footer_lang: 'Språk',
  footer_license: 'CC-BY 4.0-licensen',
};
