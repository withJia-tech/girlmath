// 05_Cost_Drivers rule: requirement = qty x rate x months.
// The driver row's qty/rate is the confirmed baseline; source.reported_qty
// is what the vendor/licence system independently reports. A difference
// between the two is a driver-vs-source mismatch (surfaced as an EXC-005
// exception, see rules/controls.js), not a change to the forecast itself —
// the baseline only moves when a human confirms a new value.

function monthlyAmount(driver) {
  return driver.qty * driver.rate;
}

function requirement(driver) {
  return driver.qty * driver.rate * driver.months;
}

function sourceMismatch(driver, source) {
  const diffQty = round2(source.reported_qty - driver.qty);
  const amount = round2(diffQty * driver.rate);
  return { diffQty, amount };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { monthlyAmount, requirement, sourceMismatch, round2 };
