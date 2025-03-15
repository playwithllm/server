/**
 * Central configuration file for LLM models
 * This file serves as the single source of truth for all model configurations
 * All models added to the application should be defined here.
 */

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

/**
 * Environment variable for API base URLs
 * These can be overridden in the environment config
 */
const OLLAMA_API_BASE = process.env.OLLAMA_API_BASE || 'http://localhost:11434/v1';

/** @type {Object.<string, ModelConfig>} */
const models = {
  "llama3.2": {
    name: "Llama 3.2",
    provider: "ollama",
    description: "Fast open-source large language model by Meta",
    contextLength: 4096,
    multimodal: false,
    enabled: true,
    parameters: "3B",
    apiBase: OLLAMA_API_BASE,
    capabilities: {
      reasoning: "high",
      coding: "medium",
      conversation: "high"
    }
  },
  "qwen2.5-coder": {
    name: "Qwen 2.5 Coder",
    provider: "ollama",
    description: "Code-specialized model from Qwen, optimized for programming tasks",
    contextLength: 8192,
    multimodal: false,
    enabled: true,
    parameters: "7B",
    apiBase: OLLAMA_API_BASE,
    capabilities: {
      reasoning: "high",
      coding: "very high",
      conversation: "medium"
    }
  },
  "gemma3:12b": {
    name: "Gemma 3 12B",
    provider: "ollama",
    description: "Google's Gemma 3 model with 12B parameters, supports vision inputs",
    contextLength: 8192,
    multimodal: true,
    enabled: true,
    parameters: "12B",
    apiBase: OLLAMA_API_BASE,
    capabilities: {
      reasoning: "high",
      vision: "high",
      conversation: "high"
    }
  },
  "hf.co/openbmb/MiniCPM-o-2_6-gguf:Q8_0": {
    name: "MiniCPM-O 2.6",
    provider: "ollama",
    description: "MiniCPM model from OpenBMB with multimodal capabilities",
    contextLength: 4096,
    multimodal: true,
    enabled: true,
    parameters: "8B",
    apiBase: OLLAMA_API_BASE,
    capabilities: {
      reasoning: "medium",
      vision: "high",
      conversation: "medium"
    }
  },
  "deepseek-r1": {
    name: "DeepSeek R1",
    provider: "ollama",
    description: "DeepSeek R1 language model with strong reasoning abilities",
    contextLength: 8192,
    multimodal: false,
    enabled: true,
    parameters: "7B",
    apiBase: OLLAMA_API_BASE,
    capabilities: {
      reasoning: "very high",
      coding: "high",
      conversation: "medium"
    }
  },
};

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
  return "llama3.2";
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
