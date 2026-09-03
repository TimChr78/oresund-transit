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
import { parseStationScope, type StationScope } from './components/StationPicker';
import { langFromPath, routePath } from './lib/route';
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
 * Anything unrecognised — including no param at all — is the whole corridor.
 */
function stationFromQuery(): StationScope {
  return parseStationScope(new URLSearchParams(globalThis.location.search).get('station'));
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

export function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;

  // Drop the no-JS/crawler fallback block (static H1 + SEO lead) shipped in
  // the shell — boot renders into #app regardless of route below.
  document.getElementById('static-shell')?.remove();

  // /privacy and /methodology render their static pages instead of the
  // dashboard. No data fetching, no consent banner — just the shell, footer
  // and lang switcher. Localized /sv/* and /da/* paths force their language.
  const pathLang = langFromPath(window.location.pathname);
  const route = routePath(window.location.pathname);
  if (route === 'privacy') {
    bootPrivacy(root, pathLang);
    return;
  }
  if (route === 'methodology') {
    bootMethodology(root, pathLang);
    return;
  }

  let lang: Lang = pathLang ?? detectLang();
  document.documentElement.lang = lang;
  let consent: ConsentState = readConsent();
  let state: AppState = createInitialState();

  // A shared ?station= link opens the board already scoped to that stop; the
  // reducer then clears it on the first fetch so no corridor rows flash up
  // under the station's name.
  const queried = stationFromQuery();
  if (queried !== 'all') state = reducer(state, { type: 'SET_STATION', station: queried });

  const render = (): void => {
    root.innerHTML = renderApp(state, lang, consent);
  };
  render();

  const dispatch = (action: Action): void => {
    state = reducer(state, action);
    render();
  };

  const refreshLive = async (): Promise<void> => {
    try {
      const live = await fetchLiveStatus();
      dispatch({ type: 'LIVE_OK', live, at: Date.now() });
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        dispatch({ type: 'LIVE_NO_DATA', at: Date.now() });
      } else {
        dispatch({ type: 'LIVE_ERROR', message: messageOf(err) });
      }
    }
  };

  const refreshStats = async (): Promise<void> => {
    try {
      const { from, to } = delayStatsRange();
      const stats = await fetchDelayStats(from, to);
      dispatch({ type: 'STATS_OK', stats });
    } catch (err) {
      dispatch({ type: 'STATS_ERROR', message: messageOf(err) });
    }
  };

  const refreshHistory = async (): Promise<void> => {
    try {
      const history = await fetchHistory(state.dayRange);
      dispatch({ type: 'HISTORY_OK', history });
    } catch (err) {
      dispatch({ type: 'HISTORY_ERROR', message: messageOf(err) });
    }
  };

  /**
   * Heatmap baseline: a SEPARATE 30-day history fetched once, so the by-hour
   * heatmap keeps a stable window no matter which range toggle is active.
   */
  const refreshHeatmapHistory = async (): Promise<void> => {
    try {
      const heatmapHistory = await fetchHistory(30);
      dispatch({ type: 'HEATMAP_HISTORY_OK', history: heatmapHistory });
    } catch (err) {
      dispatch({ type: 'HEATMAP_HISTORY_ERROR', message: messageOf(err) });
    }
  };

  const refreshPunctuality = async (): Promise<void> => {
    try {
      const punctuality = await fetchPunctuality(state.dayRange);
      dispatch({ type: 'PUNCTUALITY_OK', punctuality });
    } catch (err) {
      dispatch({ type: 'PUNCTUALITY_ERROR', message: messageOf(err) });
    }
  };

  const refreshDisruptions = async (): Promise<void> => {
    try {
      let disruptions: Disruption[];
      if (state.disruptionsMode === 'archive') {
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
      dispatch({ type: 'DISRUPTIONS_OK', disruptions });
    } catch (err) {
      dispatch({ type: 'DISRUPTIONS_ERROR', message: messageOf(err) });
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
    try {
      const station = await fetchStation(state.station);
      dispatch({ type: 'STATION_OK', station });
    } catch (err) {
      dispatch({ type: 'STATION_ERROR', message: messageOf(err) });
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
        // stopped from navigating before the scope is switched in place.
        event.preventDefault();
        dispatch({ type: 'SET_STATION', station: parseStationScope(value) });
        writeStationQuery(state.station);
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
