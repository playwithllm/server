const axios = require("axios");
const eventEmitter = require("../../../shared/libraries/events/eventEmitter");
const logger = require("../../../shared/libraries/log/logger");
const modelsConfig = require("../../../shared/configs/models");

async function generateCompletion(prompts, modelName = "llama3.2") {
  try {
    // Get model path from map or use the default
    const ollamaModel = modelsConfig.getModelById(modelName);

    if (!ollamaModel) {
      throw new Error(`Model ${modelName} not found`);
    }

    logger.info("Sending request to OLLAMA", { ollamaModel });

    console.log("Sending request to OLLAMA", {
      ollamaModel,
      prompts: prompts[0],
    });

    // Request configuration
    try {
      const response = await axios({
        method: "post",
        url: `${ollamaModel.apiBase}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          model: 'gemma3:12b',
          stream: true,
          stream_options: {
            include_usage: true,
          },
          messages: prompts,
        },
        responseType: "stream",
        timeout: 30000, // 30 second timeout
      });

      // Process the stream
      return new Promise((resolve, reject) => {
        response.data.on("data", (chunk) => {
          try {
            // Split the chunk into lines and process each line
            const lines = chunk.toString().split("\n");

            for (const line of lines) {
              // Skip empty lines
              if (!line.trim()) continue;

              // Remove 'data: ' prefix
              const cleanedLine = line.replace(/^data: /, "");

              // Handle the [DONE] message
              if (cleanedLine.trim() === "[DONE]") {
                logger.info("Stream complete [DONE] marker received");
                continue;
              }

              try {
                const parsedChunk = JSON.parse(cleanedLine);

                // When choices: [], emit done event (completion with usage stats)
                if (parsedChunk.choices && parsedChunk.choices.length === 0) {
                  logger.info("Stream complete", { usage: parsedChunk.usage });
                  eventEmitter.emit(
                    eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END,
                    parsedChunk
                  );
                  continue;
                }

                // Handle content chunks
                if (parsedChunk.choices?.length > 0) {
                  logger.debug("Stream chunk received", {
                    content: parsedChunk.choices[0].delta.content
                      ? parsedChunk.choices[0].delta.content.substring(0, 20) +
                        "..."
                      : "(empty content)",
                  });
                  eventEmitter.emit(
                    eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK,
                    parsedChunk
                  );
                }
              } catch (error) {
                // Skip lines that aren't valid JSON
                logger.debug("Skipping non-JSON line:", cleanedLine);
              }
            }
          } catch (error) {
            logger.error("Error processing chunk:", error);
          }
        });

        // Handle stream events
        response.data.on("end", () => resolve({ status: "completed" }));
        response.data.on("error", (error) => {
          logger.error("Stream error:", error);
          reject(error);
        });
      });
    } catch (axiosError) {
      console.log("CLOG: OLLAMA API error response:", {
        status: axiosError.response.status,
        axiosError,
      });
      // Handle network or API-specific errors
      if (axiosError.response) {
        // The server responded with a status code outside the 2xx range
        logger.error("OLLAMA API error response:", {
          status: axiosError.response.status,
          data: axiosError.response.data,
        });
        throw new Error(
          `OLLAMA API error: ${axiosError.response.status} - ${JSON.stringify(
            axiosError.response.data
          )}`
        );
      } else if (axiosError.request) {
        // The request was made but no response was received
        logger.error("No response received from OLLAMA API:", {
          request: axiosError.request,
        });
        throw new Error(
          "No response received from OLLAMA API. Please check if the service is running."
        );
      } else {
        // Something happened in setting up the request
        logger.error("Error setting up OLLAMA API request:", {
          message: axiosError.message,
        });
        throw new Error(
          `Error setting up OLLAMA request: ${axiosError.message}`
        );
      }
    }
  } catch (error) {
    console.log("Error generating completion with OLLAMA", {
      error,
      message: error.message,
    });
    logger.error("Error generating completion with OLLAMA", {
      error,
      message: error.message,
    });
    throw error;
  }
}

module.exports = {
  generateCompletion,
};
