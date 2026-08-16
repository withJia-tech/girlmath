const express = require('express');
const { runControls } = require('../rules/controls');

module.exports = function actualsRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const fy = req.query.fy ? Number(req.query.fy) : null;
    const rows = fy
      ? db.prepare(`SELECT * FROM actual WHERE fy = ? ORDER BY id`).all(fy)
      : db.prepare(`SELECT * FROM actual ORDER BY id`).all();
    res.json(rows);
  });

  // Append-only: this is the only write path onto `actual`. Corrections go
  // through POST /:id/reverse below rather than UPDATE/DELETE (the
  // "Correction" demo scenario). A repeated (source_ref, invoice_ref) pair
  // is rejected by the table's unique constraint (the "Duplicate" scenario).
  router.post('/', (req, res) => {
    const {
      actual_id,
      transaction_date = null,
      fy = null,
      reporting_month = null,
      cost_item = null,
      aor_record_id = null,
      commitment_id = null,
      invoice_ref = null,
      do_ref = null,
      gr_status = 'Pending',
      recognition_basis = 'TBC',
      gross_amount = null,
      recognised_amount = 0,
      source_ref = null,
      owner = null,
      status = 'Draft',
      notes = null,
    } = req.body || {};
    if (!actual_id) {
      return res.status(400).json({ error: 'actual_id is required' });
    }
    try {
      const result = db
        .prepare(
          `INSERT INTO actual (actual_id, transaction_date, fy, reporting_month, cost_item, aor_record_id, commitment_id, invoice_ref, do_ref, gr_status, recognition_basis, gross_amount, recognised_amount, source_ref, owner, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          actual_id, transaction_date, fy, reporting_month, cost_item, aor_record_id, commitment_id,
          invoice_ref, do_ref, gr_status, recognition_basis, gross_amount, recognised_amount, source_ref,
          owner, status, notes
        );
      runControls(db);
      res.status(201).json(db.prepare(`SELECT * FROM actual WHERE id = ?`).get(result.lastInsertRowid));
    } catch (err) {
      if (err.code && err.code.startsWith('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ error: `duplicate actual for source_ref=${source_ref}, invoice_ref=${invoice_ref}` });
      }
      throw err;
    }
  });

  router.post('/:id/reverse', (req, res) => {
    const original = db.prepare(`SELECT * FROM actual WHERE id = ?`).get(req.params.id);
    if (!original) return res.status(404).json({ error: 'actual not found' });
    const reversalActualId = `${original.actual_id}-REV`;
    const reversalInvoiceRef = original.invoice_ref ? `${original.invoice_ref}-REV-${original.id}` : null;
    const result = db
      .prepare(
        `INSERT INTO actual (actual_id, transaction_date, fy, reporting_month, cost_item, aor_record_id, commitment_id, invoice_ref, do_ref, gr_status, recognition_basis, gross_amount, recognised_amount, source_ref, owner, status, notes, reversal_of_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reversalActualId, original.transaction_date, original.fy, original.reporting_month, original.cost_item,
        original.aor_record_id, original.commitment_id, reversalInvoiceRef, original.do_ref, original.gr_status,
        original.recognition_basis, original.gross_amount == null ? null : -original.gross_amount,
        -original.recognised_amount, original.source_ref, original.owner, 'Recognised',
        `Reversal of ${original.actual_id}`, original.id
      );
    runControls(db);
    res.status(201).json(db.prepare(`SELECT * FROM actual WHERE id = ?`).get(result.lastInsertRowid));
  });

  return router;
};
