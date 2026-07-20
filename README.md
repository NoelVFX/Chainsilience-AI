# ChainSight AI — Supply Chain Risk Intelligence Platform

> Transforming global supply chain signals into actionable business decisions.

An AI-powered platform that monitors global disruption signals, matches them
against a company's **Digital Twin** of its supply chain, scores explainable
risk, predicts operational impact, simulates mitigation scenarios, drafts
business communications, and tracks recommended actions to completion.

Built as a polished, judge-ready MVP (IDSOL) with a **Next.js** frontend and a
**FastAPI** backend, following clean architecture throughout.

---

## ✨ What's inside

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 14 (App Router), TypeScript, TailwindCSS, React Query, Recharts-ready, SVG disruption map |
| Backend | FastAPI, SQLModel, JWT auth, clean service/repository layers |
| Data | SQLite (zero-config default) or PostgreSQL; Redis in the Docker stack |
| AI | Pluggable LLM adapter (OpenAI) with **deterministic offline fallbacks** for all six AI modules |
| Infra | Docker + Docker Compose for the full stack |

The app runs **fully offline with no API keys** — every AI module has a
rule-based fallback, so the entire workflow is demonstrable out of the box.

---

## 🚀 Quick start

### Option A — Docker (full stack: Postgres + Redis + API + UI)

```bash
docker compose up --build
```

Open **http://localhost:3000** and sign in with the demo account:

```
demo@chainsight.ai  /  demo1234
```

### Option B — Local dev (no Docker)

**Backend** (Python 3.11+):

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate     macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload           # → http://localhost:8000  (docs at /docs)
```

**Frontend** (Node 18+):

```bash
cd frontend
npm install
cp .env.local.example .env.local        # points at http://localhost:8000/api/v1
npm run dev                             # → http://localhost:3000
```

The backend seeds a complete demo scenario on first boot (the "Taiwan
earthquake → wafer supply" story), so the dashboard is populated immediately.

---

## 🧭 The end-to-end workflow

1. **Login / Onboarding** — create a company profile → seeds the Digital Twin.
2. **Dashboard** — KPIs, Top Risks, disruption heatmap, live news feed,
   recommended-actions summary. Click **↻ Ingest live news** to run a headline
   through the whole pipeline live.
3. **Risk Detail** — explainable score breakdown, AI reasoning, the cascade
   **event chain**, and predicted impact tiles. Generate a mitigation email.
4. **Scenario Simulator** — compare No Action / Switch Supplier / Air Freight /
   Increase Safety Stock on risk reduction, cost, recovery and financial impact.
   Approve one → it flows into the Action Center.
5. **Action Center** — 5-stage Kanban (Recommended → Approved → Assigned → In
   Progress → Completed). Click a card to advance it.

The intelligence pipeline (`backend/app/services/pipeline.py`):

```
news → extract event → match to Digital Twin → score risk
     → predict impact → persist risk → generate recommended actions
```

---

## 🔌 Enabling the real LLM (optional)

Set an OpenAI key and the six AI modules (summarisation, entity extraction,
risk reasoning, scenario narrative, email generation, executive report)
transparently upgrade from the deterministic fallback to real calls:

```bash
# backend/.env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

`GET /health` reports `"ai_live": true` when active.

---

## ☁️ Deployment

Split deployment — **frontend on Vercel, backend on Render** (Vercel can't run
the FastAPI + Postgres service). Full step-by-step in
[`DEPLOYMENT.md`](DEPLOYMENT.md); a Render blueprint ships in
[`render.yaml`](render.yaml).

## 📚 Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture, data model, and the mapping from the original spec to the code.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — deploy to Vercel + Render.
- API reference — interactive OpenAPI docs at **http://localhost:8000/docs**.
- [`backend/`](backend/) and [`frontend/`](frontend/) each have their own structure documented in `ARCHITECTURE.md`.

---

## 🗂 Repository layout

```
chainsilience-ai/
├── backend/                 FastAPI service (clean architecture)
│   └── app/
│       ├── core/            config, logging, security, constants
│       ├── models/          SQLModel entities (the schema)
│       ├── schemas/         Pydantic request/response contracts
│       ├── repositories/    data access (Repository Pattern)
│       ├── services/        domain + AI services
│       │   ├── ai/          LLM adapter (OpenAI + fallback)
│       │   └── pipeline.py  the end-to-end coordinator
│       ├── api/routers/     versioned REST endpoints
│       └── db/              engine, session, demo seed
├── frontend/                Next.js app (6 screens, design-faithful)
│   └── src/
│       ├── app/             routes (login, onboarding, dashboard, risk, simulator, action-center)
│       ├── components/      AppShell, AmbientOrbs, DisruptionMap, EmailModal, …
│       └── lib/             API client, React Query hooks, types
├── docker-compose.yml       Postgres + Redis + backend + frontend
└── docs/ARCHITECTURE.md
```

---

## 🧪 Demo credentials

```
Email:     demo@chainsight.ai
Password:  demo1234
```

New companies can also self-onboard from the login screen ("Start onboarding").
