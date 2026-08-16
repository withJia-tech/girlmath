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
    const { name, source_id, qty, rate, months, fy } = req.body || {};
    if (!name || !source_id || qty == null || rate == null || !months || !fy) {
      return res.status(400).json({ error: 'name, source_id, qty, rate, months and fy are required' });
    }
    const result = db
      .prepare(`INSERT INTO cost_driver (name, source_id, qty, rate, months, fy) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(name, source_id, qty, rate, months, fy);
    runControls(db);
    res.status(201).json(db.prepare(`SELECT * FROM cost_driver WHERE id = ?`).get(result.lastInsertRowid));
  });

  return router;
};
