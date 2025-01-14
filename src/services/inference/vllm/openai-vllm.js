// import OpenAI from 'openai';
// import fs from 'fs';
const OpenAI = require('openai');
const fs = require('fs');
const axios = require('axios');
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

const MODEL = {
  INTERN_VL2_5_1B_MPO: 'OpenGVLab/InternVL2_5-1B-MPO',
  INTERN_VL2_5_1B: 'OpenGVLab/InternVL2_5-1B',
};


async function generateCompletionWithImage_SDK(prompts) {
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
      model: MODEL.INTERN_VL2_5_1B_MPO, // example model, replace with your loaded model
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
      // temperature: 0.7,
      stream: true,
      stream_options: {
        "include_usage": true,
        "include_response_metadata": true
      }
    };

    // const response = await client.chat.completions.create({
    //   ...defaultOptions,
    // });

    // console.log('generateCompletionWithImage response:', JSON.stringify(response));

    // return response;

    const response = await client.chat.completions.create(defaultOptions);

    for await (const part of response) {
      console.log('generateCompletionWithImage response usage:', part);
      if (part?.choices[0]?.finish_reason === 'stop') {
        console.log('generateCompletionWithImage response-stop:', part);
        eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END, part); // Emit event for end of stream     
        return part;
      } else {
        eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, part); // Emit event for each chunk
      }
    }

    return response;
  } catch (error) {
    console.error('Error generating completion with image:', error.message);
    throw error;
  }
}

async function generateCompletionWithImage(prompts) {
  try {
    const response = await axios({
      method: 'post',
      url: 'http://192.168.4.28:8000/v1/chat/completions',
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

    // Handle the stream
    response.data.on('data', chunk => {
      try {
        // Remove 'data: ' prefix and parse JSON
        const cleanedLine = chunk.toString().replace(/^data: /, '');
        // console.log('generateCompletionWithImage response-cleanedLine:', cleanedLine);
        // Handle the [DONE] message
        if (cleanedLine.trim() === '[DONE]') {
          console.log('generateCompletionWithImage response-cleanedLine-DONE:', cleanedLine);
          // eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END);
          return 'DONE';
        }

        const parsedChunk = JSON.parse(cleanedLine);
        // console.log('generateCompletionWithImage response-parsedChunk:', parsedChunk);

        // when choices: [], emit done event
        if (parsedChunk.choices.length === 0) {
          console.log('generateCompletionWithImage response-parsedChunk-choices-0:', parsedChunk);
          eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK_END, parsedChunk);
          return 'DONE';
        }

        // Handle content chunks
        if (parsedChunk.choices?.length > 0) {
          console.log('generateCompletionWithImage response-parsedChunk-streaming:', parsedChunk.choices[0].delta.content);
          eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_STREAM_CHUNK, parsedChunk);
        }
      } catch (error) {
        console.error('Error processing chunk:', error);
      }
    });

    return new Promise((resolve, reject) => {
      response.data.on('end', () => resolve({ status: 'completed' }));
      response.data.on('error', reject);
    });

  } catch (error) {
    console.error('Error generating completion with image:', error.message);
    throw error;
  }
}

module.exports = {
  generateCompletion,
  generateCompletionWithImage
};
