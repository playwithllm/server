const Joi = require('joi');

const createSchema = Joi.object().keys({
  prompt: Joi.string().required(),
});

const searchSchema = Joi.object().keys({
  keyword: Joi.string(),
});

const idSchema = Joi.object().keys({
  id: Joi.string().required(),
});

const generateSchema = Joi.object().keys({
  prompt: Joi.string().required(),
  model: Joi.string().default('llama3.2-1B')
});

module.exports = { createSchema, searchSchema, idSchema, generateSchema };