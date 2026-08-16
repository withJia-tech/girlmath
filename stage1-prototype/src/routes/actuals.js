const express = require('express');
const { runControls } = require('../rules/controls');

module.exports = function actualsRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const fy = req.query.fy ? Number(req.query.fy) : null;
    const rows = fy
      ? db.prepare(`SELECT * FROM actual WHERE period LIKE ? ORDER BY period, id`).all(`${fy}-%`)
      : db.prepare(`SELECT * FROM actual ORDER BY period, id`).all();
    res.json(rows);
  });

  // Append-only: this is the only write path onto `actual`. Corrections go
  // through POST /:id/reverse below rather than UPDATE/DELETE (the
  // "Correction" demo scenario). A repeated (source_id, invoice_ref) pair
  // is rejected by the table's unique constraint (the "Duplicate" scenario).
  router.post('/', (req, res) => {
    const { aor_id, source_id = null, amount, period, recognition_basis = null, status = 'Recognised', invoice_ref = null } =
      req.body || {};
    if (!aor_id || amount == null || !period) {
      return res.status(400).json({ error: 'aor_id, amount and period are required' });
    }
    try {
      const result = db
        .prepare(
          `INSERT INTO actual (aor_id, source_id, amount, period, recognition_basis, status, invoice_ref)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(aor_id, source_id, amount, period, recognition_basis, status, invoice_ref);
      runControls(db);
      res.status(201).json(db.prepare(`SELECT * FROM actual WHERE id = ?`).get(result.lastInsertRowid));
    } catch (err) {
      if (err.code && err.code.startsWith('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ error: `duplicate actual for source_id=${source_id}, invoice_ref=${invoice_ref}` });
      }
      throw err;
    }
  });

  router.post('/:id/reverse', (req, res) => {
    const original = db.prepare(`SELECT * FROM actual WHERE id = ?`).get(req.params.id);
    if (!original) return res.status(404).json({ error: 'actual not found' });
    const { period = original.period, recognition_basis = original.recognition_basis } = req.body || {};
    const reversalInvoiceRef = original.invoice_ref ? `${original.invoice_ref}-REV-${original.id}` : null;
    const result = db
      .prepare(
        `INSERT INTO actual (aor_id, source_id, amount, period, recognition_basis, status, invoice_ref, reversal_of_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        original.aor_id,
        original.source_id,
        -original.amount,
        period,
        recognition_basis,
        'Recognised',
        reversalInvoiceRef,
        original.id
      );
    runControls(db);
    res.status(201).json(db.prepare(`SELECT * FROM actual WHERE id = ?`).get(result.lastInsertRowid));
  });

  return router;
};
