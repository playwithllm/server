const axios = require('axios');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter');
const logger = require('../../../shared/libraries/log/logger');

// Available models
const MODEL = {
  INTERN_VL2_5_1B_MPO: 'OpenGVLab/InternVL2_5-1B-MPO',
  INTERN_VL2_5_1B: 'OpenGVLab/InternVL2_5-1B',
};

// vLLM server configuration
const VLLM_SERVER_URL = 'http://192.168.4.28:8000/v1';

/**
 * Generate a completion using the vLLM API with streaming
 * @param {Array} prompts Array of message objects for the LLM
 * @returns {Promise<Object>} Completion result
 */
async function generateCompletionWithImage(prompts) {
  try {
    logger.info('Sending request to vLLM', { model: MODEL.INTERN_VL2_5_1B_MPO });
    
    // Request configuration
    const response = await axios({
      method: 'post',
      url: `${VLLM_SERVER_URL}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        model: MODEL.INTERN_VL2_5_1B_MPO,
        stream: true,
        stream_options: {
          include_usage: true
        },
        messages: prompts
      },
      responseType: 'stream'
    });

    // Process the stream
    return new Promise((resolve, reject) => {
      response.data.on('data', chunk => {
        try {
          // Remove 'data: ' prefix and parse JSON
          const cleanedLine = chunk.toString().replace(/^data: /, '');
          
          // Handle the [DONE] message
          if (cleanedLine.trim() === '[DONE]') {
            logger.debug('Stream complete [DONE] marker received');
            return;
          }

          const parsedChunk = JSON.parse(cleanedLine);
          
          // When choices: [], emit done event (completion with usage stats)
          if (parsedChunk.choices.length === 0) {
            logger.info('Stream complete', { usage: parsedChunk.usage });
            eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END, parsedChunk);
            return;
          }

          // Handle content chunks
          if (parsedChunk.choices?.length > 0) {
            logger.debug('Stream chunk received', { 
              content: parsedChunk.choices[0].delta.content.substring(0, 20) + '...' 
            });
            eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, parsedChunk);
          }
        } catch (error) {
          logger.error('Error processing chunk:', error);
        }
      });

      // Handle stream events
      response.data.on('end', () => resolve({ status: 'completed' }));
      response.data.on('error', (error) => {
        logger.error('Stream error:', error);
        reject(error);
      });
    });

  } catch (error) {
    logger.error('Error generating completion with image:', error.message);
    throw error;
  }
}

module.exports = {
  generateCompletionWithImage
};