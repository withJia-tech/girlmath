// 10_Exceptions rule: run_controls() recomputes every exception from current
// state on every write and (in production) nightly. It is idempotent: the
// exception table is derived data, so each run clears and rewrites it rather
// than trying to diff against the previous run.
//
// Exceptions bucket into four groups for reporting (GET /api/v1/exceptions):
//   critical / warning  -- from `severity`, for business-definition and
//                           utilisation-threshold exceptions
//   overdue / mismatch  -- from `category`, reported as their own bucket
//                           regardless of severity
//
// Business-definition checks (EXC-001..004) only ever look at the *current*
// operating FY — the workbook has no attribution rule for pushing them
// across years, and neither does this prototype (see the "Cross-FY" demo
// scenario, status Blocked).

const { sourceMismatch } = require('./drivers');
const { driversForFy } = require('./forecast');

const CURRENT_FY = 2026; // contains model_meta.as_of_date (2026-08-16)

function runControls(db) {
  const insert = db.prepare(
    `INSERT INTO exception (code, severity, category, owner, where_to_fix, related_table, related_id, detail)
     VALUES (@code, @severity, @category, @owner, @where_to_fix, @related_table, @related_id, @detail)`
  );

  const write = db.transaction(() => {
    db.exec(`DELETE FROM exception`);

    // EXC-001: Finance allocation missing
    for (const row of db.prepare(`SELECT * FROM fy_funding WHERE finance_allocation IS NULL`).all()) {
      insert.run({
        code: 'EXC-001',
        severity: 'critical',
        category: 'business-definition',
        owner: 'Finance',
        where_to_fix: 'fy_funding.finance_allocation',
        related_table: 'fy_funding',
        related_id: row.id,
        detail: `FY${row.fy} finance allocation has not been set`,
      });
    }

    // EXC-002: official AOR reference missing
    for (const row of db.prepare(`SELECT * FROM aor WHERE official_ref IS NULL`).all()) {
      insert.run({
        code: 'EXC-002',
        severity: 'critical',
        category: 'business-definition',
        owner: 'Finance',
        where_to_fix: 'aor.official_ref',
        related_table: 'aor',
        related_id: row.id,
        detail: `AOR "${row.name}" has no official reference issued`,
      });
    }

    // EXC-003: PO not mapped to an AOR
    for (const row of db.prepare(`SELECT * FROM commitment WHERE aor_id IS NULL`).all()) {
      insert.run({
        code: 'EXC-003',
        severity: 'critical',
        category: 'business-definition',
        owner: 'Commercial',
        where_to_fix: 'commitment.aor_id',
        related_table: 'commitment',
        related_id: row.id,
        detail: `${row.po_ref} (${row.vendor}) is not mapped to an AOR`,
      });
    }

    // EXC-004: actual spend recognition point undecided
    for (const row of db.prepare(`SELECT * FROM actual WHERE recognition_basis IS NULL`).all()) {
      insert.run({
        code: 'EXC-004',
        severity: 'critical',
        category: 'business-definition',
        owner: 'Finance',
        where_to_fix: 'actual.recognition_basis',
        related_table: 'actual',
        related_id: row.id,
        detail: `Actual ${row.invoice_ref || row.id} has no recognition basis`,
      });
    }

    // Utilisation warning/critical: confirmed licence qty vs driver baseline
    const warnThreshold = Number(
      db.prepare(`SELECT value FROM control_parameter WHERE key = 'utilisation_warn'`).get().value
    );
    const critThreshold = Number(
      db.prepare(`SELECT value FROM control_parameter WHERE key = 'utilisation_crit'`).get().value
    );
    const confirmed = db
      .prepare(
        `SELECT licence_observation.*, cost_driver.name AS driver_name, cost_driver.qty AS driver_qty
         FROM licence_observation
         JOIN cost_driver ON cost_driver.id = licence_observation.cost_driver_id
         WHERE licence_observation.status = 'CONFIRMED' AND licence_observation.confirmed_qty IS NOT NULL`
      )
      .all();
    for (const row of confirmed) {
      const utilisation = row.confirmed_qty / row.driver_qty;
      if (utilisation >= critThreshold) {
        insert.run({
          code: 'EXC-006',
          severity: 'critical',
          category: 'utilisation',
          owner: 'Ops owner',
          where_to_fix: 'cost_driver.qty (raise purchased capacity or confirm usage reduction)',
          related_table: 'licence_observation',
          related_id: row.id,
          detail: `${row.driver_name} ${row.period}: confirmed ${row.confirmed_qty}/${row.driver_qty} (${(utilisation * 100).toFixed(1)}%)`,
        });
      } else if (utilisation >= warnThreshold) {
        insert.run({
          code: 'EXC-007',
          severity: 'warning',
          category: 'utilisation',
          owner: 'Ops owner',
          where_to_fix: 'cost_driver.qty (monitor, approaching purchased capacity)',
          related_table: 'licence_observation',
          related_id: row.id,
          detail: `${row.driver_name} ${row.period}: confirmed ${row.confirmed_qty}/${row.driver_qty} (${(utilisation * 100).toFixed(1)}%)`,
        });
      }
    }

    // Overdue: licence period not confirmed by the deadline day
    const overdue = db
      .prepare(
        `SELECT licence_observation.*, cost_driver.name AS driver_name
         FROM licence_observation
         JOIN cost_driver ON cost_driver.id = licence_observation.cost_driver_id
         WHERE licence_observation.status = 'OVERDUE'`
      )
      .all();
    for (const row of overdue) {
      insert.run({
        code: 'EXC-008',
        severity: 'warning',
        category: 'overdue',
        owner: 'Ops owner',
        where_to_fix: 'licence_observation.confirmed_qty',
        related_table: 'licence_observation',
        related_id: row.id,
        detail: `${row.driver_name} ${row.period}: not confirmed`,
      });
    }

    // Mismatch: driver baseline vs source-reported qty, current FY only
    for (const driver of driversForFy(db, CURRENT_FY)) {
      const { diffQty, amount } = sourceMismatch(driver, { reported_qty: driver.source_reported_qty });
      if (diffQty !== 0) {
        insert.run({
          code: 'EXC-005',
          severity: 'warning',
          category: 'mismatch',
          owner: 'BA',
          where_to_fix: 'cost_driver vs source reconciliation',
          related_table: 'cost_driver',
          related_id: driver.id,
          detail: `${driver.name}: source reports ${driver.source_reported_qty}, driver confirmed ${driver.qty} (diff ${diffQty}, $${amount})`,
        });
      }
    }
  });

  write();
  return listExceptions(db);
}

function listExceptions(db) {
  return db.prepare(`SELECT * FROM exception ORDER BY severity DESC, id`).all();
}

function bucketOf(exception) {
  if (exception.category === 'overdue') return 'overdue';
  if (exception.category === 'mismatch') return 'mismatch';
  return exception.severity; // 'critical' | 'warning'
}

function exceptionCounts(db) {
  const counts = { critical: 0, warning: 0, overdue: 0, mismatch: 0 };
  for (const row of listExceptions(db)) {
    counts[bucketOf(row)] += 1;
  }
  return counts;
}

module.exports = { runControls, listExceptions, exceptionCounts, bucketOf, CURRENT_FY };
