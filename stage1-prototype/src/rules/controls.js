// 10_Exceptions rule: run_controls() recomputes exceptions from current
// state on every write and (in production) nightly.
//
// The real workbook curates 10_Exceptions to ONE representative row per
// issue category — not one row per offending record (e.g. EXC-001 flags
// "FY26 finance allocation missing" even though FY27/28 are also
// unallocated; EXC-002 flags AOR-REC-001 specifically, not every AOR
// missing an official reference). This module reproduces that curation
// rather than generating a row per violation.
//
// Two counts reported alongside the exception table are NOT rows in it —
// they're live counts against the underlying registers, exactly as the
// workbook's own dashboard computes them:
//   overdue  = COUNT(licence_observation WHERE status = 'OVERDUE')
//   mismatch = COUNT(cost_driver rows WHERE Driver vs Source != 0)

const { sourceMismatch } = require('./drivers');

const HEADLINE_FY = 2026; // EXC-001 object = 'FY26' in the source workbook
const HEADLINE_AOR = 'AOR-REC-001'; // EXC-002 object
const HEADLINE_COMMITMENT = 'COM-001'; // EXC-003 / EXC-007 object

function runControls(db) {
  const insert = db.prepare(
    `INSERT INTO exception (code, severity, category, owner, where_to_fix, related_table, related_id, detail)
     VALUES (@code, @severity, @category, @owner, @where_to_fix, @related_table, @related_id, @detail)`
  );

  const write = db.transaction(() => {
    db.exec(`DELETE FROM exception`);

    // EXC-001: Finance allocation missing (headline FY)
    const funding = db.prepare(`SELECT * FROM fy_funding WHERE fy = ?`).get(HEADLINE_FY);
    if (funding && funding.finance_allocation == null) {
      insert.run({
        code: 'EXC-001',
        severity: 'critical',
        category: 'funding',
        owner: 'Finance / Product Ops',
        where_to_fix: '02_FY_Position!C6',
        related_table: 'fy_funding',
        related_id: funding.id,
        detail: `Finance allocation missing (FY${HEADLINE_FY - 2000})`,
      });
    }

    // EXC-002: AOR official reference / FY split incomplete (headline AOR)
    const aor = db.prepare(`SELECT * FROM aor WHERE record_id = ?`).get(HEADLINE_AOR);
    if (aor && (aor.official_ref == null || aor.official_ref === 'TBC')) {
      insert.run({
        code: 'EXC-002',
        severity: 'critical',
        category: 'aor',
        owner: 'BA / Finance',
        where_to_fix: '03_AOR_Register',
        related_table: 'aor',
        related_id: aor.id,
        detail: `AOR official reference / FY split incomplete (${HEADLINE_AOR})`,
      });
    }

    // EXC-003: PO not mapped to an AOR (headline commitment)
    const headlineCommitment = db.prepare(`SELECT * FROM commitment WHERE commitment_id = ?`).get(HEADLINE_COMMITMENT);
    if (headlineCommitment && (headlineCommitment.aor_record_id == null || headlineCommitment.aor_record_id === 'TBC')) {
      insert.run({
        code: 'EXC-003',
        severity: 'critical',
        category: 'commitment',
        owner: 'Commercial / BA',
        where_to_fix: '04_PO_Commitments!B6:F6',
        related_table: 'commitment',
        related_id: headlineCommitment.id,
        detail: `${HEADLINE_COMMITMENT} not mapped to an AOR`,
      });
    }

    // EXC-004: actual spend recognition point unresolved (workbook-wide)
    const unresolvedActual = db
      .prepare(`SELECT * FROM actual WHERE recognition_basis IS NULL OR recognition_basis = 'TBC' LIMIT 1`)
      .get();
    if (unresolvedActual) {
      insert.run({
        code: 'EXC-004',
        severity: 'critical',
        category: 'definition',
        owner: 'Finance / BA',
        where_to_fix: '07_Actuals!K6:K25',
        related_table: 'actual',
        related_id: null,
        detail: 'Actual Spend recognition point unresolved (workbook-wide)',
      });
    }

    // EXC-007: milestone schedule incomplete (headline commitment)
    if (headlineCommitment) {
      const incompleteMilestone = db
        .prepare(
          `SELECT * FROM milestone
           WHERE commitment_id = ? AND (planned_amount IS NULL OR planned_date IS NULL)
           LIMIT 1`
        )
        .get(headlineCommitment.id);
      if (incompleteMilestone) {
        insert.run({
          code: 'EXC-007',
          severity: 'critical',
          category: 'commitment',
          owner: 'Product Ops / Commercial',
          where_to_fix: '04_PO_Commitments!O6:V12',
          related_table: 'commitment',
          related_id: headlineCommitment.id,
          detail: `${HEADLINE_COMMITMENT} milestone schedule incomplete`,
        });
      }
    }

    // EXC-005: driver differs from source plan (single warning, any FY)
    const mismatchedDriver = db
      .prepare(`SELECT * FROM cost_driver ORDER BY fy, name`)
      .all()
      .find((d) => sourceMismatch(d) !== 0);
    if (mismatchedDriver) {
      insert.run({
        code: 'EXC-005',
        severity: 'warning',
        category: 'driver',
        owner: 'Product Ops / BA',
        where_to_fix: '05_Cost_Drivers',
        related_table: 'cost_driver',
        related_id: mismatchedDriver.id,
        detail: `${mismatchedDriver.name} driver differs from source plan (FY26-FY28)`,
      });
    }

    // EXC-006: monthly licence confirmation overdue (single warning)
    const anyOverdue = db.prepare(`SELECT 1 FROM licence_observation WHERE status = 'OVERDUE' LIMIT 1`).get();
    if (anyOverdue) {
      insert.run({
        code: 'EXC-006',
        severity: 'warning',
        category: 'timeliness',
        owner: 'Operational owner',
        where_to_fix: '06_Licence_Checks',
        related_table: 'licence_observation',
        related_id: null,
        detail: 'Monthly licence confirmation overdue',
      });
    }
  });

  write();
  return listExceptions(db);
}

function listExceptions(db) {
  return db.prepare(`SELECT * FROM exception ORDER BY severity DESC, id`).all();
}

function overdueCount(db) {
  return db.prepare(`SELECT COUNT(*) AS n FROM licence_observation WHERE status = 'OVERDUE'`).get().n;
}

function mismatchCount(db) {
  const drivers = db.prepare(`SELECT * FROM cost_driver`).all();
  return drivers.filter((d) => sourceMismatch(d) !== 0).length;
}

function exceptionCounts(db) {
  const items = listExceptions(db);
  return {
    critical: items.filter((i) => i.severity === 'critical').length,
    warning: items.filter((i) => i.severity === 'warning').length,
    overdue: overdueCount(db),
    mismatch: mismatchCount(db),
  };
}

module.exports = { runControls, listExceptions, exceptionCounts, overdueCount, mismatchCount };
