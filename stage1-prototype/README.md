# HSS Central Financial Control — Stage 1 prototype

This is **Stage 1** of the three-stage pathway described in
[`docs/architecture-note.html`](../docs/architecture-note.html) (section 6):

| Stage | What it is | Where |
|---|---|---|
| 0 | A single `.html` test harness that embeds the real workbook as JSON and reconciles it against its own pivots | [`stage0-test-harness/`](../stage0-test-harness/) |
| **1** | **Express.js + SQLite, same JSON shapes as the eventual API, run locally — proves the API contract before Python is written** | **this directory** |
| 2 | React + FastAPI + PostgreSQL on the intranet | future — see section 4 of the architecture note for the target repo shape |

Stage 1's seed data (`src/db/seed.js`) is ported directly from the real Stage 0
harness's embedded seed JSON — not fabricated. Every AOR, commitment, cost
driver, licence-check row and exception in this prototype traces back to a
cell in `stage0-test-harness/index.html`.

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
  (derived), `source` (the 14_Sources provenance log — informational, not
  joined into the variance calculation), `control_parameter`, `demo_scenario`.
- **`src/rules/`** — `drivers.js` (`requirement = qty × rate × months`; the
  driver-vs-source mismatch is `requirement − cost_driver.source_planned_cost`,
  a second dollar figure carried on the same row, matching how the real
  workbook does it — no separate source-system join), `forecast.js`
  (monthly/FY rollups, variance, pivots), `controls.js` (`run_controls()`,
  the same job named in the note, rewrites the `exception` table on every
  write using the real workbook's **curation** model — see below).
- **`src/routes/`** — one router per FastAPI-router-to-be: `fy`, `forecast`,
  `pivots`, `aor`, `commitments`, `drivers`, `licence`, `actuals`, `exceptions`,
  `health`, `export` — same URL and JSON shapes the Stage 2 backend will expose
  under `/api/v1/*`.
- **`src/lib/xlsxExport.js`** — `GET /export.xlsx` regenerates all 18 tabs from
  the live database, exactly as section 3 of the note describes as the off-ramp.

## Seed data — ported from the real Stage 0 harness

The seed data in `src/db/seed.js` reproduces the exact figures already in
`stage0-test-harness/index.html`'s embedded snapshot (as of 2026-08-15, SGD,
FY basis 1 April–31 March):

- FY26 forecast: **130,200** (8-month partial year, monitoring starts Aug 2026, × 16,275/mo)
- FY27 / FY28 forecast: **195,300** each (12 months × 16,275/mo)
- Monthly run-rate: **16,275** (Atlassian Dedicated Site 800 + GitLab Ultimate 2,500 + Jira & Confluence 600 + Jira Service Management 12,375 + SonarQube Community 0)
- "Jira & Confluence" driver-vs-source mismatch: **+120** (FY26), **+180** (FY27, FY28)
- Exceptions: **5 critical / 2 warning / 5 overdue / 3 mismatch**

The exception model matches the real workbook's own curation: `10_Exceptions`
holds exactly 7 rows — one representative row per issue category (EXC-001
Finance allocation/FY26, EXC-002 AOR reference/AOR-REC-001, EXC-003 PO→AOR
mapping/COM-001, EXC-004 recognition point/workbook-wide, EXC-005 driver
mismatch, EXC-006 overdue licence checks, EXC-007 milestone schedule/COM-001)
— not one row per offending record. "5 overdue" and "3 mismatch" are **live
counts** against `licence_observation`/`cost_driver` directly, the same way
the workbook's own dashboard computes them, not rows in the exception table.

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
caller), no xlsx importer (only the export direction is built, since Stage 1's
job is to prove the read/write/rules contract, not the workbook migration path
— `stage0-test-harness/import_spec.json` is the spec that direction would use),
and the critical exceptions (EXC-001/002/003/004/007) are deliberately left open
in the seed data, exactly as section 7 of the note argues they should be: the
schema holds the column, the humans still have to decide the policy.
