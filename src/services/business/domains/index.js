const inferenceRoutes = require('./inference');
const apiKeysRoutes = require('./apiKeys');

const defineRoutes = (expressRouter) => {
  inferenceRoutes(expressRouter);
  apiKeysRoutes(expressRouter);
};

module.exports = defineRoutes;
