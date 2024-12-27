const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

const client = new RabbitMQClient(RABBITMQ_URL);


async function initialize() {
  try {
    await client.connect();

    // Setup queues
    await client.setupQueue(BUSINESS_QUEUE);
    await client.setupQueue(INFERENCE_QUEUE);

    // Setup consumer for inference responses
    await client.consumeMessage(BUSINESS_QUEUE, handleInferenceResponse);

    logger.info('Business messaging initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize business messaging:', error);
    throw error;
  }
}

async function handleInferenceResponse(content, msg) {
  try {
    // logger.info('handleInferenceResponse:', content);
    console.log('handleInferenceResponse\t', content);

    if (content.done) {
      // logger.info('Received inference response:', content);
      console.log('emitting inference stream chunk end\t', { content });

      eventEmitter.emit(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
        content
      );
    } else {
      // logger.info('Received inference chunk response:', content);
      console.log('emitting inference stream chunk\t', { content });
      eventEmitter.emit(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
        content
      );
    }

    await client.ack(msg);
  } catch (error) {
    logger.error('Error processing inference response:', error);
    await client.nack(msg, true);
  }
}

async function sendInferenceRequest(request) {
  try {
    logger.info('Publishing inference request to queue:', request);
    await client.publishMessage(INFERENCE_QUEUE, request);
    logger.info('Sent inference request successfully');
  } catch (error) {
    logger.error('Failed to send inference request:', error);
    throw error;
  }
}

module.exports = {
  initialize,
  sendInferenceRequest,
};
