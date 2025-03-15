const inferenceRoutes = require('./inference');
const apiKeysRoutes = require('./apiKeys');
const modelsRoutes = require('./models/api');

const defineRoutes = async (expressRouter) => {
  inferenceRoutes(expressRouter);
  apiKeysRoutes(expressRouter);
  expressRouter.use('/models', modelsRoutes.routes());
};

module.exports = defineRoutes;
