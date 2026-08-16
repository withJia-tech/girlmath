const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');

// These assertions are the same figures the Stage 0 HTML test harness
// already reconciled against the workbook (see docs/architecture-note.html
// section 6). Stage 1 exists to prove the same numbers come out the other
// end of a real HTTP + SQL round trip before the Python port is written.

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

test('Jira + Confluence driver-vs-source mismatch reconciles to +120', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const variance = await (await fetch(`${baseUrl}/api/v1/fy/2026/variance`)).json();
  const jira = variance.find((v) => v.driver === 'Jira');
  const confluence = variance.find((v) => v.driver === 'Confluence');
  assert.equal(jira.status, 'DRIVER MISMATCH');
  assert.equal(confluence.status, 'DRIVER MISMATCH');
  assert.equal(jira.mismatch_amount + confluence.mismatch_amount, 120);
});

test('exception counts reconcile to 5 critical / 2 warning / 5 overdue / 3 mismatch', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const exceptions = await (await fetch(`${baseUrl}/api/v1/exceptions`)).json();
  assert.deepEqual(exceptions.counts, { critical: 5, warning: 2, overdue: 5, mismatch: 3 });
});

test('duplicate actual (same source_id + invoice_ref) is rejected with 409', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/api/v1/actuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aor_id: 2,
      source_id: 1,
      amount: 9450,
      period: '2026-06',
      recognition_basis: 'Delivery',
      invoice_ref: 'INV-AZR-2026-06', // already exists in seed data
    }),
  });
  assert.equal(res.status, 409);
});

test('a reversal nets a prior actual to zero (the Correction scenario)', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const before = await (await fetch(`${baseUrl}/api/v1/actuals?fy=2026`)).json();
  const target = before.find((a) => a.invoice_ref === 'INV-GL-2026-06');
  assert.ok(target, 'seed data should include INV-GL-2026-06');

  const reverseRes = await fetch(`${baseUrl}/api/v1/actuals/${target.id}/reverse`, { method: 'POST' });
  assert.equal(reverseRes.status, 201);
  const reversal = await reverseRes.json();
  assert.equal(reversal.amount, -target.amount);
  assert.equal(reversal.reversal_of_id, target.id);

  const after = await (await fetch(`${baseUrl}/api/v1/actuals?fy=2026`)).json();
  const net = after
    .filter((a) => a.id === target.id || a.reversal_of_id === target.id)
    .reduce((sum, a) => sum + a.amount, 0);
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
