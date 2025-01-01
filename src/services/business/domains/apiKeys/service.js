const crypto = require('crypto');
const bcrypt = require('bcrypt');
const logger = require('../../../../shared/libraries/log/logger');
const ApiKey = require('./schema');
const { AppError } = require('../../../../shared/libraries/error-handling/AppError');

const model = 'ApiKey';

const SALT_ROUNDS = 10;


const create = async (data) => {
  try {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(apiKey, SALT_ROUNDS);
    const payload = new ApiKey({
      name: data.name ?? "Default",
      keyPrefix: apiKey.slice(0, 5),
      hashedKey: keyHash,
      salt: SALT_ROUNDS,
      userId: data.userId,
    });

    const savedItem = await payload.save();

    logger.info(`create(): ${model} created`, {
      id: savedItem._id,
    });
    return { _id: savedItem._id, apiKey, name: savedItem.name, keyPrefix: savedItem.keyPrefix };
  } catch (error) {
    logger.error(`create(): Failed to create ${model}`, error);
    throw new AppError(`Failed to create ${model}`, error.message);
  }
};

const getAll = async (userId) => {
  try {
    const items = await ApiKey.find({ userId });
    logger.info(`getAll(): ${model} fetched for ${userId}`, { count: items.length });
    return items;
  } catch (error) {
    logger.error(`getAll(): Failed to get ${model}`, error);
    throw new AppError(`Failed to get ${model}`, error.message);
  }
};

const getById = async (id) => {
  try {
    const item = await ApiKey.findById(id);
    logger.info(`getById(): ${model} fetched`, { id });
    return item;
  } catch (error) {
    logger.error(`getById(): Failed to get ${model}`, error);
    throw new AppError(`Failed to get ${model}`, error.message);
  }
};

const updateById = async (id, data) => {
  try {
    const item = await ApiKey.findByIdAndUpdate(id, data, { new: false });
    logger.info(`updateById(): ${model} updated`, { id });
    return item;
  } catch (error) {
    logger.error(`updateById(): Failed to update ${model}`, error);
    throw new AppError(`Failed to update ${model}`, error.message);
  }
};

const deleteById = async (id) => {
  try {
    await ApiKey.findByIdAndDelete(id);
    logger.info(`deleteById(): ${model} deleted`, { id });
    return true;
  } catch (error) {
    logger.error(`deleteById(): Failed to delete ${model}`, error);
    throw new AppError(`Failed to delete ${model}`, error.message);
  }
};

const revokeById = async (id) => {
  try {
    const item = await ApiKey.findByIdAndUpdate(id, { status: 'revoked', revokedAt: new Date() }, { new: true });
    logger.info(`revokeById(): ${model} revoked`, { id });
    return item;
  } catch (error) {
    logger.error(`revokeById(): Failed to revoke ${model}`, error);
    throw new AppError(`Failed to revoke ${model}`, error.message);
  }
};

module.exports = {
  create,
  getAll,
  getById,
  updateById,
  deleteById,
  revokeById,
};
