import type { DelayStats, Disruption, LiveStatus } from '@oresund/shared';
import type { HistoryResponse, PunctualityResponse } from './api';
import type { DayRange, Direction } from './lib/stats';

/**
 * Pure UI state reducer. The App boot wires it to fetch orchestration:
 * day-range changes clear history + stats (refetched), refreshes feed
 * LIVE_OK / DISRUPTIONS_OK, and a failing endpoint never blanks data that
 * is already on screen.
 */

export type LiveSectionState = 'loading' | 'ok' | 'no_data' | 'error';

export interface AppState {
  direction: Direction;
  dayRange: DayRange;
  lastRefresh: number;
  live: LiveStatus | null;
  liveState: LiveSectionState;
  liveError: string | null;
  stats: DelayStats | null;
  statsError: string | null;
  disruptions: Disruption[];
  disruptionsState: 'loading' | 'ok' | 'error';
  disruptionsError: string | null;
  history: HistoryResponse | null;
  historyError: string | null;
  /** Separate 30-day history for the by-hour heatmap (stable baseline, NOT cleared by the range toggle). */
  heatmapHistory: HistoryResponse | null;
  heatmapError: string | null;
  punctuality: PunctualityResponse | null;
  punctualityError: string | null;
}

export type Action =
  | { type: 'SET_DIRECTION'; direction: Direction }
  | { type: 'SET_DAY_RANGE'; dayRange: DayRange }
  | { type: 'LIVE_OK'; live: LiveStatus; at: number }
  | { type: 'LIVE_NO_DATA'; at: number }
  | { type: 'LIVE_ERROR'; message: string }
  | { type: 'STATS_OK'; stats: DelayStats }
  | { type: 'STATS_ERROR'; message: string }
  | { type: 'DISRUPTIONS_OK'; disruptions: Disruption[] }
  | { type: 'DISRUPTIONS_ERROR'; message: string }
  | { type: 'HISTORY_OK'; history: HistoryResponse }
  | { type: 'HISTORY_ERROR'; message: string }
  | { type: 'HEATMAP_HISTORY_OK'; history: HistoryResponse }
  | { type: 'HEATMAP_HISTORY_ERROR'; message: string }
  | { type: 'PUNCTUALITY_OK'; punctuality: PunctualityResponse }
  | { type: 'PUNCTUALITY_ERROR'; message: string };

export function createInitialState(): AppState {
  return {
    direction: 'all',
    dayRange: 7,
    lastRefresh: 0,
    live: null,
    liveState: 'loading',
    liveError: null,
    stats: null,
    statsError: null,
    disruptions: [],
    disruptionsState: 'loading',
    disruptionsError: null,
    history: null,
    historyError: null,
    heatmapHistory: null,
    heatmapError: null,
    punctuality: null,
    punctualityError: null,
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_DIRECTION':
      return { ...state, direction: action.direction };

    case 'SET_DAY_RANGE':
      // History + stats + punctuality are re-fetched on day-range change only.
      return {
        ...state,
        dayRange: action.dayRange,
        history: null,
        historyError: null,
        stats: null,
        statsError: null,
        punctuality: null,
        punctualityError: null,
      };

    case 'LIVE_OK':
      return { ...state, live: action.live, liveState: 'ok', liveError: null, lastRefresh: action.at };

    case 'LIVE_NO_DATA':
      // 503 from /api/transit/live = no snapshot yet — empty state, not an error.
      return { ...state, live: null, liveState: 'no_data', liveError: null, lastRefresh: action.at };

    case 'LIVE_ERROR':
      // Keep the last good snapshot; a failing refresh must not blank the page.
      return { ...state, liveState: 'error', liveError: action.message };

    case 'STATS_OK':
      return { ...state, stats: action.stats, statsError: null };

    case 'STATS_ERROR':
      return { ...state, statsError: action.message };

    case 'DISRUPTIONS_OK':
      return { ...state, disruptions: action.disruptions, disruptionsState: 'ok', disruptionsError: null };

    case 'DISRUPTIONS_ERROR':
      return { ...state, disruptionsState: 'error', disruptionsError: action.message };

    case 'HISTORY_OK':
      return { ...state, history: action.history, historyError: null };

    case 'HISTORY_ERROR':
      return { ...state, historyError: action.message };

    case 'HEATMAP_HISTORY_OK':
      return { ...state, heatmapHistory: action.history, heatmapError: null };

    case 'HEATMAP_HISTORY_ERROR':
      return { ...state, heatmapError: action.message };

    case 'PUNCTUALITY_OK':
      return { ...state, punctuality: action.punctuality, punctualityError: null };

    case 'PUNCTUALITY_ERROR':
      return { ...state, punctualityError: action.message };
  }
}
