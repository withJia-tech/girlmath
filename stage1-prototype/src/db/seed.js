// Seed data engineered so the API's computed outputs reproduce the figures
// already cited by the Stage 0 test harness (see docs/architecture-note.html
// section 6): FY26 forecast 130200, FY27/28 forecast 195300 each, monthly
// run-rate 16275, Jira & Confluence driver mismatch +120, and exceptions
// 5 critical / 2 warning / 5 overdue / 3 mismatches.
//
// Monthly driver run-rate (16275 = 9450 + 2475 + 2250 + 2100):
//   Azure Cloud Infrastructure   qty=1   rate=9450  -> 9450/mo
//   GitLab Ultimate              qty=45  rate=55    -> 2475/mo
//   Jira                         qty=150 rate=15    -> 2250/mo
//   Confluence                   qty=175 rate=12    -> 2100/mo
// FY26 is an 8-month partial year (program starts May 2026): 16275*8 = 130200
// FY27/FY28 are full 12-month years: 16275*12 = 195300 each

const { FY_MONTHS } = require('../rules/fyCalendar');

function seed(db) {
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO model_meta (id, version, as_of_date, status, currency, fy_basis)
       VALUES (1, ?, ?, ?, ?, ?)`
    ).run('0.1.0-stage1', '2026-08-16', 'REVIEW', 'USD', 'Calendar year (FY26 partial: May-Dec 2026)');

    const fundingStmt = db.prepare(
      `INSERT INTO fy_funding (fy, requested_amount, finance_allocation) VALUES (?, ?, ?)`
    );
    fundingStmt.run(2026, 130200, null); // EXC-001: Finance has not yet allocated FY26
    fundingStmt.run(2027, 195300, 195300);
    fundingStmt.run(2028, 195300, 195300);

    const aorStmt = db.prepare(
      `INSERT INTO aor (name, official_ref, description) VALUES (?, ?, ?)`
    );
    const aorTooling = aorStmt.run(
      'Platform Engineering Tooling',
      null, // EXC-002: official AOR reference not yet issued
      'GitLab, Jira and Confluence seat licensing for the engineering platform'
    ).lastInsertRowid;
    const aorCloud = aorStmt.run(
      'Cloud Infrastructure & Hosting',
      'GSIB-AOR-2026-014',
      'Azure subscription hosting production and non-production workloads'
    ).lastInsertRowid;

    const allocStmt = db.prepare(
      `INSERT INTO aor_fy_allocation (aor_id, fy, allocated_amount) VALUES (?, ?, ?)`
    );
    const toolingMonthly = 2475 + 2250 + 2100; // 6825
    const cloudMonthly = 9450;
    for (const [fy, months] of Object.entries(FY_MONTHS)) {
      allocStmt.run(aorTooling, Number(fy), toolingMonthly * months);
      allocStmt.run(aorCloud, Number(fy), cloudMonthly * months);
    }

    const sourceStmt = db.prepare(
      `INSERT INTO source (name, system, reported_qty) VALUES (?, ?, ?)`
    );
    const srcAzure = sourceStmt.run('Azure subscription meter', 'Azure', 1).lastInsertRowid;
    const srcGitlab = sourceStmt.run('GitLab seat portal', 'GitLab', 47).lastInsertRowid; // driver qty 45 -> +2 seats = $110 mismatch
    const srcJira = sourceStmt.run('Atlassian licence portal (Jira)', 'Jira', 154).lastInsertRowid; // driver qty 150 -> +4 seats = $60 mismatch
    const srcConfluence = sourceStmt.run('Atlassian licence portal (Confluence)', 'Confluence', 180).lastInsertRowid; // driver qty 175 -> +5 seats = $60 mismatch

    const driverStmt = db.prepare(
      `INSERT INTO cost_driver (name, source_id, qty, rate, months, fy) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const driverIds = { azure: {}, gitlab: {}, jira: {}, confluence: {} };
    for (const [fy, months] of Object.entries(FY_MONTHS)) {
      driverIds.azure[fy] = driverStmt.run('Azure Cloud Infrastructure', srcAzure, 1, 9450, months, Number(fy)).lastInsertRowid;
      driverIds.gitlab[fy] = driverStmt.run('GitLab Ultimate', srcGitlab, 45, 55, months, Number(fy)).lastInsertRowid;
      driverIds.jira[fy] = driverStmt.run('Jira', srcJira, 150, 15, months, Number(fy)).lastInsertRowid;
      driverIds.confluence[fy] = driverStmt.run('Confluence', srcConfluence, 175, 12, months, Number(fy)).lastInsertRowid;
    }

    // Licence checks — only the FY26 driver rows have observations, since the
    // as-of date (2026-08-16) sits inside FY26. Engineered to produce exactly
    // 2 warning, 1 critical (utilisation) and 5 overdue exceptions.
    const licStmt = db.prepare(
      `INSERT INTO licence_observation
         (cost_driver_id, period, confirmed_qty, evidence_ref, confirmed_by, confirmed_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    licStmt.run(driverIds.gitlab[2026], '2026-06', 40, 'GL-EVID-06', 'ops.owner@example.com', '2026-06-05T09:00:00Z', 'CONFIRMED'); // 40/45=0.89 -> warning
    licStmt.run(driverIds.gitlab[2026], '2026-07', 46, 'GL-EVID-07', 'ops.owner@example.com', '2026-07-04T09:00:00Z', 'CONFIRMED'); // 46/45=1.02 -> critical
    licStmt.run(driverIds.gitlab[2026], '2026-08', null, null, null, null, 'OVERDUE');

    licStmt.run(driverIds.jira[2026], '2026-06', 110, 'JR-EVID-06', 'ops.owner@example.com', '2026-06-06T09:00:00Z', 'CONFIRMED'); // 110/150=0.73 -> ok
    licStmt.run(driverIds.jira[2026], '2026-07', null, null, null, null, 'OVERDUE');
    licStmt.run(driverIds.jira[2026], '2026-08', null, null, null, null, 'OVERDUE');

    licStmt.run(driverIds.confluence[2026], '2026-06', 150, 'CF-EVID-06', 'ops.owner@example.com', '2026-06-07T09:00:00Z', 'CONFIRMED'); // 150/175=0.86 -> warning
    licStmt.run(driverIds.confluence[2026], '2026-07', null, null, null, null, 'OVERDUE');
    licStmt.run(driverIds.confluence[2026], '2026-08', null, null, null, null, 'OVERDUE');

    const commitStmt = db.prepare(
      `INSERT INTO commitment (po_ref, aor_id, ceiling_amount, vendor) VALUES (?, ?, ?, ?)`
    );
    const poCloud = commitStmt.run('PO-2026-001', aorCloud, 120000, 'Microsoft Azure').lastInsertRowid;
    const poTooling = commitStmt.run('PO-2026-002', aorTooling, 90000, 'Atlassian (Jira & Confluence)').lastInsertRowid;
    const poUnmapped = commitStmt.run('PO-2026-003', null, 40000, 'Azure Marketplace - GitLab Ultimate reseller').lastInsertRowid; // EXC-003: unmapped PO

    const msStmt = db.prepare(
      `INSERT INTO milestone (commitment_id, planned_amount, planned_date, status) VALUES (?, ?, ?, ?)`
    );
    msStmt.run(poCloud, 60000, '2026-06-30', 'Delivered');
    msStmt.run(poCloud, 60000, '2027-06-30', 'Planned');
    msStmt.run(poTooling, 45000, '2026-06-30', 'Delivered');
    msStmt.run(poTooling, 45000, '2027-06-30', 'Planned');
    msStmt.run(poUnmapped, 20000, '2026-06-30', 'Delivered');
    msStmt.run(poUnmapped, 20000, '2027-06-30', 'Planned');

    const actualStmt = db.prepare(
      `INSERT INTO actual (aor_id, source_id, amount, period, recognition_basis, status, invoice_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    actualStmt.run(aorCloud, srcAzure, 9450, '2026-06', 'Delivery', 'Recognised', 'INV-AZR-2026-06');
    actualStmt.run(aorCloud, srcAzure, 9450, '2026-07', 'Delivery', 'Recognised', 'INV-AZR-2026-07');
    actualStmt.run(aorTooling, srcGitlab, 2475, '2026-06', 'Delivery', 'Recognised', 'INV-GL-2026-06');
    actualStmt.run(aorTooling, srcJira, 2250, '2026-06', null, 'Pending', 'INV-JIRA-2026-06'); // EXC-004: recognition point undecided

    const paramStmt = db.prepare(
      `INSERT INTO control_parameter (key, value) VALUES (?, ?)`
    );
    paramStmt.run('licence_confirm_deadline_day', '8');
    paramStmt.run('utilisation_warn', '0.8');
    paramStmt.run('utilisation_crit', '1.0');

    const scenarioStmt = db.prepare(
      `INSERT INTO demo_scenario (name, description, status) VALUES (?, ?, ?)`
    );
    scenarioStmt.run(
      'Duplicate',
      'Posting an actual with a (source_id, invoice_ref) pair that already exists is rejected by the database unique constraint; the API returns 409.',
      'Passing'
    );
    scenarioStmt.run(
      'Correction',
      'A prior actual is corrected by posting a reversal row referencing reversal_of_id; the pair nets to zero in forecast and variance views.',
      'Passing'
    );
    scenarioStmt.run(
      'Licence drift',
      'When a licence period rolls to OVERDUE, the monthly forecast keeps the last confirmed quantity rather than dropping to zero, and an overdue exception is raised.',
      'Passing'
    );
    scenarioStmt.run(
      'Cross-FY',
      'Allocating a single commitment across two financial years has no attribution rule from Finance yet.',
      'Blocked'
    );
  });

  insert();
}

module.exports = { seed };
