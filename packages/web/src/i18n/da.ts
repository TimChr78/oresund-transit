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
  // SEO lead (H1 under the brand wordmark)
  lead_tagline:
    'Live togafgange: Hyllie, Malmö C, Kastrup, København H',
  // Byggetids-øjebliksbillede af trafikken (hjemmesidens no-JS/crawler-skal)
  // — skrevet som almindelige sætninger, så søgemaskiner og besøgende uden JS
  // får statusbilledet.
  seo_status_normal: 'Togene kører normalt over Øresund.',
  seo_status_delayed: 'Forsinkelser påvirker togene over Øresund.',
  seo_status_cancellations: 'Driftsforstyrrelser påvirker togene over Øresund.',
  seo_status_alerts: 'Mindre driftsforstyrrelser er aktive for togene over Øresund.',
  seo_status_shutdown: 'Togtrafikken over Øresund er indstillet.',
  seo_cancel_24h_zero: 'Ingen aflysninger inden for de seneste 24 timer.',
  seo_cancel_24h_one: '1 aflysning inden for de seneste 24 timer.',
  seo_cancel_24h_many: '{n} aflysninger inden for de seneste 24 timer.',
  seo_trend_up: 'Det er flere end de foregående 24 timer.',
  seo_trend_down: 'Det er færre end de foregående 24 timer.',
  seo_trend_flat: 'Det er på niveau med de foregående 24 timer.',
  // Direction tabs
  tab_to_denmark: 'Til Danmark',
  tab_to_sweden: 'Til Sverige',
  tab_all: 'Alle',
  // Table headers
  th_time: 'Tid',
  th_line: 'Linje',
  th_type: 'Type',
  th_delay: 'Forsinkelse',
  th_direction: 'Retning',
  th_reason: 'Årsag',
  // Tabelhoveder på stationssiderne (audit3 C1/H2)
  th_date: 'Dato',
  th_status: 'Status',
  th_train: 'Tog',
  th_on_time_pct: 'Til tiden %',
  th_canceled: 'Aflyste',
  // Disruption types
  type_delay: 'Forsinkelse',
  type_cancellation: 'Aflyst',
  type_alert: 'Advarsel',
  // Detalje på forstyrrelsesrækken (B1)
  time_pair_title: 'Planlagt {sched} · forventet {actual} ({delay})',
  route_section_hint: 'Berørt strækning',
  // Delay bands (audit3 H1) — badge text in the DELAY column
  delay_band_on_time: 'Til tiden',
  delay_band_minor: '4–10 min',
  delay_band_moderate: '10–15 min',
  delay_band_major: '15+ min',
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
  disruptions_none_today_dir: 'Ingen forstyrrelser i denne retning i dag.',
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
  station_archive_title: '{name} — rettidighed — Øresund.live',
  // Stationssider (audit3 C1) — siden lokaliseres på alle tre sprog.
  station_h1: '{name} — rettidighedsarkiv',
  station_sub: 'Observerede afgange de seneste {days} dage ({from}–{to}).',
  station_desc:
    'Rettidighedshistorik for {name} over Øresund — {n} afgange, {pct}% til tiden de seneste {days} dage.',
  station_desc_empty:
    'Rettidighedshistorik for {name} over Øresund — ingen afgange registreret endnu; data begynder at samle, så snart den live overvågning starter.',
  station_daily_heading: 'Rettidighed dag for dag',
  station_other_heading: 'Andre stationer',
  // Stationsval på tavlen (A1)
  station_scope_heading: 'Seneste afgange på {name}',
  station_scope_intro:
    'Afgange observeret på {name}. Statusbåndet, KPI-kortene og historikken dækker alle fire overvågede stationer.',
  station_scope_empty: 'Ingen afgange observeret på {name} endnu.',
  station_scope_archive_link: 'Punktualitetsarkiv for {name}',
  station_live_heading: 'Lige nu',
  station_live_intro:
    'Statusbåndet gælder hele Øresundskorridoren; afgangene nedenfor er observeret på {name}.',
  station_departures_heading: 'Senest observerede afgange',
  // audit4 N-C1 — tidsstempel som de seneste rækker er begrænset til.
  station_as_of: 'Observeret til og med {time} den {date}',
  // Samme tonefall som meth_lag_body: erklær forsinkelsen i stedet for at lade
  // som om tabellen var en forudsigende afgangstavle.
  station_observed_note:
    'Dette er observerede afgange, ikke en forudsigende afgangstavle — samleren henter data fra Trafiklab hvert 5. minut og læser de seneste planlagte afgange tilbage, så de nyeste rækker kan ligge op til 15 minutter efter virkeligheden.',
  station_col_destination: 'Destination',
  nav_stations: 'Stationer',
  nav_board: 'Live-tavlen',
  station_nav_label: 'Overvågede stationer',
  // Footer
  footer_attribution: 'Data fra Trafiklab.se (CC-BY 4.0)',
  footer_disclaimer: 'Data kan ligge ~10–15 min. efter officielle apps; aflyste afgange kan blive overset.',
  footer_changes: 'Ændret: klassificering + præsentation.',
  footer_lang: 'Sprog',
  footer_license: 'CC-BY 4.0-licensen',
  footer_rss: 'RSS-feed',
  // Arkivsider — prerenderede introtekster, opsummeringsrække og note om
  // overvågningsstart. Arkivsidernes SSG-rendere serverer en som standard;
  // nøglerne findes alligevel i alle tre ordbøger for paritet og fremtidige
  // lokaliserede arkivsider.
  arch_stat_total: 'I alt',
  arch_stat_cancellations: 'Aflysninger',
  arch_stat_delays: 'Forsinkelser',
  arch_stat_alerts: 'Varsler',
  arch_stat_avg_delay: 'Snitforsinkelse',
  arch_hist_intro_7: 'Et øjebliksbillede af de seneste 7 dage — hvordan aflysninger, forsinkelser og varsler formede sig over Øresund i denne uge.',
  arch_hist_intro_14: 'To ugers trafikhistorik — et tydeligere billede af, hvordan driftsforstyrrelserne over broen har udviklet sig.',
  arch_hist_intro_30: 'En måneds trafikhistorik — de seneste 30 dages aflysninger, forsinkelser og varsler over Øresund.',
  arch_hist_intro_90: 'Tre måneders trafikhistorik — det langsigtede mønster af aflysninger, forsinkelser og varsler over broen.',
  arch_intro_line: 'Driftsforstyrrelser registreret for linje {line} — aflysninger, forsinkelser og varsler med de mest almindelige årsager og en dag-for-dag-opdeling.',
  arch_intro_station: 'Rettidighed på {station} — hvor mange afgange der kørte til tiden, blev forsinket eller aflyst, dag for dag.',
  arch_empty_period: 'Overvågningen startede {date} — {from} til {to} registrerede ingen data.',
  arch_empty_day: 'Overvågningen startede {date} — {from} registrerede ingen data.',

  // Archive pages (server-rendered hubs — en is what crawlers see)
  hub_line_intro:
    'Denne hub dækker alle toglinjer, der kører over Øresund — de grænseoverskridende Øresundståg (linje 802–805) og de regionale linjer, der deler korridoren. Hver lineside viser de forstyrrelser, der er registreret for linjen: aflysninger, forsinkelser og alarmer, med de hyppigste årsager og en dag-for-dag-opdeling over de seneste 30 dage.',
  hub_station_intro:
    'Denne hub dækker de overvågede stationer på Øresundskorridoren, fra Malmö C og Hyllie over broen til Kastrup Lufthavn og København H. Hver stationsside viser rettidigheden — andelen af afgange til tiden, aflysninger og gennemsnitlig forsinkelse — med en daglig oversigt over de seneste 30 dage.',
  archive_attribution: 'Data fra Trafiklab.se',
  line_archive_href: 'Linje {line} — forsinkelser & historik',
  line_no_disruptions_note: 'Ingen forstyrrelser registreret, siden overvågningen startede 2026-08-06.',
  station_no_data_note: 'Ingen afgange registreret, siden overvågningen startede 2026-08-06.',

  // Stationsnavne (audit3 M4) — nøgles efter collector-slugen.
  station_hyllie: 'Malmö Hyllie',
  station_kobenhavn_h: 'København H',
  station_malmo_c: 'Malmö C',
  station_kastrup: 'Kastrup Lufthavn',

  // Forside-tekstblok (audit3 C2) — permanent, crawlbar tekst i skallet uden
  // JS. Kun beskrivende: hvad der måles, hvordan et tal defineres og hvor
  // data kommer fra. {link} i about_method udskiftes med /methodology-ankret
  // efter escaping (se HomeAbout.ts); {stations} er de oversatte
  // stationsnavne i korridorens rækkefølge.
  about_title: 'Togpunktualitet over Øresund, station for station',
  about_corridor:
    'Øresund.live følger grænseoverskridende Øresundståg på korridoren mellem Malmø og København. Hver planlagt afgang, der passerer en af de fire overvågede stationer — {stations} — sammenholdes med køreplanen og gemmes, så hver stationsside kan vise, hvordan stoppestedet faktisk klarede sig.',
  about_method:
    'En afgang tæller som til tiden, når den kører ud mindre end fire minutter forsinket — den RT3-grænse for punktualitet, som Skånetrafiken bruger. Større afvigelser registreres som forsinkelser eller aflysninger, og operatørens beskeder grupperes i årsager som signalfejl, køretøjsfejl eller mangel på personale. Siden {link} definerer hvert tal på tavlen.',
  about_source:
    'Data kommer fra Trafiklab (Skånetrafiken) realtidsafgange, hentes hvert femte minut og publiceres under en CC-BY 4.0-licens. Liveovervågningen begyndte i august 2026, så arkiverne er stadig korte — og tavlen viser observerede afgange, ikke en forudsigelse af det næste tog.',

  // Arkivlinks (audit3 C3) — ét sæt labels + beskrivelser, delt af tavlen
  // (App.ts), forside-tekstblokken (HomeAbout.ts) og metodiksidens liste over
  // relaterede sider.
  arch_link_station: 'Stationsarkiver',
  arch_link_line: 'Linjearkiver',
  arch_link_history: 'Forstyrrelleshistorik, seneste 30 dage',
  arch_link_station_desc: 'Andel til tiden, aflysninger og gennemsnitlig forsinkelse ved hvert overvåget stoppested.',
  arch_link_line_desc: 'Forstyrrelser pr. toglinje over de seneste 30 dage.',
  arch_link_history_desc: 'Aflysninger, forsinkelser og forstyrrelser dag for dag over Øresund.',
  board_archives_heading: 'Historik & arkiver',
  board_archives_intro: 'Tavlen viser i dag. Arkiverne gemmer den lange historik — pr. station, pr. linje og dag for dag.',
  meth_related_title: 'Relaterede sider',
  meth_related_intro:
    'De samme definitioner i praksis: punktualitetsarkivet for hvert overvåget stoppested og forstyrrelleshistorikken bag graferne.',

  // Collector-outage fallback (audit4 N-H4)
  err502_title: 'Midlertidigt utilgængelig',
  err502_body:
    'Datakilden svarede ikke, så siden kunne ikke bygges. Den er normalt tilbage inden for et par minutter — prøv igen om lidt.',
  err502_retry: 'Indlæs siden igen',
  err502_home: 'Til afgangstavlen',
};
