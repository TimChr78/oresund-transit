import { describe, it, expect } from 'vitest';

// build-meta generation (audit3 H4 / CodeRabbit CRITICAL): the deploy date stamped
// into dist/build-meta.json must be the Europe/Stockholm calendar day in YYYY-MM-DD.
// The timestamp logic lives inline in scripts/generate-llms.ts; this test pins the
// formatter contract the sitemap Function (functions/sitemap.xml.js) depends on.

function stockholmDay(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

describe('build-meta.json deploy date (generate-llms.ts contract)', () => {
  it('formats a UTC afternoon as the same Stockholm calendar day (sv-SE = YYYY-MM-DD)', () => {
    expect(stockholmDay(new Date('2026-09-02T15:30:00Z'))).toBe('2026-09-02');
  });

  it('rolls forward: 2026-09-02T22:30Z is already Sep 3 in Stockholm', () => {
    expect(stockholmDay(new Date('2026-09-02T22:30:00Z'))).toBe('2026-09-03');
  });

  it('rolls back: 2026-03-29T22:30Z (CET, pre-DST) is Mar 30 in Stockholm', () => {
    expect(stockholmDay(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30');
  });

  it('emits JSON matching the shape the sitemap Function parses', () => {
    const generated = stockholmDay(new Date('2026-09-02T15:30:00Z'));
    const payload = JSON.parse(JSON.stringify({ generated }, null, 2) + '\n');
    expect(payload).toHaveProperty('generated');
    expect(payload.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.generated).toBe('2026-09-02');
  });
});
