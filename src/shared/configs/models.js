/**
 * Central configuration file for LLM models
 * This file loads model configurations from models.config.json
 */
const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} ModelConfig
 * @property {string} name - Display name of the model
 * @property {string} provider - Provider backend ('ollama' or 'vllm')
 * @property {string} [description] - Optional description of the model's capabilities
 * @property {number} [contextLength] - Maximum context length in tokens
 * @property {boolean} [multimodal] - Whether the model supports images
 * @property {boolean} [enabled] - Whether the model is currently enabled
 * @property {Object} [capabilities] - Capabilities and strengths of the model
 * @property {string} [parameters] - Number of parameters in the model
 * @property {string} [apiBase] - Base URL for the model's API
 */

// Default API base URLs that can be overridden in configs or env vars
const DEFAULT_API_BASES = {
  ollama: 'http://localhost:11434/v1',
  vllm: 'http://localhost:8000/v1'
};

// Load models from configuration file
const configPath = path.join(__dirname, 'models.config.json');
const modelConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Process provider configs from the model configuration
const providerConfigs = modelConfig.providers || {};

// Process models with appropriate API base URLs
const models = Object.entries(modelConfig.models).reduce((acc, [id, model]) => {
  const provider = model.provider;
  
  // API base priority: 
  // 1. Environment variable (highest)
  // 2. Model-specific apiBase in config
  // 3. Provider-level apiBase in config
  // 4. Default value (lowest)
  if (!model.apiBase) {
    const envVarName = `${provider.toUpperCase()}_API_BASE`;
    model.apiBase = process.env[envVarName] || 
                    providerConfigs[provider]?.apiBase || 
                    DEFAULT_API_BASES[provider] || 
                    null;
  }
  
  acc[id] = model;
  return acc;
}, {});

/**
 * Get all available models
 * @param {boolean} [enabledOnly=true] - If true, returns only enabled models
 * @returns {Object.<string, ModelConfig>}
 */
function getAllModels(enabledOnly = true) {
  if (enabledOnly) {
    return Object.fromEntries(
      Object.entries(models).filter(([_, config]) => config.enabled !== false)
    );
  }
  return models;
}

/**
 * Get model configuration by ID
 * @param {string} modelId - Model identifier
 * @returns {ModelConfig|null} Model config or null if not found
 */
function getModelById(modelId) {
  return models[modelId] || null;
}

/**
 * Get default model ID
 * @returns {string} ID of the default model
 */
function getDefaultModelId() {
  return modelConfig.defaultModel || Object.keys(models)[0] || null;
}

/**
 * Get provider for a specific model
 * @param {string} modelId - Model identifier
 * @returns {string} Provider name ('ollama', 'vllm') or default provider if not found
 */
function getModelProvider(modelId) {
  return models[modelId]?.provider || "ollama";
}

/**
 * Get model IDs grouped by provider
 * @returns {Object.<string, string[]>} Object with providers as keys and arrays of model IDs as values
 */
function getModelsByProvider() {
  const result = {};

  Object.entries(getAllModels()).forEach(([modelId, config]) => {
    const provider = config.provider;
    if (!result[provider]) {
      result[provider] = [];
    }
    result[provider].push(modelId);
  });

  return result;
}

module.exports = {
  getAllModels,
  getModelById,
  getDefaultModelId,
  getModelProvider,
  getModelsByProvider,
};
