const messaging = require('./messaging');
const logger = require('../../shared/libraries/log/logger');

class InferenceServer {
  async start() {
    try {
      await messaging.initialize();
      logger.info('Inference service started successfully');
    } catch (error) {
      logger.error('Failed to start inference service:', error);
      throw error;
    }
  }
}

module.exports = new InferenceServer();
