const express = require('express');
const { runControls } = require('../rules/controls');

module.exports = function licenceRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const fy = req.query.fy ? Number(req.query.fy) : null;
    const rows = db
      .prepare(
        `SELECT licence_observation.*, cost_driver.name AS driver_name, cost_driver.fy AS driver_fy
         FROM licence_observation
         JOIN cost_driver ON cost_driver.id = licence_observation.cost_driver_id
         ${fy ? 'WHERE cost_driver.fy = ?' : ''}
         ORDER BY licence_observation.period, cost_driver.name`
      )
      .all(...(fy ? [fy] : []));
    res.json(rows);
  });

  router.patch('/:id/confirm', (req, res) => {
    const row = db.prepare(`SELECT * FROM licence_observation WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'licence observation not found' });
    const { confirmed_qty, evidence_ref, confirmed_by } = req.body || {};
    if (confirmed_qty == null || !evidence_ref || !confirmed_by) {
      return res.status(400).json({ error: 'confirmed_qty, evidence_ref and confirmed_by are required' });
    }
    db.prepare(
      `UPDATE licence_observation
       SET confirmed_qty = ?, evidence_ref = ?, confirmed_by = ?, confirmed_at = datetime('now'), status = 'CONFIRMED'
       WHERE id = ?`
    ).run(confirmed_qty, evidence_ref, confirmed_by, row.id);
    runControls(db);
    res.json(db.prepare(`SELECT * FROM licence_observation WHERE id = ?`).get(row.id));
  });

  return router;
};
