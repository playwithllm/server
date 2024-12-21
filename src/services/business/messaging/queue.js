const { Queue } = require('bullmq');
const { redisConfig } = require('../../../shared/config/redis');
// Import the result worker
require('./result-worker');  // This will initialize the worker when the file is loaded

const INFERENCE_REQUEST_QUEUE = 'inference-requests';

// Create queue for sending inference requests
const inferenceRequestQueue = new Queue(INFERENCE_REQUEST_QUEUE, {
  connection: redisConfig,
});

// Fire-and-forget function to send inference requests
const sendInferenceRequest = async (data) => {
  try {
    console.log('Sending inference request:', data);
    await inferenceRequestQueue.add('inference-job', data);
    console.log('Inference request queued successfully');
  } catch (error) {
    console.error('Error queuing inference request:', error);
    throw error;
  }
};

module.exports = {
  sendInferenceRequest,
}; 
