const config = require('../../shared/configs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { Server } = require('socket.io');
const eventEmitter = require('../../shared/libraries/events/eventEmitter');

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
let io;

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

const setupWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: config.CLIENT_HOST,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Set up event listener for inference responses
  // eventEmitter.on(eventEmitter.EVENT_TYPES.INFERENCE_RESPONSE, (data) => {
  //   // Broadcast the inference response to all connected clients
  //   io.emit('inferenceResponse', data);
  //   logger.info('Broadcasted inference response to all clients');
  // });

  // INFERENCE_STREAM_CHUNK_END
  eventEmitter.on(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END, (data) => {
    // Broadcast the inference response to all connected clients
    io.emit('inferenceResponseEnd', data);
    logger.info('Broadcasted INFERENCE_STREAM_CHUNK_END to all clients');
  });

  // INFERENCE_STREAM_CHUNK
  eventEmitter.on(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, (data) => {
    // Broadcast the inference response to all connected clients
    io.emit('inferenceResponseChunk', data);
    logger.info('Broadcasted INFERENCE_STREAM_CHUNK to all clients');
  });

  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Handle client authentication
    socket.on('authenticate', (token) => {
      // TODO: Implement authentication logic
      logger.info(`Client ${socket.id} attempting authentication`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });

    // Example: Handle custom events
    socket.on('inferenceRequest', (data) => {
      logger.info(`Received message from ${socket.id}:`, data);
      // Handle the message
      eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_REQUEST, data);
    });
  });

  return io;
};

async function startWebServer() {
  logger.info('Starting web server...');
  const expressApp = createExpressApp();
  const APIAddress = await openConnection(expressApp);
  logger.info(`Server is running on ${APIAddress.address}:${APIAddress.port}`);
  
  // Setup WebSocket after HTTP server is created
  setupWebSocket(connection);
  logger.info('WebSocket server initialized');

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

module.exports = { createExpressApp, startWebServer, stopWebServer, io };
