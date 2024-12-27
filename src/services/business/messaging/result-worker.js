// const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
// const logger = require('../../../shared/libraries/log/logger');

// const RABBITMQ_URL = 'amqp://localhost:5672';
// const BUSINESS_QUEUE = 'business_queue';

// let client = null;

// const initialize = async () => {
//   if (!client) {
//     client = new RabbitMQClient(RABBITMQ_URL);
//     await client.connect();
//     await client.setupQueue(BUSINESS_QUEUE);

//     // Setup consumer for inference results
//     await client.consumeMessage(BUSINESS_QUEUE, async (content, msg) => {
//       try {
//         const { originalRequest, result, error } = content;
        
//         if (error) {
//           logger.error('Received failed inference result:', {
//             originalRequest,
//             error
//           });
//           // Handle error (e.g., update database, notify user)
//         } else {
//           logger.info('Received successful inference result:', {
//             originalRequest,
//             result
//           });
//           // Handle success (e.g., update database, notify user)
//         }
        
//         // Acknowledge the message using the client's channel
//         client.channel.ack(msg);
//       } catch (err) {
//         logger.error('Error processing inference result:', err);
//         // Negative acknowledge the message using the client's channel
//         client.channel.nack(msg, false, false);
//       }
//     });

//     logger.info('Business service result worker initialized');
//   }
// };

// module.exports = {
//   initialize
// }; 
