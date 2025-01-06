const express = require('express');
const logger = require('../../../../shared/libraries/log/logger');
const { AppError } = require('../../../../shared/libraries/error-handling/AppError');

const {
  search,
  count,
  getGroupedEvaluationCounts,
  getDashboardData,
} = require('./service');

const {
  searchSchema,
} = require('./request');
const { validateRequest } = require('../../../../shared/middlewares/request-validate');
const { logRequest } = require('../../../../shared/middlewares/log');
const { isAuthorized } = require('../../../../shared/middlewares/auth/authorization');

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
