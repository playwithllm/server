const { Ollama } = require('ollama');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter'); // Import EventEmitter

const modelName = 'llama3.2';

async function generateResponse(prompt) {
  try {
    const ollama = new Ollama();
    console.log('generateResponse\t', prompt);
    const response = await ollama.chat({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
    });
    console.log('generateResponse\t', response);
    return response.message;
  } catch (error) {
    console.error('Error generating response:', error);
    return error;
  }
}

async function generateResponseStream(prompt) {
  try {
    const ollama = new Ollama();
    console.log('LLAMA WORLD\t', prompt);
    const response = await ollama.chat({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      options: { num_predict: 100 },
    });
    for await (const part of response) {
      if(part.done) {
        eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END, part); // Emit event for end of stream
        return '';
      }
      eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, part); // Emit event for each chunk
    }
    return 'DONE';
  } catch (error) {
    console.error('Error generating response stream:', error);
    return error;
  }
}

module.exports = {
  generateResponse,
  generateResponseStream,
};
