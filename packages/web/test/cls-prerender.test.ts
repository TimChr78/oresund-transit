import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { DelayStats, Disruption, LiveStatus } from '@oresund/shared';
import {
  renderBoardFrame,
  boardFrameState,
  fetchBoardFrame,
  type BoardFrameData,
} from '../src/lib/board-frame';
import { renderHomeWithSummary, renderLocalizedHome, type HomeSummary } from '../src/lib/prerender';
import { META, hreflangCluster } from '../src/lib/seo';
import { boardSettled, createInitialState } from '../src/state';
import { translate, type Lang } from '../src/i18n';
import type { HistoryResponse, PunctualityResponse } from '../src/api';

/**
 * Audit R1 C1/H1 — cold-load CLS 0.88 (desktop) / 1.11 (mobile): #app shipped
 * empty, the SPA mounted the loading board into it, and the data arrival
 * grew the page twice over. The fix prerenders the BOARD FRAME — the real
 * renderApp output over a build-time corridor snapshot — into #app, and main.ts
 * holds that frame until the visitor's own fetches settle, so first paint is
 * the board's final geometry and the swap changes values, not sizes.
 *
 * These tests pin the frame's SHAPE (stats grid, table shell with the
 * prerender-time row count, the fixed-height chart containers) and the
 * boot wiring, because "geometry matches within a few px" is what makes the
 * swap cheap. Playwright cold-load CLS is measured separately (session report).
 */

const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const LANGS: Lang[] = ['en', 'sv', 'da'];

const LIVE: LiveStatus = {
  status: 'blue',
  status_text: 'Alerts',
  timestamp: '2026-09-18T22:00:17',
  time_short: '22:00',
  disruption_count: 2,
  departure_counts: { to_denmark: 7, to_sweden: 5, bus: 0 },
  service_shutdown: false,
  directions: { to_denmark: ['Østerport'], to_sweden: ['Malmö'], bus: [] },
};

const STATS: DelayStats = {
  date_from: '2026-09-18',
  date_to: '2026-09-19',
  total_departures: 374,
  on_time_count: 249,
  delayed_count: 117,
  canceled_count: 8,
  on_time_pct: 66.6,
  delayed_pct: 31.3,
  canceled_pct: 2.1,
  avg_delay_seconds: 142,
  by_line: {},
};

const HISTORY: HistoryResponse = {
  days: 7,
  date_from: '2026-09-12',
  date_to: '2026-09-18',
  total_disruptions: 14,
  daily: [
    { date: '2026-09-16', count: 4, cancellations: 1, delays: 2, alerts: 1, avg_delay: 300 },
    { date: '2026-09-17', count: 5, cancellations: 2, delays: 2, alerts: 1, avg_delay: 240 },
    { date: '2026-09-18', count: 5, cancellations: 1, delays: 3, alerts: 1, avg_delay: 260 },
  ],
  by_line: [
    { line: '804', count: 8, avg_delay: 250, max_delay: 600 },
    { line: '803', count: 6, avg_delay: 280, max_delay: 700 },
  ],
  by_cause: [
    { cause: 'signal_failure', count: 9 },
    { cause: 'vehicle_fault', count: 5 },
  ],
  by_hour: [
    { hour: 7, count: 4, avg_delay: 300 },
    { hour: 16, count: 5, avg_delay: 250 },
    { hour: 17, count: 5, avg_delay: 220 },
  ],
};

const PUNCTUALITY: PunctualityResponse = {
  days: 7,
  date_from: '2026-09-12',
  date_to: '2026-09-18',
  daily: [
    { date: '2026-09-17', total: 120, on_time: 90, delayed: 25, canceled: 5, on_time_pct: 75.0, avg_delay_seconds: 140 },
    { date: '2026-09-18', total: 115, on_time: 80, delayed: 28, canceled: 7, on_time_pct: 69.6, avg_delay_seconds: 160 },
  ],
};

const DISRUPTIONS: Disruption[] = [
  {
    id: 1,
    timestamp: '2026-09-18T18:00:00',
    line: '804',
    type: 'delay',
    cause: 'signal_failure',
    route_section: null,
    severity: 'minor',
    delay_seconds: 600,
    raw_text: 'Signalfel',
    dep_key: 'k1',
    first_seen: '2026-09-18T18:00:00',
    last_updated: '2026-09-18T18:05:00',
    direction: 'to_denmark',
    technical_number: '1143',
    sched_time: '2026-09-18T18:00:00',
  },
  {
    id: 2,
    timestamp: '2026-09-18T19:00:00',
    line: '803',
    type: 'cancellation',
    cause: 'vehicle_fault',
    route_section: null,
    severity: 'major',
    delay_seconds: null,
    raw_text: 'Installet',
    dep_key: 'k2',
    first_seen: '2026-09-18T19:00:00',
    last_updated: '2026-09-18T19:10:00',
    direction: 'to_sweden',
    technical_number: '1144',
    sched_time: '2026-09-18T19:00:00',
  },
  {
    id: 3,
    timestamp: '2026-09-18T20:00:00',
    line: '804',
    type: 'alert',
    cause: 'unknown',
    route_section: 'Malmö C – København H',
    severity: null,
    delay_seconds: 0,
    raw_text: 'Störning',
    dep_key: 'k3',
    first_seen: '2026-09-18T20:00:00',
    last_updated: '2026-09-18T20:02:00',
    direction: 'to_denmark',
    technical_number: null,
    sched_time: '2026-09-18T20:00:00',
  },
];

const FRAME_DATA: BoardFrameData = {
  live: LIVE,
  stats: STATS,
  history: HISTORY,
  punctuality: PUNCTUALITY,
  heatmapHistory: HISTORY,
  disruptions: DISRUPTIONS,
};

/** Isolate the board table's tbody — sr-tables add other <tr>/<tbody> later. */
function boardTableTbody(html: string): string {
  const start = html.indexOf('id="disruptions-table"');
  expect(start).toBeGreaterThan(-1);
  const tbodyOpen = html.indexOf('<tbody>', start);
  const tbodyClose = html.indexOf('</tbody>', tbodyOpen);
  return html.slice(tbodyOpen, tbodyClose);
}

describe('renderBoardFrame — the frame is the real board, prerendered', () => {
  const frame = renderBoardFrame(FRAME_DATA, 'en');

  it('ships the board classes the runtime renders (stats grid, disruptions table shell)', () => {
    // Same classes = same geometry: this is what makes the runtime swap cheap.
    expect(frame).toContain('<div class="wrap">');
    expect(frame).toContain('<main class="board">');
    expect(frame).toContain('<section class="stats-grid">');
    expect((frame.match(/class="stat"/g) ?? [])).toHaveLength(5);
    expect(frame).toContain('<section class="disruptions">');
    expect(frame).toContain('id="disruptions-table"');
    expect(frame).toContain('<table class="board-table">');
    expect(frame).toContain('<section class="history" data-key="history-section">');
    expect(frame).toContain('<footer class="footer">');
    // The banner lands in its resolved state — never a loading stub.
    expect(frame).toContain('class="status-banner status-blue"');
    expect(frame).toContain('22:00');
  });

  it('the table shell carries the PRERENDER-TIME row count as rows', () => {
    // Three snapshot disruptions -> three board rows; when the visitor's own
    // data lands, reconcile diffs these same three into whatever now exists.
    expect((boardTableTbody(frame).match(/<tr /g) ?? [])).toHaveLength(3);
    // One <tr> per disruption, keyed like the runtime rows.
    expect(boardTableTbody(frame)).toContain('data-key="k1"');
    expect(boardTableTbody(frame)).toContain('data-key="k3"');
  });

  it('reserves the full history section: 6 chart containers with fixed geometry', () => {
    // daily bars, punctuality, by-line, by-weekday, by-cause, by-hour.
    expect((frame.match(/<div class="chart">/g) ?? [])).toHaveLength(6);
    expect(frame).toContain('class="bars"');
    expect(frame).toContain('class="punct-chart"');
    expect(frame).toContain('class="hbars"');
    expect(frame).toContain('class="heatmap"');
  });

  it('renders the hero strip when the snapshot reports active disruptions', () => {
    expect(frame).toContain('class="hero-strip"');
    expect(frame).toContain('id="disruptions-table"');
  });

  it('renders exactly one lead H1 and one topbar — the board chrome, not the shell', () => {
    expect((frame.match(/<h1 class="lead">/g) ?? [])).toHaveLength(1);
    expect((frame.match(/<header class="topbar">/g) ?? [])).toHaveLength(1);
    // No about block: that stays in #static-shell (audit4 N-H5).
    expect(frame).not.toContain('home-about');
  });

  for (const lang of LANGS) {
    it(`localizes the frame for ${lang} (sv/da variants get the same frame, translated)`, () => {
      const localized = renderBoardFrame(FRAME_DATA, lang);
      expect(localized).toContain(translate('section_history', lang));
      expect(localized).toContain(translate('section_disruptions', lang));
      expect(localized).toContain(translate('lead_tagline', lang));
    });
  }

  it('boardFrameState is settled by definition — the runtime swap gate can fire', () => {
    // If a frame state ever reported unsettled, boot() would hold a stale
    // frame until the deadline and the CLS win would evaporate.
    expect(boardSettled(createInitialState())).toBe(false);
    expect(boardSettled(boardFrameState(FRAME_DATA))).toBe(true);
  });
});

describe('frame injection into the home variants (prerender lib)', () => {
  const frameHtml = renderBoardFrame(FRAME_DATA, 'en');
  const SUMMARY: HomeSummary = { statusKey: 'seo_status_normal', cancellations24h: 3, trendKey: 'seo_trend_down' };

  it('the frame lands INSIDE #app with a data-prerender-frame marker', () => {
    const html = renderHomeWithSummary(shell, 'en', META.dashboard.en, undefined, null, frameHtml);
    expect(html).toContain('<div id="app" data-prerender-frame="1">');
    // The frame content itself sits inside the marked #app div, before the
    // static shell starts.
    const appOpen = html.indexOf('<div id="app" data-prerender-frame="1">');
    const shellOpen = html.indexOf('<div id="static-shell"');
    const appBoard = html.indexOf('<div class="wrap">');
    expect(appOpen).toBeGreaterThan(-1);
    expect(appBoard).toBeGreaterThan(appOpen);
    expect(appBoard).toBeLessThan(shellOpen);
  });

  it('the build-time summary still lands after the SHELL lead, never after the frame’s H1', () => {
    // #app ships before #static-shell, so if injection order ever flipped and
    // injectHomeSummary ran on a frame-bearing document, its first `</h1>`
    // would be the frame's — putting crawler copy inside #app.
    const html = renderHomeWithSummary(shell, 'en', META.dashboard.en, undefined, SUMMARY, frameHtml);
    const summaryAt = html.indexOf('class="seo-summary"');
    expect(summaryAt).toBeGreaterThan(html.indexOf('<div id="static-shell"'));
    expect(html.indexOf('<div id="app"')).toBeLessThan(summaryAt);
  });

  it('sv and da get the same marked injection', () => {
    for (const lang of ['sv', 'da'] as Lang[]) {
      const localized = renderBoardFrame(FRAME_DATA, lang);
      const html = renderHomeWithSummary(shell, lang, META.dashboard[lang], undefined, null, localized);
      expect(html, lang).toContain('<div id="app" data-prerender-frame="1">');
      expect(html, lang).toContain(translate('section_history', lang));
    }
  });

  it('with no frame the home variant is byte-identical to renderLocalizedHome', () => {
    // Collector-down builds keep shipping exactly the pre-fix shell.
    const withUndefined = renderHomeWithSummary(shell, 'en', META.dashboard.en, hreflangCluster('/'), null, undefined);
    expect(withUndefined).toBe(renderLocalizedHome(shell, 'en', META.dashboard.en, hreflangCluster('/')));
    expect(withUndefined).toContain('<div id="app"></div>');
    expect(withUndefined).not.toContain('data-prerender-frame');
  });

  it('the SOURCE shell keeps #app empty and the no-JS fallback intact (acceptance 4)', () => {
    // The frame is a BUILD artifact: index.html — the dev shell and the base
    // for every variant — must still ship the empty div and the full shell.
    expect(shell).toContain('<div id="app"></div>');
    expect(shell).toContain('id="static-shell"');
    expect(shell).toContain('<section class="home-about">');
  });
});

describe('fixed chart-container geometry (styles.css)', () => {
  it('the daily plot, punctuity svg, hbar lists and heatmap cells all reserve size', () => {
    // The second shift wave the audit measured was SECTION.history painting a
    // few hundred px and then replacing with the full chart; fixed geometry
    // means frame and final data occupy the same boxes.
    expect(css).toMatch(/\.bars \{[^}]*height:\s*180px/);
    expect(css).toMatch(/\.punct-chart svg \{[^}]*aspect-ratio:\s*560 \/ 140/);
    expect(css).toMatch(/\.chart \.hbars \{[^}]*min-height:\s*110px/);
    expect(css).toMatch(/\.cell \{[^}]*aspect-ratio:\s*1/);
  });
});

describe('boot wiring (frame-preserving mount)', () => {
  it('main.ts holds the frame until boardSettled, then swaps once and drops the marker', () => {
    expect(mainSrc).toContain("root.hasAttribute('data-prerender-frame')");
    expect(mainSrc).toContain('if (!boardSettled(state)) return;');
    expect(mainSrc).toContain("root.removeAttribute('data-prerender-frame')");
    expect(mainSrc).toContain('FRAME_HOLD_MS');
    // The swap still goes through the reconciler.
    expect(mainSrc).toContain('reconcile(root, renderApp(state, lang))');
  });

  it('the deploy-race guard keys on the boot marker, not on empty children', () => {
    // With the frame in #app, `children.length === 0` would never fire again —
    // a dead bundle looked like a healthy page.
    expect(shell).toContain("app.getAttribute('data-app-booted')");
    expect(shell).not.toContain('app.children.length === 0');
    expect(shell).toContain('oresund-reloaded');
    expect(mainSrc).toContain("root.setAttribute('data-app-booted', '1')");
  });

  it('no-JS hides the stale frame and keeps the static shell (acceptance 4)', () => {
    const noscript = /<noscript>[\s\S]*?<\/noscript>/.exec(shell)?.[0] ?? '';
    expect(noscript).toContain('#app');
    expect(noscript).toContain('display: none');
    expect(noscript).toContain('This page requires JavaScript');
  });
});

describe('fetchBoardFrame (build-time snapshot, injected fetch)', () => {
  const responses: Record<string, unknown> = {
    '/live': LIVE,
    '/delay-stats': STATS,
    '/history?days=7': HISTORY,
    '/punctuality?days=7': PUNCTUALITY,
    '/history?days=30': HISTORY,
    '/disruptions': { disruptions: DISRUPTIONS },
  };
  const okFetch = async (url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected url ${url}`);
    return { ok: true, status: 200, json: async () => responses[key] } as Response;
  };

  it('resolves the full snapshot from the five required endpoints', async () => {
    const data = await fetchBoardFrame('https://c.example/api/transit', okFetch, new Date());
    expect(data).not.toBeNull();
    expect(data!.live).toBe(LIVE);
    expect(data!.stats).toBe(STATS);
    expect(data!.disruptions).toHaveLength(3);
    expect(data!.heatmapHistory).toBe(HISTORY);
  });

  it('falls back to the 7-day history when the 30-day heatmap baseline fails', async () => {
    const partial = async (url: string) => {
      if (url.includes('history?days=30')) throw new Error('timeout');
      return okFetch(url);
    };
    const data = await fetchBoardFrame('https://c.example/api/transit', partial, new Date());
    expect(data!.heatmapHistory).toBe(HISTORY);
  });

  it('returns null (no frame, build survives) when any required endpoint fails', async () => {
    const dead = async () => {
      throw new Error('collector down');
    };
    expect(await fetchBoardFrame('https://c.example/api/transit', dead, new Date())).toBeNull();

    const badLive = async (url: string) => {
      if (url.includes('/live')) return { ok: true, status: 200, json: async () => ({ nope: true }) } as Response;
      return okFetch(url);
    };
    expect(await fetchBoardFrame('https://c.example/api/transit', badLive, new Date())).toBeNull();

    const httpError = async (url: string) => {
      if (url.includes('/disruptions')) return { ok: false, status: 500, json: async () => ({}) } as Response;
      return okFetch(url);
    };
    expect(await fetchBoardFrame('https://c.example/api/transit', httpError, new Date())).toBeNull();
  });
});

describe('boardSettled — the cold-load swap gate', () => {
  const settled = (overrides: Partial<ReturnType<typeof createInitialState>>) =>
    boardSettled({ ...boardFrameState(FRAME_DATA), ...overrides });

  it('all corridor sections resolved -> true', () => {
    expect(settled({})).toBe(true);
  });

  it('every still-loading section holds the gate', () => {
    expect(settled({ liveState: 'loading' })).toBe(false);
    expect(settled({ stats: null })).toBe(false);
    expect(settled({ disruptionsState: 'loading' })).toBe(false);
    expect(settled({ history: null })).toBe(false);
    expect(settled({ punctuality: null })).toBe(false);
    expect(settled({ heatmapHistory: null })).toBe(false);
  });

  it('errors count as settled — a failed endpoint gets its retry UI, not a frozen frame', () => {
    expect(
      settled({ stats: null, statsError: 'boom', history: null, historyError: 'boom', punctuality: null, punctualityError: 'boom', heatmapHistory: null, heatmapError: 'boom', liveState: 'error' }),
    ).toBe(true);
  });

  it('a scoped station holds the gate until its departures land', () => {
    expect(settled({ station: 'hyllie', stationState: 'loading' })).toBe(false);
    expect(settled({ station: 'hyllie', stationState: 'ok' })).toBe(true);
    expect(settled({ station: 'hyllie', stationState: 'error' })).toBe(true);
  });
});

describe('CodeRabbit PR60: interaction lifts the frame hold', () => {
  // The suite is pure-node (no jsdom), so the lift is pinned as the same pure
  // closure shape main.ts uses: hold active + click -> hold cleared and the
  // board renders in the SAME pass (the click that lifted the hold is not
  // swallowed). The wiring in main.ts itself is asserted textually below.
  function makeHold(getSettled: () => boolean) {
    let holdingFrame = true;
    let renders = 0;
    const render = (): void => {
      if (holdingFrame) {
        if (!getSettled()) return;
        holdingFrame = false;
      }
      renders += 1;
    };
    const onClick = (): void => {
      if (!holdingFrame) return;
      holdingFrame = false;
      render();
    };
    return {
      get holding() {
        return holdingFrame;
      },
      get renders() {
        return renders;
      },
      render,
      onClick,
    };
  }

  it('a click during the hold lifts it and renders in the same pass', () => {
    const hold = makeHold(() => false); // data NOT settled yet
    hold.render();
    expect(hold.renders).toBe(0); // plain render no-ops while held
    hold.onClick(); // the user's click proves presence
    expect(hold.holding).toBe(false);
    expect(hold.renders).toBe(1); // the same click is not swallowed
  });

  it('a click after the hold lifted is a no-op for the lift path', () => {
    const hold = makeHold(() => false);
    hold.onClick();
    expect(hold.holding).toBe(false);
    const before = hold.renders;
    hold.onClick();
    expect(hold.renders).toBe(before);
  });

  it('main.ts wires the lift as a capture-phase root click handler', () => {
    const src = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(src).toContain("root.addEventListener(\n    'click'");
    expect(src).toContain('capture: true');
    expect(src).toMatch(/holdingFrame = false;[\s\S]{0,120}render\(\);/);
  });
});
