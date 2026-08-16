const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { seed } = require('../src/db/seed');
const { runControls, exceptionCounts } = require('../src/rules/controls');

test('runControls produces the engineered exception mix', () => {
  const db = createDb(':memory:');
  seed(db);
  const items = runControls(db);
  assert.equal(items.length, 15); // 5 critical + 2 warning + 5 overdue + 3 mismatch

  const counts = exceptionCounts(db);
  assert.deepEqual(counts, { critical: 5, warning: 2, overdue: 5, mismatch: 3 });

  const codes = new Set(items.map((i) => i.code));
  for (const code of ['EXC-001', 'EXC-002', 'EXC-003', 'EXC-004', 'EXC-005', 'EXC-006', 'EXC-007', 'EXC-008']) {
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

test('resolving the Finance allocation for FY26 clears EXC-001', () => {
  const db = createDb(':memory:');
  seed(db);
  runControls(db);
  assert.equal(exceptionCounts(db).critical, 5);

  db.prepare(`UPDATE fy_funding SET finance_allocation = requested_amount WHERE fy = 2026`).run();
  runControls(db);
  assert.equal(exceptionCounts(db).critical, 4);
});
