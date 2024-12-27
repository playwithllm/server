const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter');

const { generateResponse, generateResponseStream } = require('../ollama');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

let client = null;

async function processInference(data) {
  console.log('processInference\t', data);
  const response = await generateResponse(data);
  logger.info('Inference response:', response);
  return {
    success: true,
    result: response,
    timestamp: new Date().toISOString(),
  };
}

async function initialize() {
  if (!client) {
    client = new RabbitMQClient(RABBITMQ_URL);
    await client.connect();

    // Setup queues
    await client.setupQueue(INFERENCE_QUEUE);
    await client.setupQueue(BUSINESS_QUEUE);

    // Setup consumer for inference requests
    await client.consumeMessage(
      INFERENCE_QUEUE,
      async (request, msg, mqClient) => {
        console.log('Processing inference request:', request);

        const { message: content, connectionId } = request;

        try {
          // Create unique event handlers
          const handleStreamChunk = async (part) => {
            console.log('publishing chunk message from inf to biz', { part, connectionId })
            await client.publishMessage(BUSINESS_QUEUE, {
              originalRequest: content,
              result: part,
              timestamp: new Date().toISOString(),
              done: part.done,
              connectionId,
            });
            // if (part.done) {
            //   eventEmitter.removeListener(
            //     eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
            //     handleStreamChunk
            //   );
            //   eventEmitter.removeListener(
            //     eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
            //     handleStreamChunkEnd
            //   );
            // }
          };

          const handleStreamChunkEnd = async (part) => {
            console.log('publishing end message from inf to biz', { part, connectionId })
            await client.publishMessage(BUSINESS_QUEUE, {
              originalRequest: content,
              result: part,
              timestamp: new Date().toISOString(),
              done: part.done,
              connectionId,
            });
            // eventEmitter.removeListener(
            //   eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
            //   handleStreamChunk
            // );
            // eventEmitter.removeListener(
            //   eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
            //   handleStreamChunkEnd
            // );
          };

          // Attach scoped event listeners
          eventEmitter.on(
            eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
            handleStreamChunk
          );

          eventEmitter.on(
            eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
            handleStreamChunkEnd
          );

          await generateResponseStream(content);

          await mqClient.ack(msg);

          logger.info('Inference result sent back to business service');
        } catch (error) {
          logger.error('Error processing inference:', error);

          await client.publishMessage(BUSINESS_QUEUE, {
            originalRequest: content,
            error: error.message,
            status: 'failed',
            timestamp: new Date().toISOString(),
          });

          await mqClient.nack(msg, true);
        }
      }
    );

    logger.info('Inference service messaging initialized');
  }
}

module.exports = {
  initialize,
};
