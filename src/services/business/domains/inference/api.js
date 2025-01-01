const express = require('express');
const EventEmitter = require('events');
const logger = require('../../../../shared/libraries/log/logger');
const { AppError } = require('../../../../shared/libraries/error-handling/AppError');

const {
  create,
  search,
  count,
  getById,
  updateById,
  deleteById,
  getGroupedEvaluationCounts,
  getDashboardData,
} = require('./service');

const {
  createSchema,
  updateSchema,
  idSchema,
  searchSchema,
} = require('./request');
const { validateRequest } = require('../../../../shared/middlewares/request-validate');
const { logRequest } = require('../../../../shared/middlewares/log');
const { isAuthorized } = require('../../../../shared/middlewares/auth/authorization');
const { getAll: getAllApiKeysByUserId } = require('../apiKeys/service')
const businessMessaging = require('../../messaging');

const model = 'Inference';

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

  // create inference
  router.post(
    '/create',
    logRequest({}),
    validateRequest({ schema: createSchema }),
    async (req, res, next) => {
      try {
        const prompt = req.body.prompt;
        const user = req.user;

        const keys = await getAllApiKeysByUserId(user._id);
        const activeKeys = keys.filter((key) => key.status === 'active');
        if (!activeKeys || activeKeys.length === 0) {
          throw new AppError('No active API keys found', 'No API keys found. Please create an API key first.', 404);
        }

        const key = activeKeys[0];

        const savedItem = (await create({ prompt, modelName: 'llama3.2-1B', inputTime: new Date(), userId: user._id, apiKeyId: key._id.toString() })).toObject();
        console.log('saved item', { savedItem });
        const chatMessagesForLLM = [];
        chatMessagesForLLM.push({ role: 'assistant', content: 'You are a helpful assistant.' });
        chatMessagesForLLM.push({ role: 'user', content: prompt });
        const eventEmitter = new EventEmitter();
        eventEmitter.on('inferenceStreamChunk', async (part) => {
          res.write(part.result.message.content);
        });
        eventEmitter.on('inferenceStreamChunkEnd', async (part) => {
          res.end();
        });

        await businessMessaging.sendInferenceRequest({ prompts: chatMessagesForLLM, connectionId: savedItem._id.toString(), _id: savedItem._id.toString() }, eventEmitter);
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

  return router;
};

module.exports = { routes };
