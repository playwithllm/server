const os = require('os');
const fs = require('fs');
const path = require('path');

const { retrieveRequestId } = require('../../middlewares/request-context');
const { createLogger, format, transports } = require('winston');
const { Loggly } = require('winston-loggly-bulk');
require('winston-daily-rotate-file');
const argv = require('minimist')(process.argv);

// Use absolute path for logs to ensure consistent location
const LOG_DIR = path.resolve(process.cwd(), 'logs');

// Ensure the log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

class LogManager {
  static instance;
  constructor() {
    // Common format for all logs
    const logFormat = format.combine(
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      format.errors({ stack: true }),
      format.splat(),
      format.json(),
      format((info) => {
        const requestId = retrieveRequestId();
        if (requestId) {
          info.requestId = requestId;
        }
        return info;
      })()
    );

    this.logger = createLogger({
      level: 'info',
      format: logFormat,
      transports: [
        // Only keep two log files: app.log for all levels and error.log for errors
        new transports.DailyRotateFile({
          filename: path.join(LOG_DIR, 'app-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'debug', // Capture all log levels
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '14d',
          auditFile: path.join(LOG_DIR, '.app-audit.json'), // Track rotated files
        }),
        new transports.DailyRotateFile({
          filename: path.join(LOG_DIR, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '30d', // Keep errors longer
          auditFile: path.join(LOG_DIR, '.error-audit.json'),
        }),
      ],
      // Don't exit on uncaught exceptions
      exitOnError: false,
    });

    // Add console transport in non-production environments
    if (argv.env !== 'production') {
      this.logger.add(
        new transports.Console({
          level: 'debug',
          format: format.combine(
            format.colorize(),
            format.timestamp({
              format: 'HH:mm:ss'
            }),
            format.printf(
              info => `${info.timestamp} ${info.level}: ${info.message}`
            )
          ),
        })
      );
    } else {
      // In production, log less to console but still capture errors
      this.logger.add(
        new transports.Console({
          level: 'warn',
          format: format.combine(
            format.colorize(),
            format.simple()
          ),
        })
      );
    }

    // Add Loggly transport in production if configured
    const configPath = path.resolve(
      __dirname,
      '../../configs/config.production.json'
    );

    if (fs.existsSync(configPath)) {
      const config = require(configPath);
      if (config?.LOGGLY_TOKEN) {
        this.logger.add(
          new Loggly({
            token: config.LOGGLY_TOKEN,
            subdomain: config.LOGGLY_SUBDOMAIN || 'foyzulk2023',
            tags: [os.hostname(), argv.env],
            json: true,
          })
        );
      }
    } else {
      console.log('Production config file not found');
    }
  }

  getLogger() {
    return this.logger;
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new LogManager();
    }

    return this.instance;
  }
}

module.exports = LogManager.getInstance().getLogger();
