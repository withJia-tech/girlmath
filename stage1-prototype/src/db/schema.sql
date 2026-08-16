-- HSS Central Financial Control — Stage 1 prototype schema
-- One table per source workbook tab (see docs/architecture-note.html section 2).
PRAGMA foreign_keys = ON;

-- 00_Cover
CREATE TABLE model_meta (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  version       TEXT NOT NULL,
  as_of_date    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'REVIEW',
  currency      TEXT NOT NULL DEFAULT 'USD',
  fy_basis      TEXT NOT NULL
);

-- 02_FY_Position
CREATE TABLE fy_funding (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  fy                  INTEGER NOT NULL UNIQUE,
  requested_amount    REAL NOT NULL,
  finance_allocation  REAL -- nullable: Finance has not yet allocated (EXC-001)
);

-- 03_AOR_Register
CREATE TABLE aor (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  official_ref  TEXT, -- nullable: not yet issued by Finance (EXC-002)
  description   TEXT
);

CREATE TABLE aor_fy_allocation (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  aor_id            INTEGER NOT NULL REFERENCES aor(id),
  fy                INTEGER NOT NULL,
  allocated_amount  REAL NOT NULL,
  UNIQUE (aor_id, fy)
);

-- 14_Sources
CREATE TABLE source (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  system        TEXT NOT NULL,
  reported_qty  REAL NOT NULL
);

-- 04_PO_Commitments
CREATE TABLE commitment (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  po_ref          TEXT NOT NULL UNIQUE,
  aor_id          INTEGER REFERENCES aor(id), -- nullable: unmapped PO (EXC-003)
  ceiling_amount  REAL NOT NULL,
  vendor          TEXT NOT NULL
);

CREATE TABLE milestone (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  commitment_id   INTEGER NOT NULL REFERENCES commitment(id),
  planned_amount  REAL NOT NULL,
  planned_date    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Planned'
);

-- 05_Cost_Drivers
CREATE TABLE cost_driver (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  source_id   INTEGER NOT NULL REFERENCES source(id),
  qty         REAL NOT NULL,
  rate        REAL NOT NULL,
  months      INTEGER NOT NULL,
  fy          INTEGER NOT NULL,
  UNIQUE (name, fy)
);

-- 06_Licence_Checks
CREATE TABLE licence_observation (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cost_driver_id  INTEGER NOT NULL REFERENCES cost_driver(id),
  period          TEXT NOT NULL, -- 'YYYY-MM'
  confirmed_qty   REAL,
  evidence_ref    TEXT,
  confirmed_by    TEXT,
  confirmed_at    TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | CONFIRMED | OVERDUE
  UNIQUE (cost_driver_id, period)
);

-- 07_Actuals (append-only)
CREATE TABLE actual (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  aor_id              INTEGER NOT NULL REFERENCES aor(id),
  source_id           INTEGER REFERENCES source(id),
  amount              REAL NOT NULL,
  period              TEXT NOT NULL,
  recognition_basis   TEXT, -- nullable: recognition point not yet decided (EXC-004)
  status              TEXT NOT NULL DEFAULT 'Recognised', -- Recognised | Pending
  invoice_ref         TEXT,
  reversal_of_id      INTEGER REFERENCES actual(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, invoice_ref)
);

-- 10_Exceptions (derived — rewritten by rules/controls.js::runControls on every write)
CREATE TABLE exception (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL,
  severity        TEXT NOT NULL, -- critical | warning
  category        TEXT NOT NULL, -- business-definition | utilisation | overdue | mismatch
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
  description  TEXT NOT NULL,
  status       TEXT NOT NULL -- Passing | Blocked
);
