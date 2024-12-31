const { routes } = require('./api');

const defineRoutes = (expressRouter) => {
  expressRouter.use('/api-keys', routes());
};

module.exports = defineRoutes;
