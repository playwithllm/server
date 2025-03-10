const { routes } = require('./api');

const defineRoutes = async (expressRouter) => {
  expressRouter.use('/products', await routes());
};

module.exports = defineRoutes;
