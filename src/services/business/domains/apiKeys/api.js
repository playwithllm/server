const express = require('express');
const logger = require('../../../../shared/libraries/log/logger');
const { AppError } = require('../../../../shared/libraries/error-handling/AppError');

const {
  create,
  getAll,
  getById,
  updateById,
  deleteById,
  revokeById,
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

const model = 'ApiKey';

const routes = () => {
  const router = express.Router();
  logger.info(`Setting up routes for ${model}`);

  router.get(
    '/search',
    logRequest({}),
    validateRequest({ schema: searchSchema, isQuery: true }),
    async (req, res, next) => {
      try {
        const user = req.user;
        const items = await getAll(user._id);
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

  // create api key
  router.post(
    '/create',
    logRequest({}),
    validateRequest({ schema: createSchema }),
    async (req, res, next) => {
      try {
        const user = req.user;
        const name = req.body.name || 'Default';
        const savedItem = await create({ userId: user._id, name });
        res.status(201).json(savedItem);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/revoke/:id',
    logRequest({}),
    validateRequest({ schema: idSchema, isParam: true }),
    async (req, res, next) => {
      try {
        const item = await revokeById(req.params.id);
        if (!item) {
          throw new AppError(`${model} not found`, `${model} not found`, 404);
        }
        res.status(200).json(item);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};

module.exports = { routes };
