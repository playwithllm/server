const { Queue, Worker } = require('bullmq');
const { redisConfig } = require('../../../shared/config/redis');

const INFERENCE_REQUEST_QUEUE = 'inference-requests';
const INFERENCE_RESULT_QUEUE = 'inference-results';

// Create queues
const inferenceResultQueue = new Queue(INFERENCE_RESULT_QUEUE, {
  connection: redisConfig,
});

// Create request worker
const requestWorker = new Worker(INFERENCE_REQUEST_QUEUE, async (job) => {
  console.log('Processing inference request:', {
    jobId: job.id,
    data: job.data
  });

  try {
    // Process the inference request
    const result = await processInference(job.data);

    // wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Send result to result queue (fire-and-forget)
    await inferenceResultQueue.add('inference-result', {
      originalRequestId: job.id,
      result: result,
      timestamp: new Date().toISOString()
    });

    console.log('Inference result queued:', {
      jobId: job.id,
      result: result
    });

  } catch (error) {
    console.error('Error processing inference:', error);
    // Queue error result
    await inferenceResultQueue.add('inference-result', {
      originalRequestId: job.id,
      error: error.message,
      status: 'failed',
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}, {
  connection: redisConfig,
});

// Mock inference processing function
async function processInference(data) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    success: true,
    result: `Processed request with data: ${JSON.stringify(data)}`,
    timestamp: new Date().toISOString()
  };
}

async function initialize() {
  console.log('Initializing inference queue workers...');
  return Promise.resolve();
}

module.exports = {
  initialize,
  inferenceResultQueue
}; 
