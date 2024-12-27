// const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
// const logger = require('../../../shared/libraries/log/logger');
// const eventEmitter = require('../../../shared/libraries/events/eventEmitter');

// // Queue names should match between services
// const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
// const INFERENCE_QUEUE = 'inference_queue';  // Receives requests from business service
// const BUSINESS_QUEUE = 'business_queue';    // Sends responses back to business service

// class InferenceMessaging {
//   constructor() {
//     this.client = new RabbitMQClient(RABBITMQ_URL);
//   }

//   async initialize() {
//     try {
//       await this.client.connect();
      
//       // Setup queues
//       await this.client.setupQueue(INFERENCE_QUEUE);
//       await this.client.setupQueue(BUSINESS_QUEUE);

//       // Setup consumer for inference responses
//       await this.client.consumeMessage(
//         INFERENCE_QUEUE,
//         this.handleInferenceResponse.bind(this)
//       );

//       logger.info('Inference messaging initialized successfully');
//     } catch (error) {
//       logger.error('Failed to initialize inference messaging:', error);
//       throw error;
//     }
//   }

//   async handleInferenceResponse(content, msg) {
//     try {
//       logger.info('Received inference response:', content);
      
//       // Emit the event with the inference response
//       eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_RESPONSE, content);
      
//       await this.client.ack(msg);
//     } catch (error) {
//       logger.error('Error processing inference response:', error);
//       // Safely handle nack with null checks
//       if (msg) {
//         await this.client.nack(msg, false, false);
//       } else {
//         logger.error('Cannot nack message - invalid message format');
//       }
//     }
//   }

//   async processInference(content) {
//     // Simulate inference processing
//     await new Promise(resolve => setTimeout(resolve, 1000));
//     return `Processed: ${content.prompt || 'No prompt provided'}`;
//   }

//   async sendResponse(response) {
//     try {
//       await this.client.publishMessage(BUSINESS_QUEUE, response);
//       logger.info('Sent inference response:', response);
//     } catch (error) {
//       logger.error('Failed to send inference response:', error);
//       throw error;
//     }
//   }
// }

// module.exports = new InferenceMessaging(); 
