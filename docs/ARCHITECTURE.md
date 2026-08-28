# Architecture

Chainsilience AI is a two-tier application (Next.js SPA ↔ FastAPI JSON API) with a
relational store. It follows clean/layered architecture: **routers → services →
repositories → models**, with the AI provider hidden behind a single adapter.

```
┌──────────────────────────┐        HTTPS/JSON        ┌───────────────────────────────┐
│  Next.js (App Router)    │  ───────────────────────▶ │  FastAPI                       │
│  React Query · Tailwind  │  ◀─────────────────────── │  routers → services → repos    │
│  6 design-faithful views │        JWT bearer         │  SQLModel → SQLite/Postgres    │
└──────────────────────────┘                           │  AI adapter → OpenAI/fallback  │
                                                        └───────────────────────────────┘
```

## Backend layers

| Layer | Responsibility | Location |
|-------|----------------|----------|
| **API / routers** | HTTP surface, auth deps, DTO validation | `app/api/routers/*` |
| **Services** | Business logic + the six AI modules | `app/services/*` |
| **Repositories** | All ORM access (Repository Pattern) | `app/repositories/*` |
| **Models** | SQLModel entities = the DB schema | `app/models/entities.py` |
| **Schemas** | Pydantic request/response contracts | `app/schemas/*` |
| **Core** | Config, logging, security, constants, time | `app/core/*` |

Dependencies point **inward**: routers depend on services, services on
repositories, repositories on models. The LLM is injected via `AIClient`
(Dependency Inversion), so no service imports OpenAI directly.

## Data model (Digital Twin + intelligence pipeline)

```
Company ──< User
Company ──< Node ──(Edge)──> Node          # the Digital Twin graph
NewsItem ──> Event ──> Risk ──< Action      # the intelligence pipeline
                         Risk ──< Feedback
```

- **Node / Edge** — the Digital Twin. Nodes (supplier, factory, component,
  product, factory, customer, port) carry JSON attributes (lead time, inventory,
  dependency share, coverage days …). Edges are typed (supplies, produces,
  requires, ships, delivers).
- **Event** — a structured disruption extracted from a `NewsItem`.
- **Risk** — an event **matched** to the company and **scored**, carrying the
  factor breakdown, predicted impact tiles, and the cascade chain (all JSON).
- **Action** — a mitigation task moving through the 5-stage workflow.
- **Feedback** — user ratings that (conceptually) improve future scoring.

## The intelligence pipeline

`app/services/pipeline.py` composes the specialised services into one flow:

```
NewsItem
  → EventExtractionService   (module 2/7: entity + event extraction)
  → MatchingService          (module 8: relevance vs the Digital Twin)
  → RiskScoringService       (module 9: explainable factor-based score)
  → ImpactService            (module 10: impact prediction)
  → Risk persisted
  → RecommendationService    (module 12: prioritised actions)
```

`ScenarioService` (module 11) and `EmailService` (module 5/13) hang off a
`Risk` on demand. `DashboardService` (module 14) aggregates KPIs from live data.

## AI modules → code

| # | Spec module | Implementation |
|---|-------------|----------------|
| 1 | News summarisation | `AIClient.summarize` (+ headline fallback) |
| 2 | Entity / event extraction | `EventExtractionService` + `AIClient.extract_event` |
| 3 | Risk reasoning | `RiskScoringService` + `pipeline._reasoning` / `AIClient.risk_reasoning` |
| 4 | Scenario planning | `ScenarioService` |
| 5 | Email generation | `EmailService` + `AIClient.generate_email` |
| 6 | Executive report | `reports` router + `AIClient.executive_report` |

Every module degrades gracefully: with no `OPENAI_API_KEY`, deterministic
rule-based logic produces coherent output so the demo never depends on network.

## Frontend structure

- **Routes** (`src/app`): `login`, `onboarding`, `dashboard`, `risk/[id]`,
  `simulator`, `action-center` — one per design screen.
- **State**: React Query hooks (`src/lib/hooks.ts`) are the only place that
  talks to the API client (`src/lib/api.ts`); JWT is persisted in localStorage.
- **Design system**: tokens live in `tailwind.config.ts` and `globals.css`
  (colors, radii, the animated living background, orbs, hover lift/tilt/glow) —
  transcribed from the handoff for pixel fidelity.
- **AppShell** provides the persistent sidebar + ambient background and guards
  routes client-side.

## Security notes (MVP scope)

- Passwords hashed with PBKDF2-SHA256; stateless JWT bearer tokens.
- CORS restricted to the frontend origin.
- Company-scoped authorization on every domain resource
  (`get_current_company_id`).
- `SECRET_KEY` and DB credentials are environment-driven — change them outside
  local dev. Sending emails and destructive operations are intentionally **not**
  wired to real external side effects in the MVP.

## Extending toward production

- Swap the SVG `DisruptionMap` for Mapbox/Leaflet (only needs the `map_points`).
- Add a background worker (Celery/RQ on the bundled Redis) to poll real news
  sources on a schedule instead of the manual **Ingest** button.
- Replace the SQLite default with the bundled Postgres (already wired in
  `docker-compose.yml`) and add Alembic migrations.
- Add a graph DB (Neo4j) if cascade traversal outgrows the in-memory approach.
