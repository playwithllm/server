const EventEmitter = require('events');
const express = require('express');
const logger = require('../../shared/libraries/log/logger');
const domainRoutes = require('./domains/index');
const packageJson = require('../../../package.json');
const businessMessaging = require('./messaging');
const auth = require('../../shared/middlewares/auth/authentication');
const { configureAuthToExpressApp: authRoutes } = require('./auth/api');
const { isValidKey } = require('./domains/apiKeys/service');
const { create } = require('./domains/inference/service');

function formatUptime(uptime) {
  const days = Math.floor(uptime / (24 * 60 * 60));
  const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((uptime % (60 * 60)) / 60);
  const seconds = Math.floor(uptime % 60);

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function defineRoutes(expressApp) {
  logger.info('Defining routes...');
  authRoutes(expressApp);

  // write an inline route handler for the /api/generate endpoint
  expressApp.post('/api/generate', async (req, res, next) => {
    const prompt = req.body.prompt;
    const apiKey = req.headers['x-api-key'];
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    if (!apiKey) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const key = await isValidKey(apiKey);
    if (!key) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const userId = key.userId;

    try {
      const savedItem = (await create({ prompt, modelName: 'llama3.2-1B', inputTime: new Date(), userId: userId, apiKeyId: key._id.toString() })).toObject();
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
  });

  const businessRouter = express.Router();
  domainRoutes(businessRouter);

  // we need to call `auth.isAuthenticated` like this so that we can mock the auth module in tests
  expressApp.use('/api/v1', auth.isAuthenticated, businessRouter);
  // health check
  expressApp.get('/health', (req, res) => {
    const healthCheck = {
      uptime: process.uptime(),
      formattedUptime: formatUptime(process.uptime()),
      message: 'OK',
      timestamp: Date.now(),
      version: packageJson.version,
    };
    res.status(200).json(healthCheck);
  });
  // 404 handler
  expressApp.use((req, res) => {
    res.status(404).send('Not Found');
  });
  logger.info('Routes defined');
}

module.exports = defineRoutes;
