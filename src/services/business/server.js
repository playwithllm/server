const config = require('../../shared/configs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const passport = require('passport');
const session = require('express-session');
const MongoStore = require('connect-mongo'); // For storing sessions in MongoDB

const defineRoutes = require('./app');
const { errorHandler } = require('../../shared/libraries/error-handling');
const logger = require('../../shared/libraries/log/logger');
const { addRequestIdMiddleware } = require('../../shared/middlewares/request-context');
const { connectWithMongoDb } = require('../../shared/libraries/db');

const businessMessaging = require('./messaging');

let connection;

// Helper function to create consistent trimmed user object
const createTrimmedUser = (user) => ({
  _id: user._id,
  email: user.email,
  authType: user.authType,
  displayName: user.displayName,
  isAdmin: user.isAdmin,
  isSuperAdmin: user.isSuperAdmin,
  isDeactivated: user.isDeactivated,
  isDemo: user.isDemo,
  role: user.role,
  permissions: user.permissions,
});

const handleAuthCallback = (strategy) => {
  return [
    function (req, res, next) {
      passport.authenticate(
        strategy,
        {
          failureRedirect: `${config.CLIENT_HOST}/login`,
        },
        (err, user, info, status) => {
          if (err || !user) {
            logger.error('Failed to authenticate user', err);
            return res.redirect(
              `${config.CLIENT_HOST}/login?error=${err?.name}`
            );
          }

          const trimmedUser = createTrimmedUser(user);
          req.logIn(trimmedUser, function (err) {
            if (err) {
              return res.redirect(
                `${config.CLIENT_HOST}/login?error=failed-to-authenticate`
              );
            }
            logger.info('saving session for user', { user: trimmedUser });
            req.session.userId = trimmedUser._id.toString();
            req.session.sessionId = req.sessionID;
            req.session.save((err) => {
              if (err) {
                logger.error('Failed to save session', err);
              } else {
                logger.info('Session saved');
              }
            });

            next();
          });
        }
      )(req, res, next);
    },
    function (req, res) {
      if (strategy === 'github') {
        logger.info('/api/auth/github/callback', {
          username: req.user.username,
        });
      }
      const userId = req.user._id.toString();
      res.cookie('userId', userId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      });
      res.redirect(`${config.CLIENT_HOST}/login-success`);
    },
  ];
};

const createExpressApp = () => {
  const expressApp = express();
  expressApp.use(addRequestIdMiddleware);
  expressApp.use(helmet());
  expressApp.use(express.urlencoded({ extended: true }));
  expressApp.use(express.json());
  expressApp.use(cookieParser());
  expressApp.use(
    cors({
      origin: config.CLIENT_HOST, // Your frontend origin
      credentials: true,
    })
  );

  const sessionStore = MongoStore.create({ mongoUrl: config.MONGODB_URI }); // Store the reference
  expressApp.use(
    session({
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      store: sessionStore,
    })
  );

  expressApp.use(passport.initialize());
  expressApp.use(passport.session());

  // Update serialization
  passport.serializeUser(async function (user, done) {
    const trimmedUser = createTrimmedUser(user);
    done(null, trimmedUser);
  });

  passport.deserializeUser(function (trimmedUser, done) {
    done(null, trimmedUser);
  });

  expressApp.use((req, res, next) => {
    // Log an info message for each incoming request
    logger.info(`${req.method} ${req.originalUrl}`);
    next();
  });

  logger.info('Express middlewares are set up');

  // Debug email routes - only available in development

  defineRoutes(expressApp);
  defineErrorHandlingMiddleware(expressApp);
  return expressApp;
};

async function startWebServer() {
  logger.info('Starting web server...');
  const expressApp = createExpressApp();
  const APIAddress = await openConnection(expressApp);
  logger.info(`Server is running on ${APIAddress.address}:${APIAddress.port}`);
  await connectWithMongoDb();

  // Initialize messaging
  await businessMessaging.initialize();

  return expressApp;
}

async function stopWebServer() {
  return new Promise((resolve) => {
    if (connection !== undefined) {
      connection.close(() => {
        resolve();
      });
    }
  });
}

async function openConnection(expressApp) {
  return new Promise((resolve) => {
    const webServerPort = config.PORT_BUSINESS || 4001;
    logger.info(`Server is about to listen to port ${webServerPort}`);

    connection = expressApp.listen(webServerPort, () => {
      errorHandler.listenToErrorEvents(connection);
      resolve(connection.address());
    });
  });
}

function defineErrorHandlingMiddleware(expressApp) {
  expressApp.use(async (error, req, res, next) => {
    // Note: next is required for Express error handlers
    if (error && typeof error === 'object') {
      if (error.isTrusted === undefined || error.isTrusted === null) {
        error.isTrusted = true;
      }
    }

    const appError = await errorHandler.handleError(error);
    res
      .status(error?.HTTPStatus || 500)
      .json(
        { ...appError, errorMessage: appError.message } || {
          message: 'Internal server error',
        }
      )
      .end();
  });
}

module.exports = { createExpressApp, startWebServer, stopWebServer };
