const { Ollama } = require('ollama');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter'); // Import EventEmitter

const modelName = 'llama3.2:1b';

async function generateResponse(prompt) {
  try {
    const ollama = new Ollama();
    const response = await ollama.chat({
      model: modelName,
      messages: [
        { role: 'assistant', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }],
    });
    
    return response.message;
  } catch (error) {
    console.error('Error generating response:', error);
    return error;
  }
}

async function generateResponseStream(prompt) {
  try {
    const ollama = new Ollama();
    const response = await ollama.chat({
      model: modelName,
      messages: [
        { role: 'assistant', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }],
      stream: true,
    });
    for await (const part of response) {
      if (part.done) {
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

async function chatResponseStream(messages) {
  try {
    const ollama = new Ollama();
    const response = await ollama.chat({
      model: modelName,
      messages: messages,
      stream: true,
    });
    for await (const part of response) {
      if (part.done) {
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
  chatResponseStream
};
