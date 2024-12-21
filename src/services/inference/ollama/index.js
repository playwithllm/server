const { Ollama } = require('ollama');

/**
 * Generates a response using the Ollama model
 * @param {string} prompt - The user's input prompt
 * @param {Object} options - Optional configuration parameters
 * @param {string} options.model - The model to use (defaults to 'llama2')
 * @param {number} options.temperature - Temperature for response generation (0-1)
 * @param {number} options.topP - Top-p sampling parameter (0-1)
 * @returns {Promise<string>} The generated response
 */
async function generateResponse(prompt) {
  try {
    const ollama = new Ollama();
    console.log(ollama)
    const response = await ollama.chat({
      model: 'llama3.2',
      messages: [{ role: 'user', content: prompt }],
    })
    console.log(response)
    return response.message;
  } catch (error) {
    console.error('Error generating response:', error);
    return error;
  }
}

module.exports = {
  generateResponse
};
