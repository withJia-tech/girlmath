// GET /export.xlsx — regenerates the 18-tab workbook from current database
// state. This is the off-ramp described in docs/architecture-note.html:
// the workbook stops being the source of truth and becomes a controlled,
// regenerated report.

const ExcelJS = require('exceljs');
const { runControls, listExceptions, exceptionCounts } = require('../rules/controls');
const { fyPosition, forecastMonth, variance, pivotCostStream, pivotAor, pivotMonth } = require('../rules/forecast');
const { FY_MONTHS } = require('../rules/fyCalendar');

const FYS = Object.keys(FY_MONTHS).map(Number);

function addTable(workbook, sheetName, rows) {
  const sheet = workbook.addWorksheet(sheetName);
  if (rows.length === 0) return sheet;
  const columns = Object.keys(rows[0]);
  sheet.columns = columns.map((key) => ({ header: key, key, width: Math.max(14, key.length + 2) }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  return sheet;
}

// Some source tabs hold two related tables side by side on one sheet (the
// workbook has 18 physical tabs total, not one per SQL table — see
// docs/architecture-note.html row 03/04 in section 2).
function addTwoTables(workbook, sheetName, labelA, rowsA, labelB, rowsB) {
  const sheet = workbook.addWorksheet(sheetName);
  let cursor = 1;
  let maxCols = 1;
  for (const [label, rows] of [[labelA, rowsA], [labelB, rowsB]]) {
    sheet.getCell(cursor, 1).value = label;
    sheet.getCell(cursor, 1).font = { bold: true, italic: true };
    cursor += 1;
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      maxCols = Math.max(maxCols, columns.length);
      columns.forEach((key, i) => {
        const cell = sheet.getCell(cursor, i + 1);
        cell.value = key;
        cell.font = { bold: true };
      });
      cursor += 1;
      for (const row of rows) {
        columns.forEach((key, i) => {
          sheet.getCell(cursor, i + 1).value = row[key];
        });
        cursor += 1;
      }
    }
    cursor += 1; // blank row between the two tables
  }
  for (let i = 1; i <= maxCols; i++) {
    sheet.getColumn(i).width = 16;
  }
  return sheet;
}

function buildWorkbook(db) {
  runControls(db); // exceptions are derived state; make sure the export is current
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'hss-financial-control-stage1';
  workbook.created = new Date();

  const meta = db.prepare(`SELECT * FROM model_meta WHERE id = 1`).get();
  addTable(workbook, '00_Cover', [meta]);

  const counts = exceptionCounts(db);
  const dashboardRows = FYS.map((fy) => {
    const position = fyPosition(db, fy);
    return {
      fy,
      requested_amount: position.requested_amount,
      finance_allocation: position.finance_allocation,
      total_requirement: position.total_requirement,
      critical_exceptions: counts.critical,
      warning_exceptions: counts.warning,
      overdue_exceptions: counts.overdue,
      mismatch_exceptions: counts.mismatch,
    };
  });
  addTable(workbook, '01_Dashboard', dashboardRows);

  addTable(workbook, '02_FY_Position', db.prepare(`SELECT * FROM fy_funding ORDER BY fy`).all());
  addTwoTables(
    workbook,
    '03_AOR_Register',
    'aor',
    db.prepare(`SELECT * FROM aor ORDER BY id`).all(),
    'aor_fy_allocation',
    db.prepare(`SELECT * FROM aor_fy_allocation ORDER BY aor_id, fy`).all()
  );
  addTwoTables(
    workbook,
    '04_PO_Commitments',
    'commitment',
    db.prepare(`SELECT * FROM commitment ORDER BY id`).all(),
    'milestone',
    db.prepare(`SELECT * FROM milestone ORDER BY commitment_id, planned_date`).all()
  );
  addTable(workbook, '05_Cost_Drivers', db.prepare(`SELECT * FROM cost_driver ORDER BY fy, name`).all());
  addTable(
    workbook,
    '06_Licence_Checks',
    db.prepare(`SELECT * FROM licence_observation ORDER BY period, cost_driver_id`).all()
  );
  addTable(workbook, '07_Actuals', db.prepare(`SELECT * FROM actual ORDER BY period, id`).all());

  const forecastRows = FYS.flatMap((fy) => forecastMonth(db, fy).periods.map((p) => ({ fy, ...p })));
  addTable(workbook, '08_Forecast_Monthly', forecastRows);

  const varianceRows = FYS.flatMap((fy) => variance(db, fy).map((v) => ({ fy, ...v })));
  addTable(workbook, '09_Variance', varianceRows);

  addTable(workbook, '10_Exceptions', listExceptions(db));

  const pivotCostStreamRows = FYS.flatMap((fy) => pivotCostStream(db, fy).map((r) => ({ fy, ...r })));
  addTable(workbook, '11_Pivot_CostStream', pivotCostStreamRows);

  const pivotAorRows = FYS.flatMap((fy) => pivotAor(db, fy).map((r) => ({ fy, ...r })));
  addTable(workbook, '12_Pivot_AOR', pivotAorRows);

  const pivotMonthRows = FYS.flatMap((fy) => pivotMonth(db, fy).map((r) => ({ fy, ...r })));
  addTable(workbook, '13_Pivot_Month', pivotMonthRows);

  addTable(workbook, '14_Sources', db.prepare(`SELECT * FROM source ORDER BY id`).all());
  addTable(workbook, '15_Checks', [
    {
      status: counts.critical > 0 ? 'REVIEW' : 'OK',
      as_of_date: meta.as_of_date,
      ...counts,
    },
  ]);
  addTable(workbook, '16_Lookups', db.prepare(`SELECT * FROM control_parameter ORDER BY key`).all());
  addTable(workbook, '17_Demo_Scenarios', db.prepare(`SELECT * FROM demo_scenario ORDER BY id`).all());

  return workbook;
}

module.exports = { buildWorkbook };
