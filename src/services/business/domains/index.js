const adminRoutes = require('../../business/domains/admin');
const inferenceRoutes = require('./inference');

const defineRoutes = (expressRouter) => {
  adminRoutes(expressRouter);
  inferenceRoutes(expressRouter);
};

module.exports = defineRoutes;
