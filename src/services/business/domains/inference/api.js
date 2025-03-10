const express = require('express');
const logger = require('../../../../shared/libraries/log/logger');
const { AppError } = require('../../../../shared/libraries/error-handling/AppError');
const EventEmitter = require('events');

const {
  search,
  count,
  getGroupedEvaluationCounts,
  getDashboardData,
  getAllByWebsocketId,
  create
} = require('./service');

const {
  searchSchema,
  generateSchema
} = require('./request');

const { validateRequest } = require('../../../../shared/middlewares/request-validate');
const { logRequest } = require('../../../../shared/middlewares/log');
const { isAuthorized } = require('../../../../shared/middlewares/auth/authorization');
const { isValidKey } = require('../../domains/apiKeys/service');
const businessMessaging = require('../../messaging');

const model = 'Inference';

/**
 * Handle generation request from API clients
 * @param {express.Request} req 
 * @param {express.Response} res 
 * @param {express.NextFunction} next 
 */
async function handleGenerateRequest(req, res, next) {
  const prompt = req.body.prompt;
  const apiKey = req.headers['x-api-key'];
  const modelName = req.body.model || 'llama3.2-1B';
  
  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required' });
  }

  if (!apiKey) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    // Validate API key
    const key = await isValidKey(apiKey);
    if (!key) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const userId = key.userId;

    // Check token usage
    const { tokenCount } = await getDashboardData(userId);
    const TOKEN_LIMIT = 10000;

    if (tokenCount >= TOKEN_LIMIT) {
      return res.status(402).json({ 
        message: `You have exceeded the free token limit (${TOKEN_LIMIT}) for today. Please try again tomorrow.` 
      });
    }

    // Create inference record
    const savedItem = (await create({ 
      prompt, 
      modelName, 
      inputTime: new Date(), 
      userId, 
      apiKeyId: key._id.toString() 
    })).toObject();

    // Prepare prompt messages
    const chatMessages = [
      { role: 'assistant', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ];

    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Create event emitter for streaming
    const streamEmitter = new EventEmitter();
    
    // Stream chunks back to client
    streamEmitter.on('inferenceStreamChunk', async (part) => {
      res.write(part.result.message.content);
    });
    
    // End stream on completion
    streamEmitter.on('inferenceStreamChunkEnd', async () => {
      res.end();
    });

    // Send inference request to messaging service
    await businessMessaging.sendInferenceRequest({ 
      prompts: chatMessages, 
      connectionId: savedItem._id.toString(), 
      _id: savedItem._id.toString() 
    }, streamEmitter);
    
  } catch (error) {
    logger.error('Error in generate endpoint:', error);
    next(new AppError('Failed to process generation request', 500, error));
  }
}

const routes = () => {
  const router = express.Router();
  logger.info(`Setting up routes for ${model}`);

  router.get(
    '/search',
    logRequest({}),
    validateRequest({ schema: searchSchema, isQuery: true }),
    async (req, res, next) => {
      try {
        console.log('req', {
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
    '/count',
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

  router.get('/grouped-evaluation-counts', async (req, res, next) => {
    try {
      const user = req.user;
      const evaluationData = await getGroupedEvaluationCounts(user._id);
      res.json(evaluationData);
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard-data', async (req, res, next) => {
    try {
      const user = req.user;
      const dashboardData = await getDashboardData(user._id);
      res.json(dashboardData);
    } catch (error) {
      next(error);
    }
  });

  // get messages by connectionId
  router.get('/messages/:connectionId', async (req, res, next) => {
    try {
      logger.info(`Getting messages for connectionId: ${req.params.connectionId}`);
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
  handleGenerateRequest
};