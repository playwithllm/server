// worker.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const Request = require('../business-service/models/Request'); // Adjust the path as needed
const {
  connectRabbitMQ,
  publishToQueue,
  consumeFromQueue,
} = require('./utils/rabbitmq');

dotenv.config();

const {
  MONGODB_URI,
  INFERENCE_REQUEST_QUEUE,
  INFERENCE_RESPONSE_QUEUE,
} = process.env;

// Simulated LLM Inference Function
const performInference = async (prompt) => {
  // Replace this with actual LLM inference logic, e.g., calling a Python script or using an SDK
  // For demonstration, we'll simulate a delay and return a mocked response
  return new Promise((resolve) => {
    setTimeout(() => {
      const mockedResult = `Processed prompt: "${prompt}"`;
      resolve(mockedResult);
    }, 5000); // Simulate a 5-second inference time
  });
};

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Inference Service connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Connect to RabbitMQ
connectRabbitMQ();

// Handle messages from inference_requests queue
consumeFromQueue(INFERENCE_REQUEST_QUEUE, async (msg) => {
  try {
    const content = JSON.parse(msg.content.toString());
    const { requestId } = content;

    console.log(`Received inference request: ${requestId}`);

    // Fetch the request details from MongoDB
    const request = await Request.findOne({ requestId });

    if (!request) {
      throw new Error(`Request ID ${requestId} not found in database.`);
    }

    // Update the status to 'processing'
    request.status = 'processing';
    await request.save();

    // Perform the inference
    const result = await performInference(request.prompt);

    // Update the request with the result and set status to 'completed'
    request.status = 'completed';
    request.result = result;
    await request.save();

    // Publish the completion message to inference_responses queue
    await publishToQueue(INFERENCE_RESPONSE_QUEUE, { requestId, result });

    // Acknowledge the message
    const { channel, fields } = msg;
    channel.ack(msg);

    console.log(`Inference completed for requestId: ${requestId}`);
  } catch (error) {
    console.error('Error processing inference request:', error);

    // Optionally, update the request status to 'failed'
    try {
      const content = JSON.parse(msg.content.toString());
      const { requestId } = content;

      await Request.findOneAndUpdate(
        { requestId },
        { status: 'failed', error: error.message }
      );
    } catch (err) {
      console.error('Failed to update request status to failed:', err);
    }

    // Reject the message and do not requeue (to prevent infinite retries)
    msg.channel.nack(msg, false, false);
  }
});
