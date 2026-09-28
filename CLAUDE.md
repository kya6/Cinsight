# Cinsight

Predicts whether a CFPB consumer complaint will end in **relief** (monetary or non-monetary), so a
customer-service team can review likely cases earlier. The model is trained in `Cinsight.ipynb`
(Colab); the website only reads what the notebook exported to `artifacts/`.

## Stack

| Part | Tech | Deploys to |
|---|---|---|
| `backend/` | FastAPI + Uvicorn, Pydantic, pandas/pyarrow, scikit-learn (pinned) | CranL (Docker, `Dockerfile` at the repo root) |
| `frontend/` | Next.js 16 App Router + TypeScript, Tailwind v4, shadcn/ui (Radix), Recharts, TanStack Query + Table, react-hook-form + zod | Vercel (Root Directory = `frontend`) |

## The artifacts contract — read before changing anything

- **Never retrain, never load the raw complaints CSV, never change how the model scores.** The site
  reads `artifacts/` only. To change the model, re-run the notebook and replace the files.
- **`artifacts/cinsight_core.py` is shared with the notebook and must not be copied, rewritten or
  "improved" here.** The backend imports it as-is (`backend/app/store.py`). Features are built only
  with `prepare_features`, tiers only with `assign_tier` (thresholds from `model_meta.json`), and
  explanations only with `explain(model_explain, X)`. This is what keeps website scores identical to
  the notebook.
- **Thresholds, tier actions, the score label and its meaning come from `model_meta.json`.** Never
  hard-code them. `calibrated` is `false`: the UI calls the score "Priority score" and never shows it
  as a percentage or a "chance of relief".
- `backend/requirements.txt` pins scikit-learn, pandas, numpy, scipy and joblib to
  `artifacts/requirements_model.txt`; a test fails if they drift. Python in the image is 3.13 to match
  `model_meta.json → versions.python`.
- `.gitattributes` keeps `artifacts/**` byte-for-byte (no line-ending conversion). CRLF inside
  `sample_batch.csv` narratives would change narrative lengths and so the scores.
- Every JSON file is validated against a Pydantic schema at startup (`backend/app/schemas.py`); a
  changed export fails loudly at boot instead of on a page. If the notebook adds a field the site
  needs, add it to the schema, then run `npm run gen:types` in `frontend/`.
- `actual_relief` from `test_scored.parquet` is never sent to the browser or exported: a reviewer
  working the queue can't know the outcome.

| File | Used by |
|---|---|
| `model_score.joblib` | scoring (`/api/predict`, `/api/predict/batch`) |
| `model_explain.joblib` | `cinsight_core.explain` only |
| `model_meta.json` | thresholds, tiers, score label/meaning, required columns (`/api/meta`) |
| `kpis`, `outcomes`, `monthly`, `breakdowns`, `high_risk_top` `.json` | Overview (`/api/dashboard/{name}`) |
| `model_comparison`, `test_metrics`, `pr_curve`, `calibration`, `shap_importance` `.json` | Model insights |
| `score_bands.json` | "Similar complaints ended in relief about n in 10" on Score a complaint |
| `form_options.json` | Score form dropdowns, queue filters (`/api/options`) |
| `test_scored.parquet` | High-risk queue (`/api/complaints`, `/api/complaints/export`) |
| `sample_batch.csv` | Batch scoring demo file (`/api/sample-batch`) |

## API (`backend/app/main.py`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | status, model name, versions |
| GET | `/api/meta` | `model_meta.json` |
| GET | `/api/dashboard/{name}` | one of the 10 dashboard files; anything else is 404. `?limit=N` for list files |
| GET | `/api/options` | `form_options.json` |
| POST | `/api/predict` | one complaint (keys = required input columns, values may be null) → score, tier, action, 5 reasons, top words, similar-score band |
| POST | `/api/predict/batch` | the CSV as the raw request body (`Content-Type: text/csv`), read in memory, never written to disk (a multipart upload would spool to disk). 400 names missing columns; 413 over `MAX_UPLOAD_MB` |
| GET | `/api/complaints` | tier, product, company, date_from, date_to, q (ID, company or narrative preview); score-descending; `page_size` ≤ 100 |
| GET | `/api/complaints/export` | same filters, streamed CSV, capped at `EXPORT_MAX_ROWS` (20,000) |
| GET | `/api/sample-batch` | downloads `sample_batch.csv` |

CORS allows `http://localhost:3000`, `https://cinsight.moxs.space`, `https://*.vercel.app` and anything in
`FRONTEND_ORIGINS`.

## Frontend conventions

- API types are generated, never hand-written: `npm run gen:types` (reads the running API's
  `/openapi.json`) → `src/lib/api-types.ts`. Client and query keys live in `src/lib/api.ts`.
- The API address is `NEXT_PUBLIC_API_URL` only. It is inlined at build time, so change it in Vercel and
  redeploy.
- Design tokens (colours, type scale, radii) are in `src/app/globals.css`, mapped from the Figma
  variables. Use tokens (`bg-surface`, `text-ink-3`, `text-13`, `rounded-card`), not raw values. `cn`
  (`src/lib/utils.ts`) is configured to know the numeric font sizes; import it from `@/lib/utils`.
- Every page has loading, empty and "API unreachable" states (`src/components/states.tsx`).
- Accessibility: real buttons/links/labels, no click handlers on divs or spans; selectable table rows use
  a stretched `<button>` in the first cell; wide tables scroll inside a focusable region.
- Next.js 16 differs from older versions; read `frontend/node_modules/next/dist/docs/` before changing
  routing, fonts or data fetching (see `frontend/AGENTS.md`).

### Where the site intentionally differs from the Figma file

- Copy that described the score as a "calibrated chance" or said November "calibrates the scores" is
  replaced with `score_meaning` and accurate wording (the model is not calibrated).
- The SHAP card lists every input group from `shap_importance.json` (including Received month) and reads
  the sample size (200) from the export.
- Search placeholder uses `ink-4` (#939393) instead of #757575, which failed 4.5:1 contrast.
- "Forgot?" and "Request an account" are hidden on sign-in (there is no authentication).
- Menu overlay, avatar popover, empty/error states and hover/focus were not in Figma; they reuse the
  existing tokens.
- Layouts switch to the desktop multi-column arrangement at 1280px; 1024–1279px uses the tablet arrangement
  beside the sidebar, since the fixed 328px side columns don't fit there.

## Running locally

```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt   # macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m uvicorn app.main:app --reload     # http://localhost:8000/docs
.venv/Scripts/python -m pytest                            # 31 tests, incl. notebook parity
cd ../frontend && npm install && cp .env.example .env.local && npm run dev   # http://localhost:3000
```

## Deployment

- **CranL (API)**: build from the repo root `Dockerfile` (python:3.13-slim, copies `backend/` and
  `artifacts/`, runs uvicorn on `0.0.0.0:8000`, `EXPOSE 8000`). Optional env vars: see
  `backend/.env.example`. Check `https://<cranl-host>/api/health` after deploy.
- **Vercel (web)**: import the repo, set **Root Directory** to `frontend`, add
  `NEXT_PUBLIC_API_URL=https://<cranl-host>` (no trailing slash), deploy. Production domain:
  `cinsight.moxs.space`.
- After replacing artifacts: run the backend tests, rebuild the image, and if a schema changed run
  `npm run gen:types` and commit `frontend/src/lib/api-types.ts`.
