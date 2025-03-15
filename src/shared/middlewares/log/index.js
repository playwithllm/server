const LogHelper = require('../../libraries/log/index');
const logger = LogHelper.getLogger('http-middleware');

/**
 * HTTP request logging middleware
 * @param {Object} options Configuration options
 * @param {string[]} [options.fields] Specific request body fields to log (logs all if not specified)
 * @param {string[]} [options.sensitiveFields] Fields to redact from request body
 * @param {boolean} [options.logHeaders=false] Whether to log request headers 
 * @param {boolean} [options.logBody=true] Whether to log request body
 */
const logRequest = (options = {}) => {
  const { 
    fields = [], 
    sensitiveFields = ['password', 'token', 'authorization', 'secret', 'key'],
    logHeaders = false,
    logBody = true
  } = options;

  return (req, res, next) => {
    // Record start time for request duration calculation
    req._requestStartTime = Date.now();
    
    // Prepare request data for logging
    const logData = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || req.headers.referrer
    };

    // Add query params if they exist
    if (Object.keys(req.query || {}).length > 0) {
      logData.query = req.query;
    }
    
    // Add URL params if they exist
    if (Object.keys(req.params || {}).length > 0) {
      logData.params = req.params;
    }
    
    // Add headers if enabled (excluding cookies for security)
    if (logHeaders && req.headers) {
      const safeHeaders = { ...req.headers };
      delete safeHeaders.cookie;
      delete safeHeaders.authorization;
      logData.headers = safeHeaders;
    }
    
    // Add body if enabled and exists
    if (logBody && req.body && Object.keys(req.body).length > 0) {
      // If specific fields are provided, only log those
      if (fields.length > 0) {
        logData.body = {};
        fields.forEach(field => {
          if (req.body[field] !== undefined) {
            logData.body[field] = req.body[field];
          }
        });
      } else {
        // Otherwise log the entire body but redact sensitive fields
        logData.body = { ...req.body };
        sensitiveFields.forEach(field => {
          if (logData.body[field]) {
            logData.body[field] = '[REDACTED]';
          }
        });
      }
    }

    // If user is authenticated, add user info
    if (req.user) {
      logData.userId = req.user._id?.toString() || req.user.id;
    }

    // Log the incoming request
    logger.http(`${req.method} ${req.originalUrl}`, logData);

    // Store original end function
    const originalEnd = res.end;
    
    // Override end method to log response
    res.end = function (chunk, encoding) {
      // Calculate request duration
      const responseTime = Date.now() - req._requestStartTime;
      
      // Restore original end function and call it
      res.end = originalEnd;
      res.end(chunk, encoding);
      
      // Prepare response data
      const responseData = {
        statusCode: res.statusCode,
        responseTime: responseTime,
        contentLength: res.getHeader('content-length'),
        contentType: res.getHeader('content-type')
      };

      // Determine log level based on status code
      const level = res.statusCode >= 500 ? 'error' : 
                   res.statusCode >= 400 ? 'warn' : 
                   'http';
      
      // Log the response
      logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime}ms`, responseData);
    };
    
    next();
  };
};

/**
 * Creates a specialized logger middleware for API endpoints
 * @param {Object} options Additional options 
 */
const apiLogger = (options = {}) => {
  return logRequest({
    logHeaders: true,
    ...options
  });
};

module.exports = { 
  logRequest,
  apiLogger
};
