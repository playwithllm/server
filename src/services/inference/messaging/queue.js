const RabbitMQClient = require("../../../shared/libraries/util/rabbitmq");
const logger = require("../../../shared/libraries/log/logger");
const eventEmitter = require("../../../shared/libraries/events/eventEmitter");
const {
  generateCompletion: generateCompletionVllm,
} = require("../vllm/openai-vllm");
const {
  generateCompletion: generateCompletionOllama,
} = require("../ollama/openai-ollama");
const modelsConfig = require("../../../shared/configs/models");

// RabbitMQ configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const INFERENCE_QUEUE = process.env.INFERENCE_QUEUE || "inference_queue";
const BUSINESS_QUEUE = process.env.BUSINESS_QUEUE || "business_queue";

let client = null;

/**
 * Route the request to the appropriate model provider
 * @param {string} modelName Name of the model to use
 * @param {Array} prompts Array of message objects for the LLM
 * @returns {Promise<Object>} Result of the model invocation
 */
async function routeToModelProvider(modelName, prompts) {
  // Get the default model if none specified
  const defaultModel = modelsConfig.getDefaultModelId();
  const selectedModel = modelName || defaultModel;

  // Get provider from config, default to vLLM if not found
  const provider = modelsConfig.getModelProvider(selectedModel);

  logger.info("Routing request to provider", {
    requestedModel: modelName,
    selectedModel: selectedModel,
    provider: provider,
  });

  // Route based on provider
  switch (provider) {
    case "ollama":
      logger.debug(`Using Ollama with model: ${selectedModel}`);
      return await generateCompletionOllama(prompts, selectedModel);
    case "vllm":
    default:
      logger.debug(`Using vLLM with model: ${selectedModel}`);
      return await generateCompletionVllm(prompts, selectedModel);
  }
}

/**
 * Handle an inference request
 * @param {Object} request The inference request object
 * @param {Object} msg The RabbitMQ message object
 * @param {Object} mqClient The RabbitMQ client
 */
async function handleInferenceRequest(request, msg, mqClient) {
  logger.info("Processing inference request:", { id: request._id });

  const { connectionId, prompts, _id, modelName } = request;

  if (!prompts || prompts.length === 0) {
    logger.error("No prompts provided for inference");
    await mqClient.ack(msg);
    return;
  }

  try {
    // Create event handlers for streaming
    const handleStreamChunk = async (part) => {
      logger.debug("Stream chunk received", { id: _id });
      await client.publishMessage(BUSINESS_QUEUE, {
        result: part,
        timestamp: new Date().toISOString(),
        connectionId,
        _id,
      });
    };

    const handleStreamChunkEnd = async (part) => {
      logger.info("Stream completed", { id: _id, part });
      await client.publishMessage(BUSINESS_QUEUE, {
        result: part,
        timestamp: new Date().toISOString(),
        connectionId,
        _id,
      });

      // Clean up event listeners to prevent memory leaks
      eventEmitter.removeListener(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
        handleStreamChunk
      );

      eventEmitter.removeListener(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
        handleStreamChunkEnd
      );
    };

    // Attach event listeners
    eventEmitter.on(
      eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
      handleStreamChunk
    );

    eventEmitter.on(
      eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
      handleStreamChunkEnd
    );

    // Route to the appropriate model provider based on modelName
    await routeToModelProvider(modelName, prompts);

    // Acknowledge the message
    await mqClient.ack(msg);
    logger.info("Inference request processed successfully", {
      id: _id,
      model: modelName,
    });
  } catch (error) {
    logger.error("Error processing inference:", error);
    // Send error response back to business service
    await client.publishMessage(BUSINESS_QUEUE, {
      originalRequest: prompts,
      error: error.message,
      status: "failed",
      timestamp: new Date().toISOString(),
      _id,
    });
    // Negative acknowledge to requeue the message if possible
    await mqClient.nack(msg, true);
  }
}

/**
 * Initialize RabbitMQ connection and set up consumers
 */
async function initialize() {
  if (!client) {
    try {
      client = new RabbitMQClient(RABBITMQ_URL);
      await client.connect();
      // Add reconnection handling
      client.connection.on("close", async () => {
        logger.warn("RabbitMQ connection closed, attempting to reconnect...");
        client = null; // Reset client so it can be recreated
        setTimeout(initialize, 5000);
      });
      // Setup queues
      await client.setupQueue(INFERENCE_QUEUE);
      await client.setupQueue(BUSINESS_QUEUE);
      // Setup consumer for inference requests
      await client.consumeMessage(INFERENCE_QUEUE, handleInferenceRequest);
      logger.info("Inference service messaging initialized");
    } catch (error) {
      logger.error("Failed to initialize RabbitMQ:", error);
      client = null;
      setTimeout(initialize, 5000);
    }
  }
}

/**
 * Get available models with their configurations
 */
function getAvailableModels() {
  return modelsConfig.getAllModels();
}

module.exports = {
  initialize,
  getAvailableModels,
};
