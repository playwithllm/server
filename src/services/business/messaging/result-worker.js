const { Worker } = require('bullmq');
const { redisConfig } = require('../../../shared/config/redis');

const INFERENCE_RESULT_QUEUE = 'inference-results';

// Create worker to handle inference results
const resultWorker = new Worker(INFERENCE_RESULT_QUEUE, async (job) => {
  const { originalRequestId, result, error } = job.data;
  
  if (error) {
    console.error('Received failed inference result:', {
      originalRequestId,
      error
    });
    // Handle error (e.g., update database, notify user)
  } else {
    console.log('Received successful inference result:', {
      originalRequestId,
      result
    });
    // Handle success (e.g., update database, notify user)
  }
}, {
  connection: redisConfig,
});

module.exports = resultWorker; 
