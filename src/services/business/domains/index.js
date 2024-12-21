const inferenceRoutes = require('./inference');

const defineRoutes = (expressRouter) => {
  // Mount admin routes
  inferenceRoutes(expressRouter);
};

module.exports = defineRoutes;
