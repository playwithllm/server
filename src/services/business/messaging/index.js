const RabbitMQClient = require("../../../shared/libraries/util/rabbitmq");
const logger = require("../../../shared/libraries/log/logger");
const eventEmitter = require("../../../shared/libraries/events/eventEmitter");
const { updateById, getById } = require("../domains/inference/service");

// RabbitMQ configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const INFERENCE_QUEUE = process.env.INFERENCE_QUEUE || "inference_queue";
const BUSINESS_QUEUE = process.env.BUSINESS_QUEUE || "business_queue";

let client;

// Store in-memory response data
const responseStore = {};

// Store client event emitters
const clientEmitters = new Map();

/**
 * Handle inference response coming from the inference service
 * @param {Object} chunk The response chunk
 * @param {Object} msg The RabbitMQ message
 * @param {Object} mqClient The RabbitMQ client
 */
async function handleInferenceResponse(chunk, msg, mqClient) {
  try {
    const chunkId = chunk._id;
    // logger.info('Received inference response:', { id: chunkId, chunk });

    // Initialize response store for this chunk if needed
    if (!responseStore[chunkId]) {
      responseStore[chunkId] = "";
    }

    const isComplete = chunk?.result?.choices?.length === 0;
    const chunkContent = chunk?.result?.choices?.[0]?.delta?.content || "";

    logger.debug("Checking chunk completion status:", {
      id: chunkId,
      isComplete,
      hasChoices: Boolean(chunk?.result?.choices),
      // choicesLength: chunk?.result?.choices?.length,
      // resultStructure: chunk.result ? Object.keys(chunk.result) : 'no result',
      // chunkContent: chunkContent.substring(0, 20) + (chunkContent.length > 20 ? '...' : '')
    });

    if (isComplete) {
      logger.info("Processing complete inference response:", {
        id: chunkId,
        result: chunk.result,
      });

      // Calculate token costs using a fixed rate
      const COST_PER_TOKEN = 1 / 1e6;

      // Extract usage data more safely with proper fallbacks
      const usage = {
        prompt_tokens: chunk.result?.usage?.prompt_tokens || 0,
        completion_tokens: chunk.result?.usage?.completion_tokens || 0,
        total_tokens: chunk.result?.usage?.total_tokens || 0,
      };

      // Calculate costs based on extracted tokens with 6 decimal precision
      usage.prompt_cost = parseFloat((usage.prompt_tokens * COST_PER_TOKEN).toFixed(6));
      usage.completion_cost = parseFloat((usage.completion_tokens * COST_PER_TOKEN).toFixed(6));
      usage.total_cost = parseFloat((usage.prompt_cost + usage.completion_cost).toFixed(6));

      const existingItem = await getById(chunkId);
      const inputTime = existingItem.inputTime ?? existingItem.createdAt;
      const duration = new Date(chunk.result.created * 1000) - inputTime;

      // Prepare result data with proper timestamp handling
      const updatedResult = {
        id: chunk.result?.id || chunkId,
        object: chunk.result?.object || "chat.completion",
        model: chunk.result?.model || "unknown",
        system_fingerprint: chunk.result?.system_fingerprint,
        created: chunk.result?.created
          ? new Date(chunk.result.created * 1000)
          : new Date(),
        timestamp: new Date(), // Current processing timestamp
        ...usage,
        duration,
      };

      logger.info("Saving completed response to database:", {
        id: chunkId,
        model: updatedResult.model,
        responseLength: responseStore[chunkId]?.length || 0,
        tokens: usage.total_tokens,
      });

      // Update database with complete response
      try {
        await updateById(chunkId, {
          response: responseStore[chunkId] || "",
          status: "completed",
          result: updatedResult,
          isCompleted: true,
        });
        logger.info("Successfully saved response to database", { id: chunkId });
      } catch (dbError) {
        logger.error("Failed to save response to database:", {
          id: chunkId,
          error: dbError.message,
        });
      }

      // Clean up memory
      delete responseStore[chunkId];

      // Emit global event
      eventEmitter.emit(
        eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
        chunk
      );

      // Emit client event if client is still connected
      const emitter = clientEmitters.get(chunkId);
      if (emitter) {
        emitter.emit("inferenceStreamChunkEnd", chunk);
        clientEmitters.delete(chunkId);
      }
    } else {
      // Handle streaming chunk
      responseStore[chunkId] += chunkContent;

      // Emit global event
      eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, chunk);

      // Emit client event if client is still connected
      const emitter = clientEmitters.get(chunkId);
      if (emitter) {
        emitter.emit("inferenceStreamChunk", chunk);
      }
    }

    // Acknowledge message
    await mqClient.ack(msg);
  } catch (error) {
    logger.error("Error processing inference response:", error);
    // Negative acknowledge with requeue on error
    await mqClient.nack(msg, true);
  }
}

/**
 * Initialize RabbitMQ connection and set up consumers
 */
async function initialize() {
  try {
    client = new RabbitMQClient(RABBITMQ_URL);
    await client.connect();

    const setupConsumers = async () => {
      await client.setupQueue(INFERENCE_QUEUE);
      await client.setupQueue(BUSINESS_QUEUE);
      await client.consumeMessage(BUSINESS_QUEUE, handleInferenceResponse);
    };

    // Handle connection events
    client.connection.on("close", async () => {
      logger.warn("RabbitMQ connection closed, attempting to reconnect...");
      setTimeout(initialize, 5000); // Retry connection after 5 seconds
    });

    client.connection.on("error", (err) => {
      logger.error("RabbitMQ connection error:", err);
    });

    await setupConsumers();
    logger.info("Business service messaging initialized");
  } catch (error) {
    logger.error("Failed to initialize RabbitMQ connection:", error);
    setTimeout(initialize, 5000); // Retry connection after 5 seconds
  }
}

/**
 * Send an inference request to the inference service
 * @param {Object} request The inference request
 * @param {EventEmitter} clientEmitter The event emitter for the client
 * @returns {Promise<void>}
 */
async function sendInferenceRequest(request, clientEmitter) {
  try {
    // Check if connection is healthy before sending
    if (!client?.connection?.connection?.readable) {
      logger.warn("RabbitMQ connection not ready, reinitializing...");
      await initialize();
    }

    // Store the client's event emitter for later stream handling
    if (clientEmitter) {
      clientEmitters.set(request._id.toString(), clientEmitter);
    }

    logger.info("Publishing inference request to queue:", {
      request,
    });
    await client.publishMessage(INFERENCE_QUEUE, request);
    logger.info("Sent inference request successfully");
  } catch (error) {
    logger.error("Failed to send inference request:", error);
    // Clean up the eventEmitter if request failed
    if (clientEmitter) {
      clientEmitters.delete(request._id.toString());
    }
    throw error;
  }
}

module.exports = {
  initialize,
  sendInferenceRequest,
};
