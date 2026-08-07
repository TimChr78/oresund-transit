/**
 * In-memory fake of the minimal D1 interface used by the collector
 * (see src/db.ts D1Like). Records every prepare/bind call and returns
 * canned results keyed by the exact SQL string — tests never need a real
 * D1 binding or wrangler.
 */
import type { D1Like, D1PreparedLike } from '../src/db.js';

export interface RecordedCall {
  sql: string;
  binds: unknown[];
}

export class FakeD1 implements D1Like {
  calls: RecordedCall[] = [];
  firstRows = new Map<string, unknown | null>();
  allRows = new Map<string, unknown[]>();

  prepare(sql: string): D1PreparedLike {
    return new FakePrepared(this, sql);
  }

  /** Stub the row returned by first() for an exact SQL string. */
  stubFirst(sql: string, row: unknown | null): void {
    this.firstRows.set(sql, row);
  }

  /** Stub the rows returned by all() for an exact SQL string. */
  stubAll(sql: string, rows: unknown[]): void {
    this.allRows.set(sql, rows);
  }

  callsMatching(fragment: string): RecordedCall[] {
    return this.calls.filter((c) => c.sql.includes(fragment));
  }

  lastBindsFor(fragment: string): unknown[] {
    const matches = this.callsMatching(fragment);
    if (matches.length === 0) throw new Error(`no recorded call containing ${fragment}`);
    return matches[matches.length - 1]!.binds;
  }
}

class FakePrepared implements D1PreparedLike {
  private binds: unknown[] = [];

  constructor(
    private readonly fake: FakeD1,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedLike {
    this.binds = values;
    return this;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    this.fake.calls.push({ sql: this.sql, binds: [...this.binds] });
    return { results: (this.fake.allRows.get(this.sql) ?? []) as T[] };
  }

  async first<T = unknown>(): Promise<T | null> {
    this.fake.calls.push({ sql: this.sql, binds: [...this.binds] });
    return (this.fake.firstRows.get(this.sql) ?? null) as T | null;
  }

  async run(): Promise<{ meta: { changes?: number } }> {
    this.fake.calls.push({ sql: this.sql, binds: [...this.binds] });
    return { meta: { changes: 1 } };
  }
}
