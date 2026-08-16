# HSS Central Financial Control — Stage 1 prototype

This is **Stage 1** of the three-stage pathway described in
[`docs/architecture-note.html`](../docs/architecture-note.html) (section 6):

| Stage | What it is | Where |
|---|---|---|
| 0 | A single `.html` test harness that embeds the workbook as JSON and reconciles it against its own pivots | (not in this repo) |
| **1** | **Express.js + SQLite, same JSON shapes as the eventual API, run locally — proves the API contract before Python is written** | **this directory** |
| 2 | React + FastAPI + PostgreSQL on the intranet | future — see section 4 of the architecture note for the target repo shape |

The process is identical across all three stages; only the runtime changes. Stage 1
exists so the router names, JSON field names, rule formulas and exception logic are
already right — and exercised end-to-end over real HTTP and a real (if disposable)
database — before anyone writes a line of FastAPI or SQLAlchemy.

## What's implemented

Every table, rule and route named in the architecture note's section 2 (tab-by-tab
mapping) and section 4 (repo shape), scaled down to SQLite/Express:

- **`src/db/schema.sql`** — one table per source workbook tab: `model_meta`,
  `fy_funding`, `aor` + `aor_fy_allocation`, `commitment` + `milestone`,
  `cost_driver`, `licence_observation`, `actual` (append-only), `exception`
  (derived), `source`, `control_parameter`, `demo_scenario`.
- **`src/rules/`** — `drivers.js` (`requirement = qty × rate × months`),
  `forecast.js` (monthly/FY rollups, variance, pivots), `controls.js`
  (`run_controls()`, the same job named in the note, rewrites the `exception`
  table on every write).
- **`src/routes/`** — one router per FastAPI-router-to-be: `fy`, `forecast`,
  `pivots`, `aor`, `commitments`, `drivers`, `licence`, `actuals`, `exceptions`,
  `health`, `export` — same URL and JSON shapes the Stage 2 backend will expose
  under `/api/v1/*`.
- **`src/lib/xlsxExport.js`** — `GET /export.xlsx` regenerates all 18 tabs from
  the live database, exactly as section 3 of the note describes as the off-ramp.

## Seed data — engineered to match the Stage 0 reconciliation

The seed data in `src/db/seed.js` is not arbitrary: it's built so this prototype's
computed API output reproduces the exact figures the Stage 0 test harness already
proved out (architecture note, section 6):

- FY26 forecast: **130,200** (8-month partial year × 16,275/mo)
- FY27 / FY28 forecast: **195,300** each (12 months × 16,275/mo)
- Monthly run-rate: **16,275** (Azure 9,450 + GitLab Ultimate 2,475 + Jira 2,250 + Confluence 2,100)
- Jira & Confluence driver-vs-source mismatch: **+120** combined
- Exceptions: **5 critical / 2 warning / 5 overdue / 3 mismatch**

`test/reconcile.test.js` asserts all of the above over real HTTP calls, and
`test/controls.test.js` unit-tests the `run_controls()` exception mix directly.

## Running it

```bash
npm install
npm test        # node --test — reconciliation + controls tests
npm start        # serves on http://localhost:4000, seeds data/stage1.sqlite on first run
```

Once running:

```bash
curl http://localhost:4000/health/model
curl http://localhost:4000/api/v1/fy/2026/forecast
curl http://localhost:4000/api/v1/fy/2026/variance
curl http://localhost:4000/api/v1/exceptions
curl -o export.xlsx http://localhost:4000/export.xlsx
```

## What this deliberately does not do

Per the architecture note's own caution: this prototype keeps the workbook out of
the loop entirely and treats SQLite as the source of truth, same as PostgreSQL
will be in Stage 2 — there is no import/export-as-source-of-truth ambiguity here.
It has no auth (Stage 2's SSO/role model is stubbed out — every route accepts any
caller), no `import_spec.json`/xlsx importer (only the export direction is built,
since Stage 1's job is to prove the read/write/rules contract, not the workbook
migration path), and the four business-definition exceptions (EXC-001..004) are
deliberately left open in the seed data, exactly as section 7 of the note argues
they should be: the schema holds the column, the humans still have to decide the
policy.
