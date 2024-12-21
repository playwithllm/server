const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

let client = null;

const initialize = async () => {
  if (!client) {
    client = new RabbitMQClient(RABBITMQ_URL);
    await client.connect();
    await client.setupQueue(INFERENCE_QUEUE);
    await client.setupQueue(BUSINESS_QUEUE);
    logger.info('RabbitMQ client initialized');
  }
};

const sendInferenceRequest = async (data) => {
  try {
    if (!client) {
      await initialize();
    }
    logger.info('Sending inference request:', data);
    await client.publishMessage(INFERENCE_QUEUE, data);
    logger.info('Inference request sent successfully');
  } catch (error) {
    logger.error('Error sending inference request:', error);
    throw error;
  }
};

module.exports = {
  sendInferenceRequest,
  initialize
}; 
