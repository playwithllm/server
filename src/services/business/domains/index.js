const adminRoutes = require('../../business/domains/admin');
const inferenceRoutes = require('./inference');
const apiKeysRoutes = require('./apiKeys');

const defineRoutes = (expressRouter) => {
  adminRoutes(expressRouter);
  inferenceRoutes(expressRouter);
  apiKeysRoutes(expressRouter);
};

module.exports = defineRoutes;
