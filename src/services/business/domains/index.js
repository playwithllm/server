const inferenceRoutes = require('./inference');
const apiKeysRoutes = require('./apiKeys');

const defineRoutes = async (expressRouter) => {
  inferenceRoutes(expressRouter);
  apiKeysRoutes(expressRouter);
};

module.exports = defineRoutes;
