const express = require('express');
const { runControls } = require('../rules/controls');

module.exports = function aorRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM aor ORDER BY name`).all();
    const allocStmt = db.prepare(`SELECT fy, allocated_amount FROM aor_fy_allocation WHERE aor_id = ? ORDER BY fy`);
    res.json(rows.map((r) => ({ ...r, allocations: allocStmt.all(r.id) })));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM aor WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'aor not found' });
    row.allocations = db
      .prepare(`SELECT fy, allocated_amount FROM aor_fy_allocation WHERE aor_id = ? ORDER BY fy`)
      .all(row.id);
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { name, official_ref = null, description = null } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = db
      .prepare(`INSERT INTO aor (name, official_ref, description) VALUES (?, ?, ?)`)
      .run(name, official_ref, description);
    runControls(db);
    res.status(201).json(db.prepare(`SELECT * FROM aor WHERE id = ?`).get(result.lastInsertRowid));
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM aor WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'aor not found' });
    const official_ref = req.body?.official_ref ?? row.official_ref;
    const description = req.body?.description ?? row.description;
    db.prepare(`UPDATE aor SET official_ref = ?, description = ? WHERE id = ?`).run(
      official_ref,
      description,
      row.id
    );
    runControls(db);
    res.json(db.prepare(`SELECT * FROM aor WHERE id = ?`).get(row.id));
  });

  return router;
};
