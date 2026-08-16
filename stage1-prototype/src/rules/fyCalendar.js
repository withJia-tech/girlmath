// Single source of truth for the FY calendar used across seed data, rules
// and routes. Matches the real Stage 0 workbook (stage0-test-harness):
// FY runs 1 April to 31 March, but licence/forecast monitoring for FY26
// only starts in August 2026, giving FY26 an 8-month partial year.

const FY_MONTHS = { 2026: 8, 2027: 12, 2028: 12 };
const FY_START = { 2026: '2026-08', 2027: '2027-04', 2028: '2028-04' };

function periodsForFy(fy) {
  const months = FY_MONTHS[fy];
  const [startYear, startMonth] = FY_START[fy].split('-').map(Number);
  const periods = [];
  for (let i = 0; i < months; i++) {
    const totalMonth = startMonth - 1 + i;
    const year = startYear + Math.floor(totalMonth / 12);
    const month = (totalMonth % 12) + 1;
    periods.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return periods;
}

module.exports = { FY_MONTHS, FY_START, periodsForFy };
