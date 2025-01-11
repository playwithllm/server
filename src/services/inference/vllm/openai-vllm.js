// import OpenAI from 'openai';
// import fs from 'fs';
const OpenAI = require('openai');
const fs = require('fs');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter'); // Import EventEmitter


const createVLLMClient = (baseURL = 'http://192.168.4.28:8000/v1') => {
  return new OpenAI({
    baseURL,
    apiKey: 'dummy-key', // vLLM doesn't require real OpenAI key
  });
};

 async function generateCompletion(input, options = {}) {
  try {
    const vllm = createVLLMClient();

    const defaultOptions = {
      model: 'OpenGVLab/InternVL2_5-1B', // example model, replace with your loaded model
      messages: [
        { role: 'user', content: input }
      ],
      temperature: 0.7,
    };

    const response = await vllm.chat.completions.create({
      ...defaultOptions,
      ...options,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error calling vLLM:', error);
    throw error;
  }
}


 async function generateCompletionWithImage(prompts) {
  try {
    const client = createVLLMClient();
    console.log('generateCompletionWithImage:', prompts);

    /**
     *  const params = {
        messages: [{ role: 'user', content: 'Say this is a test' }],
        model: 'gpt-4o',
      };
     */

    const defaultOptions = {
      model: 'OpenGVLab/InternVL2_5-1B', // example model, replace with your loaded model
      messages: [
        // {
        //   role: 'user',
        //   content: [
        //     // { type: 'text', text: prompt },
        //     // {
        //     //   type: 'image_url',
        //     //   image_url: {
        //     //     url: `data:image/jpeg;base64,${base64Image}`
        //     //   }
        //     // }
        //     ...prompts
        //   ]
        // }
        ...prompts
      ],
      temperature: 0.7,
      stream: true,
    };

    // const response = await client.chat.completions.create({
    //   ...defaultOptions,
    // });

    // console.log('generateCompletionWithImage response:', JSON.stringify(response));

    // return response;

    const response = await client.chat.completions.create(defaultOptions);

    for await (const part of response) {
      console.log('generateCompletionWithImage response:', part.choices);
      if (part.done) {
        eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END, part); // Emit event for end of stream
        return '';
      }
      eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, part); // Emit event for each chunk
    }

    return 'DONE';
  } catch (error) {
    console.error('Error generating completion with image:', error.message);
    throw error;
  }
}

module.exports = {
  generateCompletion,
  generateCompletionWithImage
};
