const express = require('express');

const userRoutes = require('./user');

const defineRoutes = (expressRouter) => {
  // Create a new router for /admin prefix
  const adminRouter = express.Router();

  userRoutes(adminRouter);

  // Mount adminRouter with /admin prefix on main expressRouter
  expressRouter.use('/admin', adminRouter);
};

module.exports = defineRoutes;
