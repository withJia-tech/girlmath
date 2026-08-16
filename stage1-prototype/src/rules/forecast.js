// 08_Forecast_Monthly / 09_Variance / 11-13_Pivot_* as JS functions over the
// SQLite db, kept as plain query + reduce so the same logic ports directly
// to the Stage 2 Python rules module without a redesign.

const { monthlyAmount, requirement, sourceMismatch, round2 } = require('./drivers');
const { periodsForFy, FY_MONTHS } = require('./fyCalendar');

function driversForFy(db, fy) {
  return db.prepare(`SELECT * FROM cost_driver WHERE fy = ? ORDER BY name`).all(fy);
}

function fyPosition(db, fy) {
  const funding = db.prepare(`SELECT * FROM fy_funding WHERE fy = ?`).get(fy);
  const allocations = db
    .prepare(`SELECT aor.record_id AS aor_record_id, aor_fy_allocation.allocated_amount
              FROM aor_fy_allocation JOIN aor ON aor.id = aor_fy_allocation.aor_id
              WHERE aor_fy_allocation.fy = ?`)
    .all(fy);
  const drivers = driversForFy(db, fy);
  const totalRequirement = drivers.reduce((sum, d) => sum + requirement(d), 0);
  const totalAllocated = allocations.reduce((sum, a) => sum + (a.allocated_amount || 0), 0);
  return {
    fy,
    requested_amount: funding ? funding.requested_amount : null,
    finance_allocation: funding ? funding.finance_allocation : null,
    total_allocated: round2(totalAllocated),
    total_requirement: round2(totalRequirement),
    allocations,
  };
}

function recognisedActualsTotal(db, fy) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(recognised_amount), 0) AS total
       FROM actual
       WHERE status = 'Recognised' AND fy = ?`
    )
    .get(fy);
  return round2(row.total);
}

function forecastMonth(db, fy) {
  const drivers = driversForFy(db, fy);
  const months = FY_MONTHS[fy];
  const monthly = round2(drivers.reduce((sum, d) => sum + monthlyAmount(d), 0));
  const totalRequirement = round2(monthly * months);
  const actualsToDate = recognisedActualsTotal(db, fy);
  const expectedRemaining = round2(Math.max(totalRequirement - actualsToDate, 0));
  const outturn = round2(actualsToDate + expectedRemaining);

  const periods = periodsForFy(fy).map((period) => {
    const actualForPeriod = db
      .prepare(
        `SELECT COALESCE(SUM(recognised_amount), 0) AS total FROM actual
         WHERE status = 'Recognised' AND reporting_month = ?`
      )
      .get(period).total;
    return {
      period,
      baseline: monthly,
      actual: round2(actualForPeriod),
    };
  });

  return {
    fy,
    months,
    monthly_baseline: monthly,
    total_requirement: totalRequirement,
    actuals_to_date: actualsToDate,
    expected_remaining: expectedRemaining,
    outturn,
    periods,
  };
}

function variance(db, fy) {
  return driversForFy(db, fy).map((d) => {
    const req = round2(requirement(d));
    const diff = sourceMismatch(d);
    return {
      cost_stream: d.cost_stream,
      cost_item: d.name,
      source_plan: d.source_planned_cost,
      driver_requirement: req,
      mismatch_amount: diff,
      status: diff !== 0 ? 'DRIVER MISMATCH' : 'OK',
    };
  });
}

function pivotCostStream(db, fy) {
  return driversForFy(db, fy).map((d) => ({
    cost_stream: d.cost_stream,
    driver: d.name,
    monthly: round2(monthlyAmount(d)),
    requirement: round2(requirement(d)),
  }));
}

function pivotAor(db, fy) {
  return db
    .prepare(
      `SELECT aor.record_id AS aor_record_id, aor.description, aor_fy_allocation.allocated_amount
       FROM aor_fy_allocation JOIN aor ON aor.id = aor_fy_allocation.aor_id
       WHERE aor_fy_allocation.fy = ?
       ORDER BY aor.record_id`
    )
    .all(fy);
}

function pivotMonth(db, fy) {
  return forecastMonth(db, fy).periods;
}

module.exports = {
  driversForFy,
  fyPosition,
  forecastMonth,
  variance,
  pivotCostStream,
  pivotAor,
  pivotMonth,
};
