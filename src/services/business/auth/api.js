const config = require('../../../shared/configs');
const passport = require('passport');
const session = require('express-session');
const MongoStore = require('connect-mongo'); // For storing sessions in MongoDB

const logger = require('../../../shared/libraries/log/logger');
const {
  getGitHubStrategy,
  clearAuthInfo,
  localStrategy,
  registerUser,
  getGoogleStrategy,
  verifyEmail,
  resendVerificationEmail,
} = require('./strategies');

const { AppError } = require('../../../shared/libraries/error-handling/AppError');

// const { getClientPermissionsByRoleIdentifierSync } = require('../domains/admin/role/service');

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
            if (err && err.code === 11000) {
              return res.redirect(
                `${config.CLIENT_HOST}/login?error=email_taken&value=${err.keyValue.email}`
              );
            }
            return res.redirect(
              `${config.CLIENT_HOST}/login?error=authentication_failed`
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

const configureAuthToExpressApp = (expressApp) => {
  passport.use(localStrategy);
  passport.use(getGitHubStrategy());
  passport.use(getGoogleStrategy());

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

  // Github authentication
  expressApp.get('/api/auth/github', passport.authenticate('github'));

  // Replace the GitHub callback route with:
  expressApp.get('/api/auth/github/callback', ...handleAuthCallback('github'));

  // Replace the Google callback route with:
  expressApp.get('/api/auth/google/callback', ...handleAuthCallback('google'));

  // Google authentication
  // get current logged in user data from req.user object
  expressApp.get('/api/auth/me', (req, res) => {
    if (!req.user) {
      return res.status(401).send('Unauthorized');
    }

    const userResponse = createTrimmedUser(req.user);
    res.json(userResponse);
  });

  expressApp.post('/api/auth/register', async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const newUser = await registerUser({ email, password });
      res
        .status(201)
        .json({ message: 'Registration successful. Please check your email to verify your account.', userId: newUser._id });
    } catch (err) {
      next(err);
    }
  });

  // Debug email routes - only available in development
  if (process.env.NODE_ENV === 'development') {
    const { listDebugEmails, readDebugEmail, isDebugMode } = require('../../../shared/libraries/email/emailService');

    expressApp.get('/api/debug/emails', async (req, res) => {
      if (!isDebugMode) {
        return res.status(400).json({ message: 'Email debug mode is not enabled' });
      }
      const emails = await listDebugEmails();
      res.json(emails);
    });

    expressApp.get('/api/debug/emails/:filename', async (req, res) => {
      if (!isDebugMode) {
        return res.status(400).json({ message: 'Email debug mode is not enabled' });
      }
      try {
        const content = await readDebugEmail(req.params.filename);
        res.send(content);
      } catch (error) {
        res.status(404).json({ message: 'Email not found' });
      }
    });
  }

  expressApp.get('/api/auth/verify-email', async (req, res, next) => {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ message: 'Verification token is required' });
      }

      const result = await verifyEmail(token);
      res.json(result);
    } catch (err) {
      if (err instanceof AppError) {
        return res.status(err.statusCode || 400).json({
          message: err.message,
          code: err.name
        });
      }
      next(err);
    }
  });

  expressApp.post('/api/auth/login', async (req, res, next) => {
    req.body.username = req.body.email;
    passport.authenticate('local', async (err, user, info) => {
      logger.info('Login attempt', { err, user, info });
      if (err) {
        return next(err);
      }
      if (!user) {
        return res
          .status(401)
          .json({ message: info.message || 'Authentication failed', reason: info.reason });
      }

      // user.permissions = {
      //   client: await getClientPermissionsByRoleIdentifierSync(user.role),
      // };

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }

        const trimmedUser = createTrimmedUser(user);
        // Save session data
        req.session.userId = trimmedUser._id.toString();
        req.session.sessionId = req.sessionID;

        logger.info('saving session for user', { user: trimmedUser });

        // Explicitly save the session
        req.session.save((err) => {
          if (err) {
            logger.error('Failed to save session', err);
            return next(err);
          }

          logger.info('Session saved successfully', {
            sessionId: req.sessionID,
            userId: trimmedUser._id
          });

          return res.json({
            message: 'Login successful',
            user: trimmedUser,
          });
        });
      });
    })(req, res, next);
  });

  expressApp.get('/api/auth/logout', async (req, res, next) => {
    const username = req.user?.username;
    const userId = req.user?._id;
    console.log('req.session', req.session);
    console.log('req.session.userId', req.session.userId);
    req.logout(async function (err) {
      // Passport.js logout function
      if (err) {
        logger.error('Failed to log out user', err);
        return next(err);
      }

      req.session.destroy(function (err) {
        // Handle potential errors during session destruction
        if (err) {
          logger.error('Failed to destroy session', err);
        } else {
          logger.info('Session destroyed');
        }
      });

      res.cookie('userId', '', {
        expires: new Date(0), // Set expiry date to a time in the past
        httpOnly: true,
        secure: true, // Use secure in production (HTTPS)
        sameSite: 'lax', // Adjust depending on deployment
      });

      await clearAuthInfo(userId);

      logger.info('User logged out', { username });
      res.redirect(`${config.CLIENT_HOST}`);
    });
  });

  // Add Google auth routes
  expressApp.get(
    '/api/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  expressApp.post('/api/auth/resend-verification', async (req, res, next) => {
    try {
      const { email } = req.body;
      logger.info('resend-verification', { email });
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const result = await resendVerificationEmail(email);
      res.json(result);
    } catch (err) {
      if (err instanceof AppError) {
        return res.status(err.statusCode || 400).json({
          message: err.message,
          code: err.name
        });
      }
      next(err);
    }
  });

  return expressApp;
};


module.exports = { configureAuthToExpressApp };
