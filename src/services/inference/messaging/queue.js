const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter'); // Import EventEmitter

const { generateResponse, generateResponseStream } = require('../ollama');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

let client = null;

// Mock inference processing function
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

// async function processInferenceStream(data) {
//   console.log('processInferenceStream\t', data);

//   eventEmitter.on(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, (part) => {
//     console.log('Inference stream chunk:', part);
//   });

//   eventEmitter.on(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END, (part) => {
//     console.log('Inference stream chunk end:', part);
//   });

//   const response = await generateResponseStream(data);
//   logger.info('Inference response:', response);
//   return {
//     success: true,
//     result: response,
//     timestamp: new Date().toISOString(),
//   };
// }

const initialize = async () => {
  if (!client) {
    client = new RabbitMQClient(RABBITMQ_URL);
    await client.connect();

    // Setup queues
    await client.setupQueue(INFERENCE_QUEUE);
    await client.setupQueue(BUSINESS_QUEUE);

    // Setup consumer for inference requests
    await client.consumeMessage(
      INFERENCE_QUEUE,
      async (content, msg, mqClient) => {
        logger.info('Processing inference request:', content);

        try {
          eventEmitter.on(
            eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
            async (part) => {
              console.log('Inference stream chunk:', part);
              await client.publishMessage(BUSINESS_QUEUE, {
                originalRequest: content,
                result: part,
                timestamp: new Date().toISOString(),
                done: part.done,
              });
            }
          );

          eventEmitter.on(
            eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
            async (part) => {
              console.log('Inference stream chunk end:', part);
              await client.publishMessage(BUSINESS_QUEUE, {
                originalRequest: content,
                result: part,
                timestamp: new Date().toISOString(),
                done: part.done,
              });
            }
          );

          const response = await generateResponseStream(content);
          console.log('generateResponseStream.response', response);

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
            timestamp: new Date().toISOString(),
          });

          // Use the mqClient instance to negative acknowledge
          await mqClient.nack(msg, true); // true to requeue the message
        }
      }
    );

    logger.info('Inference service messaging initialized');
  }
};

module.exports = {
  initialize,
};
