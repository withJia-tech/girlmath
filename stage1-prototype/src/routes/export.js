const express = require('express');
const { buildWorkbook } = require('../lib/xlsxExport');

module.exports = function exportRoutes(db) {
  const router = express.Router();

  router.get('/export.xlsx', async (req, res, next) => {
    try {
      const workbook = buildWorkbook(db);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="hss-financial-control.xlsx"');
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      next(err);
    }
  });

  return router;
};
