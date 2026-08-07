-- Live status snapshot (single-row) — written by the collector's scheduled run.
-- Storage choice: D1 over KV (the collector worker and the Phase 3 web worker
-- share the existing D1 binding; KV would need a new namespace + wrangler.toml
-- change). The full LiveStatus object is stored as JSON in one column.
-- Migration 0002. Date: 2026-08-07.
CREATE TABLE IF NOT EXISTS live_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    snapshot TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
