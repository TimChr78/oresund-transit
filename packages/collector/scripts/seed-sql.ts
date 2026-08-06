/**
 * SQL escaping helpers for the seed loader — extracted for testability.
 */
export function esc(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Build a disruptions INSERT statement from a row. */
export function disruptionInsert(d: Record<string, unknown>): string {
  const cols = ['timestamp', 'line', 'type', 'cause', 'route_section', 'severity',
    'delay_seconds', 'raw_text', 'dep_key', 'first_seen', 'last_updated',
    'direction', 'technical_number', 'sched_time'];
  return `INSERT INTO disruptions (${cols.join(', ')}) VALUES (${cols.map((c) => esc(d[c])).join(', ')});`;
}

/** Build a departures INSERT statement from a row. */
export function departureInsert(d: Record<string, unknown>): string {
  const cols = ['stop_id', 'stop_name', 'line', 'destination', 'sched_time',
    'delay_seconds', 'canceled', 'status', 'technical_number', 'dep_key',
    'first_seen', 'last_updated'];
  return `INSERT INTO departures (${cols.join(', ')}) VALUES (${cols.map((c) => esc(d[c])).join(', ')});`;
}
