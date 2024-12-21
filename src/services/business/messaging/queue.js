const { Queue, Worker } = require('bullmq');
const { redisConfig } = require('../../../shared/config/redis');

const QUEUE_NAME = 'inference-requests';
const RESPONSE_QUEUE_NAME = 'inference-responses';

// Create queues
const inferenceRequestQueue = new Queue(QUEUE_NAME, {
  connection: redisConfig,
});

const inferenceResponseQueue = new Queue(RESPONSE_QUEUE_NAME, {
  connection: redisConfig,
});

// Add a map to store pending requests
const pendingRequests = new Map();

// Create response worker
const responseWorker = new Worker(RESPONSE_QUEUE_NAME, async (job) => {
  const { requestId, inferenceResult } = job.data;
  console.log('Received inference response:', {
    requestId,
    result: inferenceResult
  });
  
  // Resolve the pending promise if it exists
  const resolver = pendingRequests.get(requestId);
  if (resolver) {
    resolver.resolve(inferenceResult);
    pendingRequests.delete(requestId);
  }
}, {
  connection: redisConfig,
});

// Function to send inference requests
const sendInferenceRequest = async (data) => {
  try {
    console.log('Sending inference request:', data);
    
    const job = await inferenceRequestQueue.add('inference-job', data);
    console.log('Inference request queued with ID:', job.id);

    // Create a promise that will be resolved when the response is received
    return new Promise((resolve, reject) => {
      pendingRequests.set(job.id, { resolve, reject });
      
      // Add timeout to prevent memory leaks
      setTimeout(() => {
        if (pendingRequests.has(job.id)) {
          pendingRequests.delete(job.id);
          reject(new Error('Inference request timed out'));
        }
      }, 30000); // 30 second timeout
    });
  } catch (error) {
    console.error('Error queuing inference request:', error);
    throw error;
  }
};

module.exports = {
  sendInferenceRequest,
}; 
