import type { Dict } from './keys';

/** Danish dictionary — plain commuter voice, no marketing. */
export const da: Dict = {
  // Brand (identical across languages)
  brand_name: 'Øresund',
  brand_sub: 'live',
  // Status banner
  status_normal: 'Normal drift',
  status_delayed: 'Forsinkelser',
  status_cancellations: 'Aflyste afgange',
  status_alerts: 'Driftsforstyrrelser',
  status_service_shutdown: 'Ingen togtrafik over Øresund lige nu',
  banner_updated: 'Opdateret',
  banner_disruptions_one: '1 forstyrrelse',
  banner_disruptions_many: '{n} forstyrrelser',
  // Disruption hero strip
  hero_disruptions: 'Lige nu',
  // SEO lead (H2 under the brand)
  lead_tagline:
    'Live Øresundstog / togafgange Hyllie ↔ København H — forsinkelser, aflysninger og forstyrrelser — opdateret hvert 5. minut (Trafiklab).',
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
  // Stat card hints
  stat_on_time_hint: 'I dag · andel afgange med under 4 min forsinkelse',
  stat_delayed_hint: 'I dag · afgange forsinket 4 minutter eller mere',
  stat_canceled_hint: 'I dag · aflyste afgange',
  stat_avg_delay_hint: 'Gns. forsinkelse for alle afgange i dag',
  stat_departures_hint: 'Grænseoverskridende Øresundståg-afgange i dag',
  // History
  hist_daily: 'Per dag',
  hist_punctuality: 'Punktlighed',
  hist_by_line: 'Per linje',
  hist_by_cause: 'Per årsag',
  hist_by_hour: 'Per time',
  heat_tooltip: '{hour}:00 — {pct} ({n})',
  heat_caption: 'Andel af forstyrrelser pr. time — sidste 30 dage',
  heat_low: 'lav',
  heat_high: 'høj',
  hist_by_weekday: 'Per ugedag',
  hist_line_delay: 'gns. {a} · maks {b}',
  hist_total: 'I alt: {n}',
  trend_avg_3d: '3-dages gennemsnit',
  punct_data_since: 'data siden {date}',
  // Chart hints
  hist_daily_hint: 'Forstyrrelser pr. dag, stablet efter type',
  hist_punctuality_hint: 'Andel afgange til tiden (under 4 min forsinkelse) pr. dag',
  hist_by_line_hint: 'Antal forstyrrelser pr. togrute · gns. / maks forsinkelse',
  hist_by_weekday_hint: 'Forstyrrelser pr. ugedag · gns. forsinkelse',
  hist_by_cause_hint: 'Forstyrrelser grupperet efter årsag',
  hist_by_hour_hint: 'Andel af forstyrrelserne pr. time',
  hist_peak_hint: 'Myldretid 07–09 & 16–18 mod resten af dagen',
  // Short month names
  month_1: 'jan',
  month_2: 'feb',
  month_3: 'mar',
  month_4: 'apr',
  month_5: 'maj',
  month_6: 'jun',
  month_7: 'jul',
  month_8: 'aug',
  month_9: 'sep',
  month_10: 'okt',
  month_11: 'nov',
  month_12: 'dec',
  // Weekdays
  weekday_mon: 'Man',
  weekday_tue: 'Tir',
  weekday_wed: 'Ons',
  weekday_thu: 'Tor',
  weekday_fri: 'Fre',
  weekday_sat: 'Lør',
  weekday_sun: 'Søn',
  // Insight cards
  insight_wow: 'Uge mod uge',
  insight_wow_delta: '{pct} ift. sidste uge',
  insight_wow_counts: '{prev} → {curr} forstyrrelser',
  insight_avg_delay: 'Gns. forsinkelse: {a} → {b}',
  insight_peak: 'Myldretid',
  insight_peak_share: '{pct} af forstyrrelserne i myldretiden',
  insight_peak_avg: 'Myldretid {peak} · øvrig {off}',
  days_7: '7 dage',
  days_14: '14 dage',
  days_30: '30 dage',
  days_90: '90 dage',
  // Sections
  section_disruptions: 'Forstyrrelser',
  disruptions_show_all: 'Vis alle forstyrrelser',
  disruptions_back_to_today: 'Tilbage til i dag',
  disruptions_today_sep: 'I dag',
  disruptions_none_archive: 'Ingen forstyrrelser i det seneste arkiv.',
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
  disruptions_none_today: 'Ingen forstyrrelse i dag — alt kører.',
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
  // Methodology page
  meth_title: 'Metode',
  meth_intro: 'Sådan defineres hvert tal på siden, og hvor dataene kommer fra.',
  meth_defs_title: 'Definitioner af nøgletal',
  meth_col_kpi: 'Nøgletal',
  meth_col_definition: 'Definition',
  meth_thresholds_title: 'Grænseværdier',
  meth_thresholds_body:
    'En afgang tæller som forsinket, når forsinkelsen er 240 sekunder (4 minutter) eller mere — Skånetrafikens officielle RT3-punktlighedsmål (≤ 3:59 forsinket = til tiden). Alt derunder tæller som til tiden.',
  meth_scope_title: 'Dækning',
  meth_scope_body:
    'Dataene dækker kun grænseoverskridende Øresundståg (linje 802–805) på strækningen Hyllie ↔ København H. Andre regionale og lokale tog er ikke inkluderet.',
  meth_source_title: 'Datakilde',
  meth_source_body:
    'Dataene kommer fra Trafiklab (Skånetrafiken) realtidsafgange, aflæst hver 5. minut, under en CC-BY 4.0-licens. Live-data starter 2026-08-06; tidligere historik kommer fra KoDas historiske arkiv (fra maj 2026).',
  meth_lag_title: 'Forsinkelse i data',
  meth_lag_body:
    'Trafiklab-data kan ligge ca. 10–15 minutter efter Skånetrafikens officielle app, når det gælder aflysninger.',
  nav_methodology: 'Metode',
  meth_def_on_time: 'Andel af dagens grænseoverskridende afgange med under 240 sekunders (4 minutters) forsinkelse.',
  meth_def_delayed:
    'Andel af dagens grænseoverskridende afgange med 240 sekunders (4 minutters) forsinkelse eller mere — ikke aflyste.',
  meth_def_canceled: 'Andel af dagens grænseoverskridende afgange, der blev aflyst.',
  meth_def_avg_delay:
    'Gennemsnitlig forsinkelse for alle dagens afgange, i sekunder — afgange til tiden tæller med deres faktiske (næsten nul) forsinkelse.',
  meth_def_departures:
    'Antal observerede grænseoverskridende afgange i dag: Øresundståg linje 802–805 på strækningen Hyllie ↔ København H.',
  meth_def_daily: 'Forstyrrelser (aflysninger, forsinkelser, advarsler) pr. dag, stablet efter type.',
  meth_def_punctuality: 'Andel afgange til tiden (under 4 minutters forsinkelse) pr. dag. Dage uden afgange springes over.',
  meth_def_by_line: 'Antal forstyrrelser pr. togrute, samt gennemsnitlig og maksimal forsinkelse.',
  meth_def_by_weekday: 'Antal forstyrrelser pr. ugedag, samt gennemsnitlig forsinkelse.',
  meth_def_by_cause: 'Antal forstyrrelser grupperet efter årsagskategori.',
  meth_def_by_hour: 'Andel af forstyrrelserne pr. time — sidste 30 dage.',
  meth_def_peak: 'Andel af forstyrrelserne i myldretiden (07–09 og 16–18) sammenlignet med resten af dagen.',
  // Footer
  footer_attribution: 'Data fra Trafiklab.se (CC-BY 4.0)',
  footer_disclaimer: 'Data kan ligge ~10–15 min. efter officielle apps; aflyste afgange kan blive overset.',
  footer_changes: 'Ændret: klassificering + præsentation.',
  footer_lang: 'Sprog',
  footer_license: 'CC-BY 4.0-licensen',
  footer_rss: 'RSS-feed',
  // Archive pages (server-rendered hubs — en is what crawlers see)
  hub_line_intro:
    'Denne hub dækker alle toglinjer, der kører over Øresund — de grænseoverskridende Øresundståg (linje 802–805) og de regionale linjer, der deler korridoren. Hver lineside viser de forstyrrelser, der er registreret for linjen: aflysninger, forsinkelser og alarmer, med de hyppigste årsager og en dag-for-dag-opdeling over de seneste 30 dage.',
  hub_station_intro:
    'Denne hub dækker de overvågede stationer på Øresundskorridoren, fra Malmö C og Hyllie over broen til Kastrup Lufthavn og København H. Hver stationsside viser rettidigheden — andelen af afgange til tiden, aflysninger og gennemsnitlig forsinkelse — med en daglig oversigt over de seneste 30 dage.',
  archive_attribution: 'Data fra Trafiklab.se',
  line_archive_href: 'Linje {line} — forsinkelser & historik',
  line_no_disruptions_note: 'Ingen forstyrrelser registreret, siden overvågningen startede 2026-08-06.',
  station_no_data_note: 'Ingen afgange registreret, siden overvågningen startede 2026-08-06.',
};
