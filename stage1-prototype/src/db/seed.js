// Seed data ported directly from the real Stage 0 test harness
// (stage0-test-harness/index.html, <script id="seed">) — this is the
// ground-truth workbook snapshot, not fabricated data. Every figure here
// should trace back to a cell in that embedded JSON.

const { FY_MONTHS, periodsForFy } = require('../rules/fyCalendar');

const FYS = [2026, 2027, 2028];

// name -> { costStream, qty, rate, sourcePlannedCost: {fy: amount} }
// source_planned_cost differs from qty*rate*months only for "Jira & Confluence"
// (the DRV-007/008/009 rows) — that's the one driver-vs-source mismatch.
const DRIVERS = [
  {
    name: 'Atlassian Dedicated Site',
    costStream: 'Subscriptions / Central Tools',
    qty: 1,
    rate: 800,
    sourcePlannedCost: { 2026: 6400, 2027: 9600, 2028: 9600 },
    sourceRefPrefix: 'SRC-ATLA',
  },
  {
    name: 'GitLab Ultimate',
    costStream: 'Subscriptions / Central Tools',
    qty: 20,
    rate: 125,
    sourcePlannedCost: { 2026: 20000, 2027: 30000, 2028: 30000 },
    sourceRefPrefix: 'SRC-GITL',
  },
  {
    name: 'Jira & Confluence',
    costStream: 'Subscriptions / Central Tools',
    qty: 20,
    rate: 30,
    sourcePlannedCost: { 2026: 4680, 2027: 7020, 2028: 7020 },
    sourceRefPrefix: 'SRC-JIRA',
  },
  {
    name: 'Jira Service Management',
    costStream: 'Subscriptions / Central Tools',
    qty: 275,
    rate: 45,
    sourcePlannedCost: { 2026: 99000, 2027: 148500, 2028: 148500 },
    sourceRefPrefix: 'SRC-JSM',
  },
  {
    name: 'SonarQube Community',
    costStream: 'Subscriptions / Central Tools',
    qty: 1,
    rate: 0,
    sourcePlannedCost: { 2026: 0, 2027: 0, 2028: 0 },
    sourceRefPrefix: 'SRC-SONA',
  },
];

function seed(db) {
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO model_meta (id, version, as_of_date, status, currency, fy_basis)
       VALUES (1, ?, ?, ?, ?, ?)`
    ).run('0.1 Draft', '2026-08-15', 'REVIEW', 'SGD', '1 April to 31 March');

    const fundingStmt = db.prepare(
      `INSERT INTO fy_funding (fy, requested_amount, finance_allocation) VALUES (?, NULL, NULL)`
    );
    for (const fy of FYS) fundingStmt.run(fy);

    const aorStmt = db.prepare(
      `INSERT INTO aor (record_id, official_ref, description, base_amount, contingency, valid_from, valid_to)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const aor1 = aorStmt.run(
      'AOR-REC-001',
      'TBC',
      'HSS Central Kitchen — Jira Svc Mgmt + JSM',
      10800,
      10200,
      '2026-02-01',
      '2027-02-28'
    ).lastInsertRowid;
    const aor2 = aorStmt.run('AOR-REC-002', 'TBC', 'Dedicated site maintenance', 9600, 960, null, null)
      .lastInsertRowid;
    const aor3 = aorStmt.run('AOR-REC-003', 'TBC', 'Input additional approved AORs', null, null, null, null)
      .lastInsertRowid;

    const allocStmt = db.prepare(
      `INSERT INTO aor_fy_allocation (aor_id, fy, allocated_amount) VALUES (?, ?, NULL)`
    );
    allocStmt.run(aor1, 2026);
    allocStmt.run(aor1, 2027);
    allocStmt.run(aor2, 2026);
    allocStmt.run(aor2, 2027);
    allocStmt.run(aor2, 2028);
    allocStmt.run(aor3, 2026);

    const sourceStmt = db.prepare(
      `INSERT INTO source (source_ref, item, source_role, source_name, section_ref, value_use, owner, as_of, status, notes, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    sourceStmt.run(
      'SRC-REF-001', 'Business rules', 'Authority', 'HSS Central financial-control Markdown reference pack',
      '03/04/06/11', 'Business definitions and workbook structure', 'BA / Product Ops', '2026-08-14', 'Current',
      'Superseded where later project decisions are more specific', 'Library: /Hss/cost-monitoring-reference(1).zip'
    );
    sourceStmt.run(
      'SRC-SUB-001', 'Subscription plan', 'Planned requirement', 'HSS Central budget CSV / table supplied by user',
      'Forward cost plan', 'FY26-FY28 amounts and quantity/rate drivers', 'Product Ops', '2026-08-13', 'Current',
      'Original file not present in workspace; figures carried from user-provided table', 'User-provided project source'
    );
    sourceStmt.run(
      'SRC-AOR-001', 'AOR ask', 'Funding authorisation', 'HSS Central budget AOR section', 'HSS Central Kitchen',
      'Base 10,800; contingency 10,200; total 21,000', 'Finance / BA', '2026-08-13', 'Needs confirmation',
      'Official AOR reference and FY split TBC', 'User-provided project source'
    );
    sourceStmt.run(
      'SRC-AOR-002', 'AOR ask', 'Funding authorisation', 'HSS Central budget AOR section', 'Dedicated site maintenance',
      'Base 9,600; contingency 960; total 10,560', 'Finance / BA', '2026-08-13', 'Needs confirmation',
      'Validity and FY split TBC', 'User-provided project source'
    );
    sourceStmt.run(
      'SRC-PO-001', 'Azure PO', 'Commercial commitment', 'Azure PO description supplied by user', 'ESWO for HSS POC',
      'PO ceiling SGD 3,000,000; supplier Microsoft Regional Sales; partially invoiced', 'Commercial / Product Ops',
      '2026-08-13', 'Needs confirmation', 'Official PO reference and milestone schedule TBC', 'User-provided project source'
    );
    sourceStmt.run(
      'SRC-OPS-001', 'Developer portal', 'Operational observation', 'Monthly portal quantity confirmation',
      '8th-of-month control', 'Confirmed licence quantity and evidence reference', 'Operational owner', '2026-08-14',
      'Recurring', 'No live observation entered', 'Manual entry / transient upload'
    );
    sourceStmt.run(
      'SRC-ACT-001', 'Invoice / DO / GR', 'Actual evidence', 'Actual expenditure evidence', 'Recognition rule TBC',
      'Only recognised records flow to Actual Spend', 'Finance / Product Ops', '2026-08-14', 'Open definition',
      'Canonical recognition point must be approved', 'Invoice / DO / Finance source'
    );

    const commitStmt = db.prepare(
      `INSERT INTO commitment (commitment_id, po_ref, fy, supplier, cost_stream, aor_record_id, description, start_date, end_date, ceiling_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const com1 = commitStmt.run(
      'COM-001', 'TBC', 2026, 'Microsoft Regional Sales', 'Central Infrastructure / Cloud Spend', 'TBC',
      'ESWO for HSS POC — Azure', null, null, 3000000, 'Partially Invoiced'
    ).lastInsertRowid;
    const com2 = commitStmt.run(
      'COM-002', 'TBC', 2026, 'TBC', 'Professional Services', 'TBC',
      'Input approved PO / contract', null, null, null, 'Draft'
    ).lastInsertRowid;
    const com3 = commitStmt.run(
      'COM-003', 'TBC', 2027, 'TBC', 'Subscriptions / Central Tools', 'TBC',
      'Input approved subscription contract', null, null, null, 'Draft'
    ).lastInsertRowid;

    const msStmt = db.prepare(
      `INSERT INTO milestone (milestone_id, commitment_id, planned_date, planned_amount, recognised_actual, status, fy, source_evidence)
       VALUES (?, ?, NULL, NULL, NULL, 'Pending', ?, 'Input milestone evidence')`
    );
    msStmt.run('MS-001', com1, 2026);
    msStmt.run('MS-002', com1, 2026);
    msStmt.run('MS-003', com1, 2027);
    msStmt.run('MS-004', com2, 2026);
    msStmt.run('MS-005', com3, 2027);
    msStmt.run('MS-006', com3, 2028);

    const driverStmt = db.prepare(
      `INSERT INTO cost_driver (driver_id, fy, cost_area, cost_stream, name, driver_type, qty, rate, months, source_planned_cost, aor_record_id, po_ref, source_ref, status)
       VALUES (?, ?, 'HSS Central', ?, ?, 'Licence quantity', ?, ?, ?, ?, 'TBC', 'TBC', ?, 'Source-backed plan')`
    );
    const driverIdsByNameFy = {}; // name -> {fy: id}
    let driverSeq = 1;
    for (const d of DRIVERS) {
      driverIdsByNameFy[d.name] = {};
      for (const fy of FYS) {
        const months = FY_MONTHS[fy];
        const driverCode = `DRV-${String(driverSeq).padStart(3, '0')}`;
        const sourceRef = `${d.sourceRefPrefix}-FY${fy - 2000}`;
        const result = driverStmt.run(
          driverCode, fy, d.costStream, d.name, d.qty, d.rate, months, d.sourcePlannedCost[fy], sourceRef
        );
        driverIdsByNameFy[d.name][fy] = result.lastInsertRowid;
        driverSeq += 1;
      }
    }

    const licStmt = db.prepare(
      `INSERT INTO licence_observation (observation_id, cost_driver_id, fy, period, planned_qty, confirmed_qty, due_date, confirmed_date, confirmed_by, source_reference, status)
       VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?)`
    );
    let obsSeq = 1;
    for (const d of DRIVERS) {
      const allPeriods = FYS.flatMap((fy) => periodsForFy(fy).map((period) => ({ fy, period })));
      allPeriods.forEach(({ fy, period }, idx) => {
        const observationId = `OBS-${String(obsSeq).padStart(4, '0')}`;
        const dueDate = `${period}-08`;
        // The first monthly check (Aug 2026) is already past its due date as
        // of the 2026-08-15 as-of date; every later one is simply not due yet.
        const status = idx === 0 ? 'OVERDUE' : 'DUE';
        licStmt.run(observationId, driverIdsByNameFy[d.name][fy], fy, period, d.qty, dueDate, status);
        obsSeq += 1;
      });
    }

    const actualStmt = db.prepare(
      `INSERT INTO actual (actual_id, transaction_date, fy, reporting_month, cost_item, aor_record_id, commitment_id, invoice_ref, do_ref, gr_status, recognition_basis, gross_amount, recognised_amount, source_ref, owner, status, notes)
       VALUES (?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending', 'TBC', NULL, 0, NULL, NULL, 'Draft', ?)`
    );
    for (let i = 1; i <= 20; i++) {
      const actualId = `ACT-${String(i).padStart(3, '0')}`;
      const notes =
        i === 1 ? 'Enter recognised actuals with evidence; do not treat PO ceiling as spend.' : null;
      actualStmt.run(actualId, notes);
    }

    const paramStmt = db.prepare(`INSERT INTO control_parameter (key, value) VALUES (?, ?)`);
    paramStmt.run('licence_confirm_deadline_day', '8');
    paramStmt.run('utilisation_warn', '0.8');
    paramStmt.run('utilisation_crit', '1');

    const scenarioStmt = db.prepare(
      `INSERT INTO demo_scenario (name, input, expected_rule, expected_result, live, owner, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    scenarioStmt.run(
      'Licence drift', 'JSM planned 275; confirmed 300', 'Variance = +25; roll revised quantity forward',
      'Forecast increases by 25 x rate x remaining months', 'No', 'BA / Tester', 'Ready',
      'Demo scenario from project deck'
    );
    scenarioStmt.run(
      'Partial invoicing', 'Azure PO ceiling 3m; partial actual', 'Actual must not equal PO ceiling',
      'Remaining ceiling = PO value - recognised actual', 'No', 'BA / Tester', 'Ready',
      'Requires milestone amounts for numeric test'
    );
    scenarioStmt.run(
      'Contingency', 'Base 10,800 + contingency 10,200', 'Preserve separate components', 'AOR total = 21,000',
      'No', 'BA / Tester', 'Ready', 'Source-backed example'
    );
    scenarioStmt.run(
      'Duplicate', 'Same invoice/source ID submitted twice', 'Prevent double counting',
      'Second record rejected or reviewed', 'No', 'BA / Tester', 'Designed', 'Implementation control'
    );
    scenarioStmt.run(
      'Correction', 'Recognised actual corrected later', 'Preserve original and reversal',
      'Net actual equals corrected amount', 'No', 'BA / Tester', 'Designed',
      'Append-only correction principle'
    );
    scenarioStmt.run(
      'Cross-FY', 'AOR or milestone spans FY boundary', 'Allocate by approved FY rule',
      'Each FY reports only its approved share', 'No', 'Finance / BA', 'Blocked', 'FY attribution rule required'
    );
  });

  insert();
}

module.exports = { seed };
