# Deployment guide

The app is a **split deployment**:

- **Frontend (Next.js)** → **Vercel** (native, fast).
- **Backend (FastAPI + Postgres)** → **Render** (or Railway/Fly) — Vercel can't
  run a long-lived Python + Postgres service.

The two are wired together with two environment variables:

| Where | Variable | Value |
|-------|----------|-------|
| Vercel (frontend) | `NEXT_PUBLIC_API_BASE_URL` | `https://<your-backend>.onrender.com/api/v1` |
| Render (backend) | `CORS_ORIGINS` | `["https://<your-app>.vercel.app"]` |

---

## 1. Push to GitHub

Once you've authenticated the GitHub CLI (`gh auth login`), from the repo root:

```bash
gh repo create chainsight-ai --public --source=. --remote=origin --push
```

(or `--private`). This creates the repo and pushes `main`.

---

## 2. Deploy the backend to Render

**Option A — Blueprint (recommended).** The repo ships a [`render.yaml`](render.yaml).

1. Render dashboard → **New → Blueprint** → select your `chainsight-ai` repo.
2. Render provisions the web service (from `backend/Dockerfile`) **and** a free
   Postgres, and auto-wires `DATABASE_URL`.
3. Wait for the first deploy; note the service URL, e.g.
   `https://chainsight-backend.onrender.com`.
4. Verify: open `https://chainsight-backend.onrender.com/health` → `{"status":"ok",...}`.

**Option B — Manual web service.** New → Web Service → your repo → Runtime
*Docker*, Root Directory `backend`. Add a Render Postgres and set env vars
`DATABASE_URL`, `SECRET_KEY`, `SEED_ON_STARTUP=true`, `CORS_ORIGINS`.

> The backend seeds the demo dataset (`demo@chainsight.ai` / `demo1234`) on first
> boot, so it's usable immediately.

---

## 3. Deploy the frontend to Vercel

1. Vercel dashboard → **Add New → Project** → import your `chainsight-ai` repo.
2. **Root Directory: `frontend`** (important — it's a monorepo). Vercel
   auto-detects Next.js.
3. **Environment Variables** → add:
   `NEXT_PUBLIC_API_BASE_URL = https://<your-backend>.onrender.com/api/v1`
4. Deploy. Note the assigned domain, e.g. `https://chainsight-ai.vercel.app`.

---

## 4. Close the loop (CORS)

Back on Render, set `CORS_ORIGINS` to your real Vercel domain (JSON array) and
redeploy the backend:

```
CORS_ORIGINS=["https://chainsight-ai.vercel.app"]
```

Then open the Vercel URL and sign in with **demo@chainsight.ai / demo1234**.

---

## Notes & gotchas

- **Cold starts**: Render's free tier sleeps after inactivity; the first request
  after idle can take ~30–60s. Fine for demos.
- **Free Postgres** on Render expires after a period — recreate or upgrade for
  anything long-lived.
- **Managed DB URLs**: Render/Railway hand out `postgres://…`; the backend
  rewrites this to the `postgresql+psycopg://` driver automatically
  (`backend/app/db/session.py`).
- **Live LLM**: set `OPENAI_API_KEY` on the backend to switch the six AI modules
  from deterministic fallbacks to real calls. Everything works without it.
- **Preview builds**: every GitHub push triggers a Vercel preview deploy; wire a
  preview backend URL if you want previews to hit a non-prod API.
