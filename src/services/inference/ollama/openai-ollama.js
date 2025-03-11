const axios = require("axios");
const eventEmitter = require("../../../shared/libraries/events/eventEmitter");
const logger = require("../../../shared/libraries/log/logger");

// Available models mapping (model name -> vLLM model path)
const MODEL = {
  "llama3.2": "llama3.2",
  "qwen2.5-coder": "qwen2.5-coder",
};

// vLLM server configuration
const OPENAI_OLLAMA_SERVER_URL = "http://localhost:11434/v1";

async function generateCompletion(prompts, modelName = "llama3.2") {
  try {
    // Get vLLM model path from map or use the default
    const ollamaModel = MODEL[modelName] || MODEL["llama3.2"];

    logger.info("Sending request to OLLAMA", { model: ollamaModel, modelName });

    // Request configuration
    const response = await axios({
      method: "post",
      url: `${OPENAI_OLLAMA_SERVER_URL}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        model: ollamaModel,
        stream: true,
        stream_options: {
          include_usage: true,
        },
        messages: prompts,
      },
      responseType: "stream",
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
  } catch (error) {
    logger.error("Error generating completion with OLLAMA", {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  generateCompletion,
};
