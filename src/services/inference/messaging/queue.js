const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter');

// const { generateResponse, chatResponseStream } = require('../ollama');
const { generateCompletionWithImage } = require('../vllm/openai-vllm');
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

        const { connectionId, prompts, _id } = request;

        if (!prompts || prompts.length === 0) {
          logger.error('No prompts provided for inference');
          await mqClient.ack(msg);
          return;
        }

        try {
          // Create unique event handlers
          const handleStreamChunk = async (part) => {
            await client.publishMessage(BUSINESS_QUEUE, {
              // originalRequest: content,
              result: part,
              timestamp: new Date().toISOString(),
              done: part.done,
              connectionId,
              _id
            });

          };

          const handleStreamChunkEnd = async (part) => {
            await client.publishMessage(BUSINESS_QUEUE, {
              result: part,
              timestamp: new Date().toISOString(),
              done: part.done,
              connectionId,
              _id
            });
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

          // await chatResponseStream(prompts);
          await generateCompletionWithImage(prompts);

          await mqClient.ack(msg);

          logger.info('Inference result sent back to business service');
        } catch (error) {
          logger.error('Error processing inference:', error);

          await client.publishMessage(BUSINESS_QUEUE, {
            originalRequest: prompts,
            error: error.message,
            status: 'failed',
            timestamp: new Date().toISOString(),
          });
          // no need to handle the error cases, simply ack the message
          await mqClient.ack(msg);
        }
      }
    );

    logger.info('Inference service messaging initialized');
  }
}

module.exports = {
  initialize,
};
