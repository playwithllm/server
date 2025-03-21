const validator = require("validator");

const logger = require("../../libraries/log/logger");
const { ValidationError } = require("../../libraries/error-handling/AppError");

function validateRequest({ schema, isParam = false, isQuery = false, skipEscape = false }) {
  return (req, res, next) => {
    const input = isParam ? req.params : isQuery ? req.query : req.body;

    // Sanitize inputs
    if (!skipEscape) {
      for (let key in input) {
        // we don't want to escape the base64 encoded image
        if (
          typeof input[key] === "string" &&
          !input[key].startsWith("data:image/") &&
          !input[key].startsWith("data:application/")
        ) {
          input[key] = validator.escape(input[key]);
        }
      }
    }

    const validationResult = schema.validate(input, { abortEarly: false });

    if (validationResult.error) {
      logger.error(`${req.method} ${req.originalUrl} Validation failed`, {
        errors: validationResult.error.details.map((detail) => detail.message),
      });
      const messages = validationResult.error.details.map(
        (detail) => detail.message
      );
      throw new ValidationError(messages);
    }

    // Attach validation result back to the original field
    if (isParam) {
      req.params = validationResult.value;
    } else if (isQuery) {
      req.query = validationResult.value;
    } else {
      req.body = validationResult.value;
    }

    // Validation successful - proceed
    next();
  };
}

module.exports = { validateRequest };
