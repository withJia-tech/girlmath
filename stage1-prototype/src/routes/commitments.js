const express = require('express');
const { runControls } = require('../rules/controls');

module.exports = function commitmentsRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM commitment ORDER BY commitment_id`).all();
    const msStmt = db.prepare(`SELECT * FROM milestone WHERE commitment_id = ? ORDER BY milestone_id`);
    res.json(rows.map((r) => ({ ...r, milestones: msStmt.all(r.id) })));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM commitment WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'commitment not found' });
    row.milestones = db.prepare(`SELECT * FROM milestone WHERE commitment_id = ? ORDER BY milestone_id`).all(row.id);
    res.json(row);
  });

  router.post('/', (req, res) => {
    const {
      commitment_id,
      po_ref = null,
      fy,
      supplier = null,
      cost_stream,
      aor_record_id = null,
      description = null,
      start_date = null,
      end_date = null,
      ceiling_amount = null,
      status = 'Draft',
    } = req.body || {};
    if (!commitment_id || !fy || !cost_stream) {
      return res.status(400).json({ error: 'commitment_id, fy and cost_stream are required' });
    }
    const result = db
      .prepare(
        `INSERT INTO commitment (commitment_id, po_ref, fy, supplier, cost_stream, aor_record_id, description, start_date, end_date, ceiling_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(commitment_id, po_ref, fy, supplier, cost_stream, aor_record_id, description, start_date, end_date, ceiling_amount, status);
    runControls(db);
    res.status(201).json(db.prepare(`SELECT * FROM commitment WHERE id = ?`).get(result.lastInsertRowid));
  });

  router.post('/:id/milestones', (req, res) => {
    const commitment = db.prepare(`SELECT * FROM commitment WHERE id = ?`).get(req.params.id);
    if (!commitment) return res.status(404).json({ error: 'commitment not found' });
    const {
      milestone_id,
      planned_amount = null,
      planned_date = null,
      status = 'Pending',
      fy = commitment.fy,
      source_evidence = null,
    } = req.body || {};
    if (!milestone_id) return res.status(400).json({ error: 'milestone_id is required' });
    if (planned_amount != null && commitment.ceiling_amount != null) {
      const plannedTotal =
        db.prepare(`SELECT COALESCE(SUM(planned_amount), 0) AS total FROM milestone WHERE commitment_id = ?`).get(
          commitment.id
        ).total + planned_amount;
      if (plannedTotal > commitment.ceiling_amount) {
        return res.status(422).json({
          error: `milestone total ${plannedTotal} would exceed commitment ceiling ${commitment.ceiling_amount}`,
        });
      }
    }
    const result = db
      .prepare(
        `INSERT INTO milestone (milestone_id, commitment_id, planned_date, planned_amount, status, fy, source_evidence)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(milestone_id, commitment.id, planned_date, planned_amount, status, fy, source_evidence);
    res.status(201).json(db.prepare(`SELECT * FROM milestone WHERE id = ?`).get(result.lastInsertRowid));
  });

  return router;
};
