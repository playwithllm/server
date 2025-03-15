// filepath: /Users/foyzul/personal/playwllm/server/src/shared/libraries/log/index.js
const logger = require('./logger');

/**
 * Logging helper to standardize logging across the application
 * Provides methods for different log levels with consistent metadata handling
 */
class LogHelper {
  /**
   * Create a logger instance for a specific module/component
   * @param {string} moduleName - Name of the module using this logger
   * @returns {object} - Logger with module context
   */
  static getLogger(moduleName) {
    if (!moduleName) {
      return logger;
    }
    
    // Create wrapper methods for each log level that include the module name
    const moduleLogger = {};
    
    ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].forEach(level => {
      moduleLogger[level] = (message, metadata = {}) => {
        const moduleMetadata = { ...metadata, module: moduleName };
        return logger[level](message, moduleMetadata);
      };
    });
    
    // Add convenience methods
    moduleLogger.logRequest = (req, customData = {}) => {
      const requestData = {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        ...customData
      };
      
      // If authenticated user, include user ID
      if (req.user && req.user._id) {
        requestData.userId = req.user._id.toString();
      }
      
      return logger.http(`${req.method} ${req.originalUrl}`, requestData);
    };
    
    moduleLogger.logResponse = (req, res, responseTime, customData = {}) => {
      const responseData = {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        ...customData
      };
      
      // Log based on status code
      const level = res.statusCode >= 500 ? 'error' :
                    res.statusCode >= 400 ? 'warn' : 'http';
      
      return logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime}ms`, responseData);
    };
    
    moduleLogger.logError = (error, additionalInfo = {}) => {
      const errorData = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        ...additionalInfo
      };
      
      return logger.error(`Error: ${error.message}`, errorData);
    };
    
    return moduleLogger;
  }
}

module.exports = LogHelper;