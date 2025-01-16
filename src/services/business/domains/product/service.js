const logger = require('../../../../shared/libraries/log/logger');
const Product = require('./schema');
const { AppError } = require('../../../../shared/libraries/error-handling/AppError');
const MultimodalProcessor = require('../../../../shared/libraries/embedding/MultimodalProcessor');
const { DataType } = require('@zilliz/milvus2-sdk-node');

const model = 'Product';

const create = async (data) => {
  try {
    const payload = new Product({
      ...data,
      sourceId: data.id,
    });

    const savedItem = await payload.save();

    logger.info(`create(): ${model} created`, {
      id: savedItem._id,
    });
    return { _id: savedItem._id };
  } catch (error) {
    logger.error(`create(): Failed to create ${model}`, error);
    throw new AppError(`Failed to create ${model}`, error.message);
  }
};

const getAll = async (query) => {
  try {
    const { keyword } = query;
    const filter = {};
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { category: { $regex: keyword, $options: 'i' } },
      ];
    }

    const items = await Product.find(filter);
    logger.info(`getAll(): ${model} fetched`, { count: items.length });
    return items;
  } catch (error) {
    logger.error(`getAll(): Failed to get ${model}`, error);
    throw new AppError(`Failed to get ${model}`, error.message);
  }
};

const getById = async (id) => {
  try {
    const item = await Product.findById(id);
    logger.info(`getById(): ${model} fetched`, { id });
    return item;
  } catch (error) {
    logger.error(`getById(): Failed to get ${model}`, error);
    throw new AppError(`Failed to get ${model}`, error.message);
  }
};

const getBySourceId = async (sourceId) => {
  const item = await Product.findOne({ sourceId });
  logger.info(`getBySourceId(): ${model} fetched`, { sourceId });
  return item;
};

const updateById = async (id, data) => {
  try {
    const item = await Product.findByIdAndUpdate(id, data, { new: false });
    logger.info(`updateById(): ${model} updated`, { id });
    return item;
  } catch (error) {
    logger.error(`updateById(): Failed to update ${model}`, error);
    throw new AppError(`Failed to update ${model}`, error.message);
  }
};

const deleteById = async (id) => {
  try {
    await Product.findByIdAndDelete(id);
    logger.info(`deleteById(): ${model} deleted`, { id });
    return true;
  } catch (error) {
    logger.error(`deleteById(): Failed to delete ${model}`, error);
    throw new AppError(`Failed to delete ${model}`, error.message);
  }
};

const search = async (queryObject) => {
  try {
    if (!queryObject) {
      return getAll({});
    }

    const { keyword: query } = queryObject;
    console.log('query', query);

    // Ensure query is a string
    if (!query) {
      return getAll({});
    }

    const searchText = String(query).trim();
    const multimodalProcessor = new MultimodalProcessor();
    await multimodalProcessor.init();

    // First, check if collection exists and has data
    const collectionInfo = await multimodalProcessor.describeCollection({
      collection_name: multimodalProcessor.collectionName
    });

    if (!collectionInfo || collectionInfo.rowCount === 0) {
      logger.warn(`search(): No vectors found in Milvus collection ${multimodalProcessor.collectionName}`);
      return getAll({ keyword: searchText }); // Fallback to regular text search
    }

    // Search in Milvus with updated parameters
    const searchResults = await multimodalProcessor.semanticSearch(searchText, 10);

    if (!searchResults || !searchResults.length || searchResults.length === 0) {
      logger.warn(`search(): No results found in vector search`);
      return getAll({ keyword: searchText }); // Fallback to regular text search
    }

    // Get product IDs from Milvus results
    const productIds = searchResults.map(result =>
      result.productId
    );

    const uniqueProductIds = [...new Set(productIds)];

    // Fetch full product details from MongoDB
    const items = await Product.find({
      sourceId: { $in: uniqueProductIds }
    });

    if (items.length === 0) {
      logger.warn(`search(): No matching products found in MongoDB`);
      return getAll({ keyword: searchText }); // Fallback to regular text search
    }

    // Sort items in the same order as search results
    const sortedItems = uniqueProductIds.map(id =>
      items.find(item => item.sourceId === id)
    ).filter(Boolean);

    logger.info(`search(): ${model} searched`, {
      query: searchText,
      resultCount: sortedItems.length
    });

    return sortedItems;
  } catch (error) {
    logger.error(`search(): Failed to search ${model}`, error);
    throw new AppError(`Failed to search ${model}`, error.message);
  }
};

const ragSearch = async (queryObject) => {
  try {
    if (!queryObject) {
      return getAll({});
    }

    const { keyword: query } = queryObject;
    if (!query) {
      return getAll({});
    }

    const searchText = String(query).trim();
    const multimodalProcessor = new MultimodalProcessor();
    await multimodalProcessor.init();
    await multimodalProcessor.initializeCollection();
    const isConnected = await multimodalProcessor.testConnection();
    if (!isConnected) {
      logger.warn(`ragSearch(): Failed to connect to Milvus`);
      return getAll({ keyword: searchText }); // Fallback to regular text search
    }

    // Perform RAG search
    const results = await multimodalProcessor.ragSearch(Product, searchText, 2);

    if (!results || results.length === 0) {
      logger.warn(`ragSearch(): No results found`);
      return getAll({ keyword: searchText }); // Fallback to regular text search
    }

    logger.info(`ragSearch(): ${model} searched`, {
      query: searchText,
      resultCount: results.length
    });

    return results;
  } catch (error) {
    logger.error(`ragSearch(): Failed to search ${model}`, error);
    throw new AppError(`Failed to search ${model}`, error.message);
  }
};

module.exports = {
  create,
  getAll,
  getById,
  getBySourceId,
  updateById,
  deleteById,
  search,
  ragSearch
};
