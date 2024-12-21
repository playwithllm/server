const { startWebServer } = require('./server');
const logger = require('../../shared/libraries/log/logger');

const start = async () => {
  try {
    await startWebServer();
    logger.info('Business service started successfully');
  } catch (error) {
    logger.error('Failed to start business service:', error);
    process.exit(1);
  }
};

start();
