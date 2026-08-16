const express = require('express');

const fyRoutes = require('./routes/fy');
const forecastRoutes = require('./routes/forecast');
const pivotsRoutes = require('./routes/pivots');
const aorRoutes = require('./routes/aor');
const commitmentsRoutes = require('./routes/commitments');
const driversRoutes = require('./routes/drivers');
const licenceRoutes = require('./routes/licence');
const actualsRoutes = require('./routes/actuals');
const exceptionsRoutes = require('./routes/exceptions');
const healthRoutes = require('./routes/health');
const exportRoutes = require('./routes/export');

function createApp(db) {
  const app = express();
  app.use(express.json());

  app.use('/api/v1/fy', fyRoutes(db));
  app.use('/api/v1/fy', forecastRoutes(db));
  app.use('/api/v1/fy', pivotsRoutes(db));
  app.use('/api/v1/aor', aorRoutes(db));
  app.use('/api/v1/commitments', commitmentsRoutes(db));
  app.use('/api/v1/drivers', driversRoutes(db));
  app.use('/api/v1/licence', licenceRoutes(db));
  app.use('/api/v1/actuals', actualsRoutes(db));
  app.use('/api/v1/exceptions', exceptionsRoutes(db));
  app.use('/health', healthRoutes(db));
  app.use('/', exportRoutes(db));

  app.use((req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message || 'internal error' });
  });

  return app;
}

module.exports = { createApp };
