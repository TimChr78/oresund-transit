import { defineConfig } from 'vitest/config';

// oresund.live — static dashboard consuming the collector Worker's API.
//
// The app talks to the API through RELATIVE /api/... paths so one build
// serves from anywhere: `bun run dev` (proxied here to a local
// `wrangler dev` on :8787), workers.dev, or oresund.live.
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    // Pure-logic tests only — no jsdom. DOM rendering is kept out of tests.
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
