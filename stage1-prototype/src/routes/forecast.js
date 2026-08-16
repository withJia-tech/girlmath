const express = require('express');
const { forecastMonth, variance } = require('../rules/forecast');

module.exports = function forecastRoutes(db) {
  const router = express.Router();

  router.get('/:fy/forecast', (req, res) => {
    res.json(forecastMonth(db, Number(req.params.fy)));
  });

  router.get('/:fy/variance', (req, res) => {
    res.json(variance(db, Number(req.params.fy)));
  });

  return router;
};
