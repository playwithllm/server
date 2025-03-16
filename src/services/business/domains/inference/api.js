const express = require("express");
const logger = require("../../../../shared/libraries/log/logger");
const {
  AppError,
} = require("../../../../shared/libraries/error-handling/AppError");
const EventEmitter = require("events");

const {
  search,
  count,
  getGroupedEvaluationCounts,
  getDashboardData,
  getAllByWebsocketId,
  create,
} = require("./service");

const { searchSchema, generateSchema } = require("./request");

const {
  validateRequest,
} = require("../../../../shared/middlewares/request-validate");
const { logRequest } = require("../../../../shared/middlewares/log");
const {
  isAuthorized,
} = require("../../../../shared/middlewares/auth/authorization");
const {
  isValidKey,
  getOrCreateDefaultApiKey,
} = require("../../domains/apiKeys/service");
const businessMessaging = require("../../messaging");

const model = "Inference";

/**
 * Handle generation request from API clients
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
async function handleGenerateRequest(req, res, next) {
  const prompt = req.body.prompt;
  const apiKey = req.headers["x-api-key"];
  const modelName = req.body.model || "llama3.2";
  const useDefaultApiKey = req.body.useDefaultApiKey === true;
  const image = req.body.image;

  // console.log('handleGenerateRequest.req.body', req.body);

  if (!prompt) {
    return res.status(400).json({ message: "Prompt is required" });
  }

  let key = null;
  let userId = null;

  try {
    // Check if we should use default API key
    if (useDefaultApiKey) {
      // If useDefaultApiKey is true, the user must be authenticated
      if (!req.user || !req.user._id) {
        return res
          .status(401)
          .json({
            message: "Authentication required when using default API key",
          });
      }

      userId = req.user._id;
      // Get or create default API key for the user
      key = await getOrCreateDefaultApiKey(userId);
      logger.info("Using default API key for user", { userId, keyId: key._id });
    } else {
      // Otherwise use the provided API key
      if (!apiKey) {
        return res
          .status(401)
          .json({
            message:
              "API key is required. Provide x-api-key header or set useDefaultApiKey to true",
          });
      }

      // Validate API key
      key = await isValidKey(apiKey);
      if (!key) {
        return res.status(403).json({ message: "Forbidden" });
      }
      userId = key.userId;
    }

    // Check token usage
    const { tokenCount } = await getDashboardData(userId);
    const TOKEN_LIMIT = 10000;

    if (tokenCount >= TOKEN_LIMIT) {
      return res.status(402).json({
        message: `You have exceeded the free token limit (${TOKEN_LIMIT}) for today. Please try again tomorrow.`,
      });
    }

    // Create inference record
    const savedItem = (
      await create({
        prompt,
        modelName,
        inputTime: new Date(),
        userId,
        apiKeyId: key._id.toString(),
        imageBase64: image,
      })
    ).toObject();

    const userPrompt = {
      role: "user",
      content: [{ type: "text", text: prompt }],
    };
    if (image) {
      const img = {
        type: "image_url",
        image_url: {
          url: image,
        },
      };
      userPrompt.content.push(img);
    }

    // Prepare prompt messages
    const chatMessages = [
      { role: "assistant", content: "You are a helpful assistant." },
      userPrompt,
    ];

    // Set up streaming response
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");

    // Create event emitter for streaming
    const streamEmitter = new EventEmitter();

    // Stream chunks back to client
    streamEmitter.on("inferenceStreamChunk", async (part) => {
      // Attempt to extract content from various possible formats
      let content = "";

      // Handle OpenAI-compatible format from vLLM
      if (part.result?.choices?.[0]?.delta?.content) {
        content = part.result.choices[0].delta.content;
      }
      // Handle direct Ollama format
      else if (part.result?.message?.content) {
        content = part.result.message.content;
      }
      // Try other potential Ollama formats
      else if (part.result?.response) {
        content = part.result.response;
      }

      // Log for debugging but only the first 50 chars to keep logs clean
      logger.debug("Stream chunk format:", {
        hasChoices: Boolean(part.result?.choices),
        hasMessage: Boolean(part.result?.message),
        hasResponse: Boolean(part.result?.response),
        contentLength: content.length,
        contentSample:
          content.substring(0, 50) + (content.length > 50 ? "..." : ""),
      });

      if (content) {
        res.write(content);
      }
    });

    // End stream on completion
    streamEmitter.on("inferenceStreamChunkEnd", async () => {
      res.end();
    });

    // Send inference request to messaging service
    await businessMessaging.sendInferenceRequest(
      {
        prompts: chatMessages,
        connectionId: savedItem._id.toString(),
        _id: savedItem._id.toString(),
        modelName: modelName, // Pass the model name to the inference service
      },
      streamEmitter
    );
  } catch (error) {
    logger.error("Error in generate endpoint:", error);
    next(new AppError("Failed to process generation request", 500, error));
  }
}

const routes = () => {
  const router = express.Router();
  logger.info(`Setting up routes for ${model}`);

  // Add the generate route with validation for the generate schema
  router.post(
    "/generate",
    logRequest({
      sensitiveFields: [],
      logBody: false
    }),
    validateRequest({ schema: generateSchema, skipEscape: true }),
    handleGenerateRequest
  );

  router.get(
    "/search",
    logRequest({}),
    validateRequest({ schema: searchSchema, isQuery: true }),
    async (req, res, next) => {
      try {
        console.log("req", {
          url: req.url,
          query: req.query,
          originalUrl: req.originalUrl,
        });
        const user = req.user;
        const items = await search({ ...req.query, userId: user._id });
        res.json(items);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/count",
    logRequest({}),
    validateRequest({ schema: searchSchema, isQuery: true }),
    async (req, res, next) => {
      try {
        const total = await count(req.query);
        res.json({ total });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get("/grouped-evaluation-counts", async (req, res, next) => {
    try {
      const user = req.user;
      const evaluationData = await getGroupedEvaluationCounts(user._id);
      res.json(evaluationData);
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard-data", async (req, res, next) => {
    try {
      const user = req.user;
      const dashboardData = await getDashboardData(user._id);
      res.json(dashboardData);
    } catch (error) {
      next(error);
    }
  });

  // get messages by connectionId
  router.get("/messages/:connectionId", async (req, res, next) => {
    try {
      logger.info(
        `Getting messages for connectionId: ${req.params.connectionId}`
      );
      const messages = await getAllByWebsocketId(req.params.connectionId);
      res.json(messages);
    } catch (error) {
      next(error);
    }
  });

  return router;
};

module.exports = {
  routes,
  handleGenerateRequest,
};
