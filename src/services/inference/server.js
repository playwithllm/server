const logger = require('../../shared/libraries/log/logger');
const { initialize } = require('./messaging/queue');

class InferenceServer {
  async start() {
    try {
      logger.info('Starting inference service...');
      
      // Initialize queue workers - this will start listening for messages
      await initialize();
      
      logger.info('Inference service started successfully and listening for messages');
    } catch (error) {
      logger.error('Failed to start inference service:', error);
      throw error;
    }
  }
}

module.exports = new InferenceServer();
