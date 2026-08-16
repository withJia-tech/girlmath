const express = require('express');
const { runControls, exceptionCounts } = require('../rules/controls');

module.exports = function healthRoutes(db) {
  const router = express.Router();

  // 15_Checks as a live endpoint: REVIEW while any critical exception is
  // open, OK otherwise. CI runs the same rule via test/reconcile.test.js.
  router.get('/model', (req, res) => {
    runControls(db);
    const counts = exceptionCounts(db);
    const meta = db.prepare(`SELECT * FROM model_meta WHERE id = 1`).get();
    res.json({
      status: counts.critical > 0 ? 'REVIEW' : 'OK',
      as_of_date: meta.as_of_date,
      version: meta.version,
      exception_counts: counts,
    });
  });

  return router;
};
