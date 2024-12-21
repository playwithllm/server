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

// Create request worker
const requestWorker = new Worker(QUEUE_NAME, async (job) => {
  console.log('Received inference request:', {
    jobId: job.id,
    data: job.data
  });

  try {
    // Mock processing
    const result = await processInference(job.data);
    
    // Send response back with status
    await inferenceResponseQueue.add('inference-response', {
      requestId: job.id,
      inferenceResult: {
        ...result,
        status: 'done'  // Add status to response
      }
    });

    console.log('Sent inference response:', {
      jobId: job.id,
      result: result
    });

    return result;
  } catch (error) {
    console.error('Error processing inference:', error);
    // Send error response with failed status
    await inferenceResponseQueue.add('inference-response', {
      requestId: job.id,
      inferenceResult: {
        success: false,
        error: error.message,
        status: 'failed',
        timestamp: new Date().toISOString()
      }
    });
    throw error;
  }
}, {
  connection: redisConfig,
});

// Mock inference processing function
async function processInference(data) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    success: true,
    result: `Processed request with data: ${JSON.stringify(data)}`,
    timestamp: new Date().toISOString(),
    status: 'done'  // Add status to the result
  };
}

async function initialize() {
  console.log('Initializing inference queue workers...');
  return Promise.resolve();
}

module.exports = {
  initialize,
  inferenceRequestQueue,
  inferenceResponseQueue,
}; 
