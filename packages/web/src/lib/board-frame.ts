/**
 * The prerendered board frame (audit R1 C1/H1 — cold-load CLS 0.88–1.11).
 *
 * #app used to ship empty, so a cold visitor watched the page collapse from
 * the no-JS shell to nothing, then grow twice over as the SPA mounted and the
 * data landed: a 0 -> 887 -> 4122px dance on desktop (1132 -> 4452 mobile),
 * measured at CLS 0.88/1.11 with a fresh cache.
 *
 * The fix (audit option A): at BUILD time, fetch the same corridor snapshot
 * the board itself will fetch, and render the real board into #app with it —
 * the stats grid, the disruptions table with the prerender-time row count,
 * the history charts with their fixed-height containers. The first paint is
 * then the board's final shape, and main.ts keeps that frame on screen until
 * the visitor's own data has settled, so the only geometry left to move is
 * what the corridor changed between the build and the visit.
 *
 * The frame is literally `renderApp(state, lang)` over the snapshot — not a
 * hand-copied skeleton — which is what keeps its classes (and therefore its
 * geometry) in lockstep with the runtime board by construction.
 *
 * This module is BUILD-TIME-ONLY in its fetch function (like seo-summary's);
 * the state + render halves are pure and shared with the tests.
 */
import type { DelayStats, Disruption, LiveStatus } from '@oresund/shared';
import { renderApp } from '../components/App';
import { createInitialState, type AppState } from '../state';
import {
  parseDisruptionsResponse,
  parseHistoryResponse,
  parsePunctualityResponse,
  type HistoryResponse,
  type PunctualityResponse,
} from '../api';
import { delayStatsRange } from './stats';
import type { FetchLike } from './seo-summary';
import type { Lang } from '../i18n';

/** The corridor snapshot the frame is rendered from (build-time /live data). */
export interface BoardFrameData {
  live: LiveStatus;
  stats: DelayStats;
  /** 7-day history — the board's default range, so the frame matches the mount. */
  history: HistoryResponse;
  punctuality: PunctualityResponse;
  /** 30-day heatmap baseline; falls back to `history` when that fetch fails. */
  heatmapHistory: HistoryResponse;
  /** Today's disruption rows — the row count IS the frame's table geometry. */
  disruptions: Disruption[];
}

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`collector ${res.status} for ${url}`);
  return await res.json();
}

/** The collector's /live carries no typed parser; check what the frame reads. */
function isLiveStatus(json: unknown): json is LiveStatus {
  const l = json as Partial<LiveStatus> | null;
  return (
    !!l &&
    typeof l.timestamp === 'string' &&
    typeof l.status === 'string' &&
    typeof l.disruption_count === 'number' &&
    typeof l.service_shutdown === 'boolean'
  );
}

function isDelayStats(json: unknown): json is DelayStats {
  const s = json as Partial<DelayStats> | null;
  return (
    !!s &&
    typeof s.on_time_pct === 'number' &&
    typeof s.delayed_pct === 'number' &&
    typeof s.canceled_pct === 'number' &&
    typeof s.total_departures === 'number' &&
    (typeof s.avg_delay_seconds === 'number' || s.avg_delay_seconds === null)
  );
}

/**
 * Fetch every endpoint the frame needs from the collector at `baseUrl`.
 * Returns null on any required failure — the build then ships exactly the
 * pre-fix shell (empty #app), never a half-rendered frame.
 *
 * Timestamp/window convention matches the runtime: the today window comes
 * from delayStatsRange() (Stockholm wall clock, audit5's date hardening), so
 * a UTC build machine frames the corridor's "today", not its own.
 */
export async function fetchBoardFrame(
  baseUrl: string,
  fetchImpl: FetchLike,
  now: Date = new Date(),
): Promise<BoardFrameData | null> {
  try {
    const { from, to } = delayStatsRange(now);
    const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const [liveRaw, statsRaw, historyRaw, punctualityRaw, disruptionsRaw] = await Promise.all([
      getJson(`${baseUrl}/live`, fetchImpl),
      getJson(`${baseUrl}/delay-stats?${q}`, fetchImpl),
      getJson(`${baseUrl}/history?days=7`, fetchImpl),
      getJson(`${baseUrl}/punctuality?days=7`, fetchImpl),
      getJson(`${baseUrl}/disruptions?limit=50&${q}`, fetchImpl),
    ]);
    if (!isLiveStatus(liveRaw) || !isDelayStats(statsRaw)) return null;
    const history = parseHistoryResponse(historyRaw);
    const punctuality = parsePunctualityResponse(punctualityRaw);
    const disruptions = parseDisruptionsResponse(disruptionsRaw);
    // The 30-day heatmap baseline is the one soft dependency: without it the
    // frame loses a 16px caption line, not its geometry.
    let heatmapHistory: HistoryResponse;
    try {
      heatmapHistory = parseHistoryResponse(await getJson(`${baseUrl}/history?days=30`, fetchImpl));
    } catch {
      heatmapHistory = history;
    }
    return { live: liveRaw, stats: statsRaw, history, punctuality, heatmapHistory, disruptions };
  } catch {
    return null;
  }
}

/** The board state the frame renders — every section resolved, 'all' scope. */
export function boardFrameState(data: BoardFrameData): AppState {
  return {
    ...createInitialState(),
    live: data.live,
    liveState: 'ok',
    stats: data.stats,
    history: data.history,
    punctuality: data.punctuality,
    heatmapHistory: data.heatmapHistory,
    disruptions: data.disruptions,
    disruptionsState: 'ok',
  };
}

/**
 * The prerendered frame markup: the real board, built from the snapshot, in
 * the page's language. renderApp owns the structure — this stays honest
 * because the runtime renders the very same function over the same shape.
 */
export function renderBoardFrame(data: BoardFrameData, lang: Lang): string {
  return renderApp(boardFrameState(data), lang);
}
