const cookie = require('cookie');
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
const {
  addRequestIdMiddleware,
} = require('../../shared/middlewares/request-context');
const { connectWithMongoDb } = require('../../shared/libraries/db');
const { AppError } = require('../../shared/libraries/error-handling/AppError');

const businessMessaging = require('./messaging');

const { getAll: getAllApiKeysByUserId } = require('../business/domains/apiKeys/service')
const { create, getAllByWebsocketId, getDashboardData } = require('./domains/inference/service');

let connection;
let io;

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

  expressApp.use((req, res, next) => {
    // Log an info message for each incoming request
    logger.info(`${req.method} ${req.originalUrl}`);
    next();
  });

  logger.info('Express middlewares are set up');

  defineRoutes(expressApp);
  defineErrorHandlingMiddleware(expressApp);
  return expressApp;
};

const setupWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: config.CLIENT_HOST,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // INFERENCE_STREAM_CHUNK
  eventEmitter.on(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, (data) => {
    const { connectionId, ...rest } = data;

    // console.log('INFERENCE_STREAM_CHUNK connectionId', connectionId);
    // Broadcast the inference response to the client that requested it
    // io.emit('inferenceResponseChunk', data);
    io.to(connectionId).emit('inferenceResponseChunk', rest);
  });

  // INFERENCE_STREAM_CHUNK_END
  eventEmitter.on(
    eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
    (data) => {
      const { connectionId, ...rest } = data;
      // console.log('INFERENCE_STREAM_CHUNK_END connectionId', connectionId);
      io.to(connectionId).emit('inferenceResponseEnd', rest);
      logger.info('Broadcasted INFERENCE_STREAM_CHUNK_END to all clients');
    }
  );

  // DISABLE_CHAT
  eventEmitter.on(eventEmitter.EVENT_TYPES.DISABLE_CHAT, (data) => {
    const { connectionId, ...rest } = data;
    io.to(connectionId).emit('disableChat', rest);
  });

  io.use((socket, next) => {
    const handshake = socket.request;
    const cookies = cookie.parse(handshake.headers.cookie || '');
    const sessionID = cookies['connect.sid'];

    if (!sessionID) {
      return next(new Error('Unauthorized'));
    }

    const sessionStore = MongoStore.create({ mongoUrl: config.MONGODB_URI });

    session({
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
    })(handshake, {}, () => {
      passport.initialize()(handshake, {}, () => {
        passport.session()(handshake, {}, () => {
          if (handshake.user) {
            socket.user = handshake.user;
            next();
          } else {
            next(new Error('Unauthorized'));
          }
        });
      });
    });
  });

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['cf-connecting-ip'] || socket.handshake.address;

    // log the user from socket.user
    console.log('socket.user._id', socket.user._id);


    logger.info(`Client connected: ${socket.id}, IP: ${clientIp}`);

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
    socket.on('inferenceRequest', async (data) => {
      const user = socket.user;
      console.log('Authenticated user:', user);
      console.log('Received message from:', socket.id, data);

      const keys = await getAllApiKeysByUserId(user._id);
      const activeKeys = keys.filter((key) => key.status === 'active');
      if (!activeKeys || activeKeys.length === 0) {
        // throw new AppError('No active API keys found', 'No API keys found', 404);
        eventEmitter.emit(
          eventEmitter.EVENT_TYPES.DISABLE_CHAT,
          { connectionId: socket.id, message: 'No active API keys found. Please create an API key first.' }
        );
      }

      const key = activeKeys[0];
      // console.log('key', key);

      // save to database
      const savedItem = await create({ prompt: data.message, websocketId: socket.id, modelName: 'llama3.2-1B', inputTime: new Date(), userId: user._id, clientIp, apiKeyId: key._id.toString() });
      // Handle the message
      // console.log('saved item', { savedItem });

      const previousInferences = await getAllByWebsocketId(socket.id);

      // console.log('previousInferences', previousInferences);
      // sum of item.result.prompt_eval_count
      const totalInputTokens = previousInferences.filter((item) => item.result?.prompt_eval_count).reduce((acc, item) => {
        return acc + item.result.prompt_eval_count;
      }, 0);
      // sum of item.result.eval_count
      const totalOutputTokens = previousInferences.reduce((acc, item) => {
        return acc + item.result?.eval_count || 0;
      }, 0);

      const totalTokensInThisDiscussion = totalInputTokens + totalOutputTokens;
      console.log('totalTokensInThisDiscussion', totalTokensInThisDiscussion);

      if (totalTokensInThisDiscussion > 1000) {
        // disable chat
        eventEmitter.emit(
          eventEmitter.EVENT_TYPES.DISABLE_CHAT,
          { connectionId: socket.id, message: 'You have exceeded the token limit (1000) for this session. Please try again later (logging out or refreshing helps sometimes)!' }
        );

        return;
      }

      const { tokenCount } = await getDashboardData(user._id);

      if (tokenCount > 10000) {
        // disable chat
        eventEmitter.emit(
          eventEmitter.EVENT_TYPES.DISABLE_CHAT,
          { connectionId: socket.id, message: 'You have exceeded the free token limit (10000) for today. Please try again tomorrow.' }
        );

        return;
      }

      const chatMessagesForLLM = [];
      chatMessagesForLLM.push({ role: 'assistant', content: 'You are a helpful assistant.' });
      if (previousInferences.length > 0) {
        previousInferences.forEach((item) => {
          // user - item.prompt
          chatMessagesForLLM.push({ role: 'user', content: item.prompt });
          // assistant - item.response
          if (item.response) {
            chatMessagesForLLM.push({ role: 'assistant', content: item.response });
          }
        });
      }
      console.log('chatMessagesForLLM', chatMessagesForLLM.length);
      await businessMessaging.sendInferenceRequest({ prompts: chatMessagesForLLM, connectionId: socket.id, _id: savedItem._id.toString() });
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
    const webServerPort = config.PORT_BUSINESS || 4000;
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
