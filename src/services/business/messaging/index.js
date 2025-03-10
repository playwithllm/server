const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter');

const { updateById, getAllByApiKeyId, getById } = require('../../business/domains/inference/service');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

let client;

const inMemoryValue = {};

const eventEmitters = new Map();

async function initialize() {
  try {
    client = new RabbitMQClient(RABBITMQ_URL);
    await client.connect();

    const setupConsumers = async () => {
      await client.setupQueue(INFERENCE_QUEUE);
      await client.setupQueue(BUSINESS_QUEUE);

      // await client.consumeMessage(BUSINESS_QUEUE, async (request, msg, mqClient) => {
      //   try {
      //     // Your inference processing logic
      //     console.log('Inference request received:', request._id, JSON.stringify(request));
      //     await handleInferenceResponseOpenAI(request, msg, mqClient);
      //   } catch (error) {
      //     console.error('Error processing inference request:', error);
      //   } finally {
      //     mqClient.ack(msg);
      //   }
      // });
      await client.consumeMessage(BUSINESS_QUEUE, handleInferenceResponseOpenAI);
    };

    // Handle connection events
    client.connection.on('close', async () => {
      console.warn('RabbitMQ connection closed, attempting to reconnect...');
      setTimeout(initialize, 5000); // Retry connection after 5 seconds
    });

    client.connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });

    await setupConsumers();
    console.info('Business service messaging initialized');
  } catch (error) {
    console.error('Failed to initialize RabbitMQ connection:', error);
    setTimeout(initialize, 5000); // Retry connection after 5 seconds
  }
}

async function handleInferenceResponseOpenAI(chunk, msg, mqClient) {
  try {
    console.log('handleInferenceResponseOpenAI:', chunk);

    if (!inMemoryValue[chunk._id]) {
      inMemoryValue[chunk._id] = '';
    }

    const isComplete = chunk?.result?.choices?.length === 0;
    const chunkContent = chunk?.result?.choices[0]?.delta?.content || '';

    if (isComplete) {
      console.log('handleInferenceResponseOpenAI-isComplete:', chunk);

      // calculate the cost from the usage coming from the response
      /**
       * 
        prompt_tokens 3402
        total_tokens 3474
        completion_tokens 72
      */

      const prompt_tokens = chunk.result.usage?.prompt_tokens || 0;
      const total_tokens = chunk.result.usage?.total_tokens || 0;
      const completion_tokens = chunk.result.usage?.completion_tokens || 0;

      const prompt_cost = prompt_tokens / 1e6;
      const completion_cost = completion_tokens / 1e6;
      const total_cost = prompt_cost + completion_cost;

      const usage = {
        ...chunk.result.usage,
        prompt_cost,
        completion_cost,
        total_cost
      };

      // Handle completion
      const updatedResult = {
        id: chunk.result.id,
        model: chunk.result.model,
        created: chunk.result.created,        
        timestamp: chunk.timestamp,        
        ...usage
      };

      await updateById(chunk._id, {
        response: inMemoryValue[chunk._id],
        status: 'completed',
        result: updatedResult
      });

      // Clear memory and emit completion events
      inMemoryValue[chunk._id] = undefined;
      eventEmitter.emit(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
        chunk
      );

      const emitter = eventEmitters.get(chunk._id);
      if (emitter) {
        emitter.emit('inferenceStreamChunkEnd', chunk);
        eventEmitters.delete(chunk._id);
      }
    } else {
      // Handle streaming chunk
      inMemoryValue[chunk._id] += chunkContent;
      eventEmitter.emit(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
        chunk
      );

      const emitter = eventEmitters.get(chunk._id);
      if (emitter) {
        emitter.emit('inferenceStreamChunk', chunk);
      }
    }

    await mqClient.ack(msg);
  } catch (error) {
    logger.error('Error processing inference response:', error);
    await mqClient.nack(msg, true);
  }
}

async function handleInferenceResponseOllama(content, msg, mqClient) {
  try {
    console.log('handleInferenceResponse:', content._id);
    console.log('handleInferenceResponse:', content.result);
    if (!inMemoryValue[content._id]) {
      inMemoryValue[content._id] = '';
    }

    if (content.done) {
      inMemoryValue[content._id] += content.result.message.content;
      // To calculate how fast the response is generated in tokens per second (token/s), divide eval_count / eval_duration * 10^9.
      const tokensPerSecond = content.result.eval_count / content.result.eval_duration * 1e9;

      // cost calculation: 1 BDT per 1M prompt tokens (prompt_eval_count), 2 BDT per 1M response tokens (eval_count)
      const inputCost = content.result.prompt_eval_count / 1e6;
      const outputCost = (content.result.eval_count / 1e6) * 2;
      const totalCost = inputCost + outputCost;

      // durations in seconds (total_duration, eval_duration, prompt_eval_duration)
      const prompt_eval_duration_in_seconds = content.result?.prompt_eval_duration ? content.result?.prompt_eval_duration / 1e9 : 0;
      const eval_duration_in_seconds = content.result?.eval_duration ? content.result?.eval_duration / 1e9 : 0;
      const total_duration_in_seconds = content.result?.total_duration ? content.result?.total_duration / 1e9 : 0;

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
    // Check if connection is healthy before sending
    if (!client?.connection?.connection?.readable) {
      console.warn('RabbitMQ connection not ready, reinitializing...');
      await initialize();
    }

    if (eventEmitter) {
      eventEmitters.set(request._id.toString(), eventEmitter);
    }
    logger.info('Publishing inference request to queue:', { _id: request._id.toString() });
    await client.publishMessage(INFERENCE_QUEUE, request);
    logger.info('Sent inference request successfully');
  } catch (error) {
    logger.error('Failed to send inference request:', error);
    // Clear the eventEmitter if request failed
    if (eventEmitter) {
      eventEmitters.delete(request._id.toString());
    }
    throw error;
  }
}

module.exports = {
  initialize,
  sendInferenceRequest,
};
