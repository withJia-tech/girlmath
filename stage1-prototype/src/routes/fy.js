const express = require('express');
const { fyPosition } = require('../rules/forecast');

module.exports = function fyRoutes(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare(`SELECT * FROM fy_funding ORDER BY fy`).all());
  });

  router.get('/:fy/position', (req, res) => {
    res.json(fyPosition(db, Number(req.params.fy)));
  });

  return router;
};
