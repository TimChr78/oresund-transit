import './styles.css';
import {
  ApiError,
  fetchDelayStats,
  fetchDisruptions,
  fetchHistory,
  fetchLiveStatus,
  fetchPunctuality,
  fetchStation,
} from './api';
import { detectLang, getDict, saveLang, translate, type Dict, type Key, type Lang } from './i18n';
import { renderApp, type ConsentState } from './components/App';
import { renderMethodologyPage } from './components/MethodologyPage';
import { renderPrivacyPage } from './components/PrivacyPage';
import {
  parseStationScope,
  stationNameKey,
  stationScopeFromSearch,
  stationTitleName,
  type StationScope,
} from './components/StationPicker';
import { renderHomeAbout } from './components/HomeAbout';
import { langFromPath, routePath } from './lib/route';
import { reconcile, isPlainPrimaryClick } from './lib/dom';
import { scopedHeadUrl } from './lib/seo';
import type { Disruption } from '@oresund/shared';
import { createInitialState, reducer, type Action, type AppState, type DisruptionsMode } from './state';
import { delayStatsRange, type DayRange, type Direction } from './lib/stats';

/**
 * Boot: read the saved language, render, then drive the board.
 *
 * Refresh rules (matches the private dashboard):
 *  - on load: live + stats + history(7d) + disruptions in parallel, rendered
 *    progressively (banner first);
 *  - every 120s: live + disruptions only;
 *  - history + stats on day-range change only;
 *  - the station scope's departures on scope change and on the same 120s cycle.
 * 503 from /api/transit/live = no snapshot yet -> empty state, not an error.
 */

const REFRESH_MS = 120_000;
const CONSENT_KEY = 'oresund-consent';

function readConsent(): ConsentState {
  try {
    const value = globalThis.localStorage?.getItem(CONSENT_KEY);
    if (value === 'accepted' || value === 'declined') return value;
  } catch {
    // storage blocked — show the banner again next load
  }
  return null;
}

function saveConsent(value: 'accepted' | 'declined'): void {
  try {
    globalThis.localStorage?.setItem(CONSENT_KEY, value);
  } catch {
    // non-fatal
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The station scope a shared link opens at (backlog A1): `?station=hyllie`.
 * Anything unrecognised — including no param at all — is the whole corridor
 * (stationScopeFromSearch; audit4 N-M10).
 */
function stationFromQuery(): StationScope {
  return stationScopeFromSearch(globalThis.location.search);
}

/**
 * Reflect the station scope back into the URL so a switched board is
 * shareable/reloadable. `replaceState`, not push: picking a station is a view
 * of the same page, not a navigation, and the back button should leave the
 * site rather than walk back through every station the visitor clicked.
 */
function writeStationQuery(scope: StationScope): void {
  const url = new URL(globalThis.location.href);
  if (scope === 'all') url.searchParams.delete('station');
  else url.searchParams.set('station', scope);
  globalThis.history?.replaceState(null, '', url);
}

/** Drop any query string from an absolute href, keeping the rest verbatim. */
function withoutQuery(url: string): string {
  return url.split('?')[0] ?? url;
}

/**
 * Head metadata for a station-scoped board (audit4 N-H6).
 *
 * `?station=` is a client-side view: the server has no such URL, so the shell
 * ships the homepage's canonical and hreflang cluster whatever the query says.
 * Left alone, a board scoped to Hyllie told search engines it WAS the corridor
 * homepage while linking a cluster of URLs that carry no station at all.
 *
 * Every href moves to the `?station=<slug>` form (see scopedHeadUrl for why
 * not the /station/<slug> archive path) and og:url follows the canonical. The
 * shell's own values are captured once, while the head still describes the
 * corridor, so `all` can put them back exactly.
 */
function stationSeoUpdater(): (scope: StationScope) => void {
  const canonical = document.head?.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const ogUrl = document.head?.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  const alternates = Array.from(
    document.head?.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]') ?? [],
  ).map((el) => ({ el, base: withoutQuery(el.getAttribute('href') ?? '') }));
  const canonicalBase = withoutQuery(canonical?.getAttribute('href') ?? '');
  const ogBase = withoutQuery(ogUrl?.getAttribute('content') ?? '');

  return (scope) => {
    canonical?.setAttribute('href', scopedHeadUrl(canonicalBase, scope));
    ogUrl?.setAttribute('content', scopedHeadUrl(ogBase, scope));
    for (const { el, base } of alternates) el.setAttribute('href', scopedHeadUrl(base, scope));
  };
}

/**
 * The document title of a station-scoped board (audit4 N-M5).
 *
 * `?station=` changed the visible board — its heading, its KPI cards, its
 * departures table — but the tab kept saying "live train status across the
 * Sound", so a visitor with a board per stop could not tell them apart, and
 * history/breadcrumbs all read the same. The scoped title names the stop; 'all'
 * puts the shell's own title back verbatim, so the localized /sv/ and /da/
 * homes (which ship a translated title) are not overwritten with English.
 */
function stationTitleUpdater(): (scope: StationScope, lang: Lang) => void {
  const shellTitle = document.title;
  return (scope, lang) => {
    if (scope === 'all') {
      document.title = shellTitle;
      return;
    }
    // The SERP-safe short name (StationPicker.stationTitleName) keeps the
    // longest stop's title inside ~60 characters; the board heading above it
    // still uses the official name.
    const name = stationTitleName(translate(stationNameKey(scope), lang));
    document.title = translate('station_board_title', lang, { name });
  };
}

/**
 * Static-page boot (privacy / methodology): static render + language switcher
 * only. No data fetching, no consent banner. `forcedLang` is present on the
 * localized /sv/ and /da/ paths so the page renders in the URL's language
 * rather than the saved/browser one.
 */
function bootStaticPage(
  root: HTMLElement,
  page: { titleKey: Key; render: (lang: Lang, dict: Dict) => string },
  forcedLang?: Lang | null,
): void {
  let lang: Lang = forcedLang ?? detectLang();
  document.documentElement.lang = lang;

  const render = (): void => {
    document.title = `${translate(page.titleKey, lang)} — Øresund.live`;
    root.innerHTML = page.render(lang, getDict(lang));
  };
  render();

  root.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const btn = target?.closest?.('[data-action]') as HTMLElement | null;
    if (!btn || btn.dataset.action !== 'set-lang') return;
    lang = btn.dataset.value as Lang;
    document.documentElement.lang = lang;
    saveLang(lang);
    render();
  });
}

function bootPrivacy(root: HTMLElement, forcedLang?: Lang | null): void {
  bootStaticPage(root, { titleKey: 'privacy_title', render: renderPrivacyPage }, forcedLang);
}

function bootMethodology(root: HTMLElement, forcedLang?: Lang | null): void {
  bootStaticPage(root, { titleKey: 'meth_title', render: renderMethodologyPage }, forcedLang);
}

/**
 * The shell's prerendered about block (audit4 N-H5).
 *
 * #static-shell ships the homepage's crawlable copy: the lead H1, the station
 * picker and ~305 words on what the board measures and where the data comes
 * from. boot() used to delete the whole block before rendering, so a JS
 * visitor threw every one of those words away the moment the board mounted —
 * the server's HTML and the client's page shared no content at all, and the
 * homepage a person saw was not the homepage a crawler indexed.
 *
 * Now only the chrome the board re-renders for itself (topbar, station nav,
 * lead H1, the build-time status sentence) is dropped; the about section is
 * left exactly as prerendered and stays in place below the board.
 *
 * Called with no argument on boot — the static node is already correct for the
 * page variant, so it is never re-rendered client-side on load or on a refresh.
 * Called with a language on an explicit switch, when the section is swapped for
 * the output of the SAME pure renderer the prerenderer used (renderHomeAbout),
 * so the prerendered copy and the switched copy cannot drift apart.
 */
function mountHomeAbout(lang?: Lang): void {
  const shell = document.getElementById('static-shell');
  const current = shell?.querySelector('section.home-about');
  if (!shell || !current) return;

  // Everything else in the shell is board chrome. Keeping it would duplicate
  // the topbar, the station picker and the lead H1 the board renders — three
  // of each on the page.
  for (const child of Array.from(shell.children)) {
    if (child !== current) child.remove();
  }

  if (!lang) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = renderHomeAbout(lang);
  const next = tpl.content.firstElementChild;
  if (next) current.replaceWith(next);
}

export function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;

  // Every route re-renders its own footer (the board's and the static pages'
  // carry the lang switcher), so the shell's static footer — the no-JS
  // fallback, still in the served HTML for crawlers and JS-disabled clients —
  // would leave the document with two <footer> landmarks (audit4 N-M2).
  document.querySelector('footer.site-footer')?.remove();

  // /privacy and /methodology render their static pages instead of the
  // dashboard. No data fetching, no consent banner — just the shell, footer
  // and lang switcher. Localized /sv/* and /da/* paths force their language.
  // Their prerendered HTML has no shell at all (the content is injected into
  // #app at build time), so this removal only bites in dev, where the
  // unbuilt shell is still present and its dashboard copy must not leak onto
  // a static route.
  const pathLang = langFromPath(window.location.pathname);
  const route = routePath(window.location.pathname);
  if (route === 'privacy') {
    document.getElementById('static-shell')?.remove();
    bootPrivacy(root, pathLang);
    return;
  }
  if (route === 'methodology') {
    document.getElementById('static-shell')?.remove();
    bootMethodology(root, pathLang);
    return;
  }

  // Keep the prerendered about copy (audit4 N-H5) before the board mounts.
  mountHomeAbout();

  let lang: Lang = pathLang ?? detectLang();
  document.documentElement.lang = lang;
  let consent: ConsentState = readConsent();
  let state: AppState = createInitialState();

  // A shared ?station= link opens the board already scoped to that stop; the
  // reducer then clears it on the first fetch so no corridor rows flash up
  // under the station's name.
  const queried = stationFromQuery();
  if (queried !== 'all') state = reducer(state, { type: 'SET_STATION', station: queried });

  // Captured before the first scope is applied, so the head still describes
  // the corridor and 'all' can restore it verbatim.
  const applyStationSeo = stationSeoUpdater();
  if (state.station !== 'all') applyStationSeo(state.station);
  const applyStationTitle = stationTitleUpdater();

  const render = (): void => {
    // Reconciled rather than assigned (audit4 N-H7): a 120-second refresh
    // changes a handful of cells, not the board, and the nodes it does not
    // touch keep their place, their selection and their scroll offset.
    reconcile(root, renderApp(state, lang, consent));
    // document.title follows the scope (audit4 N-M5): it is a document side
    // effect, so it lives here next to the DOM write rather than in the pure
    // renderer, and it re-runs on a language switch like the board does.
    applyStationTitle(state.station, lang);
  };
  render();

  const dispatch = (action: Action): void => {
    state = reducer(state, action);
    render();
  };

  /**
   * Request identity for every board fetch (audit4 N-M11 — the pattern the
   * station scope already had, applied to all of them). Each request takes the
   * next id and registers it on START; a reply is applied only while its id is
   * the current one. Overlap is routine here: the 120-second interval fires
   * while a slow reply is pending, the range/mode toggles and the retry
   * buttons start new requests outright, and a reply for a range or mode the
   * visitor has already left must not overwrite what is on screen.
   */
  let requestSeq = 0;
  const nextRequestId = (): number => ++requestSeq;

  const refreshLive = async (): Promise<void> => {
    const id = nextRequestId();
    dispatch({ type: 'LIVE_START', id });
    try {
      const live = await fetchLiveStatus();
      dispatch({ type: 'LIVE_OK', id, live, at: Date.now() });
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        dispatch({ type: 'LIVE_NO_DATA', id, at: Date.now() });
      } else {
        dispatch({ type: 'LIVE_ERROR', id, message: messageOf(err) });
      }
    }
  };

  const refreshStats = async (): Promise<void> => {
    const id = nextRequestId();
    dispatch({ type: 'STATS_START', id });
    try {
      const { from, to } = delayStatsRange();
      const stats = await fetchDelayStats(from, to);
      dispatch({ type: 'STATS_OK', id, stats });
    } catch (err) {
      dispatch({ type: 'STATS_ERROR', id, message: messageOf(err) });
    }
  };

  const refreshHistory = async (): Promise<void> => {
    const id = nextRequestId();
    const days = state.dayRange;
    dispatch({ type: 'HISTORY_START', id });
    try {
      const history = await fetchHistory(days);
      dispatch({ type: 'HISTORY_OK', id, history });
    } catch (err) {
      dispatch({ type: 'HISTORY_ERROR', id, message: messageOf(err) });
    }
  };

  /**
   * Heatmap baseline: a SEPARATE 30-day history fetched once, so the by-hour
   * heatmap keeps a stable window no matter which range toggle is active.
   */
  const refreshHeatmapHistory = async (): Promise<void> => {
    const id = nextRequestId();
    dispatch({ type: 'HEATMAP_HISTORY_START', id });
    try {
      const heatmapHistory = await fetchHistory(30);
      dispatch({ type: 'HEATMAP_HISTORY_OK', id, history: heatmapHistory });
    } catch (err) {
      dispatch({ type: 'HEATMAP_HISTORY_ERROR', id, message: messageOf(err) });
    }
  };

  const refreshPunctuality = async (): Promise<void> => {
    const id = nextRequestId();
    const days = state.dayRange;
    dispatch({ type: 'PUNCTUALITY_START', id });
    try {
      const punctuality = await fetchPunctuality(days);
      dispatch({ type: 'PUNCTUALITY_OK', id, punctuality });
    } catch (err) {
      dispatch({ type: 'PUNCTUALITY_ERROR', id, message: messageOf(err) });
    }
  };

  const refreshDisruptions = async (): Promise<void> => {
    const id = nextRequestId();
    const mode = state.disruptionsMode;
    dispatch({ type: 'DISRUPTIONS_START', id });
    try {
      let disruptions: Disruption[];
      if (mode === 'archive') {
        // Archive: no date bounds — the API returns the most recent rows
        // across all history (capped at 200 by the worker).
        disruptions = await fetchDisruptions(200);
      } else {
        // The live table shows ONLY today: half-open [today 00:00, tomorrow 00:00).
        // Disruption timestamps are naive local "YYYY-MM-DD HH:MM:SS", so the
        // date-only bounds from delayStatsRange() compare correctly.
        const { from, to } = delayStatsRange();
        disruptions = await fetchDisruptions(50, from, to);
      }
      dispatch({ type: 'DISRUPTIONS_OK', id, disruptions });
    } catch (err) {
      dispatch({ type: 'DISRUPTIONS_ERROR', id, message: messageOf(err) });
    }
  };

  /**
   * The picked stop's own departures (backlog A1). The corridor disruption
   * feed cannot be filtered by station — `Disruption` carries no `stop_id` —
   * so a scope pulls the one per-stop feed the collector exposes instead.
   * Slugs are read from state at dispatch time, so a reply for a stop the
   * visitor already left lands in a reducer that drops it.
   */
  const refreshStation = async (): Promise<void> => {
    if (state.station === 'all') return;
    const id = nextRequestId();
    const scope = state.station;
    dispatch({ type: 'STATION_START', id, scope });
    try {
      const station = await fetchStation(scope);
      dispatch({ type: 'STATION_OK', id, scope, station });
    } catch (err) {
      dispatch({ type: 'STATION_ERROR', id, scope, message: messageOf(err) });
    }
  };

  // Initial load — everything in parallel, sections render as they land.
  void refreshLive();
  void refreshStats();
  void refreshHistory();
  void refreshHeatmapHistory();
  void refreshPunctuality();
  void refreshDisruptions();
  void refreshStation();

  // Refresh cycle: live + disruptions + heatmap baseline (keeps the
  // "last 30 days" window current on long-lived tabs), plus the scoped
  // station's departures so they do not go stale on a long-lived tab.
  setInterval(() => {
    void refreshLive();
    void refreshDisruptions();
    void refreshHeatmapHistory();
    void refreshStation();
  }, REFRESH_MS);

  // One delegated listener for every data-action button on the board.
  root.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const btn = target?.closest?.('[data-action]') as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.action ?? '';
    const value = btn.dataset.value ?? '';

    switch (action) {
      case 'set-station': {
        // The picker entries are real links (that is the no-JS fallback and
        // what middle-click/open-in-tab still uses), so a JS click has to be
        // stopped from navigating before the scope is switched in place — but
        // only a plain primary click. A modified click keeps the browser's own
        // meaning (audit4 N-M8): cmd/ctrl-click opens the station page in a new
        // tab, shift-click in a new window, alt-click downloads it. Breaking
        // those left a cmd-click doing nothing at all.
        if (!isPlainPrimaryClick(event)) break;
        event.preventDefault();
        dispatch({ type: 'SET_STATION', station: parseStationScope(value) });
        writeStationQuery(state.station);
        applyStationSeo(state.station);
        void refreshStation();
        break;
      }
      case 'retry-station':
        void refreshStation();
        break;
      case 'set-direction':
        dispatch({ type: 'SET_DIRECTION', direction: value as Direction });
        break;
      case 'set-days': {
        const dayRange = Number(value) as DayRange;
        dispatch({ type: 'SET_DAY_RANGE', dayRange });
        void refreshHistory();
        void refreshPunctuality();
        void refreshStats();
        break;
      }
      case 'set-lang':
        lang = value as Lang;
        document.documentElement.lang = lang;
        saveLang(lang);
        // The about block is the one part of the page the board does not own,
        // so it is swapped here rather than inside render() (audit4 N-H5).
        mountHomeAbout(lang);
        render();
        break;
      case 'consent-accept':
        consent = 'accepted';
        saveConsent(consent);
        render();
        break;
      case 'consent-decline':
        consent = 'declined';
        saveConsent(consent);
        render();
        break;
      case 'retry-live':
        void refreshLive();
        break;
      case 'retry-stats':
        void refreshStats();
        break;
      case 'retry-history':
        void refreshHistory();
        void refreshPunctuality();
        break;
      case 'retry-disruptions':
        void refreshDisruptions();
        break;
      case 'set-disruptions-mode':
        dispatch({ type: 'SET_DISRUPTIONS_MODE', mode: value as DisruptionsMode });
        void refreshDisruptions();
        break;
    }
  });
}

boot();
