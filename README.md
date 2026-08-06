# oresund-transit

Øresund cross-border transit disruption dashboard — **oresund.live** (public).

Tracks disruptions + every observed departure on:
- **Hyllie ↔ København H** (Öresundståg)
- **Hyllie ↔ Ystad** (Pågatåg)
- Cross-border trains through Gottorp / København H

## Status: Phase 1 (seed + scaffold)

Public project of the private dashboard at `hermes-dash:8088/transit`.
Full plan: Hermes wiki → `concepts/public-transit-dashboard-plan.md`.

## Layout

```
packages/
  shared/    # API contract types (Disruption, Departure, LiveStatus, DelayStats)
  collector/ # Cloudflare Worker: 5-min cron collector + D1 + /api/transit/live
  web/       # Public dashboard (static, trilingual SV/DA/EN)
```

## Development process

- `main` protected: PR required, CI must pass, squash merge
- TDD: tests first (vitest), RED → GREEN → REFACTOR
- Harness execution model: Reasonix implements on `feat/*` branches,
  Hermes reviews, Tim approves (see wiki plan §7.5)
- CI: typecheck + test + lint on every PR; wrangler dry-run build

## Data licensing

Trafiklab Realtime APIs — CC-BY 4.0. Attribution required on every page:
"Data från Trafiklab.se". See wiki plan §4.
