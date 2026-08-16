const express = require('express');
const { runControls } = require('../rules/controls');

module.exports = function commitmentsRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM commitment ORDER BY po_ref`).all();
    const msStmt = db.prepare(`SELECT * FROM milestone WHERE commitment_id = ? ORDER BY planned_date`);
    res.json(rows.map((r) => ({ ...r, milestones: msStmt.all(r.id) })));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM commitment WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'commitment not found' });
    row.milestones = db.prepare(`SELECT * FROM milestone WHERE commitment_id = ? ORDER BY planned_date`).all(row.id);
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { po_ref, aor_id = null, ceiling_amount, vendor } = req.body || {};
    if (!po_ref || ceiling_amount == null || !vendor) {
      return res.status(400).json({ error: 'po_ref, ceiling_amount and vendor are required' });
    }
    const result = db
      .prepare(`INSERT INTO commitment (po_ref, aor_id, ceiling_amount, vendor) VALUES (?, ?, ?, ?)`)
      .run(po_ref, aor_id, ceiling_amount, vendor);
    runControls(db);
    res.status(201).json(db.prepare(`SELECT * FROM commitment WHERE id = ?`).get(result.lastInsertRowid));
  });

  router.post('/:id/milestones', (req, res) => {
    const commitment = db.prepare(`SELECT * FROM commitment WHERE id = ?`).get(req.params.id);
    if (!commitment) return res.status(404).json({ error: 'commitment not found' });
    const { planned_amount, planned_date, status = 'Planned' } = req.body || {};
    if (planned_amount == null || !planned_date) {
      return res.status(400).json({ error: 'planned_amount and planned_date are required' });
    }
    const plannedTotal =
      db.prepare(`SELECT COALESCE(SUM(planned_amount), 0) AS total FROM milestone WHERE commitment_id = ?`).get(
        commitment.id
      ).total + planned_amount;
    if (plannedTotal > commitment.ceiling_amount) {
      return res.status(422).json({
        error: `milestone total ${plannedTotal} would exceed commitment ceiling ${commitment.ceiling_amount}`,
      });
    }
    const result = db
      .prepare(`INSERT INTO milestone (commitment_id, planned_amount, planned_date, status) VALUES (?, ?, ?, ?)`)
      .run(commitment.id, planned_amount, planned_date, status);
    res.status(201).json(db.prepare(`SELECT * FROM milestone WHERE id = ?`).get(result.lastInsertRowid));
  });

  return router;
};
