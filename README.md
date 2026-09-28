# Cinsight

Cinsight predicts whether a CFPB consumer complaint will end in **relief** (the company gave monetary or
non-monetary relief), so a customer-service team can review the likely ones first.

The model was trained in `Cinsight.ipynb`. The website has two parts that run side by side:

- **The API** (`backend/`, Python): loads the trained model from `artifacts/` and scores complaints.
- **The website** (`frontend/`, Next.js): the pages you click through. It asks the API for everything.

You need both running to use the site on your computer.

---

## 1. Install these once

| Tool | Why | Get it |
|---|---|---|
| **Git** | to download the project | <https://git-scm.com/downloads> |
| **Python 3.13** (3.12 also works) | runs the API | <https://www.python.org/downloads/> — on Windows, tick **"Add python.exe to PATH"** in the installer |
| **Node.js 20 LTS or newer** | runs the website | <https://nodejs.org> — pick the **LTS** button |

Check they work: open a terminal (Windows: **PowerShell**; macOS: **Terminal**) and run each line. Each should print a version number.

```bash
git --version
python --version
node --version
```

On macOS, if `python` isn't found, use `python3` everywhere below.

## 2. Download the project

```bash
git clone https://github.com/kya6/Cinsight.git
cd Cinsight
```

## 3. Start the API (terminal 1)

The first time, create a private Python environment and install what the API needs (takes a few minutes):

**Windows (PowerShell)**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
```

**macOS**

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

Then start it (do this every time):

- Windows: `.venv\Scripts\python -m uvicorn app.main:app --reload`
- macOS: `.venv/bin/python -m uvicorn app.main:app --reload`

Wait for `Application startup complete`. Leave this terminal open. You can check it at
<http://localhost:8000/api/health> — it should show `"status":"ok"`. <http://localhost:8000/docs> lists
every endpoint and lets you try them.

## 4. Start the website (terminal 2)

Open a **second** terminal in the `Cinsight` folder.

The first time, install the website's packages and create its settings file:

**Windows (PowerShell)**

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
```

**macOS**

```bash
cd frontend
npm install
cp .env.example .env.local
```

`.env.local` tells the website where the API is (`http://localhost:8000`). You don't need to edit it.

Then start it (every time):

```bash
npm run dev
```

Open <http://localhost:3000>. Press **Sign in** (there's no real login — any or no details work).

To stop either part, click its terminal and press **Ctrl + C**.

## Next time

Only the "start" commands are needed: `uvicorn …` in `backend/` and `npm run dev` in `frontend/`.
After pulling new changes, re-run `pip install -r requirements-dev.txt` and `npm install` once in case
something new was added.

---

## The pages

| Page | What it's for |
|---|---|
| **Overview** | complaint volume, outcomes, how December was split into tiers, the top-scoring complaints |
| **Score a complaint** | fill in one complaint and see its priority score, tier and why |
| **High-risk queue** | every scored December complaint, filtered and ranked, with the reasons for each |
| **Batch scoring** | upload a CSV and download it back with a score for every row (try *Download sample file*) |
| **Model insights** | how well the model did on December and what drives the score |

The score is a **priority score** from 0 to 1, not a probability: use it to decide what to review first.

## When something goes wrong

| You see | Try |
|---|---|
| **"Can't reach the Cinsight API"** on a page | The API isn't running — start it (step 3). If it is running, check `frontend/.env.local` says `NEXT_PUBLIC_API_URL=http://localhost:8000`, then restart `npm run dev`. |
| `python` / `npm` is not recognized | Install Python / Node.js (step 1), then close and reopen the terminal. |
| `pip install` fails on scikit-learn or numpy | Use Python 3.12 or 3.13 — older or newer versions may not have the pinned packages. |
| `address already in use` / port 3000 or 8000 busy | An old copy is still running in another terminal. Stop it with Ctrl + C, or restart your computer. |
| The website looks unstyled right after `npm run dev` | Wait a few seconds and refresh — the first load in development compiles the page. |

## Running the tests

In `backend/` (with the API environment from step 3):

- Windows: `.venv\Scripts\python -m pytest`
- macOS: `.venv/bin/python -m pytest`

They check, among other things, that the API gives **exactly the same scores, tiers and reasons as the
notebook** for every row of `sample_batch.csv`.

## Updating the model

1. Re-run the notebook's export section and replace the files in `artifacts/` (don't edit them by hand).
2. Run the tests above.
3. If the notebook changed the shape of a JSON file, update `backend/app/schemas.py`, start the API, and
   in `frontend/` run `npm run gen:types` so the website's types match.
4. Commit and push — CranL and Vercel redeploy from GitHub.

## Project layout

```
artifacts/   everything the notebook exported (model, dashboard data, cinsight_core.py) — read-only for the site
backend/     FastAPI app (app/) and its tests (tests/)
frontend/    Next.js website (src/app = pages, src/components = shared pieces)
Dockerfile   builds the API image for CranL
Cinsight.ipynb  the notebook that trained the model
```

## Deploying

- **API → CranL**: point CranL at this repo; it builds the root `Dockerfile` (port 8000).
- **Website → Vercel**: import the repo, set **Root Directory** to `frontend`, and add the environment
  variable `NEXT_PUBLIC_API_URL` = your CranL URL (no trailing slash).
