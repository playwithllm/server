const express = require('express');
const logger = require('../../../../shared/libraries/log/logger');
const modelsConfig = require('../../../../shared/configs/models');

const model = 'Models';

/**
 * API endpoints for model configurations
 */
const routes = () => {
  const router = express.Router();
  logger.info(`Setting up routes for ${model}`);

  /**
   * Get all available models with their configurations
   */
  router.get('/available', async (req, res, next) => {
    try {
      const availableModels = modelsConfig.getAllModels();
      
      // Convert to array format for client consumption
      const modelArray = Object.entries(availableModels).map(([id, config]) => ({
        id,
        ...config
      }));
      
      res.json(modelArray);
    } catch (error) {
      logger.error('Failed to get available models:', error);
      next(error);
    }
  });

  /**
   * Get a specific model's configuration
   */
  router.get('/:modelId', async (req, res, next) => {
    try {
      const { modelId } = req.params;
      const modelConfig = modelsConfig.getModelById(modelId);
      
      if (!modelConfig) {
        return res.status(404).json({ message: `Model ${modelId} not found` });
      }
      
      res.json({
        id: modelId,
        ...modelConfig
      });
    } catch (error) {
      logger.error(`Failed to get model ${req.params.modelId}:`, error);
      next(error);
    }
  });

  return router;
};

module.exports = { routes };