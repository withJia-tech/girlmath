const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { seed } = require('../src/db/seed');
const { runControls, exceptionCounts } = require('../src/rules/controls');

// The real workbook curates 10_Exceptions to one representative row per
// issue category (7 rows total: 5 critical + 2 warning) — see
// rules/controls.js. "overdue" and "mismatch" are live counts against
// other tables, not exception rows.
test('runControls produces the curated 5 critical / 2 warning exception set', () => {
  const db = createDb(':memory:');
  seed(db);
  const items = runControls(db);
  assert.equal(items.length, 7);

  const counts = exceptionCounts(db);
  assert.deepEqual(counts, { critical: 5, warning: 2, overdue: 5, mismatch: 3 });

  const codes = new Set(items.map((i) => i.code));
  for (const code of ['EXC-001', 'EXC-002', 'EXC-003', 'EXC-004', 'EXC-005', 'EXC-006', 'EXC-007']) {
    assert.ok(codes.has(code), `expected ${code} to be present`);
  }
});

test('run_controls() is idempotent (derived state, safe to rerun)', () => {
  const db = createDb(':memory:');
  seed(db);
  runControls(db);
  const first = exceptionCounts(db);
  runControls(db);
  runControls(db);
  const second = exceptionCounts(db);
  assert.deepEqual(first, second);
});

test('resolving the FY26 Finance allocation clears EXC-001', () => {
  const db = createDb(':memory:');
  seed(db);
  runControls(db);
  assert.equal(exceptionCounts(db).critical, 5);

  db.prepare(`UPDATE fy_funding SET finance_allocation = 130200 WHERE fy = 2026`).run();
  runControls(db);
  assert.equal(exceptionCounts(db).critical, 4);
});
