const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const { generateResponse } = require('../ollama');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

let client = null;

// Mock inference processing function
async function processInference(data) {
  const response = await generateResponse(data.prompt);
  logger.info('Inference response:', response);
  return {
    success: true,
    result: response,
    timestamp: new Date().toISOString()
  };
}

const initialize = async () => {
  if (!client) {
    client = new RabbitMQClient(RABBITMQ_URL);
    await client.connect();

    // Setup queues
    await client.setupQueue(INFERENCE_QUEUE);
    await client.setupQueue(BUSINESS_QUEUE);

    // Setup consumer for inference requests
    await client.consumeMessage(INFERENCE_QUEUE, async (content, msg, mqClient) => {
      logger.info('Processing inference request:', content);

      try {
        // Process the inference request
        const response = await processInference(content);

        // Send result back to business service
        await client.publishMessage(BUSINESS_QUEUE, {
          originalRequest: content,
          result: response.result,
          timestamp: new Date().toISOString()
        });

        // Use the mqClient instance to acknowledge
        await mqClient.ack(msg);

        logger.info('Inference result sent back to business service');
      } catch (error) {
        logger.error('Error processing inference:', error);

        // Send error result back to business service
        await client.publishMessage(BUSINESS_QUEUE, {
          originalRequest: content,
          error: error.message,
          status: 'failed',
          timestamp: new Date().toISOString()
        });

        // Use the mqClient instance to negative acknowledge
        await mqClient.nack(msg, true); // true to requeue the message
      }
    });

    logger.info('Inference service messaging initialized');
  }
};

module.exports = {
  initialize
}; 
