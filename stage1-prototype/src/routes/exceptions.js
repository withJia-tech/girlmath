const express = require('express');
const { runControls, listExceptions, exceptionCounts } = require('../rules/controls');

module.exports = function exceptionsRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    runControls(db); // exceptions are derived state; recompute on read too
    res.json({ counts: exceptionCounts(db), items: listExceptions(db) });
  });

  router.post('/run', (req, res) => {
    runControls(db);
    res.json({ counts: exceptionCounts(db), items: listExceptions(db) });
  });

  return router;
};
