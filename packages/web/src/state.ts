import type { DelayStats, Disruption, LiveStatus } from '@oresund/shared';
import type { HistoryResponse, PunctualityResponse, StationResponse } from './api';
import type { StationScope } from './components/StationPicker';
import type { DayRange, Direction } from './lib/stats';

/**
 * Pure UI state reducer. The App boot wires it to fetch orchestration:
 * day-range changes clear history + stats (refetched), refreshes feed
 * LIVE_OK / DISRUPTIONS_OK, and a failing endpoint never blanks data that
 * is already on screen.
 */

export type LiveSectionState = 'loading' | 'ok' | 'no_data' | 'error';

/**
 * Disruption table scope: "today" (default, matches the live board) or
 * "archive" (most recent rows across all dates, date-grouped).
 */
export type DisruptionsMode = 'today' | 'archive';

/** Section state of the station-scoped departures table (backlog A1). */
export type StationSectionState = 'idle' | 'loading' | 'ok' | 'error';

export interface AppState {
  direction: Direction;
  dayRange: DayRange;
  lastRefresh: number;
  /** Station scope of the board: the whole corridor, or one monitored stop. */
  station: StationScope;
  stationData: StationResponse | null;
  stationState: StationSectionState;
  stationError: string | null;
  /**
   * Identity of the station fetch currently in flight, together with the
   * `station` scope it was issued for. Refreshes overlap (the interval timer,
   * the picker, retry), so a reply is only applied when it carries the id and
   * scope of the request the board is still waiting for; null when none is.
   */
  stationRequestId: number | null;
  live: LiveStatus | null;
  liveState: LiveSectionState;
  liveError: string | null;
  stats: DelayStats | null;
  statsError: string | null;
  disruptions: Disruption[];
  disruptionsMode: DisruptionsMode;
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
  | { type: 'SET_STATION'; station: StationScope }
  /** Registers a fetch about to run: `id` must be unique per call, `scope` the station read at dispatch time. */
  | { type: 'STATION_START'; id: number; scope: StationScope }
  | { type: 'STATION_OK'; id: number; scope: StationScope; station: StationResponse }
  | { type: 'STATION_ERROR'; id: number; scope: StationScope; message: string }
  | { type: 'LIVE_OK'; live: LiveStatus; at: number }
  | { type: 'LIVE_NO_DATA'; at: number }
  | { type: 'LIVE_ERROR'; message: string }
  | { type: 'STATS_OK'; stats: DelayStats }
  | { type: 'STATS_ERROR'; message: string }
  | { type: 'SET_DISRUPTIONS_MODE'; mode: DisruptionsMode }
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
    station: 'all',
    stationData: null,
    stationState: 'idle',
    stationError: null,
    stationRequestId: null,
    live: null,
    liveState: 'loading',
    liveError: null,
    stats: null,
    statsError: null,
    disruptions: [],
    disruptionsMode: 'today',
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

    case 'SET_STATION':
      // Station scope: drop the previous stop's rows (never show station A's
      // departures under station B's name while the new fetch is in flight)
      // and keep the corridor sections untouched — they are scope-independent.
      // The scope change also invalidates the fetch in flight: its reply now
      // belongs to a stop the visitor has left.
      if (state.station === action.station) return state;
      return {
        ...state,
        station: action.station,
        stationRequestId: null,
        stationData: null,
        stationState: action.station === 'all' ? 'idle' : 'loading',
        stationError: null,
      };

    case 'STATION_START':
      // Remember which request is the live one. The section keeps whatever it
      // is already showing — a background refresh must not flash a loading
      // state over data that is still current.
      if (state.station !== action.scope) return state;
      return { ...state, stationRequestId: action.id };

    case 'STATION_OK':
      // Both results are gated on the request the board is still waiting for:
      // a slow reply for a station the visitor has already left is discarded,
      // and so is the older of two overlapping fetches for the same stop.
      if (
        state.stationRequestId !== action.id ||
        state.station !== action.scope ||
        state.station === 'all' ||
        state.station !== action.station.slug
      ) {
        return state;
      }
      return { ...state, stationData: action.station, stationState: 'ok', stationError: null };

    case 'STATION_ERROR':
      // Scoped like STATION_OK — an unscoped failure here used to mark station
      // B failed because a request for the abandoned station A came back late.
      // Keep the last good station on screen; the section shows its own retry.
      if (state.stationRequestId !== action.id || state.station !== action.scope) return state;
      return { ...state, stationState: 'error', stationError: action.message };

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

    case 'SET_DISRUPTIONS_MODE':
      if (state.disruptionsMode === action.mode) return state;
      return { ...state, disruptionsMode: action.mode, disruptionsState: 'loading' };

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
