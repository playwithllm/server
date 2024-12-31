const Joi = require('joi');
const mongoose = require('mongoose');

const createSchema = Joi.object().keys({
  name: Joi.string().optional(),
});

const searchSchema = Joi.object().keys({
  keyword: Joi.string(),
});

const idSchema = Joi.object().keys({
  id: Joi.string().required(),
});


module.exports = { createSchema, searchSchema, idSchema };
