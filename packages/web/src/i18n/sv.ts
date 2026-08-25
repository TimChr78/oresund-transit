import type { Dict } from './keys';

/** Swedish dictionary — plain commuter voice, no marketing. */
export const sv: Dict = {
  // Brand (identical across languages)
  brand_name: 'Øresund',
  brand_sub: 'live',
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
    'Live Øresundståg / tågavgångar Hyllie ↔ Köpenhamn H — förseningar, inställda avgångar och trafikstörningar, uppdaterat var 5:e minut (Trafiklab).',
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
  insight_wow_delta: '{pct} vs föregående vecka',
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
};
