-- Initial schema for oresund-transit D1 (ported from the private SQLite DB)
-- Migration 0001. Date: 2026-08-06.

-- Disruptions (events: delays, cancellations, alerts)
CREATE TABLE IF NOT EXISTS disruptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    line TEXT,
    type TEXT,
    cause TEXT,
    route_section TEXT,
    severity TEXT,
    delay_seconds INTEGER,
    raw_text TEXT,
    dep_key TEXT,
    first_seen TEXT,
    last_updated TEXT,
    direction TEXT,
    technical_number TEXT,
    sched_time TEXT
);
CREATE INDEX IF NOT EXISTS idx_disruptions_ts ON disruptions(timestamp);
CREATE INDEX IF NOT EXISTS idx_disruptions_depkey ON disruptions(dep_key);

-- Departures (Option B: every observed departure — delay-% foundation)
CREATE TABLE IF NOT EXISTS departures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stop_id TEXT NOT NULL,
    stop_name TEXT,
    line TEXT,
    destination TEXT,
    sched_time TEXT,
    delay_seconds INTEGER NOT NULL DEFAULT 0,
    canceled INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    technical_number TEXT,
    dep_key TEXT,
    first_seen TEXT,
    last_updated TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_departures_stop_key ON departures(stop_id, dep_key);
CREATE INDEX IF NOT EXISTS idx_departures_sched ON departures(sched_time);
CREATE INDEX IF NOT EXISTS idx_departures_line ON departures(line);
