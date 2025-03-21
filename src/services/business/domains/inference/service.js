const logger = require('../../../../shared/libraries/log/logger');
const Model = require('./schema');
const { AppError } = require('../../../../shared/libraries/error-handling/AppError');
const { getAll: getApiKeysByUserId } = require('../apiKeys/service')

const model = 'inference';

const create = async (data) => {
  try {
    const item = new Model(data);
    const saved = await item.save();
    logger.info(`create(): ${model} created`, {
      id: saved._id,
    });
    return saved;
  } catch (error) {
    logger.error(`create(): Failed to create ${model}`, error);
    throw new AppError(`Failed to create ${model}`, error.message);
  }
};

const getAllByWebsocketId = async (websocketId) => {
  try {
    const items = await Model.find({ websocketId });
    logger.info(`getAllByWebsocketId(): ${model} fetched`, { websocketId });
    return items;
  } catch (error) {
    logger.error(`getAllByWebsocketId(): Failed to get ${model}`, error);
    throw new AppError(`Failed to get ${model}`, error.message);
  }
};

const search = async (query) => {
  try {
    logger.info(`search(): ${model} search`, { query });

    if (!query.userId) {
      throw new AppError('User ID is required', 'User ID is required', 400);
    }

    const pageSize = 10;
    const {
      keyword,
      page = 0,
      orderBy = 'createdAt',
      order = 'desc',
      type
    } = query ?? {};

    const filter = {
      userId: query.userId
    };
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { displayName: { $regex: keyword, $options: 'i' } },
        { identifier: { $regex: keyword, $options: 'i' } }
      ];
    }
    if (type) {
      filter.type = type;
    }

    const items = await Model.find(filter)
      .sort({ [orderBy]: order === 'asc' ? 1 : -1 });

    logger.info('search(): filter and count', {
      filter,
      count: items.length,
    });
    return items;
  } catch (error) {
    logger.error(`search(): Failed to search ${model}`, error);
    throw new AppError(`Failed to search ${model}`, error.message, 400);
  }
};

const count = async (query) => {
  try {
    const { keyword, type, userId } = query ?? {};

    if (!userId) {
      throw new AppError('User ID is required', 'User ID is required', 400);
    }

    const filter = {};
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { displayName: { $regex: keyword, $options: 'i' } },
        { identifier: { $regex: keyword, $options: 'i' } }
      ];
    }
    if (type) {
      filter.type = type;
    }
    const total = await Model.countDocuments(filter);
    logger.info('count(): filter and count', {
      filter,
      count: total,
    });
    return total;
  } catch (error) {
    logger.error(`count(): Failed to count ${model}`, error);
    throw new AppError(`Failed to count ${model}`, error.message, 400);
  }
};

const getById = async (id) => {
  try {
    const item = await Model.findById(id);
    logger.info(`getById(): ${model} fetched`, { id });
    return item;
  } catch (error) {
    logger.error(`getById(): Failed to get ${model}`, error);
    throw new AppError(`Failed to get ${model}`, error.message);
  }
};

const updateById = async (id, data) => {
  try {
    const item = await Model.findByIdAndUpdate(id, data, { new: false });
    logger.info(`updateById(): ${model} updated`, { id });
    return item;
  } catch (error) {
    logger.error(`updateById(): Failed to update ${model}`, error);
    throw new AppError(`Failed to update ${model}`, error.message);
  }
};

const deleteById = async (id) => {
  try {
    await Model.findByIdAndDelete(id);
    logger.info(`deleteById(): ${model} deleted`, { id });
    return true;
  } catch (error) {
    logger.error(`deleteById(): Failed to delete ${model}`, error);
    throw new AppError(`Failed to delete ${model}`, error.message);
  }
};

const getAllByApiKeyId = async (apiKeyId) => {
  try {
    const items = await Model.find({ apiKeyId });
    logger.info(`getAllByApiKeyId(): ${model} fetched`, { apiKeyId });
    return items;
  } catch (error) {
    logger.error(`getAllByApiKeyId(): Failed to get ${model}`, error);
    throw new AppError(`Failed to get ${model}`, error.message);
  }
};

async function getGroupedEvaluationCounts(userId) {
  try {
    logger.info(`getGroupedEvaluationCounts(): userId ${userId}`);
    const evaluationData = await Model.aggregate([
      {
        $match: {
          userId: userId
        }
      },
      {
        $addFields: {
          formattedDate: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$inputTime'
            }
          }
        }
      },
      {
        $group: {
          _id: '$formattedDate',
          totalRequests: { $sum: 1 },
          promptTokens: {
            $sum: { $ifNull: ['$result.prompt_tokens', 0] }
          },
          completionTokens: {
            $sum: { $ifNull: ['$result.completion_tokens', 0] }
          },
          totalTokens: {
            $sum: { $ifNull: ['$result.total_tokens', 0] }
          },
          promptCost: {
            $sum: { $ifNull: ['$result.prompt_cost', 0] }
          },
          completionCost: {
            $sum: { $ifNull: ['$result.completion_cost', 0] }
          },
          totalCost: {
            $sum: { $ifNull: ['$result.total_cost', 0] }
          },
          totalDuration: {
            $sum: { $ifNull: ['$result.duration', 0] }
          }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          requestCount: '$totalRequests',
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 1,
          promptCost: { $round: ['$promptCost', 6] },
          completionCost: { $round: ['$completionCost', 6] },
          totalCost: { $round: ['$totalCost', 6] },
          totalDurationInMs: '$totalDuration'
        }
      }
    ]);
    logger.debug('Evaluation data retrieved:', evaluationData);
    return evaluationData;
  } catch (error) {
    logger.error("Error aggregating evaluation counts:", error);
    throw new AppError("Failed to aggregate evaluation data", error.message);
  }
}

const getDashboardData = async (userId) => {
  try {
    // Get today's date at start (00:00:00) and end (23:59:59)
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const dashboardStats = await Model.aggregate([
      {
        $match: {
          userId: userId,
          inputTime: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          promptTokens: { $sum: '$result.prompt_tokens' },
          completionTokens: { $sum: '$result.completion_tokens' },
          totalTokens: { $sum: '$result.total_tokens' },
          promptCost: { $sum: '$result.prompt_cost' },
          completionCost: { $sum: '$result.completion_cost' },
          totalCost: { $sum: '$result.total_cost' }
        }
      },
      {
        $project: {
          _id: 0,
          requestCount: '$totalRequests',
          promptTokens: '$promptTokens',
          completionTokens: '$completionTokens',
          totalTokens: '$totalTokens',
          promptCost: { $round: ['$promptCost', 6] },
          completionCost: { $round: ['$completionCost', 6] },
          totalCost: { $round: ['$totalCost', 6] }
        }
      }
    ]);

    const apiKeys = await getApiKeysByUserId(userId);
    const activeKeys = apiKeys.filter((key) => key.status === 'active');

    const response = {
      ...dashboardStats[0],
      activeKeys: activeKeys.length
    };

    return response;
  } catch (error) {
    logger.error('getDashboardData(): Failed to get dashboard data', error);
    throw new AppError('Failed to get dashboard data', error.message);
  }
};

module.exports = {
  create,
  search,
  count,
  getById,
  updateById,
  deleteById,
  getAllByWebsocketId,
  getGroupedEvaluationCounts,
  getAllByApiKeyId,
  getDashboardData
};
