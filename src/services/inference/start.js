const server = require('./server');
const logger = require('../../shared/libraries/log/logger');

const start = async () => {
  try {
    await server.start();
  } catch (error) {
    logger.error('Failed to start the inference service:', error);
    process.exit(1);
  }
};

start();
