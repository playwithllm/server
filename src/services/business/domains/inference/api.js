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
        const items = await search(req.query);
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

  router.get(
    '/:id',
    logRequest({}),
    validateRequest({ schema: idSchema, isParam: true }),
    async (req, res, next) => {
      try {
        const item = await getById(req.params.id);
        if (!item) {
          throw new AppError(`${model} not found`, `${model} not found`, 404);
        }
        res.status(200).json(item);
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
        const savedItem = (await create({ prompt, modelName: 'llama3.2-1B', inputTime: new Date(), userId: user._id,  })).toObject();
        console.log('saved item', { savedItem });
        const chatMessagesForLLM = [];
        chatMessagesForLLM.push({ role: 'assistant', content: 'You are a helpful assistant.' });
        chatMessagesForLLM.push({ role: 'user', content: prompt });
        const eventEmitter = new EventEmitter();
        eventEmitter.on('inferenceStreamChunk', async (part) => {
          // console.log('route handler: inferenceStreamChunk', { msg: part.result.message, connectionId: savedItem._id.toString() });
          res.write(part.result.message.content);
        });
        eventEmitter.on('inferenceStreamChunkEnd', async (part) => {
          // console.log('route handler: inferenceStreamChunkEnd', { msg: part.result.message, connectionId: savedItem._id.toString() });
          res.end();
        });

        await businessMessaging.sendInferenceRequest({ prompts: chatMessagesForLLM, connectionId: savedItem._id.toString(), _id: savedItem._id.toString() }, eventEmitter);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};

module.exports = { routes };
