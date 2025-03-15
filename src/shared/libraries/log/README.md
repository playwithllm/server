# Logging System Documentation

This document describes the logging system used in the PlayWLLM server application.

## Overview

Our logging system is built on Winston and follows industry best practices for structured logging. Key features include:

- **Structured JSON logs** for machine-parsability and easy integration with log analysis tools
- **Standardized log levels** with clear purposes
- **Context enrichment** with service, environment, hostname, process ID, and request ID
- **Sensitive data redaction** to prevent security issues
- **Modular logging** with per-component loggers
- **HTTP request/response logging** with timing and status details
- **Error tracking** with stack traces
- **Log rotation** with configurable retention periods
- **Environment-aware configuration** with different behaviors for development and production

## Log Levels

The system uses the following standard log levels (ordered by severity):

1. **error** (0): Error conditions that require immediate attention
2. **warn** (1): Warning conditions that should be addressed soon
3. **info** (2): Normal operational messages about system state
4. **http** (3): HTTP request/response logs
5. **verbose** (4): More detailed informational messages for troubleshooting
6. **debug** (5): Detailed debugging information for development
7. **silly** (6): Extremely detailed diagnostic information

## Using the Logger

### Basic Usage

```javascript
const LogHelper = require('../../shared/libraries/log');
const logger = LogHelper.getLogger('component-name');

// Simple message
logger.info('Server started successfully');

// With metadata
logger.info('User registered', { userId: '123', email: 'user@example.com' });

// Different log levels
logger.error('Database connection failed', { retryCount: 3 });
logger.warn('High memory usage', { memoryUsage: process.memoryUsage() });
logger.debug('Processing request', { requestData });
```

### Specialized Methods

```javascript
// Log an HTTP request
logger.logRequest(req, { additionalData: 'value' });

// Log an HTTP response with timing
logger.logResponse(req, res, responseTimeMs, { additionalData: 'value' });

// Log an error with additional context
try {
  // code that might throw
} catch (error) {
  logger.logError(error, { userId: '123', action: 'updateProfile' });
}
```

## HTTP Request Logging

The middleware in `shared/middlewares/log` automatically logs HTTP requests and responses:

```javascript
const { logRequest, apiLogger } = require('../../shared/middlewares/log');

// Basic request logging
app.use(logRequest());

// Advanced configuration for API endpoints
app.use('/api', apiLogger({
  sensitiveFields: ['password', 'token', 'secret'],
  logHeaders: true
}));
```

## Configuration

Log levels can be configured through environment variables:
- `LOG_LEVEL`: Controls the minimum level for file logs (default: 'info' in production, 'debug' in development)
- `CONSOLE_LOG_LEVEL`: Controls the minimum level for console logs (default: 'warn' in production, 'debug' in development)

## Log File Structure

Logs are stored in the `logs` directory:
- `app-YYYY-MM-DD.log`: All log levels
- `error-YYYY-MM-DD.log`: Error logs only

Both files use JSON format for structured logging.

## Best Practices

1. **Be descriptive but concise** - Log messages should be informative but not verbose
2. **Use appropriate log levels** - Don't log everything as "info"
3. **Include context** - Add relevant metadata to logs
4. **Don't log sensitive data** - Avoid passwords, tokens, personal information
5. **Use component-specific loggers** - Create loggers for each module
6. **Log at service boundaries** - Log API calls, database operations, etc.

## Remote Logging

In production, logs are also sent to Loggly for centralized storage and analysis.