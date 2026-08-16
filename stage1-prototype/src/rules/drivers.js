// 05_Cost_Drivers rule: requirement = qty x rate x months. The real workbook
// carries a second, independently-sourced dollar figure on the SAME row
// (source_planned_cost) rather than joining out to a separate source
// system; "Driver vs Source" = Calculated Requirement - Source Planned Cost,
// and the baseline only moves when a human confirms a revised value.

function monthlyAmount(driver) {
  return driver.qty * driver.rate;
}

function requirement(driver) {
  return driver.qty * driver.rate * driver.months;
}

function sourceMismatch(driver) {
  return round2(requirement(driver) - driver.source_planned_cost);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { monthlyAmount, requirement, sourceMismatch, round2 };
