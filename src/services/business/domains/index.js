const inferenceRoutes = require('./inference');
const apiKeysRoutes = require('./apiKeys');
const productRoutes = require('./product');

const defineRoutes = async (expressRouter) => {
  inferenceRoutes(expressRouter);
  apiKeysRoutes(expressRouter);
  await productRoutes(expressRouter);
};

module.exports = defineRoutes;
