const adminRoutes = require('./admin');

const defineRoutes = (expressRouter) => {
  // Mount admin routes
  adminRoutes(expressRouter);
};

module.exports = defineRoutes;
