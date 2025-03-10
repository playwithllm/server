const express = require('express');
const multer = require('multer');


const logger = require('../../../../shared/libraries/log/logger');
const { AppError } = require('../../../../shared/libraries/error-handling/AppError');

const {
  create,
  getAll,
  getById,
  search,
  ragSearch,
  searchByImage
} = require('./service');

const {
  createSchema,
  idSchema,
  searchSchema,
} = require('./request');
const { validateRequest } = require('../../../../shared/middlewares/request-validate');
const { logRequest } = require('../../../../shared/middlewares/log');
const { isAuthorized } = require('../../../../shared/middlewares/auth/authorization');
const MultimodalProcessor = require('../../../../shared/libraries/embedding/MultimodalProcessor');

const model = 'Product';

const routes = async () => {
  const router = express.Router();
  const processor = new MultimodalProcessor();
  await processor.init();
  logger.info(`Setting up routes for ${model}`);

  // Configure multer for image uploads - store in memory
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Not an image file'));
      }
    }
  });

  router.get(
    '/search',
    logRequest({}),
    validateRequest({ schema: searchSchema, isQuery: true }),
    async (req, res, next) => {
      try {
        const items = await ragSearch(req.query);
        res.json(items);
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

  router.post(
    '/create',
    logRequest({}),
    validateRequest({ schema: createSchema }),
    async (req, res, next) => {
      try {
        const savedItem = await create(req.body);
        res.status(201).json(savedItem);
      } catch (error) {
        next(error);
      }
    }
  );

  // Search by image
  router.post('/search/image', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        throw new Error('No image file provided');
      }
      
      console.log('searchByImage(): req.file:', req.file);
      const products = await searchByImage(req.file.buffer, req.query.limit || 5);
      console.log('searchByImage(): products:', products);
      res.json(products);
    } catch (error) {
      console.error('Error searching by image:', error);
      res.status(500).json({ error: error.message });
    }
  });



  return router;
};

module.exports = { routes };
