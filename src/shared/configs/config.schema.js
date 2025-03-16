const Joi = require('joi');

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  BYPASS_AUTH_FOR_DEVELOPMENT: Joi.boolean().default(false),
  MONGODB_URI: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  RATE: Joi.number().min(0).required(),
  PORT: Joi.number().min(1000).default(4000),
  // LOGGLY is required when NODE_ENV is production
  LOGGLY_TOKEN: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
  }),
  LOGGLY_SUBDOMAIN: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
  }),
  GITHUB_CLIENT_ID: Joi.string().required(),
  GITHUB_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  // host should start with http:// or https://
  HOST: Joi.string()
    .pattern(/^(http:\/\/|https:\/\/)/)
    .required(),
  CLIENT_HOST: Joi.string()
    .pattern(/^(http:\/\/|https:\/\/)/)
    .required(),
  SESSION_SECRET: Joi.string().required(),
  ENCRYPTION_KEY: Joi.string().required(),
  ADMIN_USERNAMES: Joi.array().items(Joi.string()).required(),
  SUPERADMIN_EMAIL: Joi.string().email().required(),
  SUPERADMIN_PASSWORD: Joi.string().min(8).required(),
  // SendGrid Configuration
  SENDGRID_API_KEY: Joi.string().required(),
  SENDGRID_FROM_EMAIL: Joi.string().email().required(),

  // redis configuration
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),
  
  // Model service API endpoints - provider defaults
  OLLAMA_API_BASE: Joi.string()
    .pattern(/^(http:\/\/|https:\/\/)/)
    .default('http://localhost:11434/v1'),
  VLLM_API_BASE: Joi.string()
    .pattern(/^(http:\/\/|https:\/\/)/)
    .default('http://localhost:8000/v1'),
    
  // Can also use model-specific API bases in format MODEL_APIBASE_<MODEL_ID>
  // Examples:
  MODEL_APIBASE_LLAMA32: Joi.string()
    .pattern(/^(http:\/\/|https:\/\/)/),
  MODEL_APIBASE_GEMMA3_12B: Joi.string()
    .pattern(/^(http:\/\/|https:\/\/)/),
    
  // Inference service settings
  TOKEN_LIMIT_PER_DAY: Joi.number().min(0).default(10000),
});

module.exports = schema;
