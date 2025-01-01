const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter');

const { updateById, getAllByApiKeyId, getById } = require('../../business/domains/inference/service');
const { updateById: updateApiKeyUsage } = require('../../business/domains/apiKeys/service');

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

      // cost calculation: 1 BDT per 1M prompt tokens (prompt_eval_count), 2 BDT per 1M response tokens (eval_count)
      const inputCost = content.result.prompt_eval_count / 1e6;
      const outputCost = (content.result.eval_count / 1e6) * 2;
      const totalCost = inputCost + outputCost;

      // durations in seconds (total_duration, eval_duration, prompt_eval_duration)
      const prompt_eval_duration_in_seconds = content.result.prompt_eval_duration / 1e9;
      const eval_duration_in_seconds = content.result.eval_duration / 1e9;
      const total_duration_in_seconds = content.result.total_duration / 1e9;

      const updatedResult = {
        ...content.result,
        prompt_eval_cost: inputCost,
        eval_cost: outputCost,
        total_cost: totalCost,
        eval_duration_in_seconds,
        prompt_eval_duration_in_seconds,
        total_duration_in_seconds,
        tokens_per_second: tokensPerSecond
      };


      await updateById(content._id, { response: inMemoryValue[content._id], status: 'completed', result: updatedResult });
      
      const updatedContent = await getById(content._id);      

      const inferenceItems = await getAllByApiKeyId(updatedContent.apiKeyId);
      const totalRequests = inferenceItems.length;
      const totalPromptEvalCount = inferenceItems.reduce((acc, item) => acc + item.result.prompt_eval_count, 0);
      const totalEvalCount = inferenceItems.reduce((acc, item) => acc + item.result.eval_count, 0);
      const totalCount = totalPromptEvalCount + totalEvalCount;
      const totalPromptEvalCost = inferenceItems.reduce((acc, item) => acc + item.result.prompt_eval_cost, 0);
      const totalEvalCost = inferenceItems.reduce((acc, item) => acc + item.result.eval_cost, 0);
      const totalCosts = inferenceItems.reduce((acc, item) => acc + item.result.total_cost, 0);
      const totalDurations = inferenceItems.reduce((acc, item) => acc + item.result.total_duration_in_seconds, 0);

      console.log('Total Requests:', inferenceItems.length);
      

      await updateApiKeyUsage(updatedContent.apiKeyId, {
        usage: {
          requests: totalRequests,
          prompt_eval_count: totalPromptEvalCount,
          eval_count: totalEvalCount,
          total_count: totalCount,
          prompt_eval_cost: totalPromptEvalCost,
          eval_cost: totalEvalCost,
          total_cost: totalCosts,
          total_duration: totalDurations
        }
      });

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
