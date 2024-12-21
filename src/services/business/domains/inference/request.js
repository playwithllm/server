const Joi = require('joi');
const mongoose = require('mongoose');

const createSchema = Joi.object().keys({
  prompt: Joi.string().required(),
});

const searchSchema = Joi.object().keys({
  keyword: Joi.string(),
});


module.exports = { createSchema, searchSchema };
