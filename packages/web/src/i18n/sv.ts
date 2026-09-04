import { BRAND_NAME, type Dict } from './keys';

/** Swedish dictionary — plain commuter voice, no marketing. */
export const sv: Dict = {
  // Brand (identical across languages)
  brand_name: BRAND_NAME,
  // Status banner
  status_normal: 'Normal trafik',
  status_delayed: 'Förseningar',
  status_cancellations: 'Inställda avgångar',
  status_alerts: 'Trafikstörningar',
  status_service_shutdown: 'Ingen tågtrafik över Öresund just nu',
  banner_updated: 'Uppdaterad',
  banner_disruptions_one: '1 störning',
  banner_disruptions_many: '{n} störningar',
  // Disruption hero strip
  hero_disruptions: 'Just nu',
  // SEO lead (H1 under the brand wordmark)
  lead_tagline:
    'Live tågavgångar: Hyllie, Malmö C, Kastrup, Köpenhamn H',
  // Byggtids-citat av trafikläget (hemmets no-JS/crawler-skal) — skrivet som
  // vanliga meningar så att sökmotorer och besökare utan JS får lägesbilden.
  seo_status_normal: 'Tågen går normalt över Öresund.',
  seo_status_delayed: 'Förseningar påverkar tågen över Öresund.',
  seo_status_cancellations: 'Störningar påverkar tågen över Öresund.',
  seo_status_alerts: 'Mindre trafikstörningar är aktiva för tågen över Öresund.',
  seo_status_shutdown: 'Tågtrafiken över Öresund är avstängd.',
  seo_cancel_24h_zero: 'Inga inställda avgångar de senaste 24 timmarna.',
  seo_cancel_24h_one: '1 inställd avgång de senaste 24 timmarna.',
  seo_cancel_24h_many: '{n} inställda avgångar de senaste 24 timmarna.',
  seo_trend_up: 'Det är fler än de föregående 24 timmarna.',
  seo_trend_down: 'Det är färre än de föregående 24 timmarna.',
  seo_trend_flat: 'Det är i nivå med de föregående 24 timmarna.',
  // Direction tabs
  tab_to_denmark: 'Mot Danmark',
  tab_to_sweden: 'Mot Sverige',
  tab_all: 'Alla',
  // Table headers
  th_time: 'Tid',
  th_line: 'Linje',
  th_type: 'Typ',
  th_delay: 'Försening',
  th_direction: 'Riktning',
  th_reason: 'Orsak',
  // Tabellhuvuden på stationssidorna (audit3 C1/H2)
  th_date: 'Datum',
  th_status: 'Status',
  th_train: 'Tåg',
  th_on_time_pct: 'I tid %',
  // Diagramdatatabeller (audit4 N-M15)
  th_total: 'Totalt',
  th_hour: 'Timme',
  th_share: 'Andel',
  th_count: 'Antal',
  sr_data_table: 'datatabell',
  th_canceled: 'Inställda',
  // Disruption types
  type_delay: 'Försening',
  type_cancellation: 'Inställd',
  type_alert: 'Varning',
  // Detalj på störningsraden (B1)
  time_pair_title: 'Planerad {sched} · beräknad {actual} ({delay})',
  route_section_hint: 'Berörd sträcka',
  // Delay bands (audit3 H1) — badge text in the DELAY column
  delay_band_on_time: 'I tid',
  delay_band_minor: '4–10 min',
  delay_band_moderate: '10–15 min',
  delay_band_major: '15+ min',
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
  // Stat card hints
  stat_on_time_hint: 'Idag · andel avgångar med under 4 min försening',
  stat_delayed_hint: 'Idag · avgångar försenade 4 min eller mer',
  stat_canceled_hint: 'Idag · inställda avgångar',
  stat_avg_delay_hint: 'Snittförsening för alla avgångar idag',
  stat_departures_hint: 'Gränsöverskridande Öresundståg-avgångar idag',
  // History
  hist_daily: 'Per dag',
  hist_punctuality: 'Punktlighet',
  hist_by_line: 'Per linje',
  hist_by_cause: 'Per orsak',
  hist_by_hour: 'Per timme',
  heat_tooltip: '{hour}:00 — {pct} ({n})',
  heat_caption: 'Andel av störningar per timme — senaste 30 dagarna',
  heat_low: 'låg',
  heat_high: 'hög',
  hist_by_weekday: 'Per veckodag',
  hist_line_delay: 'snitt {a} · max {b}',
  hist_total: 'Totalt: {n}',
  trend_avg_3d: '3-dagarsmedel',
  punct_data_since: 'data från {date}',
  // Chart hints
  hist_daily_hint: 'Störningar per dag, staplade efter typ',
  hist_punctuality_hint: 'Andel avgångar i tid (under 4 min försening) per dag',
  hist_by_line_hint: 'Antal störningar per tåglinje · snitt / max försening',
  hist_by_weekday_hint: 'Störningar per veckodag · snittförsening',
  hist_by_cause_hint: 'Störningar grupperade efter orsak',
  hist_by_hour_hint: 'Andel av störningarna per timme',
  hist_peak_hint: 'Rusningstid 07–09 & 16–18 jämfört med övrig tid',
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
  weekday_mon: 'Mån',
  weekday_tue: 'Tis',
  weekday_wed: 'Ons',
  weekday_thu: 'Tor',
  weekday_fri: 'Fre',
  weekday_sat: 'Lör',
  weekday_sun: 'Sön',
  // Insight cards
  insight_wow: 'Vecka mot vecka',
  insight_wow_delta: '{pct} mot föregående vecka',
  insight_wow_counts: '{prev} → {curr} störningar',
  insight_avg_delay: 'Snittförsening: {a} → {b}',
  insight_peak: 'Rusningstid',
  insight_peak_share: '{pct} av störningarna i rusningstid',
  insight_peak_avg: 'Rusning {peak} · övrig {off}',
  days_7: '7 dagar',
  days_14: '14 dagar',
  days_30: '30 dagar',
  days_90: '90 dagar',
  // Sections
  section_disruptions: 'Störningar',
  disruptions_show_all: 'Visa alla störningar',
  disruptions_back_to_today: 'Tillbaka till idag',
  disruptions_today_sep: 'Idag',
  disruptions_none_archive: 'Inga störningar i det senaste arkivet.',
  disruptions_caption_today: 'Störningar idag',
  disruptions_caption_archive: 'Störningar i arkivet',
  disruptions_none_today_dir: 'Inga störningar i den här riktningen idag.',
  section_history: 'Historik',
  // Consent banner
  // Empty / loading / error states
  empty_no_data: 'Inga avgångar ännu — första schemalagda avläsningen väntas.',
  empty_loading: 'Läser in…',
  empty_error: 'Trafikdata nås inte just nu.',
  empty_retry: 'Försök igen',
  empty_disruptions: 'Inga störningar',
  disruptions_none_today: 'Inga störningar idag — allt flyter.',
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
  // Methodology page
  meth_title: 'Metod',
  meth_intro: 'Så här definieras varje siffra på sajten, och varifrån datan kommer.',
  meth_defs_title: 'Definitioner av nyckeltal',
  meth_col_kpi: 'Nyckeltal',
  meth_col_definition: 'Definition',
  meth_thresholds_title: 'Tröskelvärden',
  meth_thresholds_body:
    'En avgång räknas som försenad när förseningen är 240 sekunder (4 minuter) eller mer — Skånetrafikens officiella RT3-punktlighetsmått (≤ 3:59 sent = punktligt). Allt under det räknas som i tid.',
  meth_scope_title: 'Omfattning',
  meth_scope_body:
    'Datan omfattar bara gränsöverskridande Öresundståg (linje 802–805) på sträckan Hyllie ↔ Köpenhamn H. Andra regionala och lokala tåg ingår inte.',
  meth_source_title: 'Datakälla',
  meth_source_body:
    'Datan kommer från Trafiklab (Skånetrafiken) realtidsavgångar, avläst var 5:e minut, under licensen CC-BY 4.0. Live-data startar 2026-08-06; tidigare historik kommer från KoDas historiska arkiv (från maj 2026).',
  meth_lag_title: 'Eftersläpning i data',
  meth_lag_body:
    'Trafiklab-data kan ligga ungefär 10–15 minuter efter Skånetrafikens officiella app när det gäller inställda avgångar.',
  meth_tracking_title: 'Mätning och samtycke',
  meth_tracking_body:
    'Besöksräkningen sköts av Umami: en cookiefri och anonymiserad räknare som inte lagrar personuppgifter och inte följer dig mellan webbplatser. Det enda som sparas i din webbläsare är ditt språkval, i localStorage. Eftersom mätningen är neutral statistik utan identifierare efterfrågas inget samtycke och ingen cookiebanner visas.',

  nav_methodology: 'Metod',
  meth_def_on_time: 'Andel av dagens gränsöverskridande avgångar med under 240 sekunders (4 minuters) försening.',
  meth_def_delayed:
    'Andel av dagens gränsöverskridande avgångar med 240 sekunder (4 minuter) eller mer i försening — inte inställda.',
  meth_def_canceled: 'Andel av dagens gränsöverskridande avgångar som ställts in.',
  meth_def_avg_delay:
    'Snittförsening för alla dagens avgångar, i sekunder — avgångar i tid räknas med sin faktiska (nära noll) försening.',
  meth_def_departures:
    'Antal observerade gränsöverskridande avgångar idag: Öresundståg linje 802–805 på sträckan Hyllie ↔ Köpenhamn H.',
  meth_def_daily: 'Störningar (inställda, förseningar, varningar) per dag, staplade efter typ.',
  meth_def_punctuality: 'Andel avgångar i tid (under 4 minuters försening) per dag. Dagar utan avgångar hoppas över.',
  meth_def_by_line: 'Antal störningar per tåglinje, samt snitt- och maxförsening.',
  meth_def_by_weekday: 'Antal störningar per veckodag, samt snittförsening.',
  meth_def_by_cause: 'Antal störningar grupperade efter orsakskategori.',
  meth_def_by_hour: 'Andel av störningarna per timme — senaste 30 dagarna.',
  meth_def_peak: 'Andel av störningarna under rusningstid (07–09 och 16–18) jämfört med övrig tid.',
  station_archive_title: '{name} — punktlighet — Øresund.live',
  station_board_title: '{name} — live tågstatus — Øresund.live',
  // Stationssidor (audit3 C1) — sidan lokaliserats i alla tre språk.
  station_h1: '{name} — punktlighetsarkiv',
  station_sub: 'Observerade avgångar de senaste {days} dagarna ({from}–{to}).',
  station_desc:
    'Punktlighetshistorik för {name} över Öresund — {n} avgångar, {pct}% i tid de senaste {days} dagarna.',
  station_desc_empty:
    'Punktlighetshistorik för {name} över Öresund — inga avgångar registrerade ännu; data börjar samlas in så snart live-övervakningen startar.',
  station_daily_heading: 'Punktlighet dag för dag',
  station_other_heading: 'Övriga stationer',
  // Korslänkar station ↔ linje (audit4 N-M1)
  station_lines_heading: 'Linjer som trafikerar stationen',
  line_stations_heading: 'Stationer på linjen',
  // Stationsval på tavlan (A1)
  station_scope_heading: 'Senaste avgångarna på {name}',
  station_scope_intro:
    'Avgångar observerade på {name}. Statusbandet, KPI-korten och historiken täcker alla fyra övervakade stationer.',
  station_scope_empty: 'Inga avgångar observerade på {name} än.',
  station_scope_archive_link: 'Punktlighetsarkiv för {name}',
  station_live_heading: 'Läge just nu',
  station_live_intro:
    'Statusbandet gäller hela Öresundskorridoren; avgångarna nedan är observerade på {name}.',
  station_departures_heading: 'Senast observerade avgångar',
  // audit4 N-C1 — tidsstämpeln som de senaste raderna begränsats till.
  station_as_of: 'Observerat till och med {time} den {date}',
  // Samma tonläge som meth_lag_body: deklarera eftersläpningen i stället för
  // att låtsas vara en prognostiserande avgångstavla.
  station_observed_note:
    'Det här är observerade avgångar, inte en prognostiserande avgångstavla — insamlaren hämtar data från Trafiklab var 5:e minut och läser tillbaka de senaste planerade avgångarna, så de nyaste raderna kan ligga upp till 15 minuter efter verkligheten.',
  station_col_destination: 'Destination',
  nav_stations: 'Stationer',
  nav_board: 'Live-tavlan',
  nav_history: 'Störningshistorik',
  station_nav_label: 'Övervakade stationer',
  filter_direction: 'Filtrera störningar efter riktning',
  filter_range: 'Historikens tidsintervall',
  // Footer
  footer_attribution: 'Data från Trafiklab.se (CC-BY 4.0)',
  footer_disclaimer: 'Data kan ligga ~10–15 min efter officiella appar; inställda avgångar kan missas.',
  footer_changes: 'Ändrat: klassificering + presentation.',
  footer_lang: 'Språk',
  footer_license: 'CC-BY 4.0-licensen',
  footer_rss: 'RSS-flöde',
  // Arkivsidor — prerenderade introtexter, sammanfattningsrad och not om
  // övervakningsstart. Arkiv-sidornas SSG-renderare servar en som standard;
  // nycklarna finns ändå i alla tre ordböcker för paritet och framtida
  // lokaliserade arkivsidor.
  arch_stat_total: 'Totalt',
  arch_stat_cancellations: 'Inställda',
  arch_stat_delays: 'Förseningar',
  arch_stat_alerts: 'Varningar',
  arch_stat_avg_delay: 'Snittförsening',
  arch_hist_intro_7: 'En bild av de senaste 7 dagarna — hur inställda avgångar, förseningar och varningar utvecklades över Öresund den här veckan.',
  arch_hist_intro_14: 'Två veckors trafikhistorik — en tydligare bild av hur störningarna över bron har utvecklats.',
  arch_hist_intro_30: 'En månads trafikhistorik — de senaste 30 dagarnas inställda avgångar, förseningar och varningar över Öresund.',
  arch_hist_intro_90: 'Tre månaders trafikhistorik — det långsiktiga mönstret av inställda avgångar, förseningar och varningar över bron.',
  arch_intro_line: 'Störningar registrerade för linje {line} — inställda avgångar, förseningar och varningar med de vanligaste orsakerna och en dag-för-dag-uppdelning.',
  arch_intro_station: 'Punktlighet på {station} — hur många avgångar som gick i tid, blev försenade eller ställdes in, dag för dag.',
  arch_empty_period: 'Övervakningen startade {date} — {from} till {to} registrerade ingen data.',
  arch_empty_day: 'Övervakningen startade {date} — {from} registrerade ingen data.',

  // Archive pages (server-rendered hubs — en is what crawlers see)
  hub_line_intro:
    'Den här hubben täcker alla tåglinjer som trafikerar Öresund — de gränsöverskridande Øresundstågen (linje 802–805) och regionala linjer som delar korridoren. Varje linjesida visar de störningar som registrerats för just den linjen: inställda avgångar, förseningar och larm, med de vanligaste orsakerna och en dag-för-dag-uppdelning över de senaste 30 dagarna.',
  hub_station_intro:
    'Den här hubben täcker de övervakade hållplatserna på Öresundskorridoren, från Malmö C och Hyllie över bron till Kastrup Lufthavn och Köpenhamn H. Varje stationssida visar punktlighet — andel avgångar i tid, inställda avgångar och snittförsening — med en daglig sammanställning över de senaste 30 dagarna.',
  archive_attribution: 'Data från Trafiklab.se',
  line_archive_href: 'Linje {line} — förseningar & historik',
  line_no_disruptions_note: 'Inga störningar registrerade sedan övervakningen startade 2026-08-06.',
  station_no_data_note: 'Inga avgångar registrerade sedan övervakningen startade 2026-08-06.',

  // The /history hub — the aggregate archive page, served in en + sv + da.
  hub_history_title: 'Störningshistorik — Øresund.live',
  hub_history_h1: 'Störningshistorik',
  hub_history_desc:
    'Störningshistorik för hela Öresundskorridoren — avgångar, andel i tid och registrerade störningar vid de fyra övervakade stationerna.',
  hub_history_sub: 'Vad de fyra övervakade stationerna registrerade tillsammans de senaste {days} dagarna, {from} till {to}.',
  hub_history_intro:
    'En sida för hela Öresund: hur många avgångar som gick, hur många som gick i tid och hur många störningar som registrerades — med länkar till alla stations-, linje- och fönsterarkiv.',
  hub_history_windows_heading: 'Välj fönster',
  stat_disruptions: 'Störningar',

  // Stationsnamn (audit3 M4) — nycklas efter collector-slugen.
  station_hyllie: 'Malmö Hyllie',
  station_kobenhavn_h: 'Köpenhamn H',
  station_malmo_c: 'Malmö C',
  station_kastrup: 'Kastrup flygplats',

  // Informationstext på startsidan (audit3 C2) — permanent, crawlbar text i
  // skal utan JS. Beskrivande only: vad som mäts, hur ett tal definieras och
  // var datan kommer ifrån. {link} i about_method byts mot
  // /methodology-ankaret efter escapning (se HomeAbout.ts); {stations} är de
  // översatta stationsnamnen i korridorens ordning.
  about_title: 'Tågpunktlighet över Öresund, station för station',
  about_corridor:
    'Öresund.live följer gränsöverskridande Øresundståg på korridoren mellan Malmö och Köpenhamn. Varje planerad avgång som passerar en av de fyra övervakade stationerna — {stations} — jämförs med tidtabellen och sparas, så att varje stationssida kan visa hur hållplatsen faktiskt presterade.',
  about_method:
    'En avgång räknas som punktlig när den lämnar mindre än fyra minuter försenad — den RT3-tröskel för punktlighet som Skånetrafiken använder. Större avvikelser registreras som förseningar eller inställda tåg, och operatörens meddelanden grupperas i orsaker som signalstörning, fordonsfel eller personalbrist. Sidan {link} definierar varje tal på tavlan.',
  about_source:
    'Data kommer från Trafiklab (Skånetrafiken) realtidsavgångar, hämtas var femte minut och publiceras under en CC-BY 4.0-licens. Liveövervakningen började i augusti 2026, så arkiven är fortfarande korta — och tavlan visar observerade avgångar, inte en prognos för nästa tåg.',

  // Arkivlänkar (audit3 C3) — en uppsättning etiketter + beskrivningar som
  // delas av tavlan (App.ts), informationstexten på startsidan (HomeAbout.ts)
  // och metodsidans lista med relaterade sidor.
  arch_link_station: 'Stationsarkiv',
  arch_link_line: 'Linjearkiv',
  arch_link_history: 'Störningshistorik, senaste 30 dagarna',
  arch_link_station_desc: 'Andel avgångar i tid, inställda avgångar och snittförsening vid varje övervakad hållplats.',
  arch_link_line_desc: 'Störningar per tåglinje under de senaste 30 dagarna.',
  arch_link_history_desc: 'Inställda tåg, förseningar och störningar dag för dag över Öresund.',
  board_archives_heading: 'Historik & arkiv',
  board_archives_intro: 'Tavlan visar idag. Arkiven bevarar den långa historiken — per station, per linje och dag för dag.',
  meth_related_title: 'Relaterade sidor',
  meth_related_intro:
    'Samma definitioner i praktiken: punktlighetsarkivet för varje övervakad station och störningshistoriken bakom diagrammen.',

  // Collector-outage fallback (audit4 N-H4)
  err502_title: 'Tillfälligt otillgänglig',
  nav_site_sections: 'Webbplatsavdelningar',
  err502_body:
    'Datakällan svarade inte, så sidan kunde inte byggas. Den brukar vara tillbaka inom några minuter — försök igen om en stund.',
  err502_retry: 'Ladda om sidan',
  err502_home: 'Till avgångstavlan',
  // 404-sidan (audit5 L2).
  err404_title: 'Sidan hittades inte',
  err404_body: 'Sidan du letar efter finns inte eller har flyttats.',

  // Lokaliserad strukturerad data + social copy (audit5 M2) — og:image:alt,
  // fönsterlistans namn och stationssidans Dataset-nod, som tidigare var
  // engelska på /sv- och /da-varianterna.
  og_image_alt: 'Øresund.live — Øresundståg-avgångar över Öresund',
  history_window_label: 'Senaste {days} dagarna',
  dataset_station_name: '{name} punktlighetsarkiv',
  var_departures_per_day: 'Avgångar per dag',
  var_on_time_per_day: 'Avgångar i tid per dag',
  var_delayed_per_day: 'Försenade avgångar per dag',
  var_canceled_per_day: 'Inställda avgångar per dag',
  var_on_time_pct_per_day: 'Andel i tid per dag',
  var_avg_delay_per_day: 'Snittförsening per dag',

  // Hubbens tre nyttokort (audit5 M3) — avgångstalet är observationer vid fyra
  // hållplatser och störningstalet en annan enhet, så båda anger vad de räknar.
  hub_stat_departures: 'Avgångar observerade vid 4 hållplatser',
  hub_disruptions_note:
    'Störningar räknas en gång per berörd avgång och dag i korridoren — inte som summan av de fyra stationssidorna.',

  // Linjemodaliteter (audit5 M4) — linje 6 och 16 är bussarna vid Hyllie.
  line_mode_bus: 'buss',
  bus_line_archive_href: 'Busslinje {line} — förseningar & historik',
  line_archive_h1: 'Linje {line} — störningsarkiv',
  bus_line_archive_h1: 'Busslinje {line} — störningsarkiv',
  // Kortformen, delad av brödsmulan, metabeskrivningen och Dataset-noden så att
  // sidan inte kallar samma linje buss i rubriken och tåg ett element längre ner.
  line_archive_label: 'Linje {line}',
  bus_line_archive_label: 'Busslinje {line}',
  line_bus_note:
    'Busslinje {line} stannar vid Malmö Hyllie, så dess störningar arkiveras här tillsammans med tåglinjerna.',
};
