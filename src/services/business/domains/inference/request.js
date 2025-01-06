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


module.exports = { createSchema, searchSchema, idSchema };
