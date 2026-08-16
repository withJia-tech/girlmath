const path = require('path');
const { createDb } = require('./db');
const { seed } = require('./db/seed');
const { createApp } = require('./app');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'stage1.sqlite');
const PORT = process.env.PORT || 4000;

const db = createDb(DB_PATH);

const hasData = db.prepare(`SELECT COUNT(*) AS n FROM model_meta`).get().n > 0;
if (!hasData) {
  seed(db);
  console.log(`Seeded ${DB_PATH}`);
}

const app = createApp(db);

app.listen(PORT, () => {
  console.log(`HSS Central Financial Control — Stage 1 prototype listening on http://localhost:${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/health/model`);
});
