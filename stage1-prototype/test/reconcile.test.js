const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');

// These assertions are the same figures the real Stage 0 test harness
// (stage0-test-harness/index.html) already reconciled against the workbook.
// Stage 1 exists to prove the same numbers come out the other end of a
// real HTTP + SQL round trip before the Python port is written.

function startServer() {
  const db = createDb(':memory:');
  seed(db);
  const app = createApp(db);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, db, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test('FY26/27/28 forecast totals and the monthly run-rate reconcile', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const fy2026 = await (await fetch(`${baseUrl}/api/v1/fy/2026/forecast`)).json();
  assert.equal(fy2026.monthly_baseline, 16275);
  assert.equal(fy2026.total_requirement, 130200);

  const fy2027 = await (await fetch(`${baseUrl}/api/v1/fy/2027/forecast`)).json();
  assert.equal(fy2027.total_requirement, 195300);

  const fy2028 = await (await fetch(`${baseUrl}/api/v1/fy/2028/forecast`)).json();
  assert.equal(fy2028.total_requirement, 195300);
});

test('Jira & Confluence driver-vs-source mismatch reconciles to +120 (FY26)', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const variance = await (await fetch(`${baseUrl}/api/v1/fy/2026/variance`)).json();
  const jiraConfluence = variance.find((v) => v.cost_item === 'Jira & Confluence');
  assert.ok(jiraConfluence, 'variance should include the Jira & Confluence row');
  assert.equal(jiraConfluence.status, 'DRIVER MISMATCH');
  assert.equal(jiraConfluence.mismatch_amount, 120);

  const others = variance.filter((v) => v.cost_item !== 'Jira & Confluence');
  assert.ok(others.every((v) => v.status === 'OK'), 'every other FY26 driver should tie to its source plan');
});

test('FY27/28 Jira & Confluence mismatch is +180 (full 12-month year)', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  for (const fy of [2027, 2028]) {
    const variance = await (await fetch(`${baseUrl}/api/v1/fy/${fy}/variance`)).json();
    const jiraConfluence = variance.find((v) => v.cost_item === 'Jira & Confluence');
    assert.equal(jiraConfluence.mismatch_amount, 180);
  }
});

test('exception counts reconcile to 5 critical / 2 warning / 5 overdue / 3 mismatch', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const exceptions = await (await fetch(`${baseUrl}/api/v1/exceptions`)).json();
  assert.deepEqual(exceptions.counts, { critical: 5, warning: 2, overdue: 5, mismatch: 3 });
  assert.equal(exceptions.items.length, 7);
});

test('duplicate actual (same source_ref + invoice_ref) is rejected with 409', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const body = {
    actual_id: 'ACT-TEST-001',
    source_ref: 'SRC-ACT-001',
    invoice_ref: 'INV-TEST-0001',
    recognised_amount: 800,
    status: 'Recognised',
    recognition_basis: 'Invoice Received',
  };
  const first = await fetch(`${baseUrl}/api/v1/actuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}/api/v1/actuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, actual_id: 'ACT-TEST-002' }),
  });
  assert.equal(second.status, 409);
});

test('a reversal nets a prior actual to zero (the Correction scenario)', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const createRes = await fetch(`${baseUrl}/api/v1/actuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actual_id: 'ACT-TEST-010',
      fy: 2026,
      cost_item: 'GitLab Ultimate',
      recognised_amount: 2500,
      status: 'Recognised',
      recognition_basis: 'Invoice Received',
    }),
  });
  const original = await createRes.json();

  const reverseRes = await fetch(`${baseUrl}/api/v1/actuals/${original.id}/reverse`, { method: 'POST' });
  assert.equal(reverseRes.status, 201);
  const reversal = await reverseRes.json();
  assert.equal(reversal.recognised_amount, -original.recognised_amount);
  assert.equal(reversal.reversal_of_id, original.id);

  const all = await (await fetch(`${baseUrl}/api/v1/actuals?fy=2026`)).json();
  const net = all
    .filter((a) => a.id === original.id || a.reversal_of_id === original.id)
    .reduce((sum, a) => sum + a.recognised_amount, 0);
  assert.equal(net, 0);
});

test('GET /export.xlsx returns a valid xlsx with 18 tabs', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/export.xlsx`);
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  const buffer = Buffer.from(await res.arrayBuffer());
  // an xlsx is a zip; a real workbook starts with the zip local-file signature
  assert.equal(buffer.subarray(0, 2).toString('hex'), '504b');

  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets.length, 18);
});
