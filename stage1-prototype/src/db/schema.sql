-- HSS Central Financial Control — Stage 1 prototype schema
-- One table per source workbook tab (see docs/architecture-note.html section 2
-- and the real Stage 0 harness at stage0-test-harness/index.html, whose
-- embedded seed JSON is the ground truth this schema is shaped around).
PRAGMA foreign_keys = ON;

-- 00_Cover
CREATE TABLE model_meta (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  version       TEXT NOT NULL,
  as_of_date    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'REVIEW',
  currency      TEXT NOT NULL DEFAULT 'SGD',
  fy_basis      TEXT NOT NULL
);

-- 02_FY_Position
CREATE TABLE fy_funding (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  fy                  INTEGER NOT NULL UNIQUE,
  requested_amount    REAL, -- nullable: not yet submitted (real data: null for FY26-28)
  finance_allocation  REAL  -- nullable: Finance has not yet allocated (EXC-001)
);

-- 03_AOR_Register
CREATE TABLE aor (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id     TEXT NOT NULL UNIQUE, -- e.g. 'AOR-REC-001'
  official_ref  TEXT,                 -- 'TBC' or NULL: not yet issued by Finance (EXC-002)
  description   TEXT,
  base_amount   REAL,
  contingency   REAL,
  valid_from    TEXT,
  valid_to      TEXT
);

CREATE TABLE aor_fy_allocation (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  aor_id            INTEGER NOT NULL REFERENCES aor(id),
  fy                INTEGER NOT NULL,
  allocated_amount  REAL, -- nullable: real data has no FY splits entered yet
  UNIQUE (aor_id, fy)
);

-- 14_Sources: a provenance log (where a figure came from), not a lookup
-- joined into the variance calculation — the real workbook keeps these
-- entirely separate (cost_driver.source_ref is an informal citation code
-- that doesn't even resolve to a row here).
CREATE TABLE source (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_ref    TEXT NOT NULL UNIQUE, -- 'SRC-REF-001'
  item          TEXT NOT NULL,
  source_role   TEXT NOT NULL,
  source_name   TEXT NOT NULL,
  section_ref   TEXT,
  value_use     TEXT,
  owner         TEXT,
  as_of         TEXT,
  status        TEXT,
  notes         TEXT,
  location      TEXT
);

-- 04_PO_Commitments
CREATE TABLE commitment (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  commitment_id   TEXT NOT NULL UNIQUE, -- 'COM-001'
  po_ref          TEXT,                 -- nullable/'TBC': no official PO reference yet
  fy              INTEGER NOT NULL,
  supplier        TEXT,
  cost_stream     TEXT NOT NULL,
  aor_record_id   TEXT,                 -- free text, not FK: real data has all POs pointing at 'TBC'
  description     TEXT,
  start_date      TEXT,
  end_date        TEXT,
  ceiling_amount  REAL,
  status          TEXT NOT NULL DEFAULT 'Draft'
);

CREATE TABLE milestone (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id      TEXT NOT NULL UNIQUE, -- 'MS-001'
  commitment_id     INTEGER NOT NULL REFERENCES commitment(id),
  planned_date      TEXT,   -- nullable: real data has no milestone schedule entered (EXC-007)
  planned_amount    REAL,   -- nullable
  recognised_actual REAL,
  status            TEXT NOT NULL DEFAULT 'Pending',
  fy                INTEGER,
  source_evidence   TEXT
);

-- 05_Cost_Drivers
CREATE TABLE cost_driver (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id             TEXT NOT NULL UNIQUE, -- 'DRV-001'
  fy                    INTEGER NOT NULL,
  cost_area             TEXT NOT NULL,
  cost_stream           TEXT NOT NULL,
  name                  TEXT NOT NULL,        -- Cost Item, e.g. 'Jira & Confluence'
  driver_type           TEXT NOT NULL,
  qty                   REAL NOT NULL,
  rate                  REAL NOT NULL,
  months                INTEGER NOT NULL,
  source_planned_cost   REAL NOT NULL,        -- independently-sourced plan; diff vs qty*rate*months is the mismatch
  aor_record_id         TEXT,
  po_ref                TEXT,
  source_ref            TEXT,                 -- informal citation, e.g. 'SRC-JIRA-FY26' (not an FK)
  status                TEXT,
  UNIQUE (name, fy)
);

-- 06_Licence_Checks
CREATE TABLE licence_observation (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id    TEXT NOT NULL UNIQUE, -- 'OBS-0001'
  cost_driver_id    INTEGER NOT NULL REFERENCES cost_driver(id),
  fy                INTEGER NOT NULL,
  period            TEXT NOT NULL, -- reporting month 'YYYY-MM'
  planned_qty       REAL,
  confirmed_qty     REAL,          -- nullable: nothing has ever been confirmed in the real data
  due_date          TEXT NOT NULL,
  confirmed_date    TEXT,
  confirmed_by      TEXT,
  source_reference  TEXT,
  status            TEXT NOT NULL DEFAULT 'DUE', -- DUE | OVERDUE | CONFIRMED
  UNIQUE (cost_driver_id, period)
);

-- 07_Actuals (append-only)
CREATE TABLE actual (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  actual_id           TEXT NOT NULL UNIQUE, -- 'ACT-001'
  transaction_date    TEXT,
  fy                  INTEGER,
  reporting_month     TEXT,
  cost_item           TEXT,
  aor_record_id       TEXT,
  commitment_id       TEXT,
  invoice_ref         TEXT,
  do_ref              TEXT,
  gr_status           TEXT NOT NULL DEFAULT 'Pending',
  recognition_basis   TEXT NOT NULL DEFAULT 'TBC', -- EXC-004: canonical recognition point not yet decided
  gross_amount        REAL,
  recognised_amount   REAL NOT NULL DEFAULT 0,
  source_ref          TEXT,
  owner               TEXT,
  status              TEXT NOT NULL DEFAULT 'Draft',
  notes               TEXT,
  reversal_of_id      INTEGER REFERENCES actual(id),
  UNIQUE (source_ref, invoice_ref)
);

-- 10_Exceptions (derived — rewritten by rules/controls.js::runControls on
-- every write). The real workbook curates this to one representative row
-- per issue, not one row per offending record — see rules/controls.js.
CREATE TABLE exception (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL,
  severity        TEXT NOT NULL, -- critical | warning
  category        TEXT NOT NULL, -- funding | aor | commitment | definition | driver | timeliness
  owner           TEXT NOT NULL,
  where_to_fix    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'OPEN',
  related_table   TEXT NOT NULL,
  related_id      INTEGER,
  detail          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 16_Lookups
CREATE TABLE control_parameter (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- 17_Demo_Scenarios
CREATE TABLE demo_scenario (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  input        TEXT,
  expected_rule TEXT,
  expected_result TEXT,
  live         TEXT NOT NULL DEFAULT 'No',
  owner        TEXT,
  status       TEXT NOT NULL, -- Ready | Designed | Blocked
  notes        TEXT
);
