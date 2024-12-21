const { routes } = require('./api');

const defineRoutes = (expressRouter) => {
  expressRouter.use('/inference', routes());
};

module.exports = defineRoutes;
