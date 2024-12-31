const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter');

const { updateById } = require('../../business/domains/inference/service');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

const client = new RabbitMQClient(RABBITMQ_URL);

const inMemoryValue = {};

const eventEmitters = new Map();

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
    // console.log('handleInferenceResponse\t', content);

    if (!inMemoryValue[content._id]) {
      inMemoryValue[content._id] = '';
    }

    if (content.done) {
      // logger.info('Received inference response:', content);
      inMemoryValue[content._id] += content.result.message.content;
      // console.log('emitting inference stream chunk end\t', { content, inMemoryValue });

      // To calculate how fast the response is generated in tokens per second (token/s), divide eval_count / eval_duration * 10^9.
      const tokensPerSecond = content.result.eval_count / content.result.eval_duration * 1e9;
      console.log('Speed:', tokensPerSecond);
      await updateById(content._id, { response: inMemoryValue[content._id], status: 'completed', result: content.result, tokensPerSecond });

      // clear in-memory value
      inMemoryValue[content._id] = undefined;
      eventEmitter.emit(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
        content
      );

      // get the eventEmitter by content._id and broadcast the response
      const emitter = eventEmitters.get(content._id);
      if (emitter) {
        emitter.emit('inferenceStreamChunkEnd', content);
        eventEmitters.delete(content._id);
      }
    } else {
      // logger.info('Received inference chunk response:', content);
      // console.log('emitting inference stream chunk\t', { content, msg });
      inMemoryValue[content._id] += content.result.message.content;
      eventEmitter.emit(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
        content
      );

      // get the eventEmitter by content._id and broadcast the response
      const emitter = eventEmitters.get(content._id);
      if (emitter) {
        emitter.emit('inferenceStreamChunk', content);
      }
    }

    await client.ack(msg);
  } catch (error) {
    logger.error('Error processing inference response:', error);
    await client.nack(msg, true);
  }
}

async function sendInferenceRequest(request, eventEmitter) {
  try {
    if (eventEmitter) {
      eventEmitters.set(request._id.toString(), eventEmitter);
    }
    logger.info('Publishing inference request to queue:', { _id: request._id.toString() });
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
