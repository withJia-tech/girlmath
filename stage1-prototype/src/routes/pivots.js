const express = require('express');
const { pivotCostStream, pivotAor, pivotMonth } = require('../rules/forecast');

module.exports = function pivotsRoutes(db) {
  const router = express.Router();

  router.get('/:fy/pivot/cost-stream', (req, res) => {
    res.json(pivotCostStream(db, Number(req.params.fy)));
  });

  router.get('/:fy/pivot/aor', (req, res) => {
    res.json(pivotAor(db, Number(req.params.fy)));
  });

  router.get('/:fy/pivot/month', (req, res) => {
    res.json(pivotMonth(db, Number(req.params.fy)));
  });

  return router;
};
