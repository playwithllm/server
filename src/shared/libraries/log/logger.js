const os = require("os");
const fs = require("fs");
const path = require("path");
const { retrieveRequestId } = require("../../middlewares/request-context");
const { createLogger, format, transports } = require("winston");
const { Loggly } = require("winston-loggly-bulk");
require("winston-daily-rotate-file");
const argv = require("minimist")(process.argv);

// Use absolute path for logs to ensure consistent location
const LOG_DIR = path.resolve(process.cwd(), "logs");

// Ensure the log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Define standard log levels with clear purposes
const LOG_LEVELS = {
  error: 0, // Error conditions that require immediate attention
  warn: 1, // Warning conditions that should be addressed soon
  info: 2, // Informational messages about normal system operation
  http: 3, // HTTP request/response logs
  verbose: 4, // More detailed informational messages
  debug: 5, // Detailed debugging information
  silly: 6, // Extremely detailed debugging information
};

// Define sensitive data patterns to redact
const SENSITIVE_PATTERNS = [
  {
    regex: /(password["']?\s*[:=]\s*["']?)(.+?)(["'])/gi,
    replacement: "$1[REDACTED]$3",
  },
  {
    regex: /(authorization["']?\s*[:=]\s*["']?)(.+?)(["'])/gi,
    replacement: "$1[REDACTED]$3",
  },
];

/**
 * Detects which service is running based on the main module path
 * @returns {string} The detected service type ('business', 'inference', or undefined)
 */
function detectServiceType() {
  // Get the main module path (entry point of the application)
  const mainPath = require.main?.filename || "";

  if (mainPath.includes("/src/services/business/")) {
    return "business";
  } else if (mainPath.includes("/src/services/inference/")) {
    return "inference";
  }

  // If we couldn't detect from main path, try to infer from current working directory
  const cwd = process.cwd();
  if (
    cwd.includes("/src/services/business/") ||
    cwd.includes("/services/business/")
  ) {
    return "business";
  } else if (
    cwd.includes("/src/services/inference/") ||
    cwd.includes("/services/inference/")
  ) {
    return "inference";
  }

  // Return undefined if we can't detect the service type
  return process.env.SERVICE_TYPE;
}

// Get the service type once at startup
const detectedServiceType = detectServiceType();

class LogManager {
  static instance;

  constructor() {
    // Redact sensitive information from logs
    const redactSensitiveInfo = format((info) => {
      if (typeof info.message === "string") {
        SENSITIVE_PATTERNS.forEach((pattern) => {
          info.message = info.message.replace(
            pattern.regex,
            pattern.replacement
          );
        });
      }

      // Handle objects in metadata
      if (info.metadata && typeof info.metadata === "object") {
        this._redactObject(info.metadata);
      }

      return info;
    });

    // Enhanced format with standardized fields and metadata handling
    const logFormat = format.combine(
      format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss.SSS",
      }),
      format.errors({ stack: true }),
      format.splat(),
      format((info) => {
        // Add standard context fields
        const requestId = retrieveRequestId();
        const context = {
          service:
            detectedServiceType || process.env.SERVICE_NAME || "playwllm",
          environment: argv.env || process.env.NODE_ENV || "development",
          hostname: os.hostname(),
          pid: process.pid,
        };

        if (requestId) {
          context.requestId = requestId;
        }

        // Create standardized metadata object
        info.metadata = info.metadata || {};

        // Move non-standard fields to metadata
        Object.keys(info).forEach((key) => {
          if (!["level", "message", "timestamp", "metadata"].includes(key)) {
            info.metadata[key] = info[key];
            delete info[key];
          }
        });

        // Add context to the log
        info.context = context;

        return info;
      })(),
      redactSensitiveInfo(),
      format.json()
    );

    // Create consistent console format for readability
    const consoleFormat = format.combine(
      format.colorize(),
      format.timestamp({
        format: "HH:mm:ss.SSS",
      }),
      format.printf((info) => {
        let meta = "";
        if (info.metadata && Object.keys(info.metadata).length) {
          meta = JSON.stringify(info.metadata);
        }

        const requestId = info.context?.requestId
          ? `[${info.context.requestId}] `
          : "";
        const serviceType = info.context?.service
          ? `[${info.context.service}] `
          : "";
        return `${info.timestamp} ${info.level}: ${serviceType}${requestId}${info.message} ${meta}`;
      })
    );

    this.logger = createLogger({
      levels: LOG_LEVELS,
      level:
        process.env.LOG_LEVEL || (argv.env === "production" ? "info" : "debug"),
      format: logFormat,
      transports: [
        // Application logs with all levels
        new transports.DailyRotateFile({
          filename: path.join(LOG_DIR, "app-%DATE%.log"),
          datePattern: "YYYY-MM-DD",
          level: "debug",
          zippedArchive: true,
          maxSize: "50m",
          maxFiles: "14d",
          auditFile: path.join(LOG_DIR, ".app-audit.json"),
        }),
        // Error logs only
        new transports.DailyRotateFile({
          filename: path.join(LOG_DIR, "error-%DATE%.log"),
          datePattern: "YYYY-MM-DD",
          level: "error",
          zippedArchive: true,
          maxSize: "50m",
          maxFiles: "30d",
          auditFile: path.join(LOG_DIR, ".error-audit.json"),
        }),
      ],
      // Don't exit on uncaught exceptions
      exitOnError: false,
    });

    // Add service-specific log file if service type is detected
    if (detectedServiceType) {
      this.logger.add(
        new transports.DailyRotateFile({
          filename: path.join(LOG_DIR, `${detectedServiceType}-%DATE%.log`),
          datePattern: "YYYY-MM-DD",
          level: "debug",
          zippedArchive: true,
          maxSize: "50m",
          maxFiles: "14d",
          auditFile: path.join(LOG_DIR, `.${detectedServiceType}-audit.json`),
        })
      );
    }

    // Add console transport with appropriate level based on environment
    const consoleLogLevel =
      process.env.CONSOLE_LOG_LEVEL ||
      (argv.env === "production" ? "warn" : "debug");

    this.logger.add(
      new transports.Console({
        level: consoleLogLevel,
        format: consoleFormat,
      })
    );

    // Add Loggly transport in production if configured
    if (argv.env === "production" || process.env.NODE_ENV === "production") {
      this._setupRemoteLogging();
    }

    // Create convenience methods for each log level with metadata support
    Object.keys(LOG_LEVELS).forEach((level) => {
      const originalMethod = this.logger[level];
      this.logger[level] = (message, metadata) => {
        return originalMethod.call(this.logger, message, { metadata });
      };
    });
  }

  // Helper method to redact sensitive info in objects
  _redactObject(obj) {
    if (!obj || typeof obj !== "object") return;

    Object.keys(obj).forEach((key) => {
      // Redact keys that might contain sensitive data
      if (/password|key|secret|auth|credential/i.test(key)) {
        obj[key] = "[REDACTED]";
      }
      // Recursively redact nested objects
      else if (typeof obj[key] === "object" && obj[key] !== null) {
        this._redactObject(obj[key]);
      }
      // Check string values for sensitive patterns
      else if (typeof obj[key] === "string") {
        SENSITIVE_PATTERNS.forEach((pattern) => {
          obj[key] = obj[key].replace(pattern.regex, pattern.replacement);
        });
      }
    });
  }

  // Setup remote logging service
  _setupRemoteLogging() {
    try {
      const configPath = path.resolve(
        __dirname,
        "../../configs/config.production.json"
      );

      if (fs.existsSync(configPath)) {
        const config = require(configPath);
        if (config?.LOGGLY_TOKEN) {
          const tags = [os.hostname(), argv.env];

          // Add service type to tags if available
          if (detectedServiceType) {
            tags.push(detectedServiceType);
          } else if (process.env.SERVICE_NAME) {
            tags.push(process.env.SERVICE_NAME);
          } else {
            tags.push("playwllm");
          }

          this.logger.add(
            new Loggly({
              token: config.LOGGLY_TOKEN,
              subdomain: config.LOGGLY_SUBDOMAIN || "foyzulk2023",
              tags: tags,
              json: true,
            })
          );
        }
      }
    } catch (error) {
      console.error("Failed to setup remote logging:", error.message);
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
