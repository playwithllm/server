const express = require('express');
const logger = require('../../shared/libraries/log/logger');
const domainRoutes = require('./domains/index');
const packageJson = require('../../../package.json');
const businessMessaging = require('./messaging');
const auth = require('../../shared/middlewares/auth/authentication');
const { configureAuthToExpressApp: authRoutes } = require('./auth/api');
const { handleGenerateRequest } = require('./domains/inference/api');

function formatUptime(uptime) {
  const days = Math.floor(uptime / (24 * 60 * 60));
  const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((uptime % (60 * 60)) / 60);
  const seconds = Math.floor(uptime % 60);

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

async function defineRoutes(expressApp) {
  logger.info('Defining routes...');
  authRoutes(expressApp);

  // API endpoints will be mounted on /api/v1 below

  const businessRouter = express.Router();
  await domainRoutes(businessRouter);

  // we need to call `auth.isAuthenticated` like this so that we can mock the auth module in tests
  expressApp.use('/api/v1', auth.isAuthenticated, businessRouter);
  
  // health check
  expressApp.get('/health', (req, res) => {
    const healthCheck = {
      uptime: process.uptime(),
      formattedUptime: formatUptime(process.uptime()),
      message: 'OK',
      timestamp: Date.now(),
      version: packageJson.version,
    };
    res.status(200).json(healthCheck);
  });
  
  // 404 handler
  expressApp.use((req, res) => {
    res.status(404).send('Not Found');
  });
  
  logger.info('Routes defined');
}

module.exports = defineRoutes;