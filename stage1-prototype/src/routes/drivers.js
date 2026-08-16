const express = require('express');
const { driversForFy } = require('../rules/forecast');
const { runControls } = require('../rules/controls');

module.exports = function driversRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const fy = req.query.fy ? Number(req.query.fy) : null;
    if (fy) return res.json(driversForFy(db, fy));
    res.json(db.prepare(`SELECT * FROM cost_driver ORDER BY fy, name`).all());
  });

  router.post('/', (req, res) => {
    const {
      driver_id,
      fy,
      cost_area = 'HSS Central',
      cost_stream,
      name,
      driver_type = 'Licence quantity',
      qty,
      rate,
      months,
      source_planned_cost,
      aor_record_id = null,
      po_ref = null,
      source_ref = null,
      status = null,
    } = req.body || {};
    if (!driver_id || !name || !fy || !cost_stream || qty == null || rate == null || !months || source_planned_cost == null) {
      return res
        .status(400)
        .json({ error: 'driver_id, name, fy, cost_stream, qty, rate, months and source_planned_cost are required' });
    }
    const result = db
      .prepare(
        `INSERT INTO cost_driver (driver_id, fy, cost_area, cost_stream, name, driver_type, qty, rate, months, source_planned_cost, aor_record_id, po_ref, source_ref, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(driver_id, fy, cost_area, cost_stream, name, driver_type, qty, rate, months, source_planned_cost, aor_record_id, po_ref, source_ref, status);
    runControls(db);
    res.status(201).json(db.prepare(`SELECT * FROM cost_driver WHERE id = ?`).get(result.lastInsertRowid));
  });

  return router;
};
