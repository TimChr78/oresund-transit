import './styles.css';
import { ApiError, fetchDelayStats, fetchDisruptions, fetchHistory, fetchLiveStatus } from './api';
import { detectLang, getDict, saveLang, translate, type Lang } from './i18n';
import { renderApp, type ConsentState } from './components/App';
import { renderPrivacyPage } from './components/PrivacyPage';
import { routePath } from './lib/route';
import { createInitialState, reducer, type Action, type AppState } from './state';
import type { DayRange, Direction } from './lib/stats';

/**
 * Boot: read the saved language, render, then drive the board.
 *
 * Refresh rules (matches the private dashboard):
 *  - on load: live + stats + history(7d) + disruptions in parallel, rendered
 *    progressively (banner first);
 *  - every 120s: live + disruptions only;
 *  - history + stats on day-range change only.
 * 503 from /api/transit/live = no snapshot yet -> empty state, not an error.
 */

const REFRESH_MS = 120_000;
const CONSENT_KEY = 'oresund-consent';

/** Local calendar date as YYYY-MM-DD (for delay-stats today window). */
function localDateIso(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

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

/** Privacy page boot: static render + language switcher only. */
function bootPrivacy(root: HTMLElement): void {
  let lang: Lang = detectLang();
  document.documentElement.lang = lang;

  const render = (): void => {
    document.title = `${translate('privacy_title', lang)} — Øresund.live`;
    root.innerHTML = renderPrivacyPage(lang, getDict(lang));
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

export function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;

  // /privacy renders the privacy page instead of the dashboard. No data
  // fetching, no consent banner — just the shell, footer and lang switcher.
  if (routePath(window.location.pathname) === 'privacy') {
    bootPrivacy(root);
    return;
  }

  let lang: Lang = detectLang();
  document.documentElement.lang = lang;
  let consent: ConsentState = readConsent();
  let state: AppState = createInitialState();

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
      const today = localDateIso();
      const stats = await fetchDelayStats(today, today);
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

  const refreshDisruptions = async (): Promise<void> => {
    try {
      const disruptions = await fetchDisruptions(50);
      dispatch({ type: 'DISRUPTIONS_OK', disruptions });
    } catch (err) {
      dispatch({ type: 'DISRUPTIONS_ERROR', message: messageOf(err) });
    }
  };

  // Initial load — everything in parallel, sections render as they land.
  void refreshLive();
  void refreshStats();
  void refreshHistory();
  void refreshDisruptions();

  // Refresh cycle: live + disruptions only.
  setInterval(() => {
    void refreshLive();
    void refreshDisruptions();
  }, REFRESH_MS);

  // One delegated listener for every data-action button on the board.
  root.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const btn = target?.closest?.('[data-action]') as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.action ?? '';
    const value = btn.dataset.value ?? '';

    switch (action) {
      case 'set-direction':
        dispatch({ type: 'SET_DIRECTION', direction: value as Direction });
        break;
      case 'set-days': {
        const dayRange = Number(value) as DayRange;
        dispatch({ type: 'SET_DAY_RANGE', dayRange });
        void refreshHistory();
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
        break;
      case 'retry-disruptions':
        void refreshDisruptions();
        break;
    }
  });
}

boot();
