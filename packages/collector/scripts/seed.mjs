/**
 * Seed loader — imports the exported private-dashboard data into D1.
 *
 * Usage (local):
 *   wrangler d1 execute oresund-transit-db --local --file=./migrations/0001_initial.sql
 *   node scripts/seed.mjs <path-to-disruptions.json> <path-to-departures.json>
 *
 * The seed files are NOT committed (see .gitignore) — they're exported from
 * the private Unraid SQLite DB (transit-monitor.py data). Export:
 *   python3 - <<'EOF'
 *   import sqlite3, json
 *   conn = sqlite3.connect('/home/hermes/.hermes/data/transit/disruptions.db')
 *   conn.row_factory = sqlite3.Row
 *   for t in ('disruptions', 'departures'):
 *       rows = [dict(r) for r in conn.execute(f'SELECT * FROM {t}')]
 *       json.dump(rows, open(f'{t}.json', 'w'), ensure_ascii=False, default=str)
 *   EOF
 */
import { readFileSync } from 'node:fs';

const [, , disruptionsPath, departuresPath] = process.argv;
if (!disruptionsPath || !departuresPath) {
  console.error('Usage: node scripts/seed.mjs <disruptions.json> <departures.json>');
  process.exit(1);
}

// The D1 client is injected (wrangler d1 execute --json, or the Worker binding).
// For local seeding via wrangler, use: wrangler d1 execute oresund-transit-db --local --command="..."
// This script prints SQL statements for that path.
const disruptions = JSON.parse(readFileSync(disruptionsPath, 'utf8'));
const departures = JSON.parse(readFileSync(departuresPath, 'utf8'));

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

let inserts = 0;
console.log('-- disruptions');
for (const d of disruptions) {
  console.log(`INSERT INTO disruptions (timestamp, line, type, cause, route_section, severity, delay_seconds, raw_text, dep_key, first_seen, last_updated, direction, technical_number, sched_time) VALUES (${esc(d.timestamp)}, ${esc(d.line)}, ${esc(d.type)}, ${esc(d.cause)}, ${esc(d.route_section)}, ${esc(d.severity)}, ${esc(d.delay_seconds)}, ${esc(d.raw_text)}, ${esc(d.dep_key)}, ${esc(d.first_seen)}, ${esc(d.last_updated)}, ${esc(d.direction)}, ${esc(d.technical_number)}, ${esc(d.sched_time)});`);
  inserts++;
}
console.log('-- departures');
for (const d of departures) {
  console.log(`INSERT INTO departures (stop_id, stop_name, line, destination, sched_time, delay_seconds, canceled, status, technical_number, dep_key, first_seen, last_updated) VALUES (${esc(d.stop_id)}, ${esc(d.stop_name)}, ${esc(d.line)}, ${esc(d.destination)}, ${esc(d.sched_time)}, ${esc(d.delay_seconds)}, ${esc(d.canceled)}, ${esc(d.status)}, ${esc(d.technical_number)}, ${esc(d.dep_key)}, ${esc(d.first_seen)}, ${esc(d.last_updated)});`);
  inserts++;
}
console.error(`-- ${inserts} INSERT statements generated (${disruptions.length} disruptions, ${departures.length} departures)`);
